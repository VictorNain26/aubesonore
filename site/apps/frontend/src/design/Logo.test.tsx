// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

beforeEach(() => {
  vi.resetModules();
});

// The logo is aria-hidden, so the tests read the markup a wrapper holds.
const markup = (testId: string) => screen.getByTestId(testId).innerHTML;

describe('Logo', () => {
  it('is decoration: the link or heading around it carries the name', async () => {
    const { Logo } = await import('./Logo');
    render(
      <span data-testid="logo">
        <Logo />
      </span>
    );
    expect(markup('logo')).toMatch(/^<svg[^>]* aria-hidden="true"/);
    expect(markup('logo').match(/class="logo-letter"/g)).toHaveLength('aubesonore'.length);
  });

  it('plays its intro once per page load, whichever logo asks first', async () => {
    const { Logo } = await import('./Logo');
    render(
      <span data-testid="first">
        <Logo intro />
      </span>
    );
    render(
      <span data-testid="later">
        <Logo intro />
      </span>
    );
    expect(markup('first')).toContain('logo-intro');
    expect(markup('later')).not.toContain('logo-intro');
  });

  it('keeps each logo’s clip paths to itself', async () => {
    const { Logo } = await import('./Logo');
    render(
      <span data-testid="pair">
        <Logo />
        <Logo />
      </span>
    );
    const ids = [...markup('pair').matchAll(/<clipPath id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });
});
