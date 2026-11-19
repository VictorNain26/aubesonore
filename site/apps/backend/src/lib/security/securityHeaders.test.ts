import { afterEach, describe, expect, it } from 'bun:test';
import { env } from '../../config/env';
import { applySecurityHeaders } from './securityHeaders';

const isProd = env.IS_PROD;

afterEach(() => {
  env.IS_PROD = isProd;
});

describe('applySecurityHeaders', () => {
  // Once seen, the browser never asks this site over plain http again, for a year.
  it('keeps the browser to https in production', () => {
    env.IS_PROD = true;
    const headers: Record<string, string | number | undefined> = {};

    applySecurityHeaders(headers);

    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
  });
});
