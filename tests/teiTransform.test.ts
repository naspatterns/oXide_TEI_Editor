/**
 * Tests for `teiToHtml` and its supporting helpers.
 *
 * Most assertions here are XSS / privacy regression tests for the
 * v0.2.3 security patch:
 *
 *   - safeHref must reject `javascript:` / `data:` / etc.
 *   - safeImgSrc must reject the same plus disallow non-image data: URIs.
 *   - <ref> link rendering must HTML-escape its target if there is no
 *     child content (CRIT-1) and must whitelist its href scheme
 *     (CRIT-2). It must also include `rel="noopener noreferrer"`
 *     (LOW-1).
 *   - <graphic> must render a placeholder (no `<img>` element) for
 *     unsafe URLs and must add `referrerpolicy="no-referrer"` and
 *     `loading="lazy"` for safe ones (MED-1).
 */
import { describe, expect, it } from 'vitest';
import { teiToHtml, safeHref, safeImgSrc } from '../src/components/Preview/teiTransform';

const TEI_NS = ' xmlns="http://www.tei-c.org/ns/1.0"';
const wrapTEI = (body: string) => `<TEI${TEI_NS}><text><body>${body}</body></text></TEI>`;

describe('safeHref', () => {
  it('passes through http(s) URLs', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('http://example.com/path?q=1')).toBe('http://example.com/path?q=1');
  });

  it('passes through mailto: links', () => {
    expect(safeHref('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('passes through same-page anchors and relative paths', () => {
    expect(safeHref('#section-1')).toBe('#section-1');
    expect(safeHref('/abs/path')).toBe('/abs/path');
    expect(safeHref('./relative')).toBe('./relative');
    expect(safeHref('../up')).toBe('../up');
  });

  it('blocks javascript: scheme (case-insensitive, with whitespace)', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#');
    expect(safeHref('JavaScript:alert(1)')).toBe('#');
    expect(safeHref('  javascript:alert(1)  ')).toBe('#');
    expect(safeHref('JAVASCRIPT:void(0)')).toBe('#');
  });

  it('blocks data: scheme', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#');
  });

  it('blocks vbscript: scheme', () => {
    expect(safeHref('vbscript:msgbox(1)')).toBe('#');
  });

  it('blocks file: and ftp: schemes (not appropriate for preview)', () => {
    expect(safeHref('file:///etc/passwd')).toBe('#');
    expect(safeHref('ftp://example.com')).toBe('#');
  });

  it('returns # for empty / whitespace-only input', () => {
    expect(safeHref('')).toBe('#');
    expect(safeHref('   ')).toBe('#');
  });
});

describe('safeImgSrc', () => {
  it('passes through http(s) URLs', () => {
    expect(safeImgSrc('https://example.com/img.jpg')).toBe('https://example.com/img.jpg');
  });

  it('passes through data:image/* URIs (commonly used for inline images)', () => {
    expect(safeImgSrc('data:image/png;base64,iVBOR=')).toBe('data:image/png;base64,iVBOR=');
  });

  it('blocks data: URIs that are not images', () => {
    expect(safeImgSrc('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeImgSrc('data:application/javascript,alert(1)')).toBe('');
  });

  it('blocks javascript:, vbscript:, file: schemes', () => {
    expect(safeImgSrc('javascript:alert(1)')).toBe('');
    expect(safeImgSrc('vbscript:msgbox(1)')).toBe('');
    expect(safeImgSrc('file:///etc/passwd')).toBe('');
  });

  it('passes through relative paths', () => {
    expect(safeImgSrc('/imgs/foo.png')).toBe('/imgs/foo.png');
    expect(safeImgSrc('./local.svg')).toBe('./local.svg');
  });

  it('returns empty string for blank input', () => {
    expect(safeImgSrc('')).toBe('');
    expect(safeImgSrc('   ')).toBe('');
  });
});

describe('teiToHtml — <ref> XSS regressions (CRIT-1, CRIT-2, LOW-1)', () => {
  it('escapes a malicious target used as link text fallback (no child content)', () => {
    const html = teiToHtml(wrapTEI('<p><ref target="&lt;img src=x onerror=alert(1)&gt;"/></p>'));
    // The target should NOT appear as a live <img> tag in the output;
    // it should appear as escaped text.
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('rewrites javascript: target to # so the link cannot execute on click', () => {
    const html = teiToHtml(wrapTEI('<p><ref target="javascript:alert(1)">click</ref></p>'));
    // The href should be neutralized to '#', not contain the JS scheme.
    expect(html).toMatch(/href="#"/);
    expect(html).not.toMatch(/href="javascript:/i);
    // The visible text remains the child content.
    expect(html).toContain('>click</a>');
  });

  it('rewrites data: target similarly', () => {
    const html = teiToHtml(wrapTEI('<p><ref target="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">x</ref></p>'));
    expect(html).toMatch(/href="#"/);
    expect(html).not.toMatch(/href="data:/i);
  });

  it('keeps a normal https target intact', () => {
    const html = teiToHtml(wrapTEI('<p><ref target="https://example.com/article">read</ref></p>'));
    expect(html).toContain('href="https://example.com/article"');
    expect(html).toContain('>read</a>');
  });

  it('emits rel="noopener noreferrer" on ref links (LOW-1)', () => {
    const html = teiToHtml(wrapTEI('<p><ref target="https://example.com">x</ref></p>'));
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe('teiToHtml — <graphic> URL hardening (MED-1)', () => {
  it('renders a placeholder span (not <img>) when url scheme is unsafe', () => {
    const html = teiToHtml(wrapTEI('<p><graphic url="javascript:alert(1)"/></p>'));
    expect(html).not.toContain('<img');
    expect(html).toContain('tei-graphic-blocked');
    // The original (now neutralized) URL appears in title attribute,
    // HTML-escaped — the colon is fine, but no live src is emitted.
    expect(html).toContain('title="javascript:alert(1)"');
  });

  it('blocks data:text/html as a graphic url', () => {
    const html = teiToHtml(wrapTEI('<p><graphic url="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;"/></p>'));
    expect(html).not.toContain('<img');
    expect(html).toContain('tei-graphic-blocked');
  });

  it('renders a normal http(s) image with privacy-preserving attributes', () => {
    const html = teiToHtml(wrapTEI('<p><graphic url="https://example.com/i.png"/></p>'));
    expect(html).toContain('<img');
    expect(html).toContain('src="https://example.com/i.png"');
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('loading="lazy"');
  });

  it('renders inline data:image/* URIs', () => {
    const html = teiToHtml(
      wrapTEI('<p><graphic url="data:image/png;base64,iVBORw0KGgo="/></p>'),
    );
    expect(html).toContain('<img');
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });
});

describe('teiToHtml — basic shape (regression coverage)', () => {
  it('produces a parse-error message for malformed XML', () => {
    const html = teiToHtml('<TEI><text><body><p>oops</body></text></TEI>');
    expect(html).toContain('preview-error');
  });

  it('returns a parse-error message for empty input rather than throwing', () => {
    expect(() => teiToHtml('')).not.toThrow();
  });

  it('escapes text content (no XSS via plain text)', () => {
    const html = teiToHtml(wrapTEI('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
