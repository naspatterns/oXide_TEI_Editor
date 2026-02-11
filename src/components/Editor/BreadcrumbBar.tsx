import { useMemo, useCallback } from 'react';
import { useEditor } from '../../store/EditorContext';
import './BreadcrumbBar.css';

interface PathElement {
  name: string;
  line: number;
  offset: number;
}

/**
 * Parse XML content up to a given offset and extract the element path.
 * Returns an array of element names from root to current position.
 */
function getElementPathAtOffset(content: string, offset: number): PathElement[] {
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

export function BreadcrumbBar() {
  const { state, getActiveDocument, scrollToLine } = useEditor();

  const activeDoc = getActiveDocument();
  const content = activeDoc?.content ?? '';
  const cursorLine = activeDoc?.cursorLine ?? state.cursorLine;
  const cursorColumn = activeDoc?.cursorColumn ?? state.cursorColumn;

  // Calculate cursor offset from line and column
  const cursorOffset = useMemo(() => {
    if (!content) return 0;

    const lines = content.split('\n');
    let offset = 0;

    for (let i = 0; i < cursorLine - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }

    // Add column offset (1-based)
    offset += Math.min(cursorColumn - 1, lines[cursorLine - 1]?.length ?? 0);

    return offset;
  }, [content, cursorLine, cursorColumn]);

  // Get element path at cursor position
  const elementPath = useMemo(() => {
    if (!content) return [];
    return getElementPathAtOffset(content, cursorOffset);
  }, [content, cursorOffset]);

  const handleElementClick = useCallback(
    (element: PathElement) => {
      scrollToLine(element.line);
    },
    [scrollToLine],
  );

  // Don't render if no path
  if (elementPath.length === 0) {
    return (
      <div className="breadcrumb-bar">
        <span className="breadcrumb-empty">No document path</span>
      </div>
    );
  }

  return (
    <div className="breadcrumb-bar">
      {elementPath.map((element, index) => (
        <span key={`${element.name}-${element.offset}`} className="breadcrumb-item">
          {index > 0 && <span className="breadcrumb-separator">›</span>}
          <button
            className="breadcrumb-element"
            onClick={() => handleElementClick(element)}
            title={`Line ${element.line}`}
          >
            {element.name}
          </button>
        </span>
      ))}
    </div>
  );
}
