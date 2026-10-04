import { Slider as BaseSlider } from '@base-ui/react/slider';
import { cn } from '@/lib/utils';

export interface SliderProps {
  /** Libellé accessible du curseur (`aria-label`). */
  label: string;
  /** Valeur courante. */
  value: number;
  /** Appelé avec la nouvelle valeur lors du déplacement du curseur. */
  onValueChange: (value: number) => void;
  /** Valeur minimale. */
  min?: number;
  /** Valeur maximale. */
  max?: number;
  /** Pas d'incrémentation. */
  step?: number;
  /** Désactive l'interaction. */
  disabled?: boolean;
  /** Sens du curseur. */
  orientation?: 'horizontal' | 'vertical';
  /** Fond sur lequel le curseur est posé : papier (`surface`) ou encre (`accent`). */
  tone?: 'surface' | 'accent';
}

const TONE = {
  surface: { track: 'bg-border', fill: 'bg-accent', thumb: 'border-accent bg-surface' },
  accent: {
    track: 'bg-on-accent/30',
    fill: 'bg-on-accent',
    thumb: 'border-on-accent bg-on-accent focus-visible:outline-on-accent',
  },
};

/**
 * Curseur de valeur continue (ex. volume) basé sur `Slider` de Base UI,
 * disponible en orientation horizontale ou verticale.
 */
export function Slider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled,
  orientation = 'horizontal',
  tone = 'surface',
}: SliderProps) {
  const isVertical = orientation === 'vertical';
  const colors = TONE[tone];

  return (
    <BaseSlider.Root
      value={value}
      onValueChange={(next) => onValueChange(next)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      orientation={orientation}
      className={
        isVertical
          ? 'data-[disabled]:pointer-events-none data-[disabled]:opacity-50'
          : 'w-full data-[disabled]:pointer-events-none data-[disabled]:opacity-50'
      }
    >
      <BaseSlider.Control
        className={
          isVertical
            ? 'flex h-32 w-11 touch-none items-center justify-center'
            : 'flex h-11 w-full touch-none items-center'
        }
      >
        <BaseSlider.Track
          className={cn(
            colors.track,
            isVertical ? 'relative h-full w-1' : 'relative h-1 w-full rounded-full'
          )}
        >
          <BaseSlider.Indicator
            className={cn(
              colors.fill,
              isVertical ? 'absolute bottom-0 w-1' : 'absolute h-1 rounded-full'
            )}
          />
          <BaseSlider.Thumb
            aria-label={label}
            className={cn(
              'ease-out-quart focus-visible:outline-accent size-4 rounded-full border transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-110',
              colors.thumb
            )}
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
