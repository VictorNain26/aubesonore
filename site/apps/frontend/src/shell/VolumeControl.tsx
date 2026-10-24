import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '../design/Slider';
import * as m from '@/paraglide/messages.js';

export interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;
  className?: string;
}

/**
 * The volume, always in view on the player bar: the speaker mutes, and the level beside it is a
 * slider drawn with the line. Under 40rem the bar has no room for the slider and keeps the speaker
 * alone: a phone sets the level with its own buttons (and iOS ignores it from a page). The level
 * reads 0–100, so a screen reader says "60", not "0.6".
 */
export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  className,
}: VolumeControlProps) {
  const level = isMuted ? 0 : volume;
  const Icon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;

  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)}>
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={level === 0 ? m.volume_unmute() : m.volume_mute()}
        className="ease-out-quart flex size-11 items-center justify-center rounded-full transition-opacity duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current active:opacity-50"
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
      <span className="hidden w-28 sm:flex lg:w-35">
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
