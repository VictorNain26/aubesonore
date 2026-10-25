import type { LightInks, Rgb } from './lightStrength';

/** A colour the canvas can parse, painted on one pixel and read back as bytes: RGB and alpha. */
function bytesOf(
  probe: CanvasRenderingContext2D,
  colour: string
): [number, number, number, number] | null {
  const unset = '#010203';
  probe.fillStyle = unset;
  probe.fillStyle = colour;
  if (probe.fillStyle === unset) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!, a! / 255];
}

/**
 * The paper, the veil and the words' inks the hero's light is read through, from the tokens as
 * the element inherits them (by day or by night), in the bytes the canvas holds its cover in. Null
 * where the browser cannot tell: the light then keeps the opacity its style gives it.
 */
export function readInks(element: Element): LightInks | null {
  const style = getComputedStyle(element);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const probe = canvas.getContext('2d', { willReadFrequently: true });
  if (!probe) return null;
  const read = (name: string) => bytesOf(probe, style.getPropertyValue(name).trim());
  const [surface, veil, text, muted] = [
    '--surface',
    '--light-veil-top',
    '--text',
    '--text-muted',
  ].map(read);
  const opacity = Number.parseFloat(style.getPropertyValue('--light-opacity'));
  if (!surface || !veil || !text || !muted || Number.isNaN(opacity)) return null;
  const rgb = ([r, g, b]: readonly number[]): Rgb => [r!, g!, b!];
  return {
    surface: rgb(surface),
    veil: [veil[0], veil[1], veil[2], veil[3]],
    inks: [rgb(text), rgb(muted)],
    opacity,
  };
}
