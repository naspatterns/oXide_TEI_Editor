import { describe, it, expect, beforeAll } from 'vitest';
import { schemaEngine } from '../../src/schema/SchemaEngine';
import {
  getElement,
  getAttributes,
  getChildNames,
  hasElement,
  getRequiredAttributes,
} from '../../src/schema/schemaQuery';
import type { SchemaInfo } from '../../src/types/schema';

/**
 * Integration tests against the actual generated TEI schemas.
 * These guard the contract between schema generation scripts and the runtime
 * — if the generator output ever drops elements or attributes that the
 * editor depends on, we catch it here rather than at runtime.
 */

describe('SchemaEngine — real TEI Lite', () => {
  let schema: SchemaInfo;

  beforeAll(async () => {
    schema = await schemaEngine.loadBuiltin('tei_lite');
  });

  it('exposes a non-trivial number of elements', () => {
    expect(schema.elements.length).toBeGreaterThan(50);
  });

  it('contains the expected TEI Lite root and structural elements', () => {
    for (const name of ['TEI', 'teiHeader', 'fileDesc', 'titleStmt', 'text', 'body', 'p', 'div']) {
      expect(hasElement(schema, name)).toBe(true);
    }
  });

  it('attaches global attributes (xml:id, xml:lang) to common elements', () => {
    const pAttrs = getAttributes(schema, 'p').map((a) => a.name);
    expect(pAttrs).toContain('xml:id');
    expect(pAttrs).toContain('xml:lang');
  });

  it('lists allowed children for div', () => {
    const children = getChildNames(schema, 'div');
    expect(children.length).toBeGreaterThan(0);
    expect(children).toContain('p');
  });

  it('looking up an unknown element returns undefined via the query layer', () => {
    expect(getElement(schema, 'definitelyNotATeiElement')).toBeUndefined();
    expect(getRequiredAttributes(schema, 'definitelyNotATeiElement')).toEqual([]);
  });
});

describe('SchemaEngine — real TEI All', () => {
  let schema: SchemaInfo;

  beforeAll(async () => {
    schema = await schemaEngine.loadBuiltin('tei_all');
  });

  it('exposes substantially more elements than TEI Lite', () => {
    // TEI All adds the full P5 set (588 elements per the schema generator).
    expect(schema.elements.length).toBeGreaterThan(400);
  });

  it('includes elements that are absent from TEI Lite', () => {
    // Manuscript description is part of TEI All but not Lite.
    expect(hasElement(schema, 'msDesc')).toBe(true);
  });
});

describe('SchemaEngine — schema switching', () => {
  it('returns independent SchemaInfo objects for different IDs', async () => {
    const lite = await schemaEngine.loadBuiltin('tei_lite');
    const all = await schemaEngine.loadBuiltin('tei_all');
    expect(lite).not.toBe(all);
    expect(lite.id).toBe('tei_lite');
    expect(all.id).toBe('tei_all');
    expect(all.elements.length).toBeGreaterThan(lite.elements.length);
  });

  it('throws on unknown built-in id', async () => {
    await expect(schemaEngine.loadBuiltin('not_a_real_schema')).rejects.toThrow();
  });
});
