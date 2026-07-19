/**
 * Tag Synchronization Tests
 *
 * Tests for the tag synchronization functionality:
 * - findTagAtPosition: Finding tags at cursor position
 * - findMatchingTag: Finding matching opening/closing tags
 * - Nested tag handling
 */
import { describe, it, expect } from 'vitest';
import { Text } from '@codemirror/state';
import { findTagAtPosition, findMatchingTag, isChangeInTagName } from '../src/components/Editor/tagSync';

// ============================================================================
// findTagAtPosition Tests
// ============================================================================

describe('findTagAtPosition', () => {
  it('should find opening tag when cursor is inside tag name', () => {
    const doc = Text.of(['<person>John</person>']);
    // Cursor at "pers|on"
    const result = findTagAtPosition(doc, 4);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('opening');
    expect(result!.name).toBe('person');
    expect(result!.nameStart).toBe(1);
    expect(result!.nameEnd).toBe(7);
    expect(result!.tagStart).toBe(0);
    expect(result!.tagEnd).toBe(8);
  });

  it('should find opening tag when cursor is at start of tag name', () => {
    const doc = Text.of(['<div>content</div>']);
    // Cursor at "<|div>"
    const result = findTagAtPosition(doc, 1);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('opening');
    expect(result!.name).toBe('div');
  });

  it('should find opening tag when cursor is at end of tag name', () => {
    const doc = Text.of(['<div>content</div>']);
    // Cursor at "<div|>"
    const result = findTagAtPosition(doc, 4);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('opening');
    expect(result!.name).toBe('div');
  });

  it('should find closing tag when cursor is inside tag name', () => {
    const doc = Text.of(['<person>John</person>']);
    // Cursor at "</per|son>"
    const result = findTagAtPosition(doc, 16);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('closing');
    expect(result!.name).toBe('person');
    expect(result!.nameStart).toBe(14); // After </
    expect(result!.nameEnd).toBe(20); // After "person"
    expect(result!.tagStart).toBe(12);
    expect(result!.tagEnd).toBe(21);
  });

  it('should find self-closing tag', () => {
    const doc = Text.of(['<br/>']);
    const result = findTagAtPosition(doc, 2);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('self-closing');
    expect(result!.name).toBe('br');
  });

  it('should find opening tag with attributes', () => {
    const doc = Text.of(['<div id="main" class="container">content</div>']);
    // Cursor at "<d|iv"
    const result = findTagAtPosition(doc, 2);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('opening');
    expect(result!.name).toBe('div');
    expect(result!.tagEnd).toBe(33); // After the full opening tag
  });

  it('should return null when cursor is outside any tag', () => {
    const doc = Text.of(['<div>content here</div>']);
    // Cursor at "content| here"
    const result = findTagAtPosition(doc, 12);

    expect(result).toBeNull();
  });

  it('should return null when cursor is in text content', () => {
    const doc = Text.of(['<p>Hello World</p>']);
    // Cursor at "Hello |World"
    const result = findTagAtPosition(doc, 9);

    expect(result).toBeNull();
  });

  it('should return null for comments', () => {
    const doc = Text.of(['<!-- comment -->']);
    const result = findTagAtPosition(doc, 5);

    expect(result).toBeNull();
  });

  it('should return null for processing instructions', () => {
    const doc = Text.of(['<?xml version="1.0"?>']);
    const result = findTagAtPosition(doc, 5);

    expect(result).toBeNull();
  });

  it('should handle multiline tags', () => {
    const doc = Text.of(['<div', '  id="test"', '>']);
    // Cursor at "d|iv"
    const result = findTagAtPosition(doc, 2);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('opening');
    expect(result!.name).toBe('div');
  });
});

// ============================================================================
// findMatchingTag Tests
// ============================================================================

describe('findMatchingTag', () => {
  it('should find matching closing tag for opening tag', () => {
    const doc = Text.of(['<div>content</div>']);
    const openingTag = findTagAtPosition(doc, 2)!;

    const result = findMatchingTag(doc, openingTag);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('closing');
    expect(result!.name).toBe('div');
    expect(result!.tagStart).toBe(12);
    expect(result!.tagEnd).toBe(18);
  });

  it('should find matching opening tag for closing tag', () => {
    const doc = Text.of(['<div>content</div>']);
    const closingTag = findTagAtPosition(doc, 15)!;

    const result = findMatchingTag(doc, closingTag);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('opening');
    expect(result!.name).toBe('div');
    expect(result!.tagStart).toBe(0);
    expect(result!.tagEnd).toBe(5);
  });

  it('should handle nested same-name tags correctly (inner opening → inner closing)', () => {
    const doc = Text.of(['<div id="outer"><div id="inner">text</div></div>']);
    // Find the inner opening tag (the second <div)
    // Position 16 is at the start of "div" in second <div
    const innerOpening = findTagAtPosition(doc, 17)!;
    expect(innerOpening.name).toBe('div');

    const result = findMatchingTag(doc, innerOpening);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('closing');
    // Should match the first </div> (inner), not the second (outer)
    expect(result!.tagStart).toBe(36);
    expect(result!.tagEnd).toBe(42);
  });

  it('should handle nested same-name tags correctly (outer opening → outer closing)', () => {
    const doc = Text.of(['<div id="outer"><div id="inner">text</div></div>']);
    // Find the outer opening tag (the first <div)
    const outerOpening = findTagAtPosition(doc, 2)!;
    expect(outerOpening.name).toBe('div');

    const result = findMatchingTag(doc, outerOpening);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('closing');
    // Should match the second </div> (outer)
    expect(result!.tagStart).toBe(42);
    expect(result!.tagEnd).toBe(48);
  });

  it('should handle nested same-name tags correctly (inner closing → inner opening)', () => {
    const doc = Text.of(['<div id="outer"><div id="inner">text</div></div>']);
    // Find the inner closing tag (first </div>)
    const innerClosing = findTagAtPosition(doc, 39)!;
    expect(innerClosing.name).toBe('div');
    expect(innerClosing.type).toBe('closing');

    const result = findMatchingTag(doc, innerClosing);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('opening');
    // Should match the second <div> (inner opening)
    expect(result!.tagStart).toBe(16);
  });

  it('should return null for self-closing tags', () => {
    const doc = Text.of(['<br/>']);
    const selfClosing = findTagAtPosition(doc, 2)!;

    const result = findMatchingTag(doc, selfClosing);

    expect(result).toBeNull();
  });

  it('should return null when no matching tag exists', () => {
    const doc = Text.of(['<div>unclosed content']);
    const openingTag = findTagAtPosition(doc, 2)!;

    const result = findMatchingTag(doc, openingTag);

    expect(result).toBeNull();
  });

  it('should skip self-closing tags when counting depth', () => {
    const doc = Text.of(['<div><br/><span/></div>']);
    const openingTag = findTagAtPosition(doc, 2)!;

    const result = findMatchingTag(doc, openingTag);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('closing');
    expect(result!.name).toBe('div');
  });

  it('should handle different nested element names', () => {
    const doc = Text.of(['<div><span>text</span></div>']);
    const divOpening = findTagAtPosition(doc, 2)!;

    const result = findMatchingTag(doc, divOpening);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('closing');
    expect(result!.name).toBe('div');
    expect(result!.tagStart).toBe(22);
  });

  it('should handle tags with colons in names (namespaced)', () => {
    const doc = Text.of(['<tei:div>content</tei:div>']);
    const openingTag = findTagAtPosition(doc, 5)!;

    const result = findMatchingTag(doc, openingTag);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('closing');
    expect(result!.name).toBe('tei:div');
  });
});

// ============================================================================
// isChangeInTagName Tests
// ============================================================================

describe('isChangeInTagName', () => {
  it('should return true when change is within opening tag name', () => {
    const doc = Text.of(['<div>content</div>']);
    // Change at position 2 (inside "div")
    const result = isChangeInTagName(doc, 2, 3);

    expect(result).toBe(true);
  });

  it('should return true when change is within closing tag name', () => {
    const doc = Text.of(['<div>content</div>']);
    // Change at position 14 (inside closing "div")
    const result = isChangeInTagName(doc, 14, 15);

    expect(result).toBe(true);
  });

  it('should return false when change is in attributes', () => {
    const doc = Text.of(['<div id="main">content</div>']);
    // Change at position 9 (inside "main")
    const result = isChangeInTagName(doc, 9, 10);

    expect(result).toBe(false);
  });

  it('should return false when change is in text content', () => {
    const doc = Text.of(['<div>content</div>']);
    // Change at position 7 (inside "content")
    const result = isChangeInTagName(doc, 7, 8);

    expect(result).toBe(false);
  });

  it('should return false for self-closing tags', () => {
    const doc = Text.of(['<br/>']);
    const result = isChangeInTagName(doc, 2, 3);

    expect(result).toBe(false);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty document', () => {
    const doc = Text.of(['']);
    const result = findTagAtPosition(doc, 0);

    expect(result).toBeNull();
  });

  it('should handle document with only text', () => {
    const doc = Text.of(['just plain text']);
    const result = findTagAtPosition(doc, 5);

    expect(result).toBeNull();
  });

  it('should handle malformed tags gracefully', () => {
    const doc = Text.of(['<div unclosed']);
    const result = findTagAtPosition(doc, 2);

    // Should still return null since tag is not closed
    expect(result).toBeNull();
  });

  it('should handle tags with numbers in name', () => {
    const doc = Text.of(['<h1>heading</h1>']);
    const result = findTagAtPosition(doc, 2);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('h1');
  });

  it('should handle tags with underscores', () => {
    const doc = Text.of(['<my_element>content</my_element>']);
    const result = findTagAtPosition(doc, 5);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('my_element');
  });

  it('should handle tags with hyphens', () => {
    const doc = Text.of(['<my-element>content</my-element>']);
    const result = findTagAtPosition(doc, 5);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('my-element');
  });
});

// ============================================================================
// Chunk-boundary crossing (P2, 2026-07): findTagAtPosition now scans the
// document in SCAN_CHUNK (4096) slices instead of materializing the whole
// rope. These pin that a tag whose boundary lies beyond one chunk from the
// cursor is still found correctly (same result as the old full-string scan).
// ============================================================================

describe('findTagAtPosition — chunk-boundary crossing', () => {
  it('finds the opening < when it is >4096 chars behind the cursor', () => {
    // A single opening tag with a very long attribute run: the cursor sits
    // near the closing '>', so the backward scan for '<' must cross several
    // 4096-char chunks.
    const longAttrs = 'a'.repeat(5000);
    const doc = Text.of([`<div ${longAttrs}>text</div>`]);
    const gtPos = doc.toString().indexOf('>'); // inside the tag, just before '>'
    const result = findTagAtPosition(doc, gtPos);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('opening');
    expect(result!.name).toBe('div');
    expect(result!.tagStart).toBe(0);
    expect(result!.tagEnd).toBe(gtPos + 1);
  });

  it('finds the closing > when it is >4096 chars ahead of the cursor', () => {
    // Cursor just inside the tag name; the '>' is far ahead (long attr run).
    const longAttrs = 'b'.repeat(5000);
    const doc = Text.of([`<section ${longAttrs}>body</section>`]);
    const result = findTagAtPosition(doc, 3); // inside "section"

    expect(result).not.toBeNull();
    expect(result!.type).toBe('opening');
    expect(result!.name).toBe('section');
    expect(result!.tagEnd).toBe(doc.toString().indexOf('>') + 1);
  });

  it('still returns null (no tag) when a > precedes the < across chunks', () => {
    // >4096 chars of plain text before the cursor with the nearest angle
    // bracket being the previous tag close '>': cursor is in text content.
    const filler = 'x'.repeat(5000);
    const doc = Text.of([`<p>${filler}cursor</p>`]);
    const pos = doc.toString().indexOf('cursor') + 2; // inside the text run
    expect(findTagAtPosition(doc, pos)).toBeNull();
  });

  it('agrees with the tag name for a cursor deep in a long multi-line doc', () => {
    // Build a doc where the target tag sits well past the first chunk.
    const lines = [];
    for (let i = 0; i < 400; i++) lines.push(`  <l n="${i}">verse line number ${i} padding padding</l>`);
    lines.push('  <persName>Blake</persName>');
    const doc = Text.of(['<lg>', ...lines, '</lg>']);
    const idx = doc.toString().indexOf('<persName>');
    const result = findTagAtPosition(doc, idx + 3); // inside "persName"
    expect(result).not.toBeNull();
    expect(result!.name).toBe('persName');
    expect(result!.type).toBe('opening');
  });
});

// ============================================================================
// findMatchingTag across chunk boundaries (audit #16 — no doc.toString())
// ============================================================================

describe('findMatchingTag across chunk boundaries', () => {
  it('matches an opening tag to a closing tag far beyond one scan chunk (forward)', () => {
    const filler = 'x'.repeat(5000); // > SCAN_CHUNK (4096)
    const doc = Text.of([`<root>${filler}</root>`]);
    const opening = findTagAtPosition(doc, 3)!; // inside <root>
    const match = findMatchingTag(doc, opening);
    expect(match).not.toBeNull();
    expect(match!.type).toBe('closing');
    expect(match!.name).toBe('root');
    expect(match!.tagStart).toBe(6 + 5000); // after "<root>" + filler
  });

  it('matches a closing tag to its opening far above (backward)', () => {
    const filler = 'y'.repeat(5000);
    const doc = Text.of([`<root>${filler}</root>`]);
    const closingStart = doc.toString().indexOf('</root>');
    const closing = findTagAtPosition(doc, closingStart + 3)!; // inside </root>
    const match = findMatchingTag(doc, closing);
    expect(match).not.toBeNull();
    expect(match!.type).toBe('opening');
    expect(match!.tagStart).toBe(0);
  });

  it('counts nested same-name depth correctly across a chunk boundary', () => {
    // Outer <a> … <a>inner</a> … </a> with the nesting straddling the 4096-char
    // chunk boundary, so depth counting must survive chunked scanning.
    const pad = 'z'.repeat(4090);
    const doc = Text.of([`<a>${pad}<a>inner</a>tail</a>`]);
    const outerOpen = findTagAtPosition(doc, 1)!; // inside the FIRST <a>
    const match = findMatchingTag(doc, outerOpen);
    expect(match).not.toBeNull();
    expect(match!.type).toBe('closing');
    // The OUTER </a> (the last one), not the inner one.
    expect(match!.tagStart).toBe(doc.toString().lastIndexOf('</a>'));
  });
});
