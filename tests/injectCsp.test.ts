/**
 * CSP-injection tests (build-hardening track, finding #2).
 *
 * The CSP <meta> was injected with `html.replace('<meta name="theme-color"', …)`.
 * String.replace with a missing needle returns the input unchanged, so if
 * index.html ever drifted (anchor renamed/requoted/reordered) the production
 * build would ship with NO Content-Security-Policy and still succeed — a silent
 * fail-open. applyCsp now throws in that case so the build fails loudly.
 */
import { describe, it, expect } from 'vitest';
import {
  applyCsp,
  buildCspContent,
  CSP_ANCHOR,
  CSP_DIRECTIVES,
} from '../vite-csp';

const htmlWithAnchor = [
  '<head>',
  '    <meta charset="UTF-8" />',
  '    <meta name="theme-color" content="#00d4ff" />',
  '  </head>',
].join('\n');

describe('applyCsp — CSP injection (#2)', () => {
  it('injects the CSP meta immediately before the theme-color anchor', () => {
    const out = applyCsp(htmlWithAnchor);
    expect(out).toContain('http-equiv="Content-Security-Policy"');
    expect(out).toContain(buildCspContent());
    // CSP meta must appear before the anchor it was inserted ahead of
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(
      out.indexOf(CSP_ANCHOR),
    );
  });

  it('THROWS instead of shipping no CSP when the anchor is missing (#2)', () => {
    const htmlNoAnchor = [
      '<head>',
      '    <meta name="description" content="x" />',
      '  </head>',
    ].join('\n');
    expect(() => applyCsp(htmlNoAnchor)).toThrow(/anchor .* not found/);
  });

  it('is idempotent — never duplicates an already-present CSP', () => {
    const once = applyCsp(htmlWithAnchor);
    const twice = applyCsp(once);
    expect(twice).toBe(once);
    expect(twice.match(/Content-Security-Policy/g)).toHaveLength(1);
  });

  it('carries the key hardening directives', () => {
    expect(CSP_DIRECTIVES).toContain("script-src 'self'");
    expect(CSP_DIRECTIVES).toContain("object-src 'none'");
    expect(CSP_DIRECTIVES).toContain("base-uri 'self'");
    expect(CSP_DIRECTIVES).toContain("form-action 'self'");
  });

  it('serializes directives as a semicolon-terminated string', () => {
    const content = buildCspContent();
    expect(content.endsWith(';')).toBe(true);
    expect(content.startsWith("default-src 'self'")).toBe(true);
  });
});
