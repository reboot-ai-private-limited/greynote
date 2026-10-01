import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { palette, radius, semantic, shadow, status } from './tokens';

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const css = readFileSync(path.join(import.meta.dirname, 'theme.css'), 'utf8');

describe('theme.css mirrors tokens.ts', () => {
  const ramps = Object.entries(palette).flatMap(([name, steps]) =>
    Object.entries(steps).map(([step, value]) => [`${name}-${step}`, value] as const),
  );
  it.each(ramps)('ramp %s', (name, value) => {
    expect(css).toContain(`--color-${name}: ${value};`);
  });

  it.each(Object.entries(semantic))('semantic %s', (name, value) => {
    expect(css).toContain(`--color-${kebab(name)}: ${value};`);
  });

  const statuses = Object.entries(status).flatMap(([name, v]) => [
    [`${name}-bg`, v.bg] as const,
    [`${name}-fg`, v.fg] as const,
    [name, v.solid] as const,
  ]);
  it.each(statuses)('status %s', (name, value) => {
    expect(css).toContain(`--color-${name}: ${value};`);
  });

  it.each(Object.entries(radius))('radius %s', (name, value) => {
    expect(css).toContain(`--radius-${name}: ${value};`);
  });

  it('shadows', () => {
    expect(css).toContain(`--shadow-pop: ${shadow.pop};`);
    expect(css).toContain(`--shadow-focus: ${shadow.focus};`);
  });
});
