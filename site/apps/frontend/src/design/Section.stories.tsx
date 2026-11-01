import type { Meta, StoryObj } from '@storybook/react-vite';
import { RECORDS } from '../stories/components';
import { TRACKS } from '../stories/fixtures';
import { Cover } from './Cover';
import { Section } from './Section';
import * as m from '@/paraglide/messages.js';

/**
 * Two sections of Tame Impala's page (artist/ArtistPageView.tsx): the records, how many beside the
 * title; a kept track, without. The words are read as the story renders.
 */
function ArtistSection({ records }: { records: boolean }) {
  return records ? (
    <Section id="records" title={m.artist_records_title()} count={RECORDS.length}>
      <ul className="m-0 grid list-none grid-cols-2 gap-5 p-0 md:grid-cols-4">
        {RECORDS.map((record) => (
          <li key={record.title} className="flex flex-col gap-2">
            <Cover src={record.art} alt="" seed={record.title} className="aspect-square w-full" />
            <span className="text-body">{record.title}</span>
          </li>
        ))}
      </ul>
    </Section>
  ) : (
    <Section id="kept" title={m.artist_kept_title()}>
      <p className="m-0">{TRACKS.tame.title}</p>
    </Section>
  );
}

const meta = {
  title: 'Composants/Section',
  component: ArtistSection,
  args: { records: true },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ArtistSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AvecCompte: Story = { name: 'Avec son nombre' };

export const SansCompte: Story = { name: 'Sans nombre', args: { records: false } };
