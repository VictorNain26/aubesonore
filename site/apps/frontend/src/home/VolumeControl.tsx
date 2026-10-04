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

const PANEL = {
  accent: 'bg-accent text-on-accent shadow-bar',
  surface: 'bg-surface-raised text-text shadow-lift',
};

/**
 * One speaker button, for a mouse only: phones and tablets set the volume with
 * their own buttons (and iOS ignores it from the page). A click mutes; hovering
 * or tabbing onto it opens the level above it, so the bar keeps its width. The
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
    <div className={cn('group relative hidden shrink-0 pointer-fine:flex', className)}>
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
      {/* The bottom padding bridges the button and the panel, so the pointer can travel up. */}
      <div className="ease-out-quart invisible absolute bottom-full left-1/2 -translate-x-1/2 pb-2 opacity-0 transition-[opacity,visibility] duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <div className={cn('rounded-full py-2', PANEL[tone])}>
          <Slider
            label={m.volume_slider()}
            value={Math.round(level * 100)}
            onValueChange={(value) => onVolumeChange(value / 100)}
            min={0}
            max={100}
            step={5}
            orientation="vertical"
            tone={tone}
          />
        </div>
      </div>
    </div>
  );
}
