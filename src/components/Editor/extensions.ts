import { xml, autoCloseTags } from '@codemirror/lang-xml';
import { autocompletion } from '@codemirror/autocomplete';
import { lintGutter } from '@codemirror/lint';
import { keymap, EditorView } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import type { Extension } from '@codemirror/state';
import type { SchemaInfo } from '../../types/schema';
import type { ValidationError } from '../../types/schema';
import { createSchemaCompletionSource } from './completionSource';
import { createValidationLinter } from './validationLinter';
import { teiEditorTheme, teiEditorThemeLight } from './theme';
import { visualLineNumbers } from './visualLineNumbers';
import { paragraphIndentation } from './paragraphIndent';
import { INTERNAL_DRAG_TYPE } from '../../utils/dragDropUtils';
import { createTagSyncExtension } from './tagSync';
import { createScrollbarMarkersExtension } from './scrollbarMarkers';
import './scrollbarMarkers.css';

/**
 * Custom event name for file drop operations.
 * Used to bridge CodeMirror's drop handler to React's file handling.
 */
export const FILE_DROP_EVENT = 'oxide-file-drop';

/**
 * Custom event name for QuickTagMenu display.
 * Used to bridge CodeMirror's mouseup handler to React's menu state.
 */
export const QUICK_TAG_MENU_EVENT = 'oxide-quick-tag-menu';

/**
 * Create an extension that handles mouseup events within the editor.
 *
 * Problem: When mouseup events are handled at the document level,
 * the QuickTagMenu appears even when the mouse is released outside
 * the editor area.
 *
 * Solution: Use EditorView.domEventHandlers() to register mouseup
 * handler that only fires when mouseup occurs within the editor.
 * Dispatches a custom event with selection info for React to handle.
 */
export function createMouseUpExtension(): Extension {
  return EditorView.domEventHandlers({
    mouseup: (_event, view) => {
      // Wait a short moment for CodeMirror to finalize selection state
      setTimeout(() => {
        const { from, to } = view.state.selection.main;
        if (from === to) return; // No selection

        const selection = view.state.doc.sliceString(from, to);

        // Validate selection: must be 1-500 chars, single line
        if (selection.length >= 1 && selection.length <= 500 && !selection.includes('\n')) {
          const coords = view.coordsAtPos(to);
          if (coords) {
            document.dispatchEvent(new CustomEvent(QUICK_TAG_MENU_EVENT, {
              detail: { selection, x: coords.left, y: coords.bottom }
            }));
          }
        }
      }, 50); // 50ms for CodeMirror to update selection state

      return false; // Let other handlers run
    },

    mousedown: () => {
      // Cancel any pending menu display when starting a new selection
      // This is signaled via a separate event
      document.dispatchEvent(new CustomEvent(QUICK_TAG_MENU_EVENT, {
        detail: { cancel: true }
      }));
      return false;
    }
  });
}

/**
 * Create an extension that intercepts file drops at the CodeMirror level.
 *
 * Problem: When files are dropped on CodeMirror, the default behavior is to
 * insert the file content as text. This happens before React's bubble-phase
 * handlers on parent elements can intercept the event.
 *
 * Solution: Use EditorView.domEventHandlers() to register handlers that run
 * at the CodeMirror level, preventing default behavior and dispatching a
 * custom event that React can handle.
 */
export function createFileDropExtension(): Extension {
  return EditorView.domEventHandlers({
    drop: (event, view) => {
      const dt = event.dataTransfer;
      if (!dt) return false;

      // Check for external file drop (from OS file explorer)
      if (dt.types.includes('Files')) {
        event.preventDefault();
        event.stopPropagation();

        // Dispatch custom event with the dataTransfer for React to handle
        const customEvent = new CustomEvent(FILE_DROP_EVENT, {
          bubbles: true,
          detail: { files: Array.from(dt.files) }
        });
        view.dom.dispatchEvent(customEvent);

        return true; // Prevent CodeMirror's default drop handling
      }

      // Check for internal drag (from FileExplorer)
      if (dt.types.includes(INTERNAL_DRAG_TYPE)) {
        event.preventDefault();
        event.stopPropagation();

        // Get the drag ID to retrieve file handle data
        const dragId = dt.getData(INTERNAL_DRAG_TYPE);
        const customEvent = new CustomEvent(FILE_DROP_EVENT, {
          bubbles: true,
          detail: { internalDragId: dragId }
        });
        view.dom.dispatchEvent(customEvent);

        return true;
      }

      return false; // Let CodeMirror handle other drop types (e.g., text)
    },

    dragover: (event) => {
      const dt = event.dataTransfer;
      if (!dt) return false;

      // Show drop cursor for file drops
      if (dt.types.includes('Files') || dt.types.includes(INTERNAL_DRAG_TYPE)) {
        event.preventDefault();
        dt.dropEffect = 'copy';
        return true;
      }

      return false;
    }
  });
}

/**
 * Assemble all CodeMirror 6 extensions for the TEI XML editor.
 */
export function createEditorExtensions(
  schema: SchemaInfo | null,
  onValidationErrors?: (errors: ValidationError[]) => void,
  isDarkMode?: boolean,
): Extension[] {
  // Determine theme: check parameter first, then DOM attribute
  const dark = isDarkMode ?? document.documentElement.getAttribute('data-theme') === 'dark';
  const editorTheme = dark ? teiEditorTheme : teiEditorThemeLight;

  return [
    // Visual line numbers (each wrapped line gets its own number)
    visualLineNumbers(),
    // XML language support
    xml(),
    // Auto-close tags when typing > or /
    autoCloseTags,
    // Schema-aware autocompletion
    autocompletion({
      activateOnTyping: true,
      maxRenderedOptions: 50,
      override: [createSchemaCompletionSource(schema)],
    }),
    // Real-time validation linter
    createValidationLinter(schema, onValidationErrors),
    // Lint gutter for error markers
    lintGutter(),
    // Tab indentation
    keymap.of([indentWithTab]),
    // Line wrapping (no horizontal scroll)
    EditorView.lineWrapping,
    // Custom theme (Light or Dark based on current setting)
    editorTheme,
    // Paragraph block indentation (<p>, <lg> 등 내부 콘텐츠 들여쓰기)
    paragraphIndentation(),
    // File drop handling (prevent CodeMirror from inserting file content as text)
    createFileDropExtension(),
    // Tag name synchronization (opening ↔ closing tag names sync)
    createTagSyncExtension(),
    // Scrollbar error markers (visual indicators for error positions)
    createScrollbarMarkersExtension(),
    // Mouseup handling (trigger QuickTagMenu only when mouseup is inside editor)
    createMouseUpExtension(),
  ];
}
