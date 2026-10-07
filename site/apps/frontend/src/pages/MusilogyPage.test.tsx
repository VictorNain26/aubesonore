// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import MusilogyPage from './MusilogyPage';

const DAFT_PUNK = {
  mbid: '056e4f3e-d505-4dad-8ec1-d04f521cbb56',
  name: 'Daft Punk',
  disambiguation: 'French electronic duo',
  type: 'Group',
  y0: 1993,
};

describe('MusilogyPage', () => {
  it('does not bring back an earlier answer once the field was cleared', async () => {
    server.use(
      http.get('http://localhost:3000/api/musilogy/search', ({ request }) =>
        HttpResponse.json(new URL(request.url).searchParams.get('q') === 'daft' ? [DAFT_PUNK] : [])
      )
    );
    render(
      <MemoryRouter initialEntries={['/musilogy']}>
        <Routes>
          <Route path="/musilogy" element={<MusilogyPage />} />
        </Routes>
      </MemoryRouter>
    );

    const field = screen.getByRole('searchbox', { name: 'Chercher un artiste' });
    await userEvent.type(field, 'daft');
    expect(await screen.findByRole('link', { name: 'Daft Punk' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    await userEvent.type(field, 'ra');

    // Before the next answer comes, the page waits on nothing: Daft Punk is not the previous answer.
    expect(screen.queryByRole('link', { name: 'Daft Punk' })).not.toBeInTheDocument();
    expect(await screen.findByText('Aucun artiste de ce nom.')).toBeInTheDocument();
  });
});
