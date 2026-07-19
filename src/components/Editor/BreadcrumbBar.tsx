import { useMemo, useCallback, useDeferredValue } from 'react';
import { useEditor } from '../../store/useEditor';
import { useCursor } from '../../store/useCursor';
import { type PathElement, offsetOf, getElementPathAtOffset } from './breadcrumbPath';
import './BreadcrumbBar.css';

export function BreadcrumbBar() {
  const { getActiveDocument, scrollToLine } = useEditor();
  // Live cursor (CursorContext) — updates without re-rendering EditorContext
  // consumers. See C7 in CHANGELOG.
  const { line: cursorLine, column: cursorColumn } = useCursor();

  const activeDoc = getActiveDocument();
  const content = activeDoc?.content ?? '';

  // Compute the breadcrumb off the urgent render path. The cursor itself
  // updates instantly via CursorContext; the path (an O(offset) scan) runs at
  // low priority and coalesces during rapid movement — a breadcrumb doesn't
  // need per-frame accuracy (finding #2). Without this, every cursor move
  // blocked on a full-document scan, defeating the CursorContext split.
  const deferredContent = useDeferredValue(content);
  const deferredLine = useDeferredValue(cursorLine);
  const deferredColumn = useDeferredValue(cursorColumn);

  // Calculate cursor offset from line and column (newline scan, no full split)
  const cursorOffset = useMemo(
    () => (deferredContent ? offsetOf(deferredContent, deferredLine, deferredColumn) : 0),
    [deferredContent, deferredLine, deferredColumn],
  );

  // Get element path at cursor position
  const elementPath = useMemo(
    () => (deferredContent ? getElementPathAtOffset(deferredContent, cursorOffset) : []),
    [deferredContent, cursorOffset],
  );

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
