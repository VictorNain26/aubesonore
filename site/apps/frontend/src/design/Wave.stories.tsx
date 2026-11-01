import type { Meta, StoryObj } from '@storybook/react-vite';
import { Wave } from './Wave';

/**
 * The line, drawn at its box's size in the ink's colour. The loader (`travel`) and the missing
 * cover are in « Fondations/La ligne ».
 */
const meta = {
  title: 'Composants/Wave',
  component: Wave,
  args: { height: 40, amplitude: 4, seed: 1.7, className: 'text-text h-10 w-full' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Wave>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UneTrace: Story = { name: 'Une trace' };

export const AvecSonEcho: Story = { name: 'Avec son écho', args: { traces: 2 } };

export const Ample: Story = {
  name: 'Ample',
  args: { height: 80, amplitude: 12, className: 'text-text h-20 w-full' },
};
