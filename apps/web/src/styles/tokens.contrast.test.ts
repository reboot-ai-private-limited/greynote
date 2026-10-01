import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';
import { semantic, status } from './tokens';

/** AA for normal text. A pair that fails here is unreadable for someone, so it fails CI. */
const AA = 4.5;

describe('text pairs are readable (WCAG AA)', () => {
  const pairs: [string, string, string][] = [
    ['text on surface', semantic.text, semantic.surface],
    ['text-muted on surface', semantic.textMuted, semantic.surface],
    ['text-subtle on surface', semantic.textSubtle, semantic.surface],
    ['text-subtle on surface-subtle', semantic.textSubtle, semantic.surfaceSubtle],
    ['accent (links) on surface', semantic.accent, semantic.surface],
    ['accent-text on accent (primary button)', semantic.accentText, semantic.accent],
    ['accent-text on accent-hover', semantic.accentText, semantic.accentHover],
    ['accent-soft-text on accent-soft', semantic.accentSoftText, semantic.accentSoft],
    ...Object.entries(status).map(([name, v]): [string, string, string] => [
      `${name} fg on bg`,
      v.fg,
      v.bg,
    ]),
  ];

  it.each(pairs)('%s', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
  });
});
