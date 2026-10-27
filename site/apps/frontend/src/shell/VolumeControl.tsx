import { VolumeHighIcon, VolumeLowIcon, VolumeOffIcon } from '../design/icons';
import { cn } from '@/lib/utils';
import { Slider } from '../design/Slider';
import * as m from '@/paraglide/messages.js';

export interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;
  /** Shows the level whatever the room around: the hero's, beside Écouter on a computer. */
  showLevel?: boolean;
  className?: string;
}

/**
 * The volume: the speaker mutes, and the level beside it is a slider drawn with the line. Where it
 * sits (the player bar, the hero's actions) is a container: under 38rem of it there is no room for
 * the slider and the speaker stays alone, unless its host asks for the level (`showLevel`); a phone
 * sets the level with its own buttons (and iOS ignores it from a page). The level reads 0–100, so
 * a screen reader says "60", not "0.6".
 */
export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  showLevel = false,
  className,
}: VolumeControlProps) {
  const level = isMuted ? 0 : volume;
  const Icon = level === 0 ? VolumeOffIcon : level < 0.5 ? VolumeLowIcon : VolumeHighIcon;

  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)}>
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={level === 0 ? m.volume_unmute() : m.volume_mute()}
        className="ease-out-quart flex size-11 items-center justify-center rounded-full transition-opacity duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current active:opacity-50"
      >
        <Icon className="size-4" />
      </button>
      <span
        data-testid="volume-level"
        className={cn('w-28', showLevel ? 'flex' : 'hidden @min-[38rem]:flex @min-[40rem]:w-35')}
      >
        <Slider
          label={m.volume_slider()}
          value={Math.round(level * 100)}
          onValueChange={(value) => onVolumeChange(value / 100)}
          min={0}
          max={100}
          step={5}
        />
      </span>
    </div>
  );
}
