import { Extension } from '@codemirror/state';
import { gutter, GutterMarker } from '@codemirror/view';

/**
 * Custom gutter marker for visual line numbers
 */
class VisualLineMarker extends GutterMarker {
  constructor(readonly number: number) {
    super();
  }

  toDOM() {
    const span = document.createElement('span');
    span.textContent = String(this.number);
    span.className = 'cm-visual-lineNumber';
    return span;
  }
}

/**
 * Spacer marker for consistent gutter width
 */
class SpacerMarker extends GutterMarker {
  toDOM() {
    const span = document.createElement('span');
    span.textContent = '9999';
    span.className = 'cm-visual-lineNumber';
    span.style.visibility = 'hidden';
    return span;
  }
}

const spacer = new SpacerMarker();

/**
 * Creates a gutter that shows visual line numbers (each wrapped line gets its own number)
 * instead of document line numbers.
 */
export function visualLineNumbers(): Extension {
  return gutter({
    class: 'cm-visual-lineNumbers',
    lineMarker(view, line) {
      // Calculate how many visual lines exist before this line
      let visualLineNum = 1;
      const lineHeight = view.defaultLineHeight;

      for (const block of view.viewportLineBlocks) {
        if (block.from < line.from) {
          // Count wrapped lines in previous blocks
          const wrappedCount = Math.max(1, Math.round(block.height / lineHeight));
          visualLineNum += wrappedCount;
        } else if (block.from === line.from) {
          // This is our line
          return new VisualLineMarker(visualLineNum);
        }
      }

      // Fallback for lines outside viewport
      return new VisualLineMarker(visualLineNum);
    },
    lineMarkerChange(update) {
      return update.heightChanged || update.docChanged || update.viewportChanged;
    },
    initialSpacer() {
      return spacer;
    },
  });
}
