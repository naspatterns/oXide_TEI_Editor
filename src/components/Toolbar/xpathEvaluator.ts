/**
 * XPath evaluation + match line attribution for the XPath toolbar search.
 * Split out of XPathSearch.tsx so the component file only exports a
 * component (Fast Refresh) and the pure logic is unit-testable.
 */
import { createElementLineResolver } from '../../schema/xmlTokenizer';
import { rewriteUnprefixedNamesToLocalName } from '../../schema/xpathLocalName';

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

    // Resolve each matched node's source line DIRECTLY from the DOM element it
    // is (or belongs to). The old code re-scanned raw text for the "nth <tag>"
    // and indexed that by the match's position among matches — which broke on
    // multi-line tags / commented markup AND whenever the query matched a
    // SUBSET of a tag's occurrences (e.g. //rs[@type='view']), since the k-th
    // match is then NOT the k-th <rs> in the file (audit #19/#20).
    const lineOf = createElementLineResolver(xmlContent, doc);

    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i);
      if (!node) continue;

      let nodeName = '';
      let textContent = '';
      let line = 1;

      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        nodeName = element.localName || element.tagName;
        textContent = (element.textContent || '').slice(0, 60).trim().replace(/\s+/g, ' ');
        line = lineOf(element);
      } else if (node.nodeType === Node.ATTRIBUTE_NODE) {
        const attr = node as Attr;
        nodeName = `@${attr.name}`;
        textContent = attr.value.slice(0, 60);
        // Attribute nodes live on their owner element's line.
        line = attr.ownerElement ? lineOf(attr.ownerElement) : 1;
      } else if (node.nodeType === Node.TEXT_NODE) {
        nodeName = '#text';
        textContent = (node.textContent || '').slice(0, 60).trim();
        // Attribute a text node to its containing element's line.
        line = node.parentElement ? lineOf(node.parentElement) : 1;
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
