/**
 * XPath search line-attribution tests (P0, 2026-07).
 *
 * Pins the fix for a scan bug where, after locating the nth occurrence,
 * the line search kept scanning and later occurrences overwrote the
 * result — every match was labeled with (and navigated to) the LAST
 * occurrence's line in the document.
 *
 * The line attribution is tested through the pure `findNthTagLine` helper:
 * jsdom's XPath engine cannot evaluate the `local-name()` expressions
 * `evaluateXPath` generates (verified working in real browsers).
 */
import { describe, it, expect } from 'vitest';
import { findNthTagLine, evaluateXPath } from '../src/components/Toolbar/xpathEvaluator';

const POEM_LINES = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text>
    <body>
      <lg>
        <l>first line</l>
        <l>second line</l>
        <l>third line</l>
      </lg>
    </body>
  </text>
</TEI>`.split('\n');

describe('findNthTagLine', () => {
  it('assigns each occurrence its own line number in document order', () => {
    expect(findNthTagLine(POEM_LINES, 'l', 0)).toBe(6);
    expect(findNthTagLine(POEM_LINES, 'l', 1)).toBe(7);
    expect(findNthTagLine(POEM_LINES, 'l', 2)).toBe(8);
  });

  it('locates a single occurrence on its actual line', () => {
    expect(findNthTagLine(POEM_LINES, 'lg', 0)).toBe(5);
    expect(findNthTagLine(POEM_LINES, 'body', 0)).toBe(4);
  });

  it('does not confuse tags sharing a prefix (l vs lg)', () => {
    // `<lg` on line 5 must not count as an occurrence of `l`
    expect(findNthTagLine(POEM_LINES, 'l', 0)).not.toBe(5);
  });

  it('counts same-named siblings on one line separately', () => {
    const lines = ['<root>', '<row><cell>a</cell><cell>b</cell></row>', '</root>'];
    expect(findNthTagLine(lines, 'cell', 0)).toBe(2);
    expect(findNthTagLine(lines, 'cell', 1)).toBe(2);
    expect(findNthTagLine(lines, 'row', 0)).toBe(2);
  });

  it('matches namespace-prefixed tags', () => {
    const lines = ['<tei:TEI>', '  <tei:p>x</tei:p>', '</tei:TEI>'];
    expect(findNthTagLine(lines, 'p', 0)).toBe(2);
  });

  it('falls back to line 1 when the occurrence is not findable', () => {
    expect(findNthTagLine(POEM_LINES, 'l', 99)).toBe(1);
    expect(findNthTagLine(POEM_LINES, 'nothere', 0)).toBe(1);
  });
});

describe('evaluateXPath', () => {
  it('reports invalid XML instead of matching', () => {
    const { matches, error } = evaluateXPath('<a><b></a>', '//b');
    expect(matches).toHaveLength(0);
    expect(error).toBe('Invalid XML document');
  });

  it('returns no matches and no error for an empty expression', () => {
    const { matches, error } = evaluateXPath('<a/>', '   ');
    expect(matches).toHaveLength(0);
    expect(error).toBeNull();
  });
});
