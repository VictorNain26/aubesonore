import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Slider, type SliderProps } from './Slider';
import * as m from '@/paraglide/messages.js';

/**
 * The volume's slider as shell/VolumeControl.tsx sets it, 0 to 100 by steps of 5, its name read
 * as the story renders so that it follows the toolbar's « Langue ».
 */
function Volume(props: Pick<SliderProps, 'value' | 'onValueChange' | 'disabled'>) {
  return (
    <Slider {...props} label={m.volume_slider()} min={0} max={100} step={5} className="w-28" />
  );
}

const meta = {
  title: 'Composants/Slider',
  component: Volume,
  args: { value: 60, onValueChange: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Volume>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AuMilieu: Story = { name: 'À 60' };

export const AuMinimum: Story = { name: 'À 0', args: { value: 0 } };

export const AuMaximum: Story = { name: 'À 100', args: { value: 100 } };

export const Desactive: Story = { name: 'Désactivé', args: { disabled: true } };
