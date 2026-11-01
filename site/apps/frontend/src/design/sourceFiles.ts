import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The frontend's `src/`, which the design guards (design/*.test.ts) read. */
const SRC = fileURLToPath(new URL('..', import.meta.url));

/** Every script of `src/` but the tests and the generated messages, as absolute paths. */
export function sources(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'paraglide' ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** A path of `src/`, from `src/` and with forward slashes. */
export function fromSrc(path: string): string {
  return relative(SRC, path).split('\\').join('/');
}
