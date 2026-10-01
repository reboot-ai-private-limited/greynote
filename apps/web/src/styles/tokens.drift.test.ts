import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { colors } from './tokens';

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('theme.css mirrors tokens.ts', () => {
  const css = readFileSync(path.join(import.meta.dirname, 'theme.css'), 'utf8');

  it.each(Object.entries(colors))('%s', (name, value) => {
    expect(css).toContain(`--color-${kebab(name)}: ${value};`);
  });
});
