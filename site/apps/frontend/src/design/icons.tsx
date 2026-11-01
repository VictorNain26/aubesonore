import type { ReactNode } from 'react';

// ─────────────────────────────────────────────
// The site's icons, drawn by hand at the line's weight: a 1.4 px stroke at every size, round caps
// and joins, so an icon carries the same line as the wave beside it. The stroke does not scale
// with the 20-unit box (SVG's vector-effect: non-scaling-stroke, on each shape since the property
// is not inherited): 1.4 units of it gave 0.98 px at 14 px and 1.68 at 24. They draw in
// `currentColor` and are decoration by default: the button or link around them carries the
// name. One that stands alone takes a `title`, its accessible name.
// ─────────────────────────────────────────────

export interface IconProps {
  className?: string | undefined;
  /** The icon's own name, only when nothing around it says what it is. */
  title?: string | undefined;
}

function Icon({ className, title, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Garder: a heart whose lobes lean a little, empty or filled. */
export function HeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Icon {...props}>
      <path
        vectorEffect="non-scaling-stroke"
        d="M10 17 C4 12.5 2 9.8 2 7.2 A4 4 0 0 1 10 5.4 A4 4 0 0 1 18 7.2 C18 9.8 16 12.5 10 17 Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </Icon>
  );
}

/** Partager: a curve that leaves the ground and turns into an arrow. */
export function ShareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path vectorEffect="non-scaling-stroke" d="M3 15 C3 9 6 7 12 7 M9 3.5 L12.5 7 L9 10.5" />
      <path vectorEffect="non-scaling-stroke" d="M3 18 H17" />
    </Icon>
  );
}

/** Diffuser: a screen, and two waves rising from its corner. */
export function CastIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        vectorEffect="non-scaling-stroke"
        d="M2 6 V4.5 A1.5 1.5 0 0 1 3.5 3 H16.5 A1.5 1.5 0 0 1 18 4.5 V15.5 A1.5 1.5 0 0 1 16.5 17 H12"
      />
      <path
        vectorEffect="non-scaling-stroke"
        d="M2 10 A7 7 0 0 1 9 17 M2 13.5 A3.5 3.5 0 0 1 5.5 17"
      />
    </Icon>
  );
}

/** Chercher: a lens and its handle. */
export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle vectorEffect="non-scaling-stroke" cx="8.5" cy="8.5" r="5.5" />
      <path vectorEffect="non-scaling-stroke" d="M12.5 12.5 L17.5 17.5" />
    </Icon>
  );
}

/** The week's most kept: a line climbing. */
export function RisingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path vectorEffect="non-scaling-stroke" d="M3 15 L8 9 L11 12 L17 5" />
    </Icon>
  );
}

/** Fermer: two strokes crossing. */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path vectorEffect="non-scaling-stroke" d="M5 5 L15 15 M15 5 L5 15" />
    </Icon>
  );
}

/** Back: a line ending in an open point. */
export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path vectorEffect="non-scaling-stroke" d="M16.5 10 H3.5 M8 5.5 L3.5 10 L8 14.5" />
    </Icon>
  );
}

/** A link that leaves the site: the arrow goes up and out. */
export function ExternalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path vectorEffect="non-scaling-stroke" d="M5.5 14.5 L14.5 5.5 M7.5 5.5 H14.5 V12.5" />
    </Icon>
  );
}

/** A column sorted up. */
export function ArrowUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path vectorEffect="non-scaling-stroke" d="M10 16.5 V3.5 M5.5 8 L10 3.5 L14.5 8" />
    </Icon>
  );
}

/** A column sorted down. */
export function ArrowDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path vectorEffect="non-scaling-stroke" d="M10 3.5 V16.5 M5.5 12 L10 16.5 L14.5 12" />
    </Icon>
  );
}

/** A column that can be sorted: one arrow up, one down, side by side. */
export function ArrowUpDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        vectorEffect="non-scaling-stroke"
        d="M6.5 16 V4 M3.5 7 L6.5 4 L9.5 7 M13.5 4 V16 M10.5 13 L13.5 16 L16.5 13"
      />
    </Icon>
  );
}

/** Show the password: an open eye. */
export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        vectorEffect="non-scaling-stroke"
        d="M2 10 C4.5 5.5 15.5 5.5 18 10 C15.5 14.5 4.5 14.5 2 10 Z"
      />
      <circle vectorEffect="non-scaling-stroke" cx="10" cy="10" r="2.4" />
    </Icon>
  );
}

/** Hide the password: the eye closed, its lashes down. */
export function EyeClosedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path vectorEffect="non-scaling-stroke" d="M2 8.5 C4.5 13 15.5 13 18 8.5" />
      <path
        vectorEffect="non-scaling-stroke"
        d="M5 11.6 L3.8 13.6 M10 12.9 V15.2 M15 11.6 L16.2 13.6"
      />
    </Icon>
  );
}

const SPEAKER = 'M2.5 7.5 H5.5 L10 4 V16 L5.5 12.5 H2.5 Z';

/** The sound cut: the speaker, and a cross where its waves were. */
export function VolumeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path vectorEffect="non-scaling-stroke" d={SPEAKER} />
      <path vectorEffect="non-scaling-stroke" d="M13.5 7.5 L18 12 M18 7.5 L13.5 12" />
    </Icon>
  );
}

/** The sound low: the speaker and one wave. */
export function VolumeLowIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path vectorEffect="non-scaling-stroke" d={SPEAKER} />
      <path vectorEffect="non-scaling-stroke" d="M13 7.5 A3.5 3.5 0 0 1 13 12.5" />
    </Icon>
  );
}

/** The sound up: the speaker and two waves. */
export function VolumeHighIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path vectorEffect="non-scaling-stroke" d={SPEAKER} />
      <path
        vectorEffect="non-scaling-stroke"
        d="M13 7.5 A3.5 3.5 0 0 1 13 12.5 M15.5 5 A7 7 0 0 1 15.5 15"
      />
    </Icon>
  );
}
