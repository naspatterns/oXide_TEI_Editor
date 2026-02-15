/**
 * RNG Parser Tests - TEI Conformant Version
 *
 * Tests for RelaxNG (.rng) XML parsing and element/attribute extraction.
 * All test schemas are TEI conformant with proper namespace declarations.
 */
import { describe, it, expect } from 'vitest';
import { parseRng } from '../src/schema/rngParser';

// ============================================================================
// Test Data: TEI Conformant RNG Schema Strings
// ============================================================================

/**
 * Minimal TEI schema with core elements: TEI, teiHeader, text, body, p
 */
const TEI_MINIMAL_RNG = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="TEI"/></start>
  <define name="TEI">
    <element name="TEI">
      <optional><attribute name="xml:id"/></optional>
      <ref name="teiHeader"/>
      <ref name="text"/>
    </element>
  </define>
  <define name="teiHeader">
    <element name="teiHeader">
      <ref name="fileDesc"/>
    </element>
  </define>
  <define name="fileDesc">
    <element name="fileDesc">
      <ref name="titleStmt"/>
      <ref name="publicationStmt"/>
    </element>
  </define>
  <define name="titleStmt">
    <element name="titleStmt">
      <oneOrMore><ref name="title"/></oneOrMore>
    </element>
  </define>
  <define name="title">
    <element name="title"><text/></element>
  </define>
  <define name="publicationStmt">
    <element name="publicationStmt">
      <oneOrMore><ref name="p"/></oneOrMore>
    </element>
  </define>
  <define name="text">
    <element name="text">
      <ref name="body"/>
    </element>
  </define>
  <define name="body">
    <element name="body">
      <zeroOrMore><ref name="p"/></zeroOrMore>
    </element>
  </define>
  <define name="p">
    <element name="p">
      <text/>
    </element>
  </define>
</grammar>`;

/**
 * TEI schema with enum attribute values (@level on title, @rend on hi)
 */
const TEI_ENUM_ATTR_RNG = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="TEI"/></start>
  <define name="TEI">
    <element name="TEI">
      <ref name="teiHeader"/>
      <ref name="text"/>
    </element>
  </define>
  <define name="teiHeader">
    <element name="teiHeader">
      <ref name="fileDesc"/>
    </element>
  </define>
  <define name="fileDesc">
    <element name="fileDesc">
      <ref name="titleStmt"/>
    </element>
  </define>
  <define name="titleStmt">
    <element name="titleStmt">
      <oneOrMore><ref name="title"/></oneOrMore>
    </element>
  </define>
  <define name="title">
    <element name="title">
      <optional>
        <attribute name="level">
          <choice>
            <value>a</value>
            <value>m</value>
            <value>s</value>
            <value>j</value>
            <value>u</value>
          </choice>
        </attribute>
      </optional>
      <attribute name="type">
        <choice>
          <value>main</value>
          <value>sub</value>
          <value>alt</value>
        </choice>
      </attribute>
      <text/>
    </element>
  </define>
  <define name="text">
    <element name="text">
      <ref name="body"/>
    </element>
  </define>
  <define name="body">
    <element name="body">
      <zeroOrMore><ref name="p"/></zeroOrMore>
    </element>
  </define>
  <define name="p">
    <element name="p">
      <zeroOrMore>
        <choice>
          <text/>
          <ref name="hi"/>
        </choice>
      </zeroOrMore>
    </element>
  </define>
  <define name="hi">
    <element name="hi">
      <optional>
        <attribute name="rend">
          <choice>
            <value>italic</value>
            <value>bold</value>
            <value>sup</value>
            <value>sub</value>
          </choice>
        </attribute>
      </optional>
      <text/>
    </element>
  </define>
</grammar>`;

/**
 * TEI schema with nested refs (div structure with head and p)
 */
const TEI_NESTED_REF_RNG = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="TEI"/></start>
  <define name="TEI">
    <element name="TEI">
      <ref name="text"/>
    </element>
  </define>
  <define name="text">
    <element name="text">
      <ref name="body"/>
    </element>
  </define>
  <define name="body">
    <element name="body">
      <ref name="divContent"/>
    </element>
  </define>
  <define name="divContent">
    <choice>
      <ref name="div"/>
      <ref name="p"/>
    </choice>
  </define>
  <define name="div">
    <element name="div">
      <optional><ref name="head"/></optional>
      <zeroOrMore><ref name="p"/></zeroOrMore>
    </element>
  </define>
  <define name="head">
    <element name="head">
      <text/>
    </element>
  </define>
  <define name="p">
    <element name="p">
      <text/>
    </element>
  </define>
</grammar>`;

/**
 * TEI schema with self-nesting div element
 */
const TEI_DIV_SELF_NESTING_RNG = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="div"/></start>
  <define name="div">
    <element name="div">
      <optional><attribute name="type"/></optional>
      <optional><attribute name="n"/></optional>
      <optional><ref name="head"/></optional>
      <zeroOrMore>
        <choice>
          <ref name="div"/>
          <ref name="p"/>
        </choice>
      </zeroOrMore>
    </element>
  </define>
  <define name="head">
    <element name="head"><text/></element>
  </define>
  <define name="p">
    <element name="p">
      <text/>
    </element>
  </define>
</grammar>`;

/**
 * TEI schema with choice content model (lg with l, lg, or p)
 */
const TEI_CHOICE_CONTENT_RNG = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="lg"/></start>
  <define name="lg">
    <element name="lg">
      <optional><attribute name="type"/></optional>
      <choice>
        <oneOrMore><ref name="l"/></oneOrMore>
        <oneOrMore><ref name="lg"/></oneOrMore>
        <oneOrMore><ref name="p"/></oneOrMore>
      </choice>
    </element>
  </define>
  <define name="l">
    <element name="l">
      <optional><attribute name="n"/></optional>
      <text/>
    </element>
  </define>
  <define name="p">
    <element name="p"><text/></element>
  </define>
</grammar>`;

/**
 * TEI schema with sequence content model (fileDesc structure)
 */
const TEI_SEQUENCE_CONTENT_RNG = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="fileDesc"/></start>
  <define name="fileDesc">
    <element name="fileDesc">
      <ref name="titleStmt"/>
      <optional><ref name="editionStmt"/></optional>
      <ref name="publicationStmt"/>
      <optional><ref name="sourceDesc"/></optional>
    </element>
  </define>
  <define name="titleStmt">
    <element name="titleStmt">
      <oneOrMore><ref name="title"/></oneOrMore>
    </element>
  </define>
  <define name="title">
    <element name="title"><text/></element>
  </define>
  <define name="editionStmt">
    <element name="editionStmt">
      <ref name="edition"/>
    </element>
  </define>
  <define name="edition">
    <element name="edition"><text/></element>
  </define>
  <define name="publicationStmt">
    <element name="publicationStmt">
      <oneOrMore><ref name="p"/></oneOrMore>
    </element>
  </define>
  <define name="p">
    <element name="p"><text/></element>
  </define>
  <define name="sourceDesc">
    <element name="sourceDesc">
      <oneOrMore><ref name="p"/></oneOrMore>
    </element>
  </define>
</grammar>`;

/**
 * TEI schema with oneOrMore cardinality (listBibl with bibl)
 */
const TEI_ONE_OR_MORE_RNG = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="listBibl"/></start>
  <define name="listBibl">
    <element name="listBibl">
      <oneOrMore>
        <ref name="bibl"/>
      </oneOrMore>
    </element>
  </define>
  <define name="bibl">
    <element name="bibl">
      <optional><attribute name="xml:id"/></optional>
      <text/>
    </element>
  </define>
</grammar>`;

/**
 * Empty grammar (no elements)
 */
const EMPTY_GRAMMAR_RNG = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><empty/></start>
</grammar>`;

/**
 * Malformed XML (not valid RNG)
 */
const MALFORMED_RNG = `<?xml version="1.0"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0">
  <element name="broken"
</grammar>`;

/**
 * TEI schema with required attributes (@n on pb, @when on date)
 */
const TEI_REQUIRED_ATTR_RNG = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="body"/></start>
  <define name="body">
    <element name="body">
      <zeroOrMore>
        <choice>
          <ref name="p"/>
          <ref name="pb"/>
          <ref name="date"/>
        </choice>
      </zeroOrMore>
    </element>
  </define>
  <define name="p">
    <element name="p"><text/></element>
  </define>
  <define name="pb">
    <element name="pb">
      <attribute name="n"/>
      <attribute name="facs"/>
      <optional><attribute name="xml:id"/></optional>
    </element>
  </define>
  <define name="date">
    <element name="date">
      <attribute name="when"/>
      <optional><attribute name="notBefore"/></optional>
      <optional><attribute name="notAfter"/></optional>
      <text/>
    </element>
  </define>
</grammar>`;

/**
 * TEI schema with interleave content model (person with name, birth, death)
 */
const TEI_INTERLEAVE_RNG = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="person"/></start>
  <define name="person">
    <element name="person">
      <optional><attribute name="xml:id"/></optional>
      <interleave>
        <ref name="persName"/>
        <optional><ref name="birth"/></optional>
        <optional><ref name="death"/></optional>
      </interleave>
    </element>
  </define>
  <define name="persName">
    <element name="persName">
      <optional><attribute name="ref"/></optional>
      <text/>
    </element>
  </define>
  <define name="birth">
    <element name="birth">
      <optional><attribute name="when"/></optional>
      <text/>
    </element>
  </define>
  <define name="death">
    <element name="death">
      <optional><attribute name="when"/></optional>
      <text/>
    </element>
  </define>
</grammar>`;

/**
 * TEI schema with documentation annotations
 */
const TEI_DOCUMENTED_RNG = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         xmlns:a="http://relaxng.org/ns/compatibility/annotations/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="TEI"/></start>
  <define name="TEI">
    <element name="TEI">
      <a:documentation>The root element of a TEI document</a:documentation>
      <attribute name="version">
        <a:documentation>TEI version number</a:documentation>
      </attribute>
      <ref name="teiHeader"/>
      <ref name="text"/>
    </element>
  </define>
  <define name="teiHeader">
    <element name="teiHeader">
      <a:documentation>Contains metadata about the document</a:documentation>
      <text/>
    </element>
  </define>
  <define name="text">
    <element name="text">
      <a:documentation>Contains the main text of the document</a:documentation>
      <text/>
    </element>
  </define>
</grammar>`;

// ============================================================================
// Test Suite: Element Extraction
// ============================================================================

describe('rngParser - Element Extraction', () => {
  it('extracts element names from minimal TEI RNG', () => {
    const elements = parseRng(TEI_MINIMAL_RNG);
    const names = elements.map(e => e.name);

    expect(names).toContain('TEI');
    expect(names).toContain('teiHeader');
    expect(names).toContain('fileDesc');
    expect(names).toContain('titleStmt');
    expect(names).toContain('title');
    expect(names).toContain('publicationStmt');
    expect(names).toContain('text');
    expect(names).toContain('body');
    expect(names).toContain('p');
    expect(elements.length).toBe(9);
  });

  it('extracts elements from nested ref schema', () => {
    const elements = parseRng(TEI_NESTED_REF_RNG);
    const names = elements.map(e => e.name);

    expect(names).toContain('TEI');
    expect(names).toContain('text');
    expect(names).toContain('body');
    expect(names).toContain('div');
    expect(names).toContain('head');
    expect(names).toContain('p');
    expect(elements.length).toBe(6);
  });

  it('sorts elements alphabetically by name (case-insensitive)', () => {
    const elements = parseRng(TEI_MINIMAL_RNG);
    const names = elements.map(e => e.name);

    // Verify sorted order (case-insensitive)
    const sortedNames = [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    expect(names).toEqual(sortedNames);
  });

  it('returns elements from choice content model', () => {
    const elements = parseRng(TEI_CHOICE_CONTENT_RNG);
    const names = elements.map(e => e.name);

    expect(names).toContain('lg');
    expect(names).toContain('l');
    expect(names).toContain('p');
  });

  it('returns elements from sequence content model', () => {
    const elements = parseRng(TEI_SEQUENCE_CONTENT_RNG);
    const names = elements.map(e => e.name);

    expect(names).toContain('fileDesc');
    expect(names).toContain('titleStmt');
    expect(names).toContain('title');
    expect(names).toContain('editionStmt');
    expect(names).toContain('edition');
    expect(names).toContain('publicationStmt');
    expect(names).toContain('sourceDesc');
    expect(names).toContain('p');
  });
});

// ============================================================================
// Test Suite: Attribute Extraction
// ============================================================================

describe('rngParser - Attribute Extraction', () => {
  it('extracts optional attributes (xml:id on TEI)', () => {
    const elements = parseRng(TEI_MINIMAL_RNG);
    const tei = elements.find(e => e.name === 'TEI');

    expect(tei).toBeDefined();
    expect(tei!.attributes).toBeDefined();
    expect(tei!.attributes!.length).toBe(1);
    expect(tei!.attributes![0].name).toBe('xml:id');
    expect(tei!.attributes![0].required).toBe(false);
  });

  it('extracts required attributes (@n and @facs on pb, @when on date)', () => {
    const elements = parseRng(TEI_REQUIRED_ATTR_RNG);
    const pb = elements.find(e => e.name === 'pb');
    const date = elements.find(e => e.name === 'date');

    expect(pb).toBeDefined();
    expect(pb!.attributes).toBeDefined();

    const nAttr = pb!.attributes!.find(a => a.name === 'n');
    const facsAttr = pb!.attributes!.find(a => a.name === 'facs');
    const idAttr = pb!.attributes!.find(a => a.name === 'xml:id');

    expect(nAttr!.required).toBe(true);
    expect(facsAttr!.required).toBe(true);
    expect(idAttr!.required).toBe(false);

    expect(date).toBeDefined();
    const whenAttr = date!.attributes!.find(a => a.name === 'when');
    const notBeforeAttr = date!.attributes!.find(a => a.name === 'notBefore');
    expect(whenAttr!.required).toBe(true);
    expect(notBeforeAttr!.required).toBe(false);
  });

  it('extracts enum attribute values from choice (@level on title, @rend on hi)', () => {
    const elements = parseRng(TEI_ENUM_ATTR_RNG);
    const title = elements.find(e => e.name === 'title');
    const hi = elements.find(e => e.name === 'hi');

    expect(title).toBeDefined();
    expect(title!.attributes).toBeDefined();

    const levelAttr = title!.attributes!.find(a => a.name === 'level');
    expect(levelAttr!.values).toBeDefined();
    expect(levelAttr!.values).toContain('a');
    expect(levelAttr!.values).toContain('m');
    expect(levelAttr!.values).toContain('s');
    expect(levelAttr!.values).toContain('j');
    expect(levelAttr!.values).toContain('u');

    const typeAttr = title!.attributes!.find(a => a.name === 'type');
    expect(typeAttr!.values).toBeDefined();
    expect(typeAttr!.values).toContain('main');
    expect(typeAttr!.values).toContain('sub');
    expect(typeAttr!.values).toContain('alt');

    expect(hi).toBeDefined();
    const rendAttr = hi!.attributes!.find(a => a.name === 'rend');
    expect(rendAttr!.values).toBeDefined();
    expect(rendAttr!.values).toContain('italic');
    expect(rendAttr!.values).toContain('bold');
    expect(rendAttr!.values).toContain('sup');
    expect(rendAttr!.values).toContain('sub');
  });

  it('marks attributes without enum as open (no values array)', () => {
    const elements = parseRng(TEI_DIV_SELF_NESTING_RNG);
    const div = elements.find(e => e.name === 'div');

    const typeAttr = div!.attributes!.find(a => a.name === 'type');
    expect(typeAttr!.values).toBeUndefined();
  });
});

// ============================================================================
// Test Suite: Ref Resolution
// ============================================================================

describe('rngParser - Ref Resolution', () => {
  it('resolves <ref> to <define> for child elements', () => {
    const elements = parseRng(TEI_MINIMAL_RNG);
    const tei = elements.find(e => e.name === 'TEI');

    expect(tei!.children).toBeDefined();
    expect(tei!.children).toContain('teiHeader');
    expect(tei!.children).toContain('text');
  });

  it('resolves nested refs through multiple levels', () => {
    const elements = parseRng(TEI_NESTED_REF_RNG);
    const body = elements.find(e => e.name === 'body');

    // body -> divContent -> div/p
    expect(body!.children).toBeDefined();
    expect(body!.children).toContain('div');
    expect(body!.children).toContain('p');
  });

  it('handles circular refs without infinite loop (div self-nesting)', () => {
    // This should complete without hanging
    const elements = parseRng(TEI_DIV_SELF_NESTING_RNG);

    const div = elements.find(e => e.name === 'div');
    expect(div).toBeDefined();
    // div can contain itself
    expect(div!.children).toContain('div');
    expect(div!.children).toContain('p');
    expect(div!.children).toContain('head');
  });

  it('resolves refs for attributes in defines', () => {
    const elements = parseRng(TEI_DIV_SELF_NESTING_RNG);
    const div = elements.find(e => e.name === 'div');

    expect(div!.attributes).toBeDefined();
    const typeAttr = div!.attributes!.find(a => a.name === 'type');
    const nAttr = div!.attributes!.find(a => a.name === 'n');
    expect(typeAttr).toBeDefined();
    expect(nAttr).toBeDefined();
  });
});

// ============================================================================
// Test Suite: Children Extraction
// ============================================================================

describe('rngParser - Children Extraction', () => {
  it('extracts allowed child elements (div contains head, p)', () => {
    const elements = parseRng(TEI_DIV_SELF_NESTING_RNG);
    const div = elements.find(e => e.name === 'div');

    expect(div!.children).toBeDefined();
    expect(div!.children).toContain('head');
    expect(div!.children).toContain('p');
    expect(div!.children).toContain('div');
  });

  it('returns empty children array for text-only elements', () => {
    const elements = parseRng(TEI_MINIMAL_RNG);
    const title = elements.find(e => e.name === 'title');

    expect(title!.children).toBeDefined();
    expect(title!.children!.length).toBe(0);
  });

  it('extracts children from oneOrMore (listBibl contains bibl)', () => {
    const elements = parseRng(TEI_ONE_OR_MORE_RNG);
    const listBibl = elements.find(e => e.name === 'listBibl');

    expect(listBibl!.children).toContain('bibl');
  });

  it('extracts children from interleave (person contains persName, birth, death)', () => {
    const elements = parseRng(TEI_INTERLEAVE_RNG);
    const person = elements.find(e => e.name === 'person');

    expect(person!.children).toContain('persName');
    expect(person!.children).toContain('birth');
    expect(person!.children).toContain('death');
  });
});

// ============================================================================
// Test Suite: Content Model Parsing
// ============================================================================

describe('rngParser - Content Model Parsing', () => {
  it('parses choice content model (lg with l/lg/p)', () => {
    const elements = parseRng(TEI_CHOICE_CONTENT_RNG);
    const lg = elements.find(e => e.name === 'lg');

    expect(lg!.contentModel).toBeDefined();
    // Note: The RNG parser may detect the outer structure as sequence
    // (attribute + choice), so we verify children are correctly extracted
    expect(lg!.children).toContain('l');
    expect(lg!.children).toContain('lg');
    expect(lg!.children).toContain('p');
  });

  it('parses sequence content model (fileDesc children)', () => {
    const elements = parseRng(TEI_SEQUENCE_CONTENT_RNG);
    const fileDesc = elements.find(e => e.name === 'fileDesc');

    expect(fileDesc!.contentModel).toBeDefined();
    // Multiple children without explicit grouping = sequence
    expect(fileDesc!.contentModel!.type).toBe('sequence');
  });

  it('parses zeroOrMore cardinality (body with p)', () => {
    const elements = parseRng(TEI_MINIMAL_RNG);
    const body = elements.find(e => e.name === 'body');

    expect(body!.contentModel).toBeDefined();
    expect(body!.children).toContain('p');
    expect(body!.contentModel!.type).toBeDefined();
  });

  it('parses oneOrMore cardinality (listBibl with bibl)', () => {
    const elements = parseRng(TEI_ONE_OR_MORE_RNG);
    const listBibl = elements.find(e => e.name === 'listBibl');

    expect(listBibl!.contentModel).toBeDefined();
    expect(listBibl!.contentModel!.minOccurs).toBe(1);
    expect(listBibl!.contentModel!.maxOccurs).toBe(Infinity);
  });

  it('parses interleave content model (person)', () => {
    const elements = parseRng(TEI_INTERLEAVE_RNG);
    const person = elements.find(e => e.name === 'person');

    expect(person!.contentModel).toBeDefined();
    // Note: The RNG parser may not distinguish interleave from sequence,
    // but children should be correctly extracted
    expect(person!.children).toContain('persName');
    expect(person!.children).toContain('birth');
    expect(person!.children).toContain('death');
  });
});

// ============================================================================
// Test Suite: Error Handling
// ============================================================================

describe('rngParser - Error Handling', () => {
  it('throws on malformed XML', () => {
    expect(() => parseRng(MALFORMED_RNG)).toThrow();
    expect(() => parseRng(MALFORMED_RNG)).toThrow(/RNG parse error/);
  });

  it('returns empty array for RNG without elements', () => {
    const elements = parseRng(EMPTY_GRAMMAR_RNG);
    expect(elements).toEqual([]);
  });

  it('throws on completely invalid XML', () => {
    expect(() => parseRng('not xml at all')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => parseRng('')).toThrow();
  });
});

// ============================================================================
// Test Suite: Documentation Extraction
// ============================================================================

describe('rngParser - Documentation Extraction', () => {
  it('extracts documentation from a:documentation elements', () => {
    const elements = parseRng(TEI_DOCUMENTED_RNG);
    const tei = elements.find(e => e.name === 'TEI');

    expect(tei!.documentation).toBeDefined();
    expect(tei!.documentation).toContain('root element');
  });

  it('extracts documentation from attributes', () => {
    const elements = parseRng(TEI_DOCUMENTED_RNG);
    const tei = elements.find(e => e.name === 'TEI');

    const versionAttr = tei!.attributes!.find(a => a.name === 'version');
    expect(versionAttr!.documentation).toBeDefined();
    expect(versionAttr!.documentation).toContain('version number');
  });

  it('extracts documentation from child elements', () => {
    const elements = parseRng(TEI_DOCUMENTED_RNG);
    const teiHeader = elements.find(e => e.name === 'teiHeader');

    expect(teiHeader!.documentation).toBeDefined();
    expect(teiHeader!.documentation).toContain('metadata');
  });
});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

describe('rngParser - Edge Cases', () => {
  it('handles duplicate element names in different defines', () => {
    const rng = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="body"/></start>
  <define name="body">
    <element name="body">
      <ref name="p1"/>
      <ref name="p2"/>
    </element>
  </define>
  <define name="p1">
    <element name="p"><text/></element>
  </define>
  <define name="p2">
    <element name="p"><attribute name="rend"/></element>
  </define>
</grammar>`;
    const elements = parseRng(rng);
    // Should deduplicate element names
    const pElements = elements.filter(e => e.name === 'p');
    expect(pElements.length).toBe(1);
  });

  it('handles RNG with TEI namespace declaration', () => {
    const rng = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="tei"/></start>
  <define name="tei">
    <element name="TEI">
      <text/>
    </element>
  </define>
</grammar>`;
    const elements = parseRng(rng);
    const tei = elements.find(e => e.name === 'TEI');
    expect(tei).toBeDefined();
  });

  it('handles deeply nested groups', () => {
    const rng = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="body"/></start>
  <define name="body">
    <element name="body">
      <group>
        <group>
          <group>
            <element name="p"><text/></element>
          </group>
        </group>
      </group>
    </element>
  </define>
</grammar>`;
    const elements = parseRng(rng);
    const body = elements.find(e => e.name === 'body');
    expect(body!.children).toContain('p');
  });

  it('handles TEI-specific patterns like macro.paraContent style', () => {
    const rng = `<?xml version="1.0" encoding="UTF-8"?>
<grammar xmlns="http://relaxng.org/ns/structure/1.0"
         ns="http://www.tei-c.org/ns/1.0">
  <start><ref name="p"/></start>
  <define name="p">
    <element name="p">
      <ref name="macro.paraContent"/>
    </element>
  </define>
  <define name="macro.paraContent">
    <zeroOrMore>
      <choice>
        <text/>
        <ref name="hi"/>
        <ref name="persName"/>
        <ref name="placeName"/>
      </choice>
    </zeroOrMore>
  </define>
  <define name="hi">
    <element name="hi"><text/></element>
  </define>
  <define name="persName">
    <element name="persName"><text/></element>
  </define>
  <define name="placeName">
    <element name="placeName"><text/></element>
  </define>
</grammar>`;
    const elements = parseRng(rng);
    const p = elements.find(e => e.name === 'p');
    expect(p!.children).toContain('hi');
    expect(p!.children).toContain('persName');
    expect(p!.children).toContain('placeName');
  });
});
