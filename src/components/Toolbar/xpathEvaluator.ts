/**
 * XPath evaluation + match line attribution for the XPath toolbar search.
 * Split out of XPathSearch.tsx so the component file only exports a
 * component (Fast Refresh) and the pure logic is unit-testable.
 */

export interface XPathMatch {
  nodeName: string;
  textContent: string;
  line: number;
}

/**
 * Convert simple element names to local-name() based XPath
 * This handles the default namespace issue in TEI documents
 *
 * Examples:
 * - //p → //*[local-name()='p']
 * - //div[@type] → //*[local-name()='div'][@type]
 * - //tei:p → //tei:p (kept as-is for explicit namespace)
 */
function convertToLocalNameXPath(expression: string): string {
  // If user explicitly uses tei: prefix, don't convert
  if (expression.includes('tei:')) {
    return expression;
  }

  // Convert //tagname to //*[local-name()='tagname']
  // Also handle /tagname, //tagname[@attr], etc.
  return expression.replace(
    /\/\/([a-zA-Z_][\w-]*)([[@]|$)/g,
    (_, tagName, suffix) => `//*[local-name()='${tagName}']${suffix || ''}`
  ).replace(
    /\/([a-zA-Z_][\w-]*)([[@]|$)/g,
    (match, tagName, suffix) => {
      // Don't convert if it's already converted or part of a predicate
      if (match.includes('local-name')) return match;
      return `/*[local-name()='${tagName}']${suffix || ''}`;
    }
  );
}

/**
 * Locate the 1-based line of the nth (0-based) occurrence of `<tagName…`
 * in the document, tolerating an optional namespace prefix.
 *
 * Returns 1 when the occurrence cannot be found (e.g. a tag spanning
 * multiple lines defeats the per-line regex).
 */
export function findNthTagLine(lines: string[], tagName: string, occurrenceIndex: number): number {
  // Create pattern that matches the tag with or without namespace prefix
  const tagPattern = new RegExp(`<([a-zA-Z_][\\w-]*:)?${tagName}(\\s|>|/)`, 'g');
  let currentOccurrence = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    tagPattern.lastIndex = 0;

    while (tagPattern.exec(lines[lineIdx]) !== null) {
      if (currentOccurrence === occurrenceIndex) {
        // Return immediately: an earlier version kept scanning here, so
        // later occurrences overwrote the result and every match was
        // attributed to (and navigated to) the LAST occurrence.
        return lineIdx + 1;
      }
      currentOccurrence++;
    }
  }

  return 1;
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
