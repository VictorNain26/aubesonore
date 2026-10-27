import { Slider as BaseSlider } from '@base-ui/react/slider';
import { cn } from '@/lib/utils';
import { wavePath } from './wave';

export interface SliderProps {
  /** The slider's accessible name (`aria-label`). */
  label: string;
  /** The current value. */
  value: number;
  /** Called with the new value as the thumb moves. */
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  /** The step between values, and of each arrow key. */
  step?: number;
  /** Turns interaction off. */
  disabled?: boolean;
  className?: string;
}

/** The drawing's units: 100 wide, so a point's x is its share of the track in percent. */
const LINE = { width: 100, height: 16, amplitude: 2.5, seed: 1.5, step: 2 } as const;

/**
 * A continuous value (the volume) on Base UI's `Slider`, drawn with the line: the part up to the
 * value is the site's wave, the rest a flat rule, and a round thumb sits where they meet. In the
 * ink of its text (currentColor), so it reads on paper and on the player bar alike. The control
 * is 44 px high; arrows, Page keys, Home and End move it (Base UI).
 */
export function Slider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled,
  className,
}: SliderProps) {
  const at = max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;
  const x = Math.round(at * 10000) / 100;

  return (
    <BaseSlider.Root
      value={value}
      onValueChange={(next) => onValueChange(next)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cn(
        'group/slider w-full data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
    >
      <BaseSlider.Control className="flex h-11 w-full cursor-pointer touch-none items-center">
        <BaseSlider.Track className="relative h-4 w-full">
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${LINE.width} ${LINE.height}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            <path
              data-testid="slider-played"
              d={wavePath({ ...LINE, end: x })}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              data-testid="slider-rest"
              d={`M${x} ${LINE.height / 2} L${LINE.width} ${LINE.height / 2}`}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <BaseSlider.Thumb
            aria-label={label}
            // A 12 px dot, grabbed on 24 px (WCAG 2.5.8): the hit area is the ::before's.
            className="ease-out-quart size-3 rounded-full bg-current transition-transform duration-150 group-hover/slider:scale-125 before:absolute before:-inset-1.5 before:rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current active:scale-125"
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
