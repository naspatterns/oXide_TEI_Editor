/**
 * goToLineInView tests (unverified-tier fix #4).
 *
 * useEditorActions.goToLine used a raw `view.state.doc.line(line)` with no
 * clamp, so CodeMirror threw RangeError on an out-of-range line (an AI "go to
 * line N" action past EOF, a stored line for a since-shrunk doc). The shared
 * helper both goToLine paths now use clamps to [1, doc.lines].
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { goToLineInView } from '../src/utils/goToLineInView';

// jsdom doesn't implement scrollIntoView, which CM may reach through on a
// scrollIntoView dispatch.
Element.prototype.scrollIntoView = vi.fn();

const FIVE_LINES = 'a\nb\nc\nd\ne'; // exactly 5 lines

let view: EditorView | null = null;
function mount(doc: string): EditorView {
  view = new EditorView({ state: EditorState.create({ doc }), parent: document.body });
  return view;
}
function cursorLine(v: EditorView): number {
  return v.state.doc.lineAt(v.state.selection.main.head).number;
}

afterEach(() => {
  view?.destroy();
  view = null;
});

describe('goToLineInView (#4)', () => {
  it('moves the cursor to the requested in-range line', () => {
    const v = mount(FIVE_LINES);
    goToLineInView(v, 3);
    expect(cursorLine(v)).toBe(3);
  });

  it('does NOT throw and clamps to the last line when line > doc.lines', () => {
    const v = mount(FIVE_LINES);
    expect(() => goToLineInView(v, 9999)).not.toThrow();
    expect(cursorLine(v)).toBe(5);
  });

  it('clamps zero and negative lines to line 1', () => {
    const v = mount(FIVE_LINES);
    goToLineInView(v, 0);
    expect(cursorLine(v)).toBe(1);
    goToLineInView(v, -5);
    expect(cursorLine(v)).toBe(1);
  });

  it('does not throw on a NaN line', () => {
    const v = mount(FIVE_LINES);
    expect(() => goToLineInView(v, Number.NaN)).not.toThrow();
  });
});
