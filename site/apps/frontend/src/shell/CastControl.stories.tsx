import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CastControl } from './CastControl';
import * as m from '@/paraglide/messages.js';

// « Salon » is an example device name.

const meta = {
  title: 'Coque/CastControl',
  component: CastControl,
  args: {
    variant: 'hero',
    diffusion: { kind: 'chromecast', found: true, device: null, connecting: false, onOpen: fn() },
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CastControl>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Clicked with no device on the network: what to check, in place of an empty picker. */
const askHelp: Story['play'] = async ({ canvas, userEvent }) => {
  await userEvent.click(await canvas.findByRole('button', { name: m.cast_open() }));
};

export const AppareilTrouve: Story = { name: 'Un appareil trouvé' };

export const AucunAppareilChromecast: Story = {
  name: 'Aucun appareil, Chromecast',
  args: {
    diffusion: { kind: 'chromecast', found: false, device: null, connecting: false, onOpen: fn() },
  },
  play: askHelp,
};

export const AucunAppareilAirPlay: Story = {
  name: 'Aucun appareil, AirPlay',
  args: {
    diffusion: { kind: 'airplay', found: false, device: null, connecting: false, onOpen: fn() },
  },
  play: askHelp,
};

export const Connexion: Story = {
  name: 'Connexion',
  args: {
    diffusion: { kind: 'chromecast', found: true, device: null, connecting: true, onOpen: fn() },
  },
};

export const EnDiffusion: Story = {
  name: 'Diffusion en cours',
  args: {
    diffusion: {
      kind: 'chromecast',
      found: true,
      device: 'Salon',
      connecting: false,
      onOpen: fn(),
    },
  },
};

/** In the phone's sheet (shell/NowPlayingSheet.tsx). */
export const DansLaFiche: Story = { name: 'Dans la fiche', args: { variant: 'text' } };

/** On the player bar's ink (shell/PlayerBar.tsx), whose class gives it its colours. */
export const DansLaBarre: Story = {
  name: 'Dans la barre, diffusion en cours',
  args: {
    variant: 'bar',
    diffusion: {
      kind: 'chromecast',
      found: true,
      device: 'Salon',
      connecting: false,
      onOpen: fn(),
    },
  },
  decorators: [
    (Story) => (
      <div className="player-bar bg-accent text-on-accent flex justify-end p-4">
        <Story />
      </div>
    ),
  ],
};
