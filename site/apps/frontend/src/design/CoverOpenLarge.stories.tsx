import type { Meta, StoryObj } from '@storybook/react-vite';
import { RECORDS } from '../stories/components';
import { CoverOpenLarge, type CoverOpenLargeProps } from './CoverOpenLarge';
import * as m from '@/paraglide/messages.js';

const [, lonerism] = RECORDS;

/** A record of an artist's page (musilogy/Releases.tsx), its words read as the story renders. */
function Record(props: Pick<CoverOpenLargeProps, 'src'>) {
  return (
    <CoverOpenLarge
      {...props}
      alt=""
      seed={lonerism.title}
      label={m.cover_open({ title: lonerism.title })}
      title={lonerism.title}
      largeAlt={m.artist_cover_alt({ title: lonerism.title })}
      caption={m.artist_cover_caption({ title: lonerism.title, year: String(lonerism.year) })}
      triggerClassName="w-48"
      className="aspect-square w-full"
      sizes="12rem"
    />
  );
}

/** The cover opens large (OpenLarge, Base UI's Dialog) on a click; without art, it opens nothing. */
const meta = {
  title: 'Composants/CoverOpenLarge',
  component: Record,
  args: { src: lonerism.art },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Record>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fermee: Story = { name: 'Dans la page' };

export const Ouverte: Story = {
  name: 'Ouverte en grand',
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: m.cover_open({ title: lonerism.title }) })
    );
  },
};

/** No art: the glyph, and nothing to open. */
export const SansPochette: Story = { name: 'Sans pochette', args: { src: null } };
