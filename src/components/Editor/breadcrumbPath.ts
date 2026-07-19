/**
 * Pure element-path logic for the BreadcrumbBar (kept out of the .tsx so the
 * component file only exports a component, and so this can be unit-tested).
 *
 * Both functions are bounded by the CURSOR OFFSET, not the whole document, and
 * allocate no full line array — important because the breadcrumb recomputes on
 * cursor movement (finding #2: the previous code split the entire document on
 * every cursor move, defeating the CursorContext split).
 */

export interface PathElement {
  name: string;
  line: number;
  offset: number;
}

/**
 * Character offset of a (1-based line, 1-based column) position, computed by
 * scanning for newlines — O(offset), no full-document array allocation.
 */
export function offsetOf(content: string, line: number, column: number): number {
  let offset = 0;
  for (let i = 1; i < line; i++) {
    const nl = content.indexOf('\n', offset);
    if (nl === -1) {
      return content.length;
    }
    offset = nl + 1;
  }
  const lineEnd = content.indexOf('\n', offset);
  const lineLen = (lineEnd === -1 ? content.length : lineEnd) - offset;
  return offset + Math.min(Math.max(column - 1, 0), lineLen);
}

/**
 * Parse the XML content up to `offset` and return the open-element path from
 * root to the cursor (each entry carries the line it opened on, for
 * click-to-navigate). Only the prefix up to `offset` is examined.
 */
export function getElementPathAtOffset(content: string, offset: number): PathElement[] {
  // Only parse up to the offset
  const textUpToOffset = content.slice(0, offset);

  const path: PathElement[] = [];
  const lines = textUpToOffset.split('\n');

  // Regex to match opening and closing tags
  // Captures: full match, slash (for closing), tag name
  const tagRegex = /<(\/?)([a-zA-Z_][\w.:_-]*)[^>]*?(\/?)\s*>/g;

  let currentOffset = 0;
  let currentLine = 1;

  for (const lineText of lines) {
    let match;
    tagRegex.lastIndex = 0;

    while ((match = tagRegex.exec(lineText)) !== null) {
      const isClosing = match[1] === '/';
      const isSelfClosing = match[3] === '/';
      const tagName = match[2];
      const matchOffset = currentOffset + match.index;

      if (isClosing) {
        // Closing tag - pop from stack if matching
        if (path.length > 0 && path[path.length - 1].name === tagName) {
          path.pop();
        }
      } else if (!isSelfClosing) {
        // Opening tag (not self-closing) - push to stack
        path.push({
          name: tagName,
          line: currentLine,
          offset: matchOffset,
        });
      }
      // Self-closing tags don't affect the path
    }

    currentOffset += lineText.length + 1; // +1 for newline
    currentLine++;
  }

  return path;
}
