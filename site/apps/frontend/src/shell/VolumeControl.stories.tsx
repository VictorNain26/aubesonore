import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { VolumeControl } from './VolumeControl';

/** The speaker's icon follows the level: off at 0, low under half, high from half. */
const meta = {
  title: 'Coque/VolumeControl',
  component: VolumeControl,
  args: { volume: 0.8, isMuted: false, onVolumeChange: fn(), onToggleMute: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof VolumeControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fort: Story = { name: 'Fort' };

export const Faible: Story = { name: 'Faible', args: { volume: 0.3 } };

export const AZero: Story = { name: 'À zéro', args: { volume: 0 } };

/** Muted: the level reads 0, the volume kept for when the sound comes back. */
export const Coupe: Story = { name: 'Son coupé', args: { isMuted: true } };
