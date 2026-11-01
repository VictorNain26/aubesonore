import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('keeps a custom font size next to a text color', () => {
    expect(cn('text-body text-on-accent')).toBe('text-body text-on-accent');
    expect(cn('text-small', 'text-text-muted')).toBe('text-small text-text-muted');
  });

  it('still resolves two sizes or two colors to the last one', () => {
    expect(cn('text-body', 'text-small')).toBe('text-small');
    expect(cn('text-text', 'text-on-accent')).toBe('text-on-accent');
  });
});
