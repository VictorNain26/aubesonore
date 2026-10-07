/**
 * Environment configuration with startup validation.
 * Required vars throw if missing; optional ones default to a safe value.
 * Never read `process.env` / `Bun.env` outside this module.
 */

import { readFileSync } from 'node:fs';

interface EnvConfig {
  // Core
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  IS_PROD: boolean;

  // Database
  DATABASE_URL: string;
  /** CA of the stack's Postgres (PEM, single-line with \n, or DATABASE_CA_CERT_FILE); required whenever TLS is on. */
  DATABASE_CA_CERT: string | undefined;
  /** Optional pool size override. Defaults to 20, of the 100 connections Postgres allows. */
  DATABASE_POOL_MAX: number;
  /** TLS to Postgres, always verified against DATABASE_CA_CERT. Defaults to true in prod; false for a local plain Postgres. */
  DATABASE_SSL: boolean;

  // Auth
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  FRONTEND_BASE_URL: string;
  BACKEND_BASE_URL: string;
  ALLOWED_ORIGINS: string[];
  COOKIE_DOMAIN: string | undefined;

  // Social OAuth
  GOOGLE_CLIENT_ID: string | undefined;
  GOOGLE_CLIENT_SECRET: string | undefined;
  SPOTIFY_CLIENT_ID: string | undefined;
  SPOTIFY_CLIENT_SECRET: string | undefined;

  // External APIs
  // MusicBrainz and Wikimedia require a User-Agent with a contact and block callers without one.
  OUTBOUND_USER_AGENT: string;
  // Frontend service on the compose network. The artist page reads the deployed
  // index.html from it to inject OG tags; a shared volume would go stale.
  FRONTEND_ORIGIN_INTERNAL: string;
  // The artist pages' server render on the compose network (apps/frontend/scripts/renderer.mjs).
  RENDERER_ORIGIN_INTERNAL: string;

  // AzuraCast (radio history proxy — key must stay server-side)
  AZURACAST_BASE_URL: string;
  AZURACAST_API_KEY: string;
  AZURACAST_STATION_ID: string;

  // YouTube Data API: direct links to kept tracks. Unset, they open a YouTube search.
  YOUTUBE_API_KEY: string | undefined;

  // SMTP
  SMTP_HOST: string | undefined;
  SMTP_PORT: number;
  SMTP_USER: string | undefined;
  SMTP_PASSWORD: string | undefined;
  SMTP_FROM: string;
  DISABLE_EMAILS: boolean;
}

function required(name: string): string {
  const value = Bun.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = Bun.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

function parseInteger(name: string, fallback: number): number {
  const raw = Bun.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer env var: ${name}=${raw}`);
  }
  return parsed;
}

function parseOrigins(name: string): string[] {
  const raw = Bun.env[name];
  if (!raw) return ['http://localhost:8080'];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** CA cert from inline PEM (DATABASE_CA_CERT, \n-escaped) or a mounted file (DATABASE_CA_CERT_FILE). */
function resolveCaCert(): string | undefined {
  const inline = optional('DATABASE_CA_CERT');
  if (inline) return inline.replace(/\\n/g, '\n');
  const file = optional('DATABASE_CA_CERT_FILE');
  if (file) return readFileSync(file, 'utf8');
  return undefined;
}

const nodeEnv = Bun.env.NODE_ENV ?? Bun.env.ENV ?? 'development';
const isProd = nodeEnv === 'production';

export const env: EnvConfig = {
  PORT: parseInteger('PORT', 3000),
  NODE_ENV: nodeEnv === 'production' || nodeEnv === 'test' ? nodeEnv : 'development',
  IS_PROD: isProd,

  DATABASE_URL: required('DATABASE_URL'),
  DATABASE_CA_CERT: resolveCaCert(),
  DATABASE_POOL_MAX: parseInteger('DATABASE_POOL_MAX', 20),
  DATABASE_SSL: Bun.env.DATABASE_SSL ? Bun.env.DATABASE_SSL === 'true' : isProd,

  BETTER_AUTH_SECRET: required('BETTER_AUTH_SECRET'),
  BETTER_AUTH_URL: required('BETTER_AUTH_URL'),
  FRONTEND_BASE_URL: Bun.env.FRONTEND_BASE_URL ?? 'http://localhost:8080',
  BACKEND_BASE_URL: Bun.env.BACKEND_BASE_URL ?? 'http://localhost:3000',
  ALLOWED_ORIGINS: parseOrigins('ALLOWED_ORIGINS'),
  COOKIE_DOMAIN: optional('COOKIE_DOMAIN'),

  GOOGLE_CLIENT_ID: optional('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: optional('GOOGLE_CLIENT_SECRET'),
  SPOTIFY_CLIENT_ID: optional('SPOTIFY_CLIENT_ID'),
  SPOTIFY_CLIENT_SECRET: optional('SPOTIFY_CLIENT_SECRET'),

  OUTBOUND_USER_AGENT: optional('OUTBOUND_USER_AGENT') ?? 'AubeSonore/1.0 (https://aubesonore.fr)',
  FRONTEND_ORIGIN_INTERNAL: Bun.env.FRONTEND_ORIGIN_INTERNAL ?? 'http://frontend',
  RENDERER_ORIGIN_INTERNAL: Bun.env.RENDERER_ORIGIN_INTERNAL ?? 'http://renderer:3000',

  AZURACAST_BASE_URL: Bun.env.AZURACAST_BASE_URL ?? '',
  AZURACAST_API_KEY: Bun.env.AZURACAST_API_KEY ?? '',
  AZURACAST_STATION_ID: Bun.env.AZURACAST_STATION_ID ?? '1',
  YOUTUBE_API_KEY: optional('YOUTUBE_API_KEY'),

  SMTP_HOST: optional('SMTP_HOST'),
  SMTP_PORT: parseInteger('SMTP_PORT', 587),
  SMTP_USER: optional('SMTP_USER'),
  SMTP_PASSWORD: optional('SMTP_PASSWORD'),
  SMTP_FROM: Bun.env.SMTP_FROM ?? 'AubeSonore <noreply@aubesonore.fr>',
  DISABLE_EMAILS: Bun.env.DISABLE_EMAILS === 'true',
};

// Cross-field validation: secrets must be coherent.
// TLS without a CA would encrypt yet accept any certificate. The database is
// the stack's own, signed by its own CA (site/certs): it is always verified.
if (env.DATABASE_SSL && !env.DATABASE_CA_CERT) {
  throw new Error(
    'DATABASE_SSL is on but DATABASE_CA_CERT(_FILE) is missing: refusing unverified TLS'
  );
}
if (env.IS_PROD && env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must be at least 32 chars in production');
}

if (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) {
  throw new Error('GOOGLE_CLIENT_ID set but GOOGLE_CLIENT_SECRET missing');
}
if (env.SPOTIFY_CLIENT_ID && !env.SPOTIFY_CLIENT_SECRET) {
  throw new Error('SPOTIFY_CLIENT_ID set but SPOTIFY_CLIENT_SECRET missing');
}
if (env.SMTP_HOST && (!env.SMTP_USER || !env.SMTP_PASSWORD)) {
  throw new Error('SMTP_HOST set but SMTP_USER or SMTP_PASSWORD missing');
}
// Signing up requires a verified email (lib/auth `requireEmailVerification`),
// so a production deploy with no mail transport locks every new account out
// while every request still answers 200. Refuse to start instead.
if (env.IS_PROD && !env.DISABLE_EMAILS && !env.SMTP_HOST) {
  throw new Error(
    'SMTP_HOST is required in production: without it email verification silently fails and nobody can register. Set DISABLE_EMAILS=true to accept that explicitly.'
  );
}
