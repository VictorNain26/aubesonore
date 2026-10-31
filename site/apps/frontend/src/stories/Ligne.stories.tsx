import type { Meta, StoryObj } from '@storybook/react-vite';
import { CoverGlyph } from '../design/CoverGlyph';
import { LineLoader } from '../design/LineLoader';

/**
 * The site's line where it stands alone: the loader, and the cover a track without one gets. The
 * horizon takes its height from the hero (the `hero` utility of design/tokens.css): it is seen in
 * « Pages/Accueil », the bar's edge in « Coque/La barre ».
 */
const meta = {
  title: 'Fondations/La ligne',
  component: LineLoader,
  decorators: [
    (Story) => (
      <div className="bg-surface text-text py-10">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LineLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Chargement: Story = { name: 'Le chargement', args: { className: 'px-page' } };

export const PochetteAbsente: Story = {
  name: 'Une pochette absente',
  render: () => (
    <div className="px-page flex gap-4">
      <CoverGlyph seed="Un artiste|Un titre" className="size-24" />
      <CoverGlyph seed="Un autre artiste|Un autre titre" className="size-24" />
    </div>
  ),
};
