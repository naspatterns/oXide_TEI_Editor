/**
 * Get the element context at a given position in XML text.
 * Returns the stack of open element names from root to cursor.
 */
export function getElementStack(xml: string, offset: number): string[] {
  const stack: string[] = [];
  const text = xml.substring(0, offset);

  // Simple regex-based approach — matches opening/closing tags
  const tagRegex = /<\/?([a-zA-Z_][\w.:_-]*)[^>]*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1];

    if (fullMatch.startsWith('</')) {
      // Closing tag — pop from stack
      const idx = stack.lastIndexOf(tagName);
      if (idx !== -1) stack.splice(idx, 1);
    } else if (!fullMatch.endsWith('/>')) {
      // Opening tag (not self-closing)
      stack.push(tagName);
    }
  }

  return stack;
}

/**
 * Check if XML is well-formed using the browser's DOMParser.
 * Returns null if valid, or an error message string.
 */
export function checkWellFormed(xml: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const errorNode = doc.querySelector('parsererror');
  return errorNode ? errorNode.textContent ?? 'XML is not well-formed' : null;
}
