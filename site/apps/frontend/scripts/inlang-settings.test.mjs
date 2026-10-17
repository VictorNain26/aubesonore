import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// A plugin the compiler cannot import is only a warning: Paraglide then emits an empty catalogue,
// and typecheck and lint fail on hundreds of missing messages. A plugin read from a URL is
// therefore one network failure away from that, on every fresh checkout (CI, the Docker build); a
// plugin read from node_modules is pinned by the lockfile and needs no network. Paths are relative
// to the folder that holds project.inlang (inlang, docs/install-plugin.md), and the workspace
// hoists its packages to site/node_modules (.npmrc).
const settings = JSON.parse(
  readFileSync(new URL('../project.inlang/settings.json', import.meta.url), 'utf8'),
);

describe('project.inlang settings', () => {
  it('loads every plugin from an installed package, never from a URL', () => {
    for (const module of settings.modules) {
      expect(module).not.toMatch(/^[a-z]+:/);
      expect(existsSync(new URL(`../${module}`, import.meta.url))).toBe(true);
    }
  });

  it('loads the message format plugin, without which no message is read', () => {
    expect(settings.modules).toContain(
      '../../node_modules/@inlang/plugin-message-format/dist/index.js',
    );
  });
});
