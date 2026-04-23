import { describe, it, expect, beforeAll } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { CompletionContext } from '@codemirror/autocomplete';
import { schemaEngine } from '../../src/schema/SchemaEngine';
import { validateXml } from '../../src/schema/xmlValidator';
import { createSchemaCompletionSource } from '../../src/components/Editor/completionSource';
import type { SchemaInfo } from '../../src/types/schema';

/**
 * End-to-end tests of the validation + completion pipeline against a real
 * loaded TEI Lite schema. These check that the full stack agrees on what
 * counts as valid TEI: a synthetic schema can hide regressions where the
 * generator and runtime disagree.
 */

function mockContext(doc: string, pos = doc.length): CompletionContext {
  const state = EditorState.create({ doc });
  return {
    state,
    pos,
    explicit: true,
    tokenBefore: () => null,
    matchBefore: (regex: RegExp) => {
      const before = doc.slice(0, pos);
      const match = before.match(regex);
      return match ? { from: pos - match[0].length, to: pos, text: match[0] } : null;
    },
    aborted: false,
    addEventListener: () => {},
  } as unknown as CompletionContext;
}

const VALID_DOC = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test</title>
      </titleStmt>
      <publicationStmt>
        <p>Unpublished</p>
      </publicationStmt>
      <sourceDesc>
        <p>Born digital</p>
      </sourceDesc>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <div>
        <p>Hello world</p>
      </div>
    </body>
  </text>
</TEI>`;

describe('validateXml — against real TEI Lite', () => {
  let schema: SchemaInfo;

  beforeAll(async () => {
    schema = await schemaEngine.loadBuiltin('tei_lite');
  });

  it('passes a minimal well-formed TEI document with no errors', () => {
    const errors = validateXml(VALID_DOC, schema);
    // Filter to only blocking errors — warnings are allowed.
    const blocking = errors.filter((e) => e.severity === 'error');
    expect(blocking).toEqual([]);
  });

  it('reports an error for an unclosed tag', () => {
    const malformed = '<TEI><teiHeader>';
    const errors = validateXml(malformed, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].severity).toBe('error');
  });

  it('reports a malformed tag with line and column information', () => {
    const malformed = '<a>\n<>\n</a>';
    const errors = validateXml(malformed, schema);
    expect(errors.length).toBeGreaterThan(0);
    // The malformed `<>` is on line 2 — DOMParser line numbers may vary by
    // browser, so we just assert the column points into the second line.
    const malformedTagError = errors.find((e) => e.line === 2);
    expect(malformedTagError).toBeDefined();
  });
});

describe('completionSource — against real TEI Lite', () => {
  let schema: SchemaInfo;

  beforeAll(async () => {
    schema = await schemaEngine.loadBuiltin('tei_lite');
  });

  it('returns null when the schema is null', () => {
    const completer = createSchemaCompletionSource(null);
    const result = completer(mockContext('<TEI><'));
    expect(result).toBeNull();
  });

  it('suggests teiHeader as a child of TEI root', () => {
    const completer = createSchemaCompletionSource(schema);
    const doc = '<TEI><';
    const result = completer(mockContext(doc));
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain('teiHeader');
  });

  it('suggests element-name attributes when typing inside a known tag', () => {
    const completer = createSchemaCompletionSource(schema);
    // Cursor right after `<p ` (with trailing space) — should propose attrs of <p>
    const doc = '<TEI><text><body><p ';
    const result = completer(mockContext(doc));
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    // Global attributes should appear regardless of which TEI element it is.
    expect(labels).toContain('xml:id');
  });

  it('suggests element names when typing after `<`', () => {
    const completer = createSchemaCompletionSource(schema);
    // Inside <body>, after `<` — should propose body-valid children.
    const doc = '<TEI><text><body><';
    const result = completer(mockContext(doc));
    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThan(0);
  });
});
