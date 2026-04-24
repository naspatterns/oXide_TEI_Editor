/**
 * Behavioral tests for `createTagSyncExtension`.
 *
 * Mounts a real CodeMirror `EditorView` in jsdom and dispatches
 * transactions to exercise the four listeners returned by
 * `createTagSyncExtension`. Both the single-character "live typing" path
 * and the multi-character "paste rename" path keep opening and closing
 * tags synchronized.
 *
 * Background: in v0.2.1 these tests were characterization tests pinning
 * two latent bugs:
 *   (1) the rename listener could not sync via single-character typing
 *       because it looked up the matching tag by the NEW name (which by
 *       construction had no match yet);
 *   (2) the progressive-deletion listener treated a name change as a
 *       "tag destroyed" event and dispatched a sibling deletion that
 *       conflicted with the rename listener's sibling rename.
 *
 * v0.2.2 fixed both: the rename listener now resolves the matching tag in
 * `update.startState.doc` (where names still agree) and translates its
 * positions forward via `update.changes.mapPos`; the progressive-deletion
 * listener no longer fires on a name-only difference.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createTagSyncExtension } from '../src/components/Editor/tagSync';

let host: HTMLDivElement;
let view: EditorView;

function mount(initialDoc: string, initialCursor?: number) {
  host = document.createElement('div');
  document.body.appendChild(host);
  view = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      selection: initialCursor !== undefined ? { anchor: initialCursor } : undefined,
      extensions: [createTagSyncExtension()],
    }),
    parent: host,
  });
}

afterEach(() => {
  view?.destroy();
  host?.remove();
});

describe('createTagSyncExtension — early-return paths', () => {
  it('does nothing when typing in an attribute value', () => {
    mount('<a id="x">y</a>', 8);
    view.dispatch({
      changes: { from: 8, to: 8, insert: 'X' },
      selection: { anchor: 9 },
    });
    expect(view.state.doc.toString()).toBe('<a id="xX">y</a>');
  });

  it('does nothing when typing in text content', () => {
    mount('<a>hello</a>', 8);
    view.dispatch({
      changes: { from: 8, to: 8, insert: '!' },
      selection: { anchor: 9 },
    });
    expect(view.state.doc.toString()).toBe('<a>hello!</a>');
  });

  it('does nothing when editing a self-closing tag (no matching pair)', () => {
    mount('<br/>', 3);
    view.dispatch({
      changes: { from: 3, to: 3, insert: 'i' },
      selection: { anchor: 4 },
    });
    expect(view.state.doc.toString()).toBe('<bri/>');
  });

  it('does nothing when there is no matching closing tag (unclosed opener)', () => {
    mount('<unclosed>', 9);
    view.dispatch({
      changes: { from: 9, to: 9, insert: 'X' },
      selection: { anchor: 10 },
    });
    expect(view.state.doc.toString()).toBe('<unclosedX>');
  });

  it('does nothing when typing inside a comment', () => {
    mount('<!-- comment -->', 9);
    view.dispatch({
      changes: { from: 9, to: 9, insert: 'X' },
      selection: { anchor: 10 },
    });
    expect(view.state.doc.toString()).toBe('<!-- commXent -->');
  });

  it('does nothing when typing inside a processing instruction', () => {
    mount('<?xml version="1.0"?>', 5);
    view.dispatch({
      changes: { from: 5, to: 5, insert: 'X' },
      selection: { anchor: 6 },
    });
    expect(view.state.doc.toString()).toBe('<?xmlX version="1.0"?>');
  });
});

describe('createTagSyncExtension — full-tag deletion', () => {
  it('deletes the matching closing tag when the opening tag is selected and removed', () => {
    mount('<a>x</a>');
    view.dispatch({
      changes: { from: 0, to: 3, insert: '' },
      selection: { anchor: 0 },
    });
    expect(view.state.doc.toString()).toBe('x');
  });

  it('deletes the matching opening tag when the closing tag is selected and removed', () => {
    mount('<a>x</a>');
    view.dispatch({
      changes: { from: 4, to: 8, insert: '' },
      selection: { anchor: 4 },
    });
    expect(view.state.doc.toString()).toBe('x');
  });

  it('does not orphan any tag when deleting a self-closing tag wholesale', () => {
    mount('a<br/>b');
    view.dispatch({
      changes: { from: 1, to: 6, insert: '' },
      selection: { anchor: 1 },
    });
    expect(view.state.doc.toString()).toBe('ab');
  });

  it('handles deletion of an opening tag with attributes', () => {
    mount('<a id="x">y</a>');
    // Delete the entire opening tag '<a id="x">' (positions 0..10).
    view.dispatch({
      changes: { from: 0, to: 10, insert: '' },
      selection: { anchor: 0 },
    });
    expect(view.state.doc.toString()).toBe('y');
  });
});

describe('createTagSyncExtension — sync-annotation guard', () => {
  it('does not infinitely loop on extension-dispatched sibling edits', () => {
    // Whatever the rename listener actually does, it must not loop. We
    // assert termination by checking that a single user dispatch settles
    // the document in a single observable state (i.e. the test returns).
    mount('<foo>x</foo>', 4);
    view.dispatch({
      changes: { from: 4, to: 4, insert: 's' },
      selection: { anchor: 5 },
    });
    // Whatever the resulting doc is, the test reaching this assertion at
    // all means the loop guard worked.
    expect(view.state.doc.length).toBeGreaterThan(0);
  });
});

describe('createTagSyncExtension — single-character rename via typing (v0.2.2 fix)', () => {
  it('typing one character into the opening tag name extends the closing tag', () => {
    mount('<foo>x</foo>', 4);
    view.dispatch({
      changes: { from: 4, to: 4, insert: 's' },
      selection: { anchor: 5 },
    });
    expect(view.state.doc.toString()).toBe('<foos>x</foos>');
  });

  it('backspacing one character from the opening tag name shrinks the closing tag', () => {
    mount('<foos>x</foos>', 5);
    view.dispatch({
      changes: { from: 4, to: 5, insert: '' },
      selection: { anchor: 4 },
    });
    expect(view.state.doc.toString()).toBe('<foo>x</foo>');
  });

  it('typing one character into the closing tag name extends the opening tag', () => {
    mount('<foo>x</foo>', 11);
    view.dispatch({
      changes: { from: 11, to: 11, insert: 's' },
      selection: { anchor: 12 },
    });
    expect(view.state.doc.toString()).toBe('<foos>x</foos>');
  });

  it('backspacing one character from the closing tag name shrinks the opening tag', () => {
    // <foos>x</foos>: cursor at 13 (just before '>'), backspace removes
    // the trailing 's' at position 12 → closing becomes </foo>, and the
    // opening should also shrink to <foo>.
    mount('<foos>x</foos>', 13);
    view.dispatch({
      changes: { from: 12, to: 13, insert: '' },
      selection: { anchor: 12 },
    });
    expect(view.state.doc.toString()).toBe('<foo>x</foo>');
  });

  it('mirrors a sequence of one-character insertions in the opening tag', () => {
    mount('<a>x</a>', 2);
    view.dispatch({ changes: { from: 2, to: 2, insert: 'b' }, selection: { anchor: 3 } });
    view.dispatch({ changes: { from: 3, to: 3, insert: 'a' }, selection: { anchor: 4 } });
    view.dispatch({ changes: { from: 4, to: 4, insert: 'r' }, selection: { anchor: 5 } });
    expect(view.state.doc.toString()).toBe('<abar>x</abar>');
  });
});

describe('createTagSyncExtension — multi-character paste rename (v0.2.2 fix)', () => {
  it('replacing the entire opening-tag name in one shot syncs the closing tag', () => {
    mount('<foo>x</foo>');
    view.dispatch({
      changes: { from: 1, to: 4, insert: 'bar' },
      selection: { anchor: 4 },
    });
    expect(view.state.doc.toString()).toBe('<bar>x</bar>');
  });

  it('replacing the entire closing-tag name in one shot syncs the opening tag', () => {
    mount('<foo>x</foo>');
    view.dispatch({
      changes: { from: 8, to: 11, insert: 'bar' },
      selection: { anchor: 11 },
    });
    expect(view.state.doc.toString()).toBe('<bar>x</bar>');
  });

  it('keeps inner-tag and outer-tag pairs independent under nested same-name renaming', () => {
    // Renaming the OUTER opening must rename the OUTER closing (the last
    // </div>), not the INNER closing.
    mount('<div><div>x</div></div>', 4);
    // Replace outer opening name "div" (positions 1..4) with "box".
    view.dispatch({
      changes: { from: 1, to: 4, insert: 'box' },
      selection: { anchor: 4 },
    });
    expect(view.state.doc.toString()).toBe('<box><div>x</div></box>');
  });
});
