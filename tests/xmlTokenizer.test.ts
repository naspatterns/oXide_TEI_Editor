import { describe, it, expect } from 'vitest';
import {
  tokenizeXmlTagsToArray,
  getOpenElementStack,
  parseAttributes,
} from '../src/schema/xmlTokenizer';

describe('tokenizeXmlTags', () => {
  it('emits open/close tokens for a simple element', () => {
    const tokens = tokenizeXmlTagsToArray('<a>x</a>');
    expect(tokens.map((t) => t.kind)).toEqual(['open', 'close']);
    expect(tokens.map((t) => t.name)).toEqual(['a', 'a']);
  });

  it('detects self-closing tags', () => {
    const tokens = tokenizeXmlTagsToArray('<br/>');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ kind: 'self-close', name: 'br' });
  });

  it('reports 1-based line and column', () => {
    const tokens = tokenizeXmlTagsToArray('hello\n  <a>\n</a>');
    expect(tokens[0]).toMatchObject({ name: 'a', line: 2, column: 3 });
    expect(tokens[1]).toMatchObject({ name: 'a', line: 3, column: 1 });
  });

  it('skips processing instructions and comments without confusing tag names', () => {
    const xml = '<?xml version="1.0"?><!-- <fake> --><real/>';
    const tokens = tokenizeXmlTagsToArray(xml);
    expect(tokens.map((t) => t.kind)).toEqual(['pi', 'comment', 'self-close']);
    expect(tokens[2].name).toBe('real');
  });

  it('does not split tags on > inside attribute quotes', () => {
    const tokens = tokenizeXmlTagsToArray('<a x="1>2"/>');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      kind: 'self-close',
      name: 'a',
      attributesText: 'x="1>2"',
    });
  });

  it('handles XML namespace prefixes in names', () => {
    const tokens = tokenizeXmlTagsToArray('<tei:teiHeader/>');
    expect(tokens[0]).toMatchObject({ kind: 'self-close', name: 'tei:teiHeader' });
  });

  it('handles multi-line tag bodies', () => {
    const tokens = tokenizeXmlTagsToArray('<a\n  x="1"\n  y="2"\n/>');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe('self-close');
    expect(tokens[0].name).toBe('a');
  });

  it('skips bare < that does not start a valid tag', () => {
    const tokens = tokenizeXmlTagsToArray('a < b > <real/>');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].name).toBe('real');
  });

  it('treats CDATA as a single token', () => {
    const tokens = tokenizeXmlTagsToArray('<a><![CDATA[ <fake/> ]]></a>');
    expect(tokens.map((t) => t.kind)).toEqual(['open', 'cdata', 'close']);
  });

  it('handles unterminated tags gracefully', () => {
    expect(() => tokenizeXmlTagsToArray('<a x="oops')).not.toThrow();
  });
});

describe('getOpenElementStack', () => {
  it('returns the stack at end of document', () => {
    const xml = '<root><body><p>text';
    expect(getOpenElementStack(xml)).toEqual(['root', 'body', 'p']);
  });

  it('pops matched closes', () => {
    const xml = '<root><body></body><other>';
    expect(getOpenElementStack(xml)).toEqual(['root', 'other']);
  });

  it('keeps stack intact on mismatched close (tolerant for autocomplete)', () => {
    const xml = '<root><body></wrong>';
    expect(getOpenElementStack(xml)).toEqual(['root', 'body']);
  });

  it('respects the offset argument', () => {
    const xml = '<a><b><c></c></b></a>';
    // After "<a><b>" → stack is ['a', 'b']
    expect(getOpenElementStack(xml, 6)).toEqual(['a', 'b']);
    // At end → all closed
    expect(getOpenElementStack(xml)).toEqual([]);
  });

  it('ignores self-closing tags', () => {
    expect(getOpenElementStack('<root><br/><img/>')).toEqual(['root']);
  });
});

describe('parseAttributes', () => {
  it('parses double-quoted attributes', () => {
    expect(parseAttributes('a="1" b="two"')).toEqual({ a: '1', b: 'two' });
  });

  it('parses single-quoted attributes', () => {
    expect(parseAttributes("xml:id='abc' n='3'")).toEqual({ 'xml:id': 'abc', n: '3' });
  });

  it('returns empty object for empty input', () => {
    expect(parseAttributes('')).toEqual({});
  });

  it('handles attributes containing the > character inside quotes', () => {
    expect(parseAttributes('expr="a>b"')).toEqual({ expr: 'a>b' });
  });
});

// ============================================================================
// P1 (2026-07 audit): quote-aware attribute scan + stack-with-children
// ============================================================================

import { scanAttributeNames, getOpenElementStackWithChildren } from '../src/schema/xmlTokenizer';

describe('scanAttributeNames', () => {
  it('extracts simple attribute names with their offsets', () => {
    const text = 'type="poem" n="3"';
    expect(scanAttributeNames(text)).toEqual([
      { name: 'type', index: 0 },
      { name: 'n', index: 12 },
    ]);
  });

  it('ignores name= patterns inside double-quoted values', () => {
    const text = 'target="https://en.wikipedia.org/w/index.php?title=Worm&oldid=5"';
    expect(scanAttributeNames(text).map(a => a.name)).toEqual(['target']);
  });

  it('ignores name= patterns inside single-quoted values', () => {
    const text = "target='?a=1&b=2' rend='x=y'";
    expect(scanAttributeNames(text).map(a => a.name)).toEqual(['target', 'rend']);
  });

  it('handles whitespace around =', () => {
    const text = 'type = "poem"  n ="3"';
    expect(scanAttributeNames(text).map(a => a.name)).toEqual(['type', 'n']);
  });

  it('an unterminated quote swallows the rest (mid-typing state)', () => {
    const text = 'target="https://example.com/?id=5&lang=';
    expect(scanAttributeNames(text).map(a => a.name)).toEqual(['target']);
  });

  it('does not treat bare words without = as attributes', () => {
    const text = 'checked type="a"';
    expect(scanAttributeNames(text).map(a => a.name)).toEqual(['type']);
  });

  it('returns empty for empty input', () => {
    expect(scanAttributeNames('')).toEqual([]);
  });
});

describe('getOpenElementStackWithChildren', () => {
  it('reports the open ancestor chain with per-instance children', () => {
    const xml = '<TEI><teiHeader><fileDesc></fileDesc></teiHeader><text><body><div><head/><lg><l>a</l><l>b</l>';
    const stack = getOpenElementStackWithChildren(xml);
    expect(stack.map(f => f.name)).toEqual(['TEI', 'text', 'body', 'div', 'lg']);
    const top = stack[stack.length - 1];
    expect(top.children).toEqual(['l', 'l']);
    // div saw head (self-close) and lg — not the l's inside lg
    expect(stack[3].children).toEqual(['head', 'lg']);
  });

  it('scopes children to the CURRENT instance, not earlier same-named elements', () => {
    // Two sibling divs: the first is closed with children; the second is
    // open and empty. The open one must not inherit the first one's children.
    const xml = '<body><div><head/><p>x</p></div><div>';
    const stack = getOpenElementStackWithChildren(xml);
    expect(stack.map(f => f.name)).toEqual(['body', 'div']);
    expect(stack[stack.length - 1].children).toEqual([]);
    expect(stack[0].children).toEqual(['div', 'div']);
  });

  it('skips comments, PIs and CDATA', () => {
    const xml = '<a><?pi x?><!-- <fake> --><![CDATA[<fake2>]]><b>';
    const stack = getOpenElementStackWithChildren(xml);
    expect(stack.map(f => f.name)).toEqual(['a', 'b']);
    expect(stack[0].children).toEqual(['b']);
  });

  it('tolerates mismatched closes like getOpenElementStack', () => {
    const xml = '<a><b></c>';
    const stack = getOpenElementStackWithChildren(xml);
    expect(stack.map(f => f.name)).toEqual(['a', 'b']);
  });
});
