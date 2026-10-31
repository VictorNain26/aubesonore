import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { SiteHeader } from '../shell/SiteHeader';
import { useAuthStore } from '../stores/authStore';
import { CASSIUS, NO_HIT_QUERY } from '../stories/artist';
import { MusilogyHomeView } from './SearchView';

const meta = {
  title: 'Pages/Musilogy',
  component: MusilogyHomeView,
  args: { query: '', onQueryChange: fn(), search: { status: 'idle' } },
  // The header above the search, as pages/MusilogyPage.tsx lays them out.
  decorators: [
    (Story) => (
      <div className="min-h-page flex flex-col">
        <SiteHeader />
        <Story />
      </div>
    ),
  ],
  // The header asks who is signed in: a visitor, the session read.
  beforeEach: () => {
    useAuthStore.setState({ isLoading: false, isAuthenticated: false, user: null });
  },
} satisfies Meta<typeof MusilogyHomeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AvantLaSaisie: Story = { name: 'Avant la saisie' };

/** Under two letters, no search: the hint stays. */
export const UneLettre: Story = { name: 'Une lettre', args: { query: 'c' } };

export const Resultats: Story = {
  name: 'Résultats',
  args: { query: 'cassius', search: { status: 'done', hits: CASSIUS } },
};

export const Telephone: Story = {
  name: 'Téléphone : résultats',
  args: { query: 'cassius', search: { status: 'done', hits: CASSIUS } },
  globals: { viewport: { value: 'w390' } },
};

export const PremiereRecherche: Story = {
  name: 'Recherche en cours',
  args: { query: 'cassius', search: { status: 'searching', hits: [] } },
};

/** The answer to « cassius » stays on screen, dimmed, while the next one comes. */
export const RechercheSuivante: Story = {
  name: 'Recherche suivante',
  args: { query: 'cassius k', search: { status: 'searching', hits: CASSIUS } },
};

export const AucunResultat: Story = {
  name: 'Aucun résultat',
  args: { query: NO_HIT_QUERY, search: { status: 'done', hits: [] } },
};

export const Erreur: Story = {
  name: 'Erreur',
  args: { query: 'cassius', search: { status: 'error' } },
};

/** Musilogy is not loaded on the server (a 503). */
export const Indisponible: Story = {
  name: 'Indisponible',
  args: { query: 'cassius', search: { status: 'unavailable' } },
};
