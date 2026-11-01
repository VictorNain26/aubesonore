import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { RECORDS, WITHOUT_FRONT } from '../stories/components';
import { Cover } from './Cover';

const [, , currents] = RECORDS;

const meta = {
  title: 'Composants/Cover',
  component: Cover,
  args: {
    src: currents.art,
    alt: currents.title,
    seed: `Tame Impala|${currents.title}`,
    className: 'size-48',
    sizes: '12rem',
    onError: fn(),
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Cover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AvecPochette: Story = { name: 'Avec sa pochette' };

/** No art at all: the glyph drawn from the seed. */
export const SansPochette: Story = { name: 'Sans pochette', args: { src: null } };

/** A record the archive has no front for: the image fails, the glyph takes its place. */
export const PochetteIntrouvable: Story = {
  name: 'Pochette introuvable',
  args: {
    src: WITHOUT_FRONT.art,
    alt: WITHOUT_FRONT.title,
    seed: `Tame Impala|${WITHOUT_FRONT.title}`,
  },
};
