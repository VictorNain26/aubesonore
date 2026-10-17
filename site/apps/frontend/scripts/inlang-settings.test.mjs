import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { paraglideOptions } from './paraglide-options.mjs';

// A plugin the compiler cannot import (a URL off the network) only warns, and the catalogue comes
// out empty. Module paths are relative to the folder holding project.inlang.
const app = new URL('../', import.meta.url);
const settings = JSON.parse(
  readFileSync(new URL(`${paraglideOptions.project}/settings.json`, app), 'utf8'),
);

describe('project.inlang settings', () => {
  it('loads the message format plugin, and every plugin, from an installed file', () => {
    expect(settings.modules).toContain(
      '../../node_modules/@inlang/plugin-message-format/dist/index.js',
    );
    for (const module of settings.modules) {
      expect(module).not.toMatch(/^[a-z]+:/);
      expect(existsSync(new URL(module, app))).toBe(true);
    }
  });
});
