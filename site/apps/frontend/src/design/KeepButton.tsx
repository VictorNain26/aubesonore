import { KeepHeart } from './KeepHeart';
import * as m from '@/paraglide/messages.js';

interface KeepButtonProps {
  /** The track's title, which names the button. */
  title: string;
  isKept: boolean;
  /** A keep under way: the button waits for it. */
  isKeeping?: boolean;
  onToggle: () => void;
  /** The button's look and size, its place's (the hero's ring, a row's heart, the bar's icon). */
  className: string;
  heartClassName: string;
}

/** Garder for one track: the heart, pressed once the track is kept, named for its title. */
export function KeepButton({
  title,
  isKept,
  isKeeping = false,
  onToggle,
  className,
  heartClassName,
}: KeepButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isKeeping}
      aria-pressed={isKept}
      aria-label={m.track_keep_aria({ title })}
      className={className}
    >
      <KeepHeart isKept={isKept} className={heartClassName} />
    </button>
  );
}
