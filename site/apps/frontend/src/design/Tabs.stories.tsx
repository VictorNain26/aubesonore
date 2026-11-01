import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Tabs } from './Tabs';
import * as m from '@/paraglide/messages.js';

/**
 * Musilogy's close artists (musilogy/ArtistSections.tsx), its three tabs: each panel holds here the
 * sentence the real one opens with, its timeline left out. The words are read as the story renders.
 */
function CloseArtists({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const tabs = [
    { id: 'same-sound', label: m.musilogy_tab_same_sound(), note: m.musilogy_close_same() },
    { id: 'colisten', label: m.musilogy_tab_colisten(), note: m.musilogy_colisten_note() },
    { id: 'filiation', label: m.musilogy_tab_filiation(), note: m.musilogy_filiation_note() },
  ].map(({ id, label, note }) => ({ id, label, panel: <p className="m-0">{note}</p> }));
  return (
    <Tabs label={m.musilogy_close_title()} tabs={tabs} selected={selected} onSelect={onSelect} />
  );
}

const meta = {
  title: 'Composants/Tabs',
  component: CloseArtists,
  args: { selected: 'same-sound', onSelect: fn() },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CloseArtists>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Premier: Story = { name: 'Le premier onglet' };

export const Deuxieme: Story = { name: 'Un autre onglet', args: { selected: 'colisten' } };

/** One row that scrolls sideways past the gutter. */
export const Telephone: Story = {
  name: 'Petit téléphone',
  globals: { viewport: { value: 'w320' } },
};
