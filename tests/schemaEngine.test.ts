/**
 * SchemaEngine custom-RNG cache tests (P1, 2026-07).
 *
 * Pins the fix for the stale-cache bug: re-uploading an EDITED schema under
 * the same file name must reflect the edits (the cache is now keyed by
 * content, not by name).
 */
import { describe, it, expect } from 'vitest';
import { SchemaEngine } from '../src/schema/SchemaEngine';

const RNG_V1 = `<?xml version="1.0"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0">
  <start><ref name="root"/></start>
  <define name="root">
    <element name="poem">
      <oneOrMore><ref name="lineEl"/></oneOrMore>
    </element>
  </define>
  <define name="lineEl">
    <element name="line"><text/></element>
  </define>
</grammar>`;

const RNG_V2 = `<?xml version="1.0"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0">
  <start><ref name="root"/></start>
  <define name="root">
    <element name="poem">
      <optional><ref name="titleEl"/></optional>
      <oneOrMore><ref name="lineEl"/></oneOrMore>
    </element>
  </define>
  <define name="lineEl">
    <element name="line"><text/></element>
  </define>
  <define name="titleEl">
    <element name="title"><text/></element>
  </define>
</grammar>`;

describe('SchemaEngine.loadCustomRng', () => {
  it('re-uploading edited content under the same name returns the NEW schema', async () => {
    const engine = new SchemaEngine();

    const v1 = await engine.loadCustomRng(RNG_V1, 'mySchema.rng');
    const v1Names = v1.elements.map(e => e.name).sort();
    expect(v1Names).toContain('poem');
    expect(v1Names).toContain('line');
    expect(v1Names).not.toContain('title');

    const v2 = await engine.loadCustomRng(RNG_V2, 'mySchema.rng');
    expect(v2.elements.map(e => e.name)).toContain('title');
  });

  it('identical content is served from cache (same instance)', async () => {
    const engine = new SchemaEngine();
    const a = await engine.loadCustomRng(RNG_V1, 'mySchema.rng');
    const b = await engine.loadCustomRng(RNG_V1, 'mySchema.rng');
    expect(b).toBe(a);
  });

  it('keeps id and display name stable across content versions', async () => {
    const engine = new SchemaEngine();
    const v1 = await engine.loadCustomRng(RNG_V1, 'mySchema.rng');
    const v2 = await engine.loadCustomRng(RNG_V2, 'mySchema.rng');
    expect(v1.id).toBe('custom_mySchema.rng');
    expect(v2.id).toBe('custom_mySchema.rng');
    expect(v2.name).toBe('mySchema.rng');
  });
});
