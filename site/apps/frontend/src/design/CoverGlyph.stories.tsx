import type { Meta, StoryObj } from '@storybook/react-vite';
import { TRACKS } from '../stories/fixtures';
import { CoverGlyph } from './CoverGlyph';

const { growlers, danny } = TRACKS;

/** Its seed is the track (`${artist}|${title}`): another track draws another line and sun. */
const meta = {
  title: 'Composants/CoverGlyph',
  component: CoverGlyph,
  args: { seed: `${growlers.artist}|${growlers.title}`, className: 'size-48' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CoverGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnTitre: Story = { name: 'Un titre' };

export const UnAutreTitre: Story = {
  name: 'Un autre titre',
  args: { seed: `${danny.artist}|${danny.title}` },
};

/** At the player bar's size on a computer (shell/PlayerBar.tsx). */
export const Petite: Story = { name: 'Petite', args: { className: 'size-12' } };
