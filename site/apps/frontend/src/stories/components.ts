import { fn } from 'storybook/test';
import type { User } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

// Sample data for the stories of Composants and Coque. Records are real: their release groups read
// from MusicBrainz (/ws/2/release-group?artist=…&type=album) and their fronts asked of the Cover
// Art Archive (front-250), 2026-10-31.

/** A release group's front cover, as the site receives it (stories/fixtures.ts). */
const cover = (releaseGroup: string) =>
  `https://coverartarchive.org/release-group/${releaseGroup}/front`;

/** Tame Impala's four first studio albums, oldest first: each has a front at the archive. */
export const RECORDS = [
  {
    title: 'Innerspeaker',
    year: 2010,
    art: cover('0cfdeff7-4aa7-4df4-918d-88c9421cc512'),
  },
  {
    title: 'Lonerism',
    year: 2012,
    art: cover('b0864c80-2726-4761-bf66-a97610162a2c'),
  },
  {
    title: 'Currents',
    year: 2015,
    art: cover('08aa7a6c-3e43-4459-87b2-e47faf3a088a'),
  },
  {
    title: 'The Slow Rush',
    year: 2020,
    art: cover('c6fc678e-e987-45c5-811c-e2bd09c8b902'),
  },
] as const;

/** Tame Impala's « Innerspeaker: Demos »: the archive has no front for it (404). */
export const WITHOUT_FRONT = {
  title: 'Innerspeaker: Demos',
  art: cover('388e245f-b1e1-4068-858d-237b276f21fc'),
} as const;

/** An example account, not a real listener. */
export const EXAMPLE_USER: User = {
  id: 'example',
  email: 'auditrice@example.com',
  name: 'Camille',
  image: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

/**
 * The account store as the session would leave it (`loading`: while it is read), the sign-out
 * caught by the Actions panel; then back to its first state, so the next story starts clean.
 */
export function account(state: 'guest' | 'signed-in' | 'loading'): () => () => void {
  return () => {
    useAuthStore.setState({
      user: state === 'signed-in' ? EXAMPLE_USER : null,
      isAuthenticated: state === 'signed-in',
      isLoading: state === 'loading',
      authError: null,
      signOut: fn(),
    });
    return () => useAuthStore.setState(useAuthStore.getInitialState(), true);
  };
}
