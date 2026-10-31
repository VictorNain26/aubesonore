import type { Meta, StoryObj } from '@storybook/react-vite';
import { useAuthStore } from '../stores/authStore';
import { KEPT, LISTENER, STEREOLAB, STEREOLAB_MUSILOGY, TRAIL } from '../stories/artist';
import { ArtistPageView } from './ArtistPageView';

const meta = {
  title: 'Pages/Artiste',
  component: ArtistPageView,
  args: {
    state: { status: 'ready', profile: STEREOLAB },
    kept: KEPT,
    musilogy: STEREOLAB_MUSILOGY,
    trail: TRAIL,
  },
  // Kept tracks are a signed-in listener's: the header shows one (an example account), then the
  // store goes back to its first state for the next story.
  beforeEach: () => {
    useAuthStore.setState({ isLoading: false, isAuthenticated: true, user: LISTENER });
    return () => useAuthStore.setState(useAuthStore.getInitialState(), true);
  },
} satisfies Meta<typeof ArtistPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Complete: Story = { name: 'Complète' };

export const Telephone: Story = {
  name: 'Téléphone : complète',
  globals: { viewport: { value: 'w390' } },
};

export const SansMusilogy: Story = { name: 'Sans Musilogy', args: { musilogy: null } };

/** Without a Wikipedia article, the facts are said in a sentence. */
export const SansResume: Story = {
  name: 'Sans résumé Wikipédia',
  args: { state: { status: 'ready', profile: { ...STEREOLAB, summary: null } } },
};

export const Chargement: Story = { name: 'Chargement', args: { state: { status: 'loading' } } };

export const Introuvable: Story = { name: 'Introuvable', args: { state: { status: 'missing' } } };

export const Erreur: Story = { name: 'Erreur', args: { state: { status: 'error' } } };
