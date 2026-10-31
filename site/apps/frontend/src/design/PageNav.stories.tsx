import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageNav } from './PageNav';
import * as m from '@/paraglide/messages.js';

/**
 * The anchors of an artist's page (artist/ArtistPageView.tsx), its words read as the story renders.
 * With fewer than two sections it shows nothing: no story for that.
 */
function ArtistNav() {
  return (
    <PageNav
      items={[
        { id: 'kept', label: m.artist_kept_title() },
        { id: 'records', label: m.artist_records_title() },
        { id: 'close', label: m.musilogy_close_title() },
      ]}
    />
  );
}

const meta = {
  title: 'Composants/PageNav',
  component: ArtistNav,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ArtistNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TroisSections: Story = { name: 'Trois sections' };

/** One row that scrolls sideways past the gutter. */
export const Telephone: Story = {
  name: 'Petit téléphone',
  globals: { viewport: { value: 'w320' } },
};
