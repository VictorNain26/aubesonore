// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Layout from './Layout';

const mockMatchMedia = () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
};

beforeEach(() => {
  mockMatchMedia();
  window.history.replaceState({}, '', '/');
});

describe('Layout', () => {
  it('renders the skip link to the main landmark and the page', () => {
    render(
      <Layout>
        <main id="main">contenu</main>
      </Layout>
    );

    const skipLink = screen.getByRole('link', { name: 'Aller au contenu principal' });
    expect(skipLink).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveTextContent('contenu');
  });
});
