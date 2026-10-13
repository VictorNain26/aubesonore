import { env } from '../config/env';

/**
 * Minimal structured logger. One JSON object per line in production
 * (parseable by any log shipper; the journal keeps them, site/CLAUDE.md), human-readable lines
 * in development.
 *
 * Keep it dependency-free on purpose: log shape stability matters more
 * than features. If we later need correlation IDs, span context, or
 * sampling, swap the implementation here without touching call sites.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  const record = { level, time: new Date().toISOString(), msg, ...fields };
  const line = env.IS_PROD ? JSON.stringify(record) : formatHuman(record);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function formatHuman(record: { level: LogLevel; time: string; msg: string } & LogFields): string {
  const { level, time, msg, ...rest } = record;
  const tail = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
  return `[${time}] ${level.toUpperCase()} ${msg}${tail}`;
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
};
