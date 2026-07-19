/**
 * schemaDetector tests (input-robustness track, finding #11).
 *
 * The DOCTYPE SYSTEM literal was run through decodeURIComponent, which throws
 * URIError on a bare '%' (e.g. "100%.dtd"). That exception propagated out of
 * every open / recovery / batch-validate path and made such a document
 * impossible to open. These tests pin the guarded decode plus the normal
 * detection/resolution behaviour.
 */
import { describe, it, expect } from 'vitest';
import {
  detectSchemaDeclarations,
  detectSchemaIdFromContent,
} from '../src/utils/schemaDetector';

describe('detectSchemaDeclarations — DOCTYPE percent handling (#11)', () => {
  it('does not throw on a SYSTEM literal with a bare percent, keeping the raw href', () => {
    const xml = '<!DOCTYPE TEI SYSTEM "100%.dtd"><TEI/>';
    let decls: ReturnType<typeof detectSchemaDeclarations> | undefined;
    expect(() => {
      decls = detectSchemaDeclarations(xml);
    }).not.toThrow();
    expect(decls).toHaveLength(1);
    expect(decls![0].type).toBe('doctype');
    expect(decls![0].href).toBe('100%.dtd'); // raw literal, not decoded
    expect(decls![0].format).toBe('dtd');
  });

  it('still decodes valid percent-escapes', () => {
    const xml = '<!DOCTYPE TEI SYSTEM "schemas/tei%20all.rng"><TEI/>';
    const decls = detectSchemaDeclarations(xml);
    expect(decls[0].href).toBe('schemas/tei all.rng');
  });

  it('detectSchemaIdFromContent returns null (not a throw) for a bad-DOCTYPE document', () => {
    const xml = '<!DOCTYPE TEI SYSTEM "tei%all.dtd"><TEI xmlns="http://www.tei-c.org/ns/1.0"/>';
    expect(() => detectSchemaIdFromContent(xml)).not.toThrow();
    expect(detectSchemaIdFromContent(xml)).toBeNull();
  });
});

describe('detectSchemaDeclarations / resolve — normal detection', () => {
  it('detects an xml-model PI and resolves the built-in id', () => {
    const all = '<?xml-model href="http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_all.rng" type="application/xml"?><TEI/>';
    expect(detectSchemaIdFromContent(all)).toBe('tei_all');

    const lite = '<?xml-model href="tei_lite.rng"?><TEI/>';
    expect(detectSchemaIdFromContent(lite)).toBe('tei_lite');
  });

  it('returns no declarations for content without any schema hint', () => {
    expect(detectSchemaDeclarations('<TEI><text/></TEI>')).toEqual([]);
    expect(detectSchemaIdFromContent('<TEI><text/></TEI>')).toBeNull();
  });
});
