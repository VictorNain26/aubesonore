// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './App';

// The page chunk fails to load, as offline or blocked by an extension.
vi.mock('./pages/ArtistPage', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

describe('App', () => {
  it('shows the artist page error state when its chunk fails to load', async () => {
    render(
      <MemoryRouter initialEntries={['/artiste/hania-rani']}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Page indisponible.' })).toBeInTheDocument();
    // In the frame of every page, footer and way back to the live included.
    expect(screen.getByRole('link', { name: 'Revenir au direct' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
