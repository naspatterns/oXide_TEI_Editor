import type { ValidationError } from '../../types/schema';
import { tokenizeXmlTags, parseAttributes } from '../../schema/xmlTokenizer';

/**
 * Pure tree model for the Outline panel.
 *
 * Parsing and error-annotation live here (not in OutlinePanel.tsx) so they can
 * be unit-tested directly and so the component file only exports a component
 * (Fast Refresh / react-refresh convention). Everything here is React-free.
 *
 * IMPORTANT: `annotateTreeWithErrors` walks the tree ITERATIVELY (explicit
 * stack). A recursive walk overflows the call stack on deeply-nested documents
 * (~4-5k levels, which open fine in CodeMirror) — with no ErrorBoundary that
 * turned into a full-app unmount and loss of unsaved edits. Keep it iterative.
 */

/** Represents a node in the XML tree structure */
export interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  line: number; // Line number in source for navigation
  textContent?: string; // Brief text preview
  // Error display fields
  hasError?: boolean;
  hasWarning?: boolean;
  errorMessages?: string[];
}

/** Parsing result interface */
export interface ParseResult {
  root: XmlNode | null;
  parseErrors: Array<{ line: number; message: string }>;
}

/**
 * Tag-stream-based XML parsing (works even with malformed XML).
 * Uses the shared `xmlTokenizer` so this view, the completion source, and
 * the validator agree on what counts as a tag.
 */
export function parseXmlWithRegex(xmlStr: string): ParseResult {
  const parseErrors: Array<{ line: number; message: string }> = [];
  const stack: Array<{ node: XmlNode; expectedClosing: string }> = [];
  const root: XmlNode = { name: '#root', attributes: {}, children: [], line: 0 };
  let current = root;

  for (const tok of tokenizeXmlTags(xmlStr)) {
    if (tok.kind === 'pi' || tok.kind === 'comment' || tok.kind === 'cdata') continue;

    if (tok.kind === 'close') {
      if (stack.length === 0) continue;
      const expected = stack[stack.length - 1];
      if (expected.expectedClosing !== tok.name) {
        parseErrors.push({
          line: tok.line,
          message: `Expected </${expected.expectedClosing}>, found </${tok.name}>`,
        });
        // Recovery: find matching tag and clean up the stack down to it.
        let found = false;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].expectedClosing === tok.name) {
            stack.splice(i);
            current = stack.length > 0 ? stack[stack.length - 1].node : root;
            found = true;
            break;
          }
        }
        if (!found) continue;
      } else {
        stack.pop();
        current = stack.length > 0 ? stack[stack.length - 1].node : root;
      }
    } else {
      const node: XmlNode = {
        name: tok.name,
        attributes: parseAttributes(tok.attributesText),
        children: [],
        line: tok.line,
      };
      current.children.push(node);
      if (tok.kind === 'open') {
        stack.push({ node, expectedClosing: tok.name });
        current = node;
      }
    }
  }

  // Report unclosed tags
  for (const item of stack) {
    parseErrors.push({
      line: item.node.line,
      message: `Unclosed tag <${item.expectedClosing}>`,
    });
  }

  return {
    root: root.children[0] ?? null,
    parseErrors,
  };
}

/** Error-tolerant XML parsing: DOMParser first, regex fallback on failure */
export function parseXmlToTreeTolerant(xmlStr: string): ParseResult {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'application/xml');
    const errorNode = doc.querySelector('parsererror');

    if (!errorNode) {
      // Parse succeeded - use DOM-based conversion
      const lines = xmlStr.split('\n');

      function domToNode(element: Element, lineHint: number): XmlNode {
        // Try to find actual line number
        let line = lineHint;
        for (let i = lineHint - 1; i < lines.length; i++) {
          if (lines[i]?.includes(`<${element.tagName}`)) {
            line = i + 1;
            break;
          }
        }

        // Get attributes
        const attributes: Record<string, string> = {};
        for (const attr of element.attributes) {
          attributes[attr.name] = attr.value;
        }

        // Get direct text content (not from children)
        let textContent = '';
        for (const child of element.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            const text = child.textContent?.trim();
            if (text) {
              textContent = text.length > 30 ? text.slice(0, 30) + '...' : text;
              break;
            }
          }
        }

        // Process child elements
        const children: XmlNode[] = [];
        let childLineHint = line;
        for (const child of element.children) {
          const childNode = domToNode(child, childLineHint);
          children.push(childNode);
          childLineHint = childNode.line + 1;
        }

        return {
          name: element.tagName,
          attributes,
          children,
          line,
          textContent: textContent || undefined,
        };
      }

      const root = doc.documentElement ? domToNode(doc.documentElement, 1) : null;

      return { root, parseErrors: [] };
    }

    // DOMParser error - use regex fallback
    return parseXmlWithRegex(xmlStr);
  } catch {
    // Exception (e.g. domToNode recursion overflow on a very deep document) —
    // fall back to the iterative regex parser.
    return parseXmlWithRegex(xmlStr);
  }
}

/**
 * Annotate tree nodes with ValidationError information, returning a NEW tree.
 *
 * Walks iteratively (explicit stack) rather than recursively so a pathologically
 * deep document cannot overflow the call stack during render. Child order is
 * preserved: each source node's children are cloned into the destination node's
 * children array in document order before their own subtrees are processed.
 */
export function annotateTreeWithErrors(node: XmlNode, errors: ValidationError[]): XmlNode {
  // Build line -> errors map
  const errorMap = new Map<number, ValidationError[]>();
  for (const err of errors) {
    if (!errorMap.has(err.line)) {
      errorMap.set(err.line, []);
    }
    errorMap.get(err.line)!.push(err);
  }

  // Clone a single node with its error annotation and a fresh (empty) children
  // array to be filled by the traversal below.
  const makeShell = (src: XmlNode): XmlNode => {
    const lineErrors = errorMap.get(src.line) ?? [];
    const hasError = lineErrors.some((e) => e.severity === 'error');
    const hasWarning = lineErrors.some((e) => e.severity === 'warning');

    return {
      ...src,
      hasError: hasError || undefined,
      hasWarning: (!hasError && hasWarning) || undefined,
      errorMessages: lineErrors.length > 0 ? lineErrors.map((e) => e.message) : undefined,
      children: [],
    };
  };

  const root = makeShell(node);
  const stack: Array<{ src: XmlNode; dst: XmlNode }> = [{ src: node, dst: root }];

  while (stack.length > 0) {
    const { src, dst } = stack.pop()!;
    for (const child of src.children) {
      const childShell = makeShell(child);
      dst.children.push(childShell);
      stack.push({ src: child, dst: childShell });
    }
  }

  return root;
}
