import type { Plugin } from 'vite';

/**
 * Content-Security-Policy for the production build. Defense-in-depth against
 * XSS that slips past the preview sanitizer.
 *
 *   - `script-src 'self'` blocks inline scripts and external scripts — even an
 *     injected `<script>` tag would not execute.
 *   - `style-src 'unsafe-inline'` is required by CodeMirror, which generates
 *     inline styles at runtime. We accept the trade-off.
 *   - `font-src` allows the Google Fonts domains we use.
 *   - `img-src *` allows TEI `<graphic>` URLs (already scheme-filtered by
 *     `teiTransform.safeImgSrc`).
 *   - `object-src 'none'` blocks `<object>`/`<embed>`/`<applet>`.
 *   - `base-uri 'self'` blocks `<base>` hijacking.
 *   - `form-action 'self'` restricts form submissions.
 *
 * Build-only: in dev, Vite injects HMR client modules and dynamic imports that
 * some CSPs would block, so the plugin declares `apply: 'build'`.
 */
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src * data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

/** The existing `<meta>` the CSP is inserted immediately before. */
export const CSP_ANCHOR = '<meta name="theme-color"';

/** Serialize the directive list into a CSP header/meta value. */
export function buildCspContent(): string {
  return CSP_DIRECTIVES.join('; ') + ';';
}

/**
 * Insert the CSP `<meta>` immediately before the theme-color meta.
 *
 * Throws if the anchor is absent. `String.prototype.replace` with a missing
 * needle returns the input unchanged, so the previous inline version would
 * have emitted a production build with NO CSP the moment index.html drifted
 * (anchor renamed, requoted, reordered) — a silent fail-open (audit #2).
 * Failing the build loudly is the safe default.
 *
 * Idempotent: HTML that already carries a CSP meta is returned untouched, so
 * the policy is never duplicated.
 */
export function applyCsp(html: string): string {
  if (/http-equiv=["']Content-Security-Policy["']/i.test(html)) {
    return html;
  }
  if (!html.includes(CSP_ANCHOR)) {
    throw new Error(
      `[inject-csp] anchor ${JSON.stringify(CSP_ANCHOR)} not found in index.html — ` +
        'refusing to emit a production build without a Content-Security-Policy. ' +
        'If index.html changed, update CSP_ANCHOR in vite-csp.ts.',
    );
  }
  const meta = `<meta http-equiv="Content-Security-Policy" content="${buildCspContent()}" />`;
  return html.replace(CSP_ANCHOR, `${meta}\n    ${CSP_ANCHOR}`);
}

/**
 * Vite plugin wrapper. Build-only; runs `pre` so the CSP is present before
 * other index.html transforms.
 */
export function injectCsp(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler(html: string) {
        return applyCsp(html);
      },
    },
  };
}
