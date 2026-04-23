import { useCallback, useMemo } from 'react';
import { useEditor } from '../store/useEditor';
import { useWrapSelection } from './useWrapSelection';

/**
 * Imperative editor operations that need a live `EditorView` instance.
 *
 * These actions used to be sprinkled through component bodies
 * (`view.dispatch({...})` inline), which made it easy to forget `view.focus()`
 * or inconsistently handle a null view. Centralizing them here:
 *
 * - keeps `EditorView` access in one place,
 * - lets every caller share the "no-op when no view" guard,
 * - gives us one obvious target if we ever want to record / replay actions.
 */
export interface EditorActions {
  /** Wrap the current selection in `<tagName>...</tagName>` (schema-aware). */
  wrapSelection: (tagName: string) => void;
  /** Insert XML at the current cursor position. */
  insertAtCursor: (xml: string) => void;
  /** Replace the current selection with the given XML. */
  replaceSelection: (xml: string) => void;
  /** Move the cursor to the start of the given 1-based line and scroll to it. */
  goToLine: (line: number) => void;
}

export function useEditorActions(): EditorActions {
  const { editorViewRef } = useEditor();
  const wrapSelection = useWrapSelection();

  const insertAtCursor = useCallback(
    (xml: string) => {
      const view = editorViewRef.current;
      if (!view) return;
      const { from } = view.state.selection.main;
      view.dispatch({ changes: { from, insert: xml } });
      view.focus();
    },
    [editorViewRef],
  );

  const replaceSelection = useCallback(
    (xml: string) => {
      const view = editorViewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: xml } });
      view.focus();
    },
    [editorViewRef],
  );

  const goToLine = useCallback(
    (line: number) => {
      const view = editorViewRef.current;
      if (!view) return;
      const target = view.state.doc.line(line);
      view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true });
      view.focus();
    },
    [editorViewRef],
  );

  return useMemo(
    () => ({ wrapSelection, insertAtCursor, replaceSelection, goToLine }),
    [wrapSelection, insertAtCursor, replaceSelection, goToLine],
  );
}
