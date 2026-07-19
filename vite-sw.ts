/**
 * Build-time data injected into the emitted `dist/sw.js`.
 *
 * Two placeholders in the service worker are resolved at build:
 *   - `__BUILD_HASH__`        → a per-build cache-name stamp (forces old
 *                               caches to be evicted on the next `activate`).
 *   - `/*__PRECACHE_ASSETS__*\/` → the list of hashed JS/CSS chunks to
 *                               precache at install time.
 *
 * The hashed filenames change every build, so the service worker cannot name
 * them literally. Before this, PRECACHE_URLS held only the HTML shell and none
 * of the chunks, so the first offline start (on a visit where the page's own
 * asset fetches completed before the SW took control) white-screened — the
 * chunks were never cached (audit #9). Precaching the real asset list at build
 * time fixes that.
 *
 * The pure helpers below are unit-tested (tests/injectSw.test.ts); the Vite
 * plugin in vite.config.ts does the dist file IO and calls them.
 */

/** Marker the precache list replaces. A no-op comment until the build fills it. */
export const PRECACHE_MARKER = '/*__PRECACHE_ASSETS__*/';

/** The cache-name stamp placeholder. */
export const BUILD_HASH_PLACEHOLDER = '__BUILD_HASH__';

/**
 * Turn a dist/assets directory listing into precache URLs (relative to the SW
 * scope at the site root). Only code assets — JS and CSS — are precached;
 * source maps and anything else are skipped. Sorted for stable output.
 */
export function buildPrecacheList(assetFiles: string[]): string[] {
  return assetFiles
    .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
    .slice()
    .sort()
    .map((f) => `./assets/${f}`);
}

/**
 * Resolve both build placeholders in the service-worker source.
 *
 * Throws if the precache marker is missing: without it the SW would install
 * with only the HTML shell precached and silently reintroduce the offline
 * white-screen (audit #9). Failing the build loudly is the safe default —
 * same fail-closed stance as the CSP plugin (audit #2).
 */
export function applySwBuildData(
  swSource: string,
  opts: { stamp: string; precache: string[] },
): string {
  const withHash = swSource.replace(
    new RegExp(BUILD_HASH_PLACEHOLDER, 'g'),
    opts.stamp,
  );
  if (!withHash.includes(PRECACHE_MARKER)) {
    throw new Error(
      `[inject-sw] precache marker ${PRECACHE_MARKER} not found in sw.js — ` +
        'refusing to emit a service worker that would install without ' +
        'precaching the app shell. If sw.js changed, restore the marker.',
    );
  }
  // The marker sits on its own indented line; join with the same indent so the
  // resulting array literal stays readable and valid (trailing comma is fine).
  const list = opts.precache.map((u) => `'${u}',`).join('\n  ');
  return withHash.replace(PRECACHE_MARKER, list);
}
