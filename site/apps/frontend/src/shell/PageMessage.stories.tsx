import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageMessage } from './PageMessage';
import * as m from '@/paraglide/messages.js';

/** The three answers the site gives with it, their words read as the story renders. */
function Message({ page }: { page: 'not-found' | 'unknown-artist' | 'failed' }) {
  const words = {
    'not-found': { title: m.notfound_title(), body: m.notfound_body() },
    'unknown-artist': { title: m.artist_missing_title(), body: m.artist_missing_body() },
    failed: { title: m.artist_error_title(), body: m.artist_error_body() },
  }[page];
  return <PageMessage {...words} />;
}

const meta = {
  title: 'Coque/PageMessage',
  component: Message,
  args: { page: 'not-found' },
} satisfies Meta<typeof Message>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The 404 (pages/NotFoundPage.tsx). */
export const Introuvable: Story = { name: 'Page introuvable' };

/** An artist the site does not know (artist/ArtistPageView.tsx). */
export const ArtisteInconnu: Story = {
  name: 'Artiste introuvable',
  args: { page: 'unknown-artist' },
};

/** A page that could not load (artist/ArtistPageView.tsx, PageError). */
export const Indisponible: Story = { name: 'Page indisponible', args: { page: 'failed' } };
