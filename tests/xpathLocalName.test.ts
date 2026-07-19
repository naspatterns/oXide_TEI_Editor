/**
 * Shared XPath name-rewriting tests (roadmap #2, 2026-07).
 *
 * These pin the Schematron / XPath-search "silent false-pass" cluster from the
 * v0.3.0 re-audit. jsdom cannot evaluate the local-name() output against a
 * namespaced document, so we assert the rewritten STRING is correct — that is
 * exactly where the previous regex silently produced wrong XPath:
 *   #5  div/mod (real TEI elements) were skipped as if they were operators
 *   #6  only the final path step was rewritten (//div/head lost /head)
 *   #12 words inside string literals were mangled; axes (child::) were skipped
 */
import { describe, it, expect } from 'vitest';
import {
  rewriteUnprefixedNamesToLocalName as rw,
  splitTopLevelUnion as split,
} from '../src/schema/xpathLocalName';

describe('rewriteUnprefixedNamesToLocalName', () => {
  it('rewrites div and mod — they are TEI element names, not just operators (#5)', () => {
    expect(rw('//div')).toBe("//*[local-name()='div']");
    expect(rw('//mod')).toBe("//*[local-name()='mod']");
    expect(rw('div')).toBe("*[local-name()='div']");
    expect(rw('//div[@type]')).toBe("//*[local-name()='div'][@type]");
  });

  it('rewrites EVERY step of a multi-step path, not just the last (#6)', () => {
    expect(rw('//div/head')).toBe("//*[local-name()='div']/*[local-name()='head']");
    expect(rw('//text/body/div')).toBe(
      "//*[local-name()='text']/*[local-name()='body']/*[local-name()='div']",
    );
    expect(rw('.//lg/l')).toBe(".//*[local-name()='lg']/*[local-name()='l']");
  });

  it('keeps div/mod as operators when they sit in operand position', () => {
    expect(rw('count(//lb) div count(//pb)')).toBe(
      "count(//*[local-name()='lb']) div count(//*[local-name()='pb'])",
    );
    expect(rw('@n mod 2')).toBe('@n mod 2');
    expect(rw('@n div 2')).toBe('@n div 2');
  });

  it('never rewrites inside string literals (#12/#21)', () => {
    expect(rw("@rend = 'bold italic underline'")).toBe("@rend = 'bold italic underline'");
    expect(rw("not(contains(., 'draft only text'))")).toBe("not(contains(., 'draft only text'))");
    expect(rw('@type = "a div b"')).toBe('@type = "a div b"');
  });

  it('rewrites the node test of an axis-qualified step but not the axis (#12)', () => {
    expect(rw('child::p')).toBe("child::*[local-name()='p']");
    expect(rw('descendant::lg')).toBe("descendant::*[local-name()='lg']");
    expect(rw('ancestor::div/head')).toBe("ancestor::*[local-name()='div']/*[local-name()='head']");
  });

  it('leaves prefixed names, attributes, variables, and functions alone', () => {
    expect(rw('tei:div')).toBe('tei:div');
    expect(rw('//tei:div/head')).toBe("//tei:div/*[local-name()='head']");
    expect(rw('@rend')).toBe('@rend');
    expect(rw('@xml:id')).toBe('@xml:id');
    expect(rw('$var')).toBe('$var');
    expect(rw('not(@type)')).toBe('not(@type)');
    expect(rw('position() = 1')).toBe('position() = 1');
    expect(rw('text()')).toBe('text()');
  });

  it('handles union and predicate combinations', () => {
    expect(rw('head | trailer')).toBe("*[local-name()='head'] | *[local-name()='trailer']");
    expect(rw('//lg[3]')).toBe("//*[local-name()='lg'][3]");
    expect(rw("//div[@type='chapter']/head")).toBe(
      "//*[local-name()='div'][@type='chapter']/*[local-name()='head']",
    );
  });

  it('is idempotent-safe on already-rewritten expressions (no double wrap)', () => {
    const once = rw('//div/head');
    // local-name is a function call, * is a wildcard operand → nothing to rewrite again
    expect(rw(once)).toBe(once);
  });
});

describe('splitTopLevelUnion', () => {
  it('splits only on top-level | and trims branches', () => {
    expect(split('head | trailer')).toEqual(['head', 'trailer']);
    expect(split('a|b|c')).toEqual(['a', 'b', 'c']);
    expect(split('/book')).toEqual(['/book']);
  });

  it('does not split inside predicates, parens, or string literals', () => {
    expect(split('div[self::a | self::b] | trailer')).toEqual(['div[self::a | self::b]', 'trailer']);
    expect(split("p[@n='x|y'] | q")).toEqual(["p[@n='x|y']", 'q']);
    expect(split('count(a | b) | c')).toEqual(['count(a | b)', 'c']);
  });
});
