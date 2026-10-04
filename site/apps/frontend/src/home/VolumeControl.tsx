import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '../design/atoms/Slider';
import * as m from '@/paraglide/messages.js';

export interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;
  /** Ink bar (`accent`) or paper (`surface`) under it. */
  tone: 'accent' | 'surface';
  className?: string;
}

const MUTE_BUTTON = {
  accent: 'focus-visible:outline-on-accent',
  surface: 'focus-visible:outline-accent',
};

/**
 * Mute and a level always in view, for a mouse only: phones and tablets set
 * the volume with their own buttons (and iOS ignores it from the page). The
 * level reads 0–100 so a screen reader says "60", not "0.6".
 */
export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  tone,
  className,
}: VolumeControlProps) {
  const level = isMuted ? 0 : volume;
  const Icon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;

  return (
    <div className={cn('hidden shrink-0 items-center gap-1 pointer-fine:flex', className)}>
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={level === 0 ? m.volume_unmute() : m.volume_mute()}
        className={cn(
          'ease-out-quart flex size-11 items-center justify-center rounded-full transition-opacity duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-50',
          MUTE_BUTTON[tone]
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
      <div className="w-24">
        <Slider
          label={m.volume_slider()}
          value={Math.round(level * 100)}
          onValueChange={(value) => onVolumeChange(value / 100)}
          min={0}
          max={100}
          step={5}
          tone={tone}
        />
      </div>
    </div>
  );
}
