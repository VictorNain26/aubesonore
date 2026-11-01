import type { Meta, StoryObj } from '@storybook/react-vite';
import { TRACKS } from '../stories/fixtures';
import { CoverLight } from './CoverLight';

/**
 * The light lies behind its host (the hero, the phone's sheet, the bar), filling it: here a box of
 * the paper. Changing `art` in the Controls panel shows the cross-fade from one light to the next.
 */
const meta = {
  title: 'Composants/CoverLight',
  component: CoverLight,
  args: { art: TRACKS.growlers.art },
  decorators: [
    (Story) => (
      <div className="relative h-96 w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CoverLight>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnePochette: Story = { name: 'La lumière d’une pochette' };

export const UneAutrePochette: Story = {
  name: 'Une autre pochette',
  args: { art: TRACKS.lorde.art },
};

/** Off air, or a track without a cover: no light. */
export const SansPochette: Story = { name: 'Sans pochette', args: { art: null } };
