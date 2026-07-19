/**
 * BreadcrumbBar path logic tests (roadmap #3, finding #2).
 *
 * The component moved the cursor→offset conversion off a full-document split
 * (offsetOf now scans newlines, O(offset)) and defers the whole computation.
 * These tests pin the pure logic that produces the ancestor breadcrumb.
 */
import { describe, it, expect } from 'vitest';
import { offsetOf, getElementPathAtOffset } from '../src/components/Editor/breadcrumbPath';

describe('offsetOf', () => {
  const doc = 'abc\ndef\nghi'; // lines: abc(0-2) \n(3) def(4-6) \n(7) ghi(8-10)

  it('returns 0 for the first line/column', () => {
    expect(offsetOf(doc, 1, 1)).toBe(0);
  });

  it('finds the start of a later line', () => {
    expect(offsetOf(doc, 2, 1)).toBe(4);
    expect(offsetOf(doc, 3, 1)).toBe(8);
  });

  it('adds the (1-based) column within the line', () => {
    expect(offsetOf(doc, 2, 3)).toBe(6); // "def", 3rd char
  });

  it('clamps the column to the end of the line', () => {
    expect(offsetOf('abc\ndef', 2, 100)).toBe(7); // end of "def"
  });

  it('returns content length when the line is past the end', () => {
    expect(offsetOf('abc', 9, 1)).toBe(3);
    expect(offsetOf('', 1, 1)).toBe(0);
  });
});

describe('getElementPathAtOffset', () => {
  it('returns the open-element stack up to the offset', () => {
    const xml = '<a><b><c>text';
    expect(getElementPathAtOffset(xml, xml.length).map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });

  it('pops closed elements', () => {
    const xml = '<a><b></b>';
    expect(getElementPathAtOffset(xml, xml.length).map((p) => p.name)).toEqual(['a']);
  });

  it('ignores self-closing elements', () => {
    const xml = '<a><b/>';
    expect(getElementPathAtOffset(xml, xml.length).map((p) => p.name)).toEqual(['a']);
  });

  it('only considers markup up to the offset', () => {
    const xml = '<a><b><c></c></b></a>';
    // offset right after <b> opens (before <c>) → path is [a, b]
    const off = '<a><b>'.length;
    expect(getElementPathAtOffset(xml, off).map((p) => p.name)).toEqual(['a', 'b']);
  });

  it('attributes the correct line to each ancestor', () => {
    const xml = '<a>\n  <b>\n    <c>';
    const path = getElementPathAtOffset(xml, xml.length);
    expect(path.map((p) => ({ name: p.name, line: p.line }))).toEqual([
      { name: 'a', line: 1 },
      { name: 'b', line: 2 },
      { name: 'c', line: 3 },
    ]);
  });
});
