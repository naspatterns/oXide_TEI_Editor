import type { EditorView } from '@codemirror/view';

/**
 * Move the cursor to the start of a 1-based line in a CodeMirror view and
 * scroll it into view.
 *
 * The line is CLAMPED to the document's [1, doc.lines] range. CodeMirror's
 * `Text.line()` throws `RangeError` for an out-of-range line, which is
 * reachable in normal use — e.g. an AI "go to line N" action, or a stored
 * error/line number targeting a document that has since been shrunk. The
 * try/catch is a final backstop (e.g. a NaN line).
 *
 * Single source of truth shared by EditorContext.scrollToLine and
 * useEditorActions.goToLine, which had drifted into two implementations — the
 * latter unclamped and unguarded, so it threw (audit #4).
 */
export function goToLineInView(view: EditorView, line: number): void {
  try {
    const targetLine = Math.max(1, Math.min(line, view.state.doc.lines));
    const lineInfo = view.state.doc.line(targetLine);
    view.dispatch({ selection: { anchor: lineInfo.from }, scrollIntoView: true });
    view.focus();
  } catch (e) {
    console.warn('goToLine failed:', e);
  }
}
