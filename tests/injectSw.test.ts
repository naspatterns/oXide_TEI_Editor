/**
 * Service-worker precache-injection tests (build-hardening track, #9).
 *
 * PRECACHE_URLS held only the HTML shell; the hashed JS/CSS chunks were never
 * precached, so the first offline start white-screened. buildPrecacheList +
 * applySwBuildData now inject the real chunk list at build time, and fail the
 * build loudly if the marker is gone.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPrecacheList,
  applySwBuildData,
  PRECACHE_MARKER,
  BUILD_HASH_PLACEHOLDER,
} from '../vite-sw';

describe('buildPrecacheList (#9)', () => {
  it('keeps only JS/CSS assets and sorts them', () => {
    const list = buildPrecacheList([
      'index-DBRMOq4j.css',
      'index-D-J8OTKt.js',
      'react-CfO-1QOm.js',
      'index-D-J8OTKt.js.map', // source map — excluded
      'favicon.svg', // not a code asset — excluded
    ]);
    expect(list).toEqual([
      './assets/index-D-J8OTKt.js',
      './assets/index-DBRMOq4j.css',
      './assets/react-CfO-1QOm.js',
    ]);
  });

  it('returns an empty list when there are no code assets', () => {
    expect(buildPrecacheList(['logo.png', 'data.json'])).toEqual([]);
  });
});

describe('applySwBuildData (#9)', () => {
  const sw = [
    "const CACHE_VERSION = '__BUILD_HASH__';",
    'const PRECACHE_URLS = [',
    "  './',",
    "  './index.html',",
    '  ' + PRECACHE_MARKER,
    '];',
  ].join('\n');

  it('replaces the build-hash placeholder with the stamp', () => {
    const out = applySwBuildData(sw, { stamp: '0.3.0-abc', precache: [] });
    expect(out).toContain("const CACHE_VERSION = '0.3.0-abc';");
    expect(out).not.toContain(BUILD_HASH_PLACEHOLDER);
  });

  it('injects the precache list in place of the marker', () => {
    const out = applySwBuildData(sw, {
      stamp: '0.3.0-abc',
      precache: ['./assets/index-x.js', './assets/index-x.css'],
    });
    expect(out).toContain("'./assets/index-x.js',");
    expect(out).toContain("'./assets/index-x.css',");
    // Marker fully consumed, no placeholder residue left in the array.
    expect(out).not.toContain(PRECACHE_MARKER);
    expect(out).not.toContain('__PRECACHE');
    // The shell entries are preserved ahead of the injected chunks.
    expect(out).toContain("  './',\n  './index.html',");
  });

  it('THROWS when the precache marker is missing (no silent shell-only SW) (#9)', () => {
    const noMarker = sw.replace(PRECACHE_MARKER, '');
    expect(() =>
      applySwBuildData(noMarker, { stamp: 's', precache: ['./assets/a.js'] }),
    ).toThrow(/precache marker .* not found/);
  });
});
