# /// script
# requires-python = ">=3.12"
# dependencies = ["fonttools[woff]>=4.66", "uharfbuzz>=0.56", "pillow>=12.3"]
# ///
"""AubeSonore's mark, built from its rules (README.md), and every file made from it.

    uv run brand/build.py            # from apps/frontend; needs a Chromium for the PNGs
    CHROME=/path/to/chrome uv run brand/build.py

Writes brand/svg/*.svg, public/favicon.svg, public/favicon.ico, public/icon-*.png, public/og-*.png
and src/design/atoms/logoArt.ts. Run it again after changing a rule, never edit the outputs.
"""

import bisect
import glob
import io
import json
import math
import os
import subprocess
import tempfile
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.pointInsidePen import PointInsidePen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image

FRONTEND = Path(__file__).resolve().parent.parent
FONTS = FRONTEND.parent.parent / "node_modules/@fontsource-variable"
FONT = FONTS / "bricolage-grotesque/files/bricolage-grotesque-latin-wdth-normal.woff2"
PUBLIC, SVG_OUT = FRONTEND / "public", FRONTEND / "brand/svg"
ART_TS = FRONTEND / "src/design/atoms/logoArt.ts"

# The palette's hex values (tokens.css is oklch; icons and older Cast devices want hex).
PAPER, INK, DAWN, MUTED = "#E8E0D7", "#211F26", "#F2AC81", "#4A4650"

# The wordmark: Bricolage Grotesque at weight 500, width 85 %, tracking −1.5 %.
WORD, WGHT, WDTH, TRACKING = "aubesonore", 500, 85, -0.015

Point = tuple[float, float]


def f(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


# ── The wordmark ─────────────────────────────────────────────────────────────


def font_instance() -> TTFont:
    return instantiateVariableFont(TTFont(FONT), {"wght": WGHT, "wdth": WDTH})


def measure(inst: TTFont) -> dict[str, float]:
    """What the symbol is drawn from: the « b »'s ascender, the x-height and the « e »'s
    crossbar, the thinnest stroke of the word (its délié)."""
    gs, cmap = inst.getGlyphSet(), inst.getBestCmap()

    def glyph(c: str):
        return gs[cmap[ord(c)]]

    def bounds(c: str):
        pen = BoundsPen(gs)
        glyph(c).draw(pen)
        return pen.bounds

    def inside(x: float, y: float) -> bool:
        pen = PointInsidePen(gs, (x, y))
        glyph("e").draw(pen)
        return pen.getResult()

    xmin, ymin, xmax, ymax = bounds("e")
    x, runs, start = (xmin + xmax) / 2, [], None
    for y in range(int(ymin), int(ymax) + 2):
        if inside(x, y) and start is None:
            start = y
        elif not inside(x, y) and start is not None:
            runs.append((start, y))
            start = None
    xheight = inst["OS/2"].sxHeight
    crossbar = next(b - a for a, b in runs if a < xheight / 2 < b)
    return {"ascender": bounds("b")[3], "xheight": xheight, "crossbar": crossbar}


def glyphs(inst: TTFont) -> tuple[list[str], float]:
    """Each letter as its own outline (font units, baseline at 0, y down), shaped by HarfBuzz with
    the font's kerning, and the word's advance width."""
    buf = io.BytesIO()
    inst.flavor = None
    inst.save(buf)
    face = hb.Face(buf.getvalue())
    buffer = hb.Buffer()
    buffer.add_str(WORD)
    buffer.guess_segment_properties()
    hb.shape(hb.Font(face), buffer, {"kern": True, "liga": False})
    gs, order, upem = inst.getGlyphSet(), inst.getGlyphOrder(), inst["head"].unitsPerEm
    paths, x = [], 0.0
    for info, pos in zip(buffer.glyph_infos, buffer.glyph_positions):
        pen = SVGPathPen(gs, ntos=lambda v: f(v))
        gs[order[info.codepoint]].draw(TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)))
        paths.append(pen.getCommands())
        x += pos.x_advance + TRACKING * upem
    return paths, x - TRACKING * upem


# ── The symbol ───────────────────────────────────────────────────────────────


def cubic(p0: Point, p1: Point, p2: Point, p3: Point, s: float) -> Point:
    m = 1 - s
    return (
        m**3 * p0[0] + 3 * m * m * s * p1[0] + 3 * m * s * s * p2[0] + s**3 * p3[0],
        m**3 * p0[1] + 3 * m * m * s * p1[1] + 3 * m * s * s * p2[1] + s**3 * p3[1],
    )


Segment = tuple[Point, Point, Point, Point]


def fit_horizontal(samples: list[Point]) -> list[Segment]:
    """Cubic Béziers through the extremes of y(x), every handle horizontal: the fewest nodes a
    smooth wave can have, each where the curve turns. Handle lengths fitted to the samples."""
    ext = [0]
    for i in range(1, len(samples) - 1):
        if (samples[i][1] - samples[i - 1][1]) * (samples[i + 1][1] - samples[i][1]) < 0:
            ext.append(i)
    ext.append(len(samples) - 1)
    segments = []
    for a, b in zip(ext, ext[1:]):
        p0, p3, target = samples[a], samples[b], samples[a : b + 1]
        xs, span = [p[0] for p in target], p3[0] - p0[0]
        best: tuple[float, Point, Point] | None = None
        for i in range(10, 91):
            for j in range(10, 91):
                p1, p2 = (p0[0] + span * i / 100, p0[1]), (p3[0] - span * j / 100, p3[1])
                err = 0.0
                for k in range(1, 12):
                    x, y = cubic(p0, p1, p2, p3, k / 12)
                    n = min(max(bisect.bisect_left(xs, x) - 1, 0), len(target) - 2)
                    (xa, ya), (xb, yb) = target[n], target[n + 1]
                    err += (y - (ya + (yb - ya) * ((x - xa) / (xb - xa) if xb != xa else 0))) ** 2
                if best is None or err < best[0]:
                    best = (err, p1, p2)
        assert best
        segments.append((p0, best[1], best[2], p3))
    return segments


@dataclass(frozen=True)
class Map:
    """Where a drawing goes: scaled, then moved."""

    scale: float = 1
    dx: float = 0
    dy: float = 0

    def __call__(self, p: Point) -> str:
        return f"{f(p[0] * self.scale + self.dx)} {f(p[1] * self.scale + self.dy)}"


@dataclass(frozen=True)
class Horizon:
    """The horizon that becomes a wave where the sun rises through it (README.md, Construction)."""

    stroke: float  # t
    gap: float  # g, between the line and the sun
    peak: float  # the wave's highest crest, centre to centre
    periods: float  # waves across the sun's diameter
    sun_r: float = 150  # R
    sun_cx: float = 256
    y: float = 300
    reach: float = 50  # the line beyond the sun, each side
    caps: str = "round"

    @property
    def x0(self) -> float:
        return self.sun_cx - self.sun_r - self.reach

    @property
    def x1(self) -> float:
        return self.sun_cx + self.sun_r + self.reach

    def shape(self, x: float) -> float:
        u = (x - (self.sun_cx - self.sun_r)) / (2 * self.sun_r)
        if not 0 < u < 1:
            return 0.0
        # A Hann window: the wave leaves the level line with no kink and settles back onto it.
        return math.sin(math.pi * u) ** 2 * math.sin(2 * math.pi * self.periods * u)

    @cached_property
    def amp(self) -> float:
        left = self.sun_cx - self.sun_r
        return self.peak / max(abs(self.shape(left + 2 * self.sun_r * i / 2000)) for i in range(2001))

    def samples(self, offset: float = 0.0, n: int = 1200) -> list[Point]:
        """The wave's centre line, or its parallel `offset` above it along the normal."""
        left, pts = self.sun_cx - self.sun_r, []
        for i in range(n + 1):
            x = left + 2 * self.sun_r * i / n
            slope = -self.amp * (self.shape(x + 1e-3) - self.shape(x - 1e-3)) / 2e-3
            norm = math.hypot(1, slope)
            pts.append((x + offset * slope / norm, self.y - self.amp * self.shape(x) - offset / norm))
        return pts

    @cached_property
    def wave(self) -> list[Segment]:
        return fit_horizontal(self.samples())

    @cached_property
    def cut(self) -> list[Segment]:
        """The sun's lower edge: the wave's parallel, half the line and the gap above it."""
        return fit_horizontal(self.samples(self.stroke / 2 + self.gap))

    @staticmethod
    def curves(segments: list[Segment], m: Map) -> str:
        return " ".join(f"C{m(a)} {m(b)} {m(c)}" for _, a, b, c in segments)

    def line_d(self, m: Map = Map()) -> str:
        return f"M{m((self.x0, self.y))} L{m(self.wave[0][0])} {self.curves(self.wave, m)} L{m((self.x1, self.y))}"

    def sky_d(self, m: Map = Map()) -> str:
        """Everything above the cut, so the sun can rise from behind the horizon."""
        first, last = self.cut[0][0], self.cut[-1][3]
        far_l, far_r, top = self.x0 - self.stroke, self.x1 + self.stroke, self.y - 2 * self.sun_r
        return (
            f"M{m((far_l, first[1]))} L{m(first)} {self.curves(self.cut, m)} L{m((far_r, last[1]))} "
            f"L{m((far_r, top))} L{m((far_l, top))} Z"
        )

    def box(self, margin: float = 0) -> tuple[float, float, float, float]:
        cap = self.stroke / 2 if self.caps == "round" else 0
        top, bottom = self.y - self.sun_r, self.y + self.peak + self.stroke / 2
        return (self.x0 - cap - margin, top - margin, self.x1 - self.x0 + 2 * cap + 2 * margin, bottom - top + 2 * margin)

    def svg(self, uid: str, sun: str, ink: str, m: Map = Map()) -> str:
        return (
            f'<clipPath id="{uid}-sky"><path d="{self.sky_d(m)}"/></clipPath>'
            f'<g clip-path="url(#{uid}-sky)"><circle cx="{f(self.sun_cx * m.scale + m.dx)}" cy="{f(self.y * m.scale + m.dy)}" '
            f'r="{f(self.sun_r * m.scale)}" fill="{sun}"/></g>'
            f'<path d="{self.line_d(m)}" fill="none" stroke="{ink}" stroke-width="{f(self.stroke * m.scale)}" '
            f'stroke-linecap="{self.caps}" stroke-linejoin="round"/>'
        )


class Pixel16:
    """16 px, drawn pixel by pixel: a curve there is only grey, so the wave is steps of one pixel —
    a dip, then a crest, as in the large drawing — and the sun stops one pixel above the line."""

    box = (0, 0, 16, 16)
    line = "M1 11 H4 V12 H7 V11 H9 V10 H12 V11 H15 V13 H12 V12 H9 V13 H7 V14 H4 V13 H1 Z"
    sky = "M0 0 H16 V10 H12 V9 H9 V10 H7 V11 H4 V10 H0 Z"

    def svg(self, uid: str, sun: str, ink: str) -> str:
        return (
            f'<clipPath id="{uid}-sky"><path d="{self.sky}"/></clipPath>'
            f'<g clip-path="url(#{uid}-sky)"><circle cx="8" cy="11" r="7" fill="{sun}"/></g>'
            f'<path d="{self.line}" fill="{ink}" shape-rendering="crispEdges"/>'
        )


def svg_doc(box: tuple[float, ...], body: str, width: float | None = None, height: float | None = None,
            style: str = "", label: str = "AubeSonore") -> str:
    size = f' width="{f(width)}" height="{f(height)}"' if width else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{" ".join(f(v) for v in box)}"{size} role="img" '
        f'aria-label="{label}">{style}{body}</svg>\n'
    )


# ── Rendering ────────────────────────────────────────────────────────────────


def chrome() -> str:
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    found = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome")))
    if not found:
        raise SystemExit("No Chromium found: set CHROME to a Chromium or Chrome binary.")
    return found[-1]


def render(html: str, width: int, height: int, out: Path, transparent: bool = False) -> None:
    """A page shot at its exact size by headless Chromium, the renderer the site is tested in."""
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "page.html"
        page.write_text(
            "<!doctype html><meta charset=utf-8><style>html,body{margin:0;width:%dpx;height:%dpx;overflow:hidden;"
            "background:transparent}</style>%s" % (width, height, html)
        )
        args = [chrome(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                f"--window-size={width},{height}", f"--screenshot={out}"]
        if transparent:
            args.append("--default-background-color=00000000")
        subprocess.run([*args, page.as_uri()], check=True, capture_output=True)


def font_face(family: str, file: Path, axes: str) -> str:
    return f"@font-face{{font-family:'{family}';src:url('{file.as_uri()}') format('woff2');{axes}}}"


# ── Build ────────────────────────────────────────────────────────────────────


def main() -> None:
    inst = font_instance()
    metrics = measure(inst)
    letters, word_width = glyphs(inst)
    unit = metrics["ascender"] / 150  # font units per grid unit, once the sun's radius meets the « b »
    t = metrics["crossbar"] / unit

    master = Horizon(stroke=t, gap=t, peak=t, periods=2)
    px32 = Horizon(stroke=2, gap=2, peak=2, periods=1.5, sun_r=14, sun_cx=16, y=21, reach=1, caps="butt")
    px16 = Pixel16()

    # The lockup, in font units: the horizon on the baseline, the sun up to the « b »'s ascender,
    # half an x-height between the line's end and the « a ».
    sx, sy, sw, sh = master.box()
    space = metrics["xheight"] / 2
    to_word = Map(scale=unit, dx=-space - sw * unit - sx * unit, dy=-master.y * unit)
    top = -master.sun_r * unit
    bottom = (master.peak + master.stroke / 2) * unit
    left = -space - sw * unit
    lockup_box = (left, top, word_width - left, bottom - top)

    def lockup_body(uid: str, sun: str, ink: str, word: str) -> str:
        return master.svg(uid, sun, ink, to_word) + f'<path d="{" ".join(letters)}" fill="{word}"/>'

    SVG_OUT.mkdir(parents=True, exist_ok=True)
    symbol_box = master.box(margin=t)
    files = {
        "symbol.svg": svg_doc(symbol_box, master.svg("s", DAWN, INK)),
        "symbol-one-colour.svg": svg_doc(symbol_box, master.svg("s", INK, INK)),
        "symbol-inverse.svg": svg_doc(symbol_box, master.svg("s", DAWN, PAPER)),
        "symbol-32.svg": svg_doc((0, 0, 32, 32), px32.svg("s", DAWN, INK)),
        "symbol-16.svg": svg_doc(px16.box, px16.svg("s", DAWN, INK)),
        "lockup.svg": svg_doc(lockup_box, lockup_body("l", DAWN, INK, INK)),
        "lockup-inverse.svg": svg_doc(lockup_box, lockup_body("l", DAWN, PAPER, PAPER)),
        "lockup-one-colour.svg": svg_doc(lockup_box, lockup_body("l", INK, INK, INK)),
    }
    for name, content in files.items():
        (SVG_OUT / name).write_text(content)

    # The tab's icon: the 32 px drawing, whose 2 px line lands on whole pixels at 16 and 32 px; on
    # a dark tab strip the line turns to paper.
    dark = (
        "<style>.ink{fill:none;stroke:%s}@media (prefers-color-scheme:dark){.ink{stroke:%s}}</style>" % (INK, PAPER)
    )
    (PUBLIC / "favicon.svg").write_text(
        svg_doc((0, 0, 32, 32), px32.svg("f", DAWN, INK).replace(f'stroke="{INK}"', 'class="ink"'), style=dark)
    )

    def icon_html(size: int, symbol_width: float, background: str = PAPER) -> str:
        x, y, w, h = master.box()
        scale = symbol_width / w
        m = Map(scale=scale, dx=(size - w * scale) / 2 - x * scale, dy=(size - h * scale) / 2 - y * scale)
        return svg_doc((0, 0, size, size), f'<rect width="{size}" height="{size}" fill="{background}"/>'
                       + master.svg("i", DAWN, INK, m), size, size)

    def pixel_html(drawing, size: int) -> str:
        return svg_doc((0, 0, size, size), drawing.svg("p", DAWN, INK), size, size)

    with tempfile.TemporaryDirectory() as tmp:
        p16, p32 = Path(tmp) / "16.png", Path(tmp) / "32.png"
        render(pixel_html(px16, 16), 16, 16, p16, transparent=True)
        render(pixel_html(px32, 32), 32, 32, p32, transparent=True)
        big = Image.open(p32).convert("RGBA")
        big.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32)], append_images=[Image.open(p16).convert("RGBA")])

    # Home screens: the symbol on paper, two thirds of the width. The maskable icon keeps it in the
    # central circle of radius 40 % that every launcher's mask leaves whole (web.dev/articles/maskable-icon).
    _, _, w, h = master.box()
    mask_width = 0.92 * 2 * 0.4 * 512 / math.hypot(1, h / w)
    for name, size, width in (("icon-180.png", 180, 120), ("icon-192.png", 192, 128), ("icon-512.png", 512, 340),
                              ("icon-maskable-512.png", 512, mask_width)):
        render(icon_html(size, width), size, size, PUBLIC / name)

    # Sharing cards: the line of the hero, then the lockup at the foot, in the light of dawn.
    faces = font_face("Bricolage", FONT, "font-weight:200 800;font-stretch:75% 100%")
    lockup_px = 58
    for lang, title, sub in (
        ("fr", "Des titres à l’aube de vous plaire.", "Une radio de découverte, un titre après l’autre."),
        ("en", "The first light of your next favourite songs.", "A discovery radio, one track after another."),
    ):
        logo = svg_doc(lockup_box, lockup_body("o", DAWN, INK, INK), lockup_px * lockup_box[2] / lockup_box[3], lockup_px)
        html = f"""<style>{faces}
body{{background:{PAPER};font-family:Bricolage,sans-serif;color:{INK};position:relative}}
.glow{{position:absolute;inset:auto -10% -170px -10%;height:420px;background:
radial-gradient(40% 46% at 30% 60%,color-mix(in oklab,{DAWN} 70%,transparent) 0%,transparent 72%),
radial-gradient(26% 34% at 12% 58%,color-mix(in oklab,#E9C4CF 55%,transparent) 0%,transparent 72%),
radial-gradient(24% 30% at 52% 62%,color-mix(in oklab,#D9D3E6 50%,transparent) 0%,transparent 72%);filter:blur(8px)}}
.text{{position:absolute;left:76px;top:70px;display:flex;flex-direction:column;gap:30px}}
h1{{margin:0;width:15ch;font-size:80px;line-height:.98;font-weight:520;letter-spacing:-.032em;text-wrap:balance}}
p{{margin:0 0 0 2px;font-size:28px;line-height:1.3;color:{MUTED};font-weight:450}}
.logo{{position:absolute;left:76px;bottom:78px}}</style>
<div class="glow"></div><div class="text"><h1>{title}</h1><p>{sub}</p></div>
<div class="logo">{logo}</div>"""
        render(html, 1200, 630, PUBLIC / f"og-{lang}.png")

    # The component's drawing: the lockup's parts, named for its animation.
    art = {
        "viewBox": " ".join(f(v) for v in lockup_box),
        "line": master.line_d(to_word),
        "lineWidth": float(f(master.stroke * unit)),
        "sky": master.sky_d(to_word),
        "sun": {"cx": float(f(master.sun_cx * unit + to_word.dx)), "cy": 0, "r": float(f(master.sun_r * unit))},
        "baseline": float(f(16)),
        "letters": letters,
    }
    ART_TS.write_text(
        "// Generated by brand/build.py from the mark's rules (brand/README.md). Do not edit: change\n"
        "// the rules and run the script again.\n"
        f"export const LOGO_ART = {json.dumps(art, ensure_ascii=False)} as const;\n"
    )
    print(f"t = {t:.2f} on the 512 grid, {metrics['crossbar']:.0f} font units; lockup {lockup_box}")


if __name__ == "__main__":
    main()
