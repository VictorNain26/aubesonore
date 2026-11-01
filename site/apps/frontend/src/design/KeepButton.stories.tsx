import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { TRACKS } from '../stories/fixtures';
import { KEEP_RING } from './classes';
import { KeepButton } from './KeepButton';

/** In the ring the hero and the phone's sheet give it (design/classes.ts, KEEP_RING). */
const meta = {
  title: 'Composants/KeepButton',
  component: KeepButton,
  args: {
    title: TRACKS.growlers.title,
    isKept: false,
    onToggle: fn(),
    className: KEEP_RING,
    heartClassName: 'size-6',
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof KeepButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PasGarde: Story = { name: 'Pas gardé' };

export const Garde: Story = { name: 'Gardé', args: { isKept: true } };

export const EnCours: Story = { name: 'Garde en cours', args: { isKeeping: true } };
