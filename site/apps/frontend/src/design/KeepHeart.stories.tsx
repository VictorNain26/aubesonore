import type { Meta, StoryObj } from '@storybook/react-vite';
import { KeepHeart } from './KeepHeart';

/** The heart beats once when `isKept` turns true: switch it in the Controls panel to see it. */
const meta = {
  title: 'Composants/KeepHeart',
  component: KeepHeart,
  args: { isKept: false, className: 'size-6' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof KeepHeart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vide: Story = { name: 'Pas gardé' };

export const Plein: Story = { name: 'Gardé', args: { isKept: true } };
