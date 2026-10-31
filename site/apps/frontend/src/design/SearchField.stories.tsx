import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { SearchField } from './SearchField';
import * as m from '@/paraglide/messages.js';

/**
 * Mes titres' search (library/MyTracksView.tsx), and Musilogy's, larger (musilogy/SearchView.tsx);
 * their words read as the story renders.
 */
function Search({
  query,
  onQueryChange,
  musilogy = false,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  musilogy?: boolean;
}) {
  return (
    <SearchField
      label={musilogy ? m.musilogy_search_label() : m.library_search_label()}
      placeholder={musilogy ? m.musilogy_search_placeholder() : m.library_search_placeholder()}
      query={query}
      onQueryChange={onQueryChange}
      large={musilogy}
    />
  );
}

const meta = {
  title: 'Composants/SearchField',
  component: Search,
  args: { query: '', onQueryChange: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Search>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vide: Story = { name: 'Vide' };

/** Something typed: the clear button shows. */
export const Saisie: Story = { name: 'Saisie', args: { query: 'Tame Impala' } };

export const Musilogy: Story = { name: 'Musilogy, vide', args: { musilogy: true } };

export const MusilogySaisie: Story = {
  name: 'Musilogy, saisie',
  args: { musilogy: true, query: 'Tame Impala' },
};
