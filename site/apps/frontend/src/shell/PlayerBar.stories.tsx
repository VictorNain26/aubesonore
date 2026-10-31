import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { TRACKS } from '../stories/fixtures';
import { PlayerBarView } from './PlayerBar';
import * as m from '@/paraglide/messages.js';

const { growlers } = TRACKS;

const meta = {
  title: 'Coque/La barre',
  component: PlayerBarView,
  args: {
    isHidden: false,
    listen: 'idle',
    onToggleListen: fn(),
    track: { ...growlers, playedAt: Math.floor(Date.now() / 1000) - 60 },
    isKept: false,
    onToggleKeep: fn(),
    onShare: fn(),
    volume: 0.8,
    isMuted: false,
    onVolumeChange: fn(),
    onToggleMute: fn(),
    diffusion: null,
    artistHref: '/artiste/the-growlers',
    isOnline: true,
  },
  // The bar is pinned to the foot of the page: the story gives it a page to sit on.
  decorators: [
    (Story) => (
      <div className="bg-surface min-h-svh">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlayerBarView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ALArret: Story = { name: 'À l’arrêt' };

export const EnEcoute: Story = { name: 'En écoute', args: { listen: 'playing' } };

export const Connexion: Story = { name: 'Connexion au direct', args: { listen: 'connecting' } };

export const Garde: Story = { name: 'Titre gardé', args: { isKept: true } };

export const Muet: Story = { name: 'Son coupé', args: { listen: 'playing', isMuted: true } };

export const AvecDiffuser: Story = {
  name: 'Diffuser, un appareil trouvé',
  args: {
    diffusion: { kind: 'chromecast', found: true, device: null, connecting: false, onOpen: fn() },
  },
};

export const SurUnAppareil: Story = {
  name: 'Diffusion en cours',
  args: {
    listen: 'playing',
    diffusion: {
      kind: 'chromecast',
      found: true,
      device: 'Salon',
      connecting: false,
      onOpen: fn(),
    },
  },
};

export const SansPageArtiste: Story = { name: 'Artiste sans page', args: { artistHref: null } };

export const HorsAntenne: Story = { name: 'Hors antenne', args: { isOnline: false } };

/** On a phone, the track line opens the sheet: it is opened here as a tap would. */
export const FicheDuTelephone: Story = {
  name: 'Téléphone : la fiche du titre',
  globals: { viewport: { value: 'w390' } },
  play: async ({ canvas, userEvent }) => {
    const opens = m.sheet_open({ title: growlers.title, artist: growlers.artist });
    await userEvent.click(await canvas.findByRole('button', { name: opens }));
  },
};
