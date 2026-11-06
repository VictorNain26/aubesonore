import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('still resolves two sizes or two colors to the last one', () => {
    expect(cn('text-body', 'text-small')).toBe('text-small');
    expect(cn('text-text', 'text-on-accent')).toBe('text-on-accent');
  });
});
