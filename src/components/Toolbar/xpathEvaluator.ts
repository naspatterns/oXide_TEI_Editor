/**
 * XPath evaluation + match line attribution for the XPath toolbar search.
 * Split out of XPathSearch.tsx so the component file only exports a
 * component (Fast Refresh) and the pure logic is unit-testable.
 */
import { findNthTagLine } from '../../schema/xmlTokenizer';
import { rewriteUnprefixedNamesToLocalName } from '../../schema/xpathLocalName';

// Re-exported for existing consumers/tests; the implementation moved to
// xmlTokenizer so the Schematron layer (src/schema) can share it without
// importing from src/components.
export { findNthTagLine };

export interface XPathMatch {
  nodeName: string;
  textContent: string;
  line: number;
}

/**
 * Convert unprefixed element names to local-name()-based XPath so prefix-less
 * queries match default-namespaced TEI documents. Delegates to the shared
 * scanner (src/schema/xpathLocalName) so this and the Schematron layer stay in
 * sync — the scanner rewrites EVERY name step (not just the last), skips string
 * literals, axes, prefixed names, attributes, and functions.
 *
 * Examples:
 * - //p → //*[local-name()='p']
 * - //div/head → //*[local-name()='div']/*[local-name()='head']
 * - //div[@type] → //*[local-name()='div'][@type]
 * - //tei:p → //tei:p (prefixed name kept as-is)
 */
export function convertToLocalNameXPath(expression: string): string {
  return rewriteUnprefixedNamesToLocalName(expression);
}

export function evaluateXPath(xmlContent: string, expression: string): { matches: XPathMatch[]; error: string | null } {
  if (!expression.trim()) {
    return { matches: [], error: null };
  }

  try {
    // Parse XML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'application/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return { matches: [], error: 'Invalid XML document' };
    }

    // Convert expression to handle namespaces
    const convertedExpression = convertToLocalNameXPath(expression);

    // Create namespace resolver for TEI documents
    const nsResolver = (prefix: string | null): string | null => {
      const namespaces: Record<string, string> = {
        tei: 'http://www.tei-c.org/ns/1.0',
        xml: 'http://www.w3.org/XML/1998/namespace',
      };
      return prefix ? namespaces[prefix] || null : null;
    };

    // Evaluate XPath expression
    const result = doc.evaluate(
      convertedExpression,
      doc,
      nsResolver,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );

    const matches: XPathMatch[] = [];
    const lines = xmlContent.split('\n');

    // Track found occurrences to handle duplicates
    const foundTags = new Map<string, number>();

    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i);
      if (!node) continue;

      let nodeName = '';
      let textContent = '';

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        nodeName = element.localName || element.tagName;
        textContent = (element.textContent || '').slice(0, 60).trim().replace(/\s+/g, ' ');
      } else if (node.nodeType === Node.ATTRIBUTE_NODE) {
        nodeName = `@${(node as Attr).name}`;
        textContent = (node as Attr).value.slice(0, 60);
      } else if (node.nodeType === Node.TEXT_NODE) {
        nodeName = '#text';
        textContent = (node.textContent || '').slice(0, 60).trim();
      }

      // Find line number - search for the nth occurrence of this tag
      let line = 1;
      const occurrenceIndex = foundTags.get(nodeName) || 0;
      foundTags.set(nodeName, occurrenceIndex + 1);

      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = (node as Element).localName || (node as Element).tagName;
        line = findNthTagLine(lines, tagName, occurrenceIndex);
      }

      matches.push({
        nodeName,
        textContent,
        line,
      });
    }

    return { matches, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid XPath expression';
    // Make error messages more user-friendly
    if (message.includes('not a valid XPath')) {
      return { matches: [], error: 'Invalid XPath syntax' };
    }
    return { matches: [], error: message };
  }
}
