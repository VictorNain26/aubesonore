import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { baseLocale } from '@/paraglide/runtime.js';
import { KEPT, THIS_YEAR } from '../stories/account';
import { MyTracksView } from './MyTracksView';
import { DEFAULT_SORT, filterKept, sortKept, type KeptSort } from './order';

/** The library as MyTracksPage hands it over: sorted, then searched. */
function ready(sort: KeptSort, query = '') {
  const tracks = sortKept(KEPT, sort, baseLocale);
  return {
    state: { status: 'ready', tracks: filterKept(tracks, query, baseLocale), total: tracks.length },
    sort,
    query,
  } as const;
}

const meta = {
  title: 'Pages/Mes titres',
  component: MyTracksView,
  args: {
    ...ready(DEFAULT_SORT),
    onSortChange: fn(),
    onQueryChange: fn(),
    onRemove: fn(),
    thisYear: THIS_YEAR,
  },
} satisfies Meta<typeof MyTracksView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Liste: Story = { name: 'Les plus récents d’abord' };

export const ParArtiste: Story = {
  name: 'Triés par artiste',
  args: ready({ key: 'artist', dir: 'asc' }),
};

export const ParTitreDecroissant: Story = {
  name: 'Triés par titre, de Z à A',
  args: ready({ key: 'title', dir: 'desc' }),
};

export const Recherche: Story = { name: 'Une recherche', args: ready(DEFAULT_SORT, 'daft') };

export const RechercheSansResultat: Story = {
  name: 'Une recherche sans résultat',
  args: ready(DEFAULT_SORT, 'brel'),
};

export const UnSeul: Story = {
  name: 'Un seul titre gardé',
  args: { state: { status: 'ready', tracks: KEPT.slice(0, 1), total: 1 } },
};

export const Vide: Story = {
  name: 'Rien de gardé',
  args: { state: { status: 'ready', tracks: [], total: 0 } },
};

export const Deconnecte: Story = {
  name: 'Déconnecté',
  args: { state: { status: 'signed-out', signInHref: '/connexion', from: '/mes-titres' } },
};

export const Chargement: Story = { name: 'Chargement', args: { state: { status: 'loading' } } };

export const Erreur: Story = {
  name: 'Titres indisponibles',
  args: { state: { status: 'error', onRetry: fn() } },
};
