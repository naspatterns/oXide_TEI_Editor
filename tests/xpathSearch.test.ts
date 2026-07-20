/**
 * XPath / node→line attribution tests (audit #19/#20, 2026-07).
 *
 * The XPath toolbar search attributed each match to a source line with a naive
 * per-line `<tag` regex (findNthTagLine), indexed by the match's position among
 * matches. That diverged from the DOM on multi-line tags and tag-shaped text
 * inside comments/CDATA, and — for a FILTERED query — indexed a matched-subset
 * position into ALL occurrences of the tag, so the k-th match's line was some
 * OTHER element's line. The retired helper is replaced by a shared
 * `createElementLineResolver` that resolves each matched element directly.
 *
 * The resolver is tested directly (via DOMParser + getElementsByTagName, which
 * jsdom supports). Whole-query `evaluateXPath` matching mostly can't run in
 * jsdom because its XPath engine cannot evaluate the `local-name()` expressions
 * the search generates for unprefixed names; a prefixed query is exercised
 * end-to-end where jsdom allows it.
 */
import { describe, it, expect } from 'vitest';
import { createElementLineResolver } from '../src/schema/xmlTokenizer';
import { evaluateXPath } from '../src/components/Toolbar/xpathEvaluator';

function resolve(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return { doc, lineOf: createElementLineResolver(xml, doc) };
}

/** The i-th (0-based) element with the given local name, in document order. */
function nth(doc: Document, local: string, i: number): Element {
  return Array.from(doc.getElementsByTagName('*')).filter(e => e.localName === local)[i];
}

describe('createElementLineResolver (#19/#20)', () => {
  it('gives each element the 1-based line of its opening tag, in document order', () => {
    const xml = [
      '<?xml version="1.0"?>', // 1
      '<TEI xmlns="http://www.tei-c.org/ns/1.0">', // 2
      '  <text>', // 3
      '    <body>', // 4
      '      <lg>', // 5
      '        <l>first</l>', // 6
      '        <l>second</l>', // 7
      '        <l>third</l>', // 8
      '      </lg>', // 9
      '    </body>', // 10
      '  </text>', // 11
      '</TEI>', // 12
    ].join('\n');
    const { doc, lineOf } = resolve(xml);
    expect(lineOf(nth(doc, 'l', 0))).toBe(6);
    expect(lineOf(nth(doc, 'l', 1))).toBe(7);
    expect(lineOf(nth(doc, 'l', 2))).toBe(8);
    expect(lineOf(nth(doc, 'lg', 0))).toBe(5);
    expect(lineOf(nth(doc, 'body', 0))).toBe(4);
  });

  it('resolves a multi-line open tag to the line of its "<" (a per-line regex misses it)', () => {
    const xml = [
      '<doc>', // 1
      '  <a>one</a>', // 2
      '  <rs', // 3  ← <rs opens here, its attributes wrap to the next line
      '    type="place">Kashi</rs>', // 4
      '  <rs type="person">Devadatta</rs>', // 5
      '</doc>', // 6
    ].join('\n');
    const { doc, lineOf } = resolve(xml);
    expect(lineOf(nth(doc, 'rs', 0))).toBe(3);
    expect(lineOf(nth(doc, 'rs', 1))).toBe(5);
  });

  it('does not let tag-shaped text inside a comment shift the count', () => {
    const xml = [
      '<doc>', // 1
      '  <!-- <rs>ignored</rs> -->', // 2  fake <rs> inside a comment
      '  <rs>real-one</rs>', // 3
      '  <rs>real-two</rs>', // 4
      '</doc>', // 5
    ].join('\n');
    const { doc, lineOf } = resolve(xml);
    // Only two REAL <rs> elements — each maps to its own line, unshifted.
    expect(Array.from(doc.getElementsByTagName('*')).filter(e => e.localName === 'rs')).toHaveLength(2);
    expect(lineOf(nth(doc, 'rs', 0))).toBe(3);
    expect(lineOf(nth(doc, 'rs', 1))).toBe(4);
  });

  it('does not let tag-shaped text inside CDATA shift the count', () => {
    const xml = [
      '<doc>', // 1
      '  <eg><![CDATA[ <rs>literal</rs> ]]></eg>', // 2  fake <rs> inside CDATA
      '  <rs>real</rs>', // 3
      '</doc>', // 4
    ].join('\n');
    const { doc, lineOf } = resolve(xml);
    expect(lineOf(nth(doc, 'rs', 0))).toBe(3);
  });

  it('handles namespace-prefixed tags by local name', () => {
    const xml = [
      '<tei:TEI xmlns:tei="http://www.tei-c.org/ns/1.0">', // 1
      '  <tei:p>x</tei:p>', // 2
      '</tei:TEI>', // 3
    ].join('\n');
    const { doc, lineOf } = resolve(xml);
    expect(lineOf(nth(doc, 'p', 0))).toBe(2);
  });

  it('handles self-closing elements', () => {
    const xml = ['<doc>', '  <lb/>', '  <p>a<lb/>b</p>', '</doc>'].join('\n');
    const { doc, lineOf } = resolve(xml);
    expect(lineOf(nth(doc, 'lb', 0))).toBe(2);
    expect(lineOf(nth(doc, 'lb', 1))).toBe(3);
  });

  it('resolves each element of a SUBSET independently (#19 — filtered queries)', () => {
    const xml = [
      '<doc>', // 1
      '  <rs type="a">zero</rs>', // 2  rs#0 (a)
      '  <rs type="b">one</rs>', // 3  rs#1 (b)
      '  <rs type="a">two</rs>', // 4  rs#2 (a)
      '  <rs type="b">three</rs>', // 5  rs#3 (b)
      '</doc>', // 6
    ].join('\n');
    const { doc, lineOf } = resolve(xml);
    // Simulate the match set of //rs[@type='a'] = rs#0, rs#2 — a SUBSET.
    const typeA = Array.from(doc.getElementsByTagName('*')).filter(
      e => e.localName === 'rs' && e.getAttribute('type') === 'a',
    );
    // The old code indexed matched-subset positions [0,1] into ALL rs lines
    // [2,3,4,5] → [2,3] (second line wrong). Each element resolves to its own.
    expect(typeA.map(lineOf)).toEqual([2, 4]);
  });

  it('distinguishes same-content elements on different lines', () => {
    const xml = ['<doc>', '  <rs>dup</rs>', '  <rs>dup</rs>', '</doc>'].join('\n');
    const { doc, lineOf } = resolve(xml);
    expect(lineOf(nth(doc, 'rs', 0))).toBe(2);
    expect(lineOf(nth(doc, 'rs', 1))).toBe(3);
  });

  it('falls back to line 1 for an element the tokenizer never saw', () => {
    const { doc, lineOf } = resolve('<doc><p>x</p></doc>');
    const orphan = doc.createElement('ghost');
    expect(lineOf(orphan)).toBe(1);
  });

  it('ignores tag-shaped text inside a DOCTYPE internal-subset ENTITY value', () => {
    // <!ENTITY> replacement text may legally contain '<'/'>'. The tokenizer must
    // skip the whole DOCTYPE as a unit so the ghost <rs> is not counted as an
    // element and does not shift the real <rs> line attribution (adversarial
    // review finding — same "preview right, line wrong" symptom as #19/#20).
    const xml = [
      '<?xml version="1.0"?>', // 1
      '<!DOCTYPE TEI [', // 2
      '  <!ENTITY sneaky "<rs>ghost</rs>">', // 3  markup INSIDE an entity value
      ']>', // 4
      '<TEI xmlns="http://www.tei-c.org/ns/1.0">', // 5
      '  <text><body>', // 6
      '    <rs type="person">Real</rs>', // 7
      '    <rs>Second</rs>', // 8
      '  </body></text>', // 9
      '</TEI>', // 10
    ].join('\n');
    const { doc, lineOf } = resolve(xml);
    // The entity's <rs> is unreferenced replacement text, not a DOM element.
    expect(Array.from(doc.getElementsByTagName('*')).filter(e => e.localName === 'rs')).toHaveLength(2);
    expect(lineOf(nth(doc, 'rs', 0))).toBe(7);
    expect(lineOf(nth(doc, 'rs', 1))).toBe(8);
  });

  it('parses names containing the U+00B7 NameChar like the DOM does', () => {
    // A middle-dot in an element name is a valid XML NameChar. If the tokenizer
    // stopped the name at U+00B7 while the DOM keeps it, the buckets desync and
    // sibling same-name elements get the wrong line (adversarial review finding).
    const xml = [
      '<doc>', // 1
      '  <a·b>x</a·b>', // 2  element named "a·b"
      '  <a>one</a>', // 3
      '  <a>two</a>', // 4
      '</doc>', // 5
    ].join('\n');
    const { doc, lineOf } = resolve(xml);
    expect(lineOf(nth(doc, 'a', 0))).toBe(3);
    expect(lineOf(nth(doc, 'a', 1))).toBe(4);
    expect(lineOf(nth(doc, 'a·b', 0))).toBe(2);
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

  it('attributes correct lines end-to-end for a prefixed query (jsdom-evaluable)', () => {
    const xml = [
      '<?xml version="1.0"?>', // 1
      '<tei:TEI xmlns:tei="http://www.tei-c.org/ns/1.0">', // 2
      '  <tei:text><tei:body><tei:lg>', // 3
      '    <tei:l>a</tei:l>', // 4
      '    <tei:l>b</tei:l>', // 5
      '    <tei:l>c</tei:l>', // 6
      '  </tei:lg></tei:body></tei:text>', // 7
      '</tei:TEI>', // 8
    ].join('\n');
    const { matches, error } = evaluateXPath(xml, '//tei:l');
    // jsdom can evaluate a prefixed path with the ns resolver (only local-name()
    // is unsupported). If this environment can't, the assertion below surfaces it.
    expect(error).toBeNull();
    expect(matches.map(m => m.textContent)).toEqual(['a', 'b', 'c']);
    expect(matches.map(m => m.line)).toEqual([4, 5, 6]);
  });

  it('attributes correct lines for a FILTERED prefixed query — subset (#19)', () => {
    const xml = [
      '<?xml version="1.0"?>', // 1
      '<tei:TEI xmlns:tei="http://www.tei-c.org/ns/1.0">', // 2
      '  <tei:p>', // 3
      '    <tei:rs type="a">zero</tei:rs>', // 4  rs#0 (a)
      '    <tei:rs type="b">one</tei:rs>', // 5  rs#1 (b)
      '    <tei:rs type="a">two</tei:rs>', // 6  rs#2 (a)
      '  </tei:p>', // 7
      '</tei:TEI>', // 8
    ].join('\n');
    const { matches, error } = evaluateXPath(xml, "//tei:rs[@type='a']");
    expect(error).toBeNull();
    expect(matches.map(m => m.textContent)).toEqual(['zero', 'two']);
    // The matched subset is rs#0 + rs#2. Lines must be [4, 6] — the old code
    // indexed subset positions [0,1] into all-rs lines → [4, 5] (2nd wrong).
    expect(matches.map(m => m.line)).toEqual([4, 6]);
  });
});
