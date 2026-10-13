// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Slider } from './Slider';

function ControlledSlider({
  onValueChange,
  disabled = false,
}: {
  onValueChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(0.5);
  return (
    <Slider
      label="Volume"
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

describe('Slider', () => {
  it('renders a slider with the given label', () => {
    render(<Slider label="Volume" value={0.5} onValueChange={vi.fn()} />);
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
  });

  it('calls onValueChange with a number on keyboard interaction', () => {
    const onValueChange = vi.fn();
    render(<ControlledSlider onValueChange={onValueChange} />);
    const thumb = screen.getByRole('slider', { name: 'Volume' });
    thumb.focus();
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenCalledWith(expect.any(Number));
  });

  it('renders disabled and blocks keyboard focus', () => {
    const onValueChange = vi.fn();
    render(<ControlledSlider onValueChange={onValueChange} disabled />);
    const thumb = screen.getByRole('slider', { name: 'Volume' });
    expect(thumb).toBeDisabled();
    thumb.focus();
    expect(thumb).not.toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('supports a vertical orientation', () => {
    render(
      <Slider
        label="Volume"
        orientation="vertical"
        value={0.5}
        onValueChange={vi.fn()}
        min={0}
        max={1}
        step={0.05}
      />
    );
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute(
      'aria-orientation',
      'vertical'
    );
  });
});
