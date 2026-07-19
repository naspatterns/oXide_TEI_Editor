/**
 * Outline tree model tests (roadmap #1, 2026-07).
 *
 * The load-bearing case: annotateTreeWithErrors must walk ITERATIVELY. A
 * deeply-nested document (which opens fine in CodeMirror) built a very deep
 * XmlNode tree via the tolerant parser's iterative regex fallback; a recursive
 * annotate then overflowed the stack during render, and with no ErrorBoundary
 * React 18 unmounted the whole app — losing unsaved edits. These tests pin the
 * iterative traversal (no throw at pathological depth) plus structure/order and
 * error/warning annotation correctness.
 */
import { describe, it, expect } from 'vitest';
import {
  parseXmlToTreeTolerant,
  annotateTreeWithErrors,
  type XmlNode,
} from '../src/components/Outline/outlineModel';
import type { ValidationError } from '../src/types/schema';

function err(line: number, severity: 'error' | 'warning', message = 'x'): ValidationError {
  return { message, line, column: 1, severity };
}

/** Build a linear chain of `depth` nodes iteratively (line == depth index). */
function deepChain(depth: number): XmlNode {
  const root: XmlNode = { name: 'div', attributes: {}, children: [], line: 1 };
  let cur = root;
  for (let i = 2; i <= depth; i++) {
    const child: XmlNode = { name: 'div', attributes: {}, children: [], line: i };
    cur.children.push(child);
    cur = child;
  }
  return root;
}

/** Walk to the deepest node of a linear chain iteratively. */
function deepest(node: XmlNode): XmlNode {
  let cur = node;
  while (cur.children.length > 0) cur = cur.children[0];
  return cur;
}

describe('annotateTreeWithErrors', () => {
  it('does not overflow the stack on a pathologically deep tree', () => {
    const DEPTH = 20000; // well beyond the ~4-5k where a recursive walk throws
    const tree = deepChain(DEPTH);

    let annotated: XmlNode | undefined;
    expect(() => {
      annotated = annotateTreeWithErrors(tree, []);
    }).not.toThrow();

    // The whole chain survived and is reachable without recursion.
    const tip = deepest(annotated!);
    expect(tip.line).toBe(DEPTH);
  });

  it('returns a new tree without mutating the input', () => {
    const tree = deepChain(3);
    const annotated = annotateTreeWithErrors(tree, [err(2, 'error')]);

    expect(annotated).not.toBe(tree);
    expect(annotated.children[0]).not.toBe(tree.children[0]);
    // Input is untouched.
    expect(tree.children[0].hasError).toBeUndefined();
  });

  it('flags nodes by line with error taking precedence over warning', () => {
    const tree = deepChain(4); // lines 1..4
    const annotated = annotateTreeWithErrors(tree, [
      err(2, 'warning', 'w2'),
      err(3, 'error', 'e3'),
      err(3, 'warning', 'w3'), // same line as the error
    ]);

    const l1 = annotated;
    const l2 = annotated.children[0];
    const l3 = l2.children[0];
    const l4 = l3.children[0];

    expect(l1.hasError).toBeUndefined();
    expect(l1.hasWarning).toBeUndefined();

    expect(l2.hasWarning).toBe(true);
    expect(l2.hasError).toBeUndefined();
    expect(l2.errorMessages).toEqual(['w2']);

    // error wins over the co-located warning
    expect(l3.hasError).toBe(true);
    expect(l3.hasWarning).toBeUndefined();
    expect(l3.errorMessages).toEqual(['e3', 'w3']);

    expect(l4.errorMessages).toBeUndefined();
  });

  it('preserves child order across multiple children', () => {
    const root: XmlNode = {
      name: 'lg',
      attributes: {},
      line: 1,
      children: [
        { name: 'l', attributes: {}, children: [], line: 2 },
        { name: 'l', attributes: {}, children: [], line: 3 },
        { name: 'l', attributes: {}, children: [], line: 4 },
      ],
    };
    const annotated = annotateTreeWithErrors(root, []);
    expect(annotated.children.map((c) => c.line)).toEqual([2, 3, 4]);
  });
});

describe('parseXmlToTreeTolerant', () => {
  it('parses a well-formed document into a tree with no parse errors', () => {
    const { root, parseErrors } = parseXmlToTreeTolerant(
      '<TEI>\n  <text>\n    <body><p>hi</p></body>\n  </text>\n</TEI>',
    );
    expect(root?.name).toBe('TEI');
    expect(parseErrors).toEqual([]);
    expect(root?.children.map((c) => c.name)).toContain('text');
  });

  it('falls back to the iterative regex parser and reports mismatched tags', () => {
    const { root, parseErrors } = parseXmlToTreeTolerant('<a><b></a></b>');
    expect(root).not.toBeNull();
    expect(parseErrors.length).toBeGreaterThan(0);
  });
});
