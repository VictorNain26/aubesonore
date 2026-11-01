import type { Meta, StoryObj } from '@storybook/react-vite';
import { useNowPlayingStore, type NowPlaying } from '../lib/azuracast';
import { usePlayer } from '../lib/player';
import { useAuthStore } from '../stores/authStore';
import { LONG_UNCOVERED, LONG_WORD, TRACKS, WEEK, nowPlayingPayload } from '../stories/fixtures';
import { Hero } from './Hero';

interface Live {
  /** The station's answer; null with `unreachable` while it does not answer. */
  data: NowPlaying | null;
  unreachable?: boolean;
  playing?: boolean;
}

/**
 * The stores the hero reads, as the live and the player would leave them, then back to their
 * first state: the next story starts clean.
 */
function live({ data, unreachable = false, playing = false }: Live): () => () => void {
  return () => {
    useNowPlayingStore.setState({
      data,
      isConnected: data !== null,
      error: unreachable ? 'unreachable' : null,
    });
    usePlayer.setState({ isPlaying: playing, isConnecting: false });
    useAuthStore.setState({ isLoading: false, isAuthenticated: false, user: null });
    return () => {
      useNowPlayingStore.setState(useNowPlayingStore.getInitialState(), true);
      usePlayer.setState({ isPlaying: false, isConnecting: false });
    };
  };
}

const meta = {
  title: 'Pages/Accueil',
  component: Hero,
  args: { trends: { week: WEEK } },
} satisfies Meta<typeof Hero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnDirect: Story = {
  name: 'En direct',
  beforeEach: live({ data: nowPlayingPayload(TRACKS.growlers, TRACKS.danny) }),
};

export const EnEcoute: Story = {
  name: 'En écoute',
  beforeEach: live({ data: nowPlayingPayload(TRACKS.growlers, TRACKS.danny), playing: true }),
};

export const SansPochetteTitreLong: Story = {
  name: 'Sans pochette, titre long',
  beforeEach: live({ data: nowPlayingPayload(LONG_UNCOVERED, TRACKS.gesaffelstein) }),
};

export const TitreTresLong: Story = {
  name: 'Titre très long, mot sans coupure',
  beforeEach: live({ data: nowPlayingPayload(LONG_WORD, TRACKS.danny) }),
};

export const PremierTitre: Story = {
  name: 'Rien juste avant',
  beforeEach: live({ data: nowPlayingPayload(TRACKS.tame, null) }),
};

export const RienAvantSemaineVide: Story = {
  name: 'Rien juste avant, semaine vide',
  args: { trends: { week: [] } },
  beforeEach: live({ data: nowPlayingPayload(TRACKS.tame, null) }),
};

export const Chargement: Story = {
  name: 'Le direct n’a pas encore répondu',
  args: { trends: null },
  beforeEach: live({ data: null }),
};

export const HorsAntenne: Story = {
  name: 'Hors antenne',
  beforeEach: live({ data: nowPlayingPayload(TRACKS.growlers, TRACKS.danny, false) }),
};

export const Injoignable: Story = {
  name: 'Le direct ne répond pas',
  beforeEach: live({ data: null, unreachable: true }),
};

export const SemaineVide: Story = {
  name: 'Semaine sans titre gardé',
  args: { trends: { week: [] } },
  beforeEach: live({ data: nowPlayingPayload(TRACKS.growlers, TRACKS.danny) }),
};

export const SemaineEnErreur: Story = {
  name: 'Classement indisponible',
  args: { trends: 'failed' },
  beforeEach: live({ data: nowPlayingPayload(TRACKS.growlers, TRACKS.danny) }),
};
