import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * packages/frontend/src/styles/tokens.css must match the approved design (design/README.md): the `light` and `night`
 * objects in design/owner-dashboard/Main.dc.html, the phone `tint*` tokens in PhoneLight.dc.html, and the page
 * background. Change the design first, then the tokens; this test fails on any drift.
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const design = read('design/owner-dashboard/Main.dc.html');
const phone = read('design/owner-dashboard/PhoneLight.dc.html');
const css = read('packages/frontend/src/styles/tokens.css');
const indexCss = read('packages/frontend/src/styles/index.css');

/** The `name = { key: 'value', ... }` object of a design file. */
function designObject(source: string, name: string): Record<string, string> {
  const body = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\s*\\};`).exec(source)?.[1];
  if (!body) throw new Error(`No ${name} object in the design file.`);
  return Object.fromEntries([...body.matchAll(/(\w+):\s*'([^']*)'/g)].map((m) => [m[1] ?? '', m[2] ?? '']));
}

/** The `--name: value;` declarations of one CSS block, found by its selector. */
function cssBlock(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`No ${selector} block in tokens.css.`);
  const open = css.indexOf('{', start + selector.length - 1);
  let depth = 0;
  let end = open;
  for (; end < css.length; end += 1) {
    if (css[end] === '{') depth += 1;
    if (css[end] === '}' && (depth -= 1) === 0) break;
  }
  const body = css.slice(open + 1, end);
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
}

/** Same value regardless of case, spaces and trailing zeros ("0.30" and "0.3"). */
const norm = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(\d\.\d*?)0+(?=[^\d]|$)/g, '$1')
    .replace(/\.(?=[^\d])/g, '');
/** The design's camelCase key as tokens.css names it: cardBorder -> card-border, orbA -> orb-a, c1 -> c1. */
const cssName = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const themes = [
  { name: 'light', selector: ":root,\n:root[data-theme='light']", phoneName: 'light' },
  { name: 'night', selector: ":root[data-theme='dark']", phoneName: 'night' },
] as const;

describe('tokens.css matches the approved design', () => {
  for (const theme of themes) {
    it(`${theme.name}: every token of the design object, with the same value`, () => {
      const tokens = cssBlock(theme.selector);
      const expected = designObject(design, theme.name);
      const differences = Object.entries(expected)
        .filter(([key, value]) => norm(tokens[cssName(key)] ?? 'missing') !== norm(value))
        .map(([key]) => cssName(key));
      expect(differences).toEqual([]);
    });

    it(`${theme.name}: the phone dashboard's tint tokens`, () => {
      const tokens = cssBlock(theme.selector);
      const tints = Object.entries(designObject(phone, theme.phoneName)).filter(([key]) =>
        key.startsWith('tint'),
      );
      expect(tints.length).toBe(4);
      for (const [key, value] of tints)
        expect(norm(tokens[cssName(key)] ?? 'missing'), key).toBe(norm(value));
    });
  }

  it('the page background is the design aurora, in both themes', () => {
    const aurora = [...design.matchAll(/\? '(radial-gradient[^']+)'\s*: '([^']+)'/g)][0];
    expect(aurora).toBeDefined();
    expect(norm(cssBlock(themes[1].selector).bg ?? '')).toBe(norm(aurora?.[1] ?? ''));
    expect(norm(cssBlock(themes[0].selector).bg ?? '')).toBe(norm(aurora?.[2] ?? ''));
  });

  it('the dark block used without data-theme (OS preference) equals the explicit dark block', () => {
    const normalized = (block: Record<string, string>) =>
      Object.fromEntries(Object.entries(block).map(([key, value]) => [key, norm(value)]));
    expect(normalized(cssBlock(":root:not([data-theme='light'])"))).toEqual(
      normalized(cssBlock(themes[1].selector)),
    );
  });

  it('glass uses the design blur, with a no-blur fallback', () => {
    expect(norm(cssBlock(':root {')['glass-blur'] ?? '')).toBe(norm('blur(30px) saturate(190%)'));
    expect(indexCss).toMatch(/backdrop-filter:\s*var\(--glass-blur\)/);
    // Without backdrop-filter support, with reduced transparency, or when the app turns glass off (low-end phones).
    expect(indexCss).toMatch(/@supports not \(\(backdrop-filter/);
    expect(indexCss).toMatch(/prefers-reduced-transparency:\s*reduce/);
    expect(indexCss).toMatch(/\[data-glass='off'\]/);
  });
});
