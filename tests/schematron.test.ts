/**
 * Schematron engine tests (P2, 2026-07).
 *
 * jsdom's XPath engine cannot evaluate namespace-prefixed name tests or
 * local-name() predicates, so evaluation against TEI-namespaced documents
 * is verified in a real browser. These tests cover the full parse surface
 * and end-to-end evaluation over no-namespace documents (which jsdom's
 * XPath handles natively), including line attribution, first-rule-wins,
 * role→severity mapping, <name/> substitution, and rule-error reporting.
 */
import { describe, it, expect } from 'vitest';
import { parseSchematron, validateSchematron } from '../src/schema/schematron';

const ISO_NS = 'http://purl.oclc.org/dsdl/schematron';

const TEI_SCH = `<?xml version="1.0"?>
<schema xmlns="${ISO_NS}">
  <title>TEI house rules</title>
  <ns prefix="tei" uri="http://www.tei-c.org/ns/1.0"/>
  <pattern>
    <rule context="tei:div">
      <assert test="@type">Every division must declare @type.</assert>
    </rule>
    <rule context="tei:p">
      <report test="not(node())" role="warning">Empty paragraph.</report>
    </rule>
  </pattern>
</schema>`;

describe('parseSchematron', () => {
  it('parses ISO schematron: title, ns map, patterns, rules, tests', () => {
    const s = parseSchematron(TEI_SCH, 'house-rules');
    expect(s.name).toBe('house-rules');
    expect(s.title).toBe('TEI house rules');
    expect(s.nsMap).toEqual({ tei: 'http://www.tei-c.org/ns/1.0' });
    expect(s.patterns).toHaveLength(1);
    expect(s.patterns[0].rules).toHaveLength(2);
    expect(s.testCount).toBe(2);
    expect(s.patterns[0].rules[0]).toMatchObject({ context: 'tei:div' });
    expect(s.patterns[0].rules[0].tests[0]).toMatchObject({
      kind: 'assert',
      test: '@type',
      severity: 'error', // default for asserts
    });
    expect(s.patterns[0].rules[1].tests[0]).toMatchObject({
      kind: 'report',
      severity: 'warning', // explicit role="warning"
    });
  });

  it('parses legacy-namespace and no-namespace schematron tolerantly', () => {
    const legacy = `<schema xmlns="http://www.ascc.net/xml/schematron"><pattern><rule context="a"><assert test="@x">x</assert></rule></pattern></schema>`;
    expect(parseSchematron(legacy, 'l').testCount).toBe(1);

    const bare = `<schema><pattern><rule context="a"><assert test="@x">x</assert></rule></pattern></schema>`;
    expect(parseSchematron(bare, 'b').testCount).toBe(1);
  });

  it('maps roles to severities', () => {
    const sch = `<schema xmlns="${ISO_NS}"><pattern><rule context="a">
      <assert test="1" role="warning">w</assert>
      <assert test="1" role="fatal">f</assert>
      <report test="1" role="error">e</report>
    </rule></pattern></schema>`;
    const tests = parseSchematron(sch, 'r').patterns[0].rules[0].tests;
    expect(tests.map(t => t.severity)).toEqual(['warning', 'error', 'error']);
  });

  it('rejects non-XML, non-schematron, and empty schemas', () => {
    expect(() => parseSchematron('<not xml', 'x')).toThrow(/well-formed/);
    expect(() => parseSchematron('<grammar xmlns="http://relaxng.org/ns/structure/1.0"/>', 'x')).toThrow(/expected Schematron/);
    expect(() => parseSchematron(`<schema xmlns="${ISO_NS}"><title>t</title></schema>`, 'x')).toThrow(/No <rule>/);
  });

  it('skips abstract patterns and rules', () => {
    const sch = `<schema xmlns="${ISO_NS}">
      <pattern abstract="true"><rule context="a"><assert test="@x">x</assert></rule></pattern>
      <pattern><rule abstract="true" context="b"><assert test="@x">x</assert></rule>
        <rule context="c"><assert test="@x">x</assert></rule></pattern>
    </schema>`;
    const s = parseSchematron(sch, 'a');
    expect(s.patterns).toHaveLength(1);
    expect(s.patterns[0].rules.map(r => r.context)).toEqual(['c']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Evaluation over no-namespace documents (jsdom-evaluable)
// ───────────────────────────────────────────────────────────────────────────

const BOOK_SCH = `<schema xmlns="${ISO_NS}"><pattern>
  <rule context="chapter">
    <assert test="@title">A <name/> requires a title attribute.</assert>
    <report test="@draft = 'true'" role="info">Draft chapter.</report>
  </rule>
</pattern></schema>`;

const BOOK_XML = `<book>
  <chapter title="One"/>
  <chapter/>
  <chapter title="Three" draft="true"/>
</book>`;

describe('validateSchematron (no-namespace documents)', () => {
  it('fires asserts on violating nodes with correct line attribution', () => {
    const errors = validateSchematron(BOOK_XML, parseSchematron(BOOK_SCH, 'book'));
    const asserts = errors.filter(e => e.severity === 'error');
    expect(asserts).toHaveLength(1);
    expect(asserts[0].line).toBe(3); // the second <chapter> — not the first or last
    expect(asserts[0].message).toBe('[Schematron] A <chapter> requires a title attribute.');
  });

  it('fires reports when the test is TRUE, as warnings', () => {
    const errors = validateSchematron(BOOK_XML, parseSchematron(BOOK_SCH, 'book'));
    const reports = errors.filter(e => e.severity === 'warning');
    expect(reports).toHaveLength(1);
    expect(reports[0].line).toBe(4);
    expect(reports[0].message).toContain('Draft chapter.');
  });

  it('passes clean documents with no diagnostics', () => {
    const clean = `<book><chapter title="A"/><chapter title="B"/></book>`;
    expect(validateSchematron(clean, parseSchematron(BOOK_SCH, 'book'))).toEqual([]);
  });

  it('applies only the FIRST matching rule per pattern to a node (ISO semantics)', () => {
    const sch = `<schema xmlns="${ISO_NS}"><pattern>
      <rule context="chapter[@special]"><assert test="@title">special needs title</assert></rule>
      <rule context="chapter"><assert test="false()">generic always fires</assert></rule>
    </pattern></schema>`;
    const xml = `<book>
  <chapter special="yes"/>
  <chapter/>
</book>`;
    const errors = validateSchematron(xml, parseSchematron(sch, 's'));
    // special chapter: first rule only (missing title). generic chapter: second rule.
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('special needs title');
    expect(errors[0].line).toBe(2);
    expect(errors[1].message).toContain('generic always fires');
    expect(errors[1].line).toBe(3);
  });

  it('reports an unevaluable rule ONCE as a warning instead of throwing', () => {
    const sch = `<schema xmlns="${ISO_NS}"><pattern>
      <rule context="chapter"><assert test="!!!broken(">bad</assert></rule>
    </pattern></schema>`;
    const errors = validateSchematron(BOOK_XML, parseSchematron(sch, 'bad'));
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe('warning');
    expect(errors[0].message).toContain('could not be evaluated');
  });

  it('returns no diagnostics for malformed documents (main validator owns those)', () => {
    expect(validateSchematron('<a><b></a>', parseSchematron(BOOK_SCH, 'book'))).toEqual([]);
  });

  it('absolute contexts are honored without descendant-prefixing', () => {
    const sch = `<schema xmlns="${ISO_NS}"><pattern>
      <rule context="/book"><assert test="count(chapter) &gt;= 2">book needs 2+ chapters</assert></rule>
    </pattern></schema>`;
    const bad = `<book><chapter/></book>`;
    const errors = validateSchematron(bad, parseSchematron(sch, 'abs'));
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(1);
  });
});
