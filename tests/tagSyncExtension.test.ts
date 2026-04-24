/**
 * Characterization tests for `createTagSyncExtension`.
 *
 * These tests mount a real CodeMirror `EditorView` in jsdom and dispatch
 * transactions to exercise the four listeners returned by
 * `createTagSyncExtension`. They pin the *currently observed* behavior so
 * any future change is caught — they are NOT a behavioral specification.
 *
 * What is NOT covered (and should not be inferred to "work"):
 *
 * - Sync of an opening tag's name when the user types into it character by
 *   character. The rename listener queries `findMatchingTag` against the
 *   *new* name, which by construction has no match in the document, so the
 *   sync silently no-ops. Real-time UX is propped up by CodeMirror's
 *   `autoCloseTags` extension creating the closing tag at the moment the
 *   opening tag's `>` is typed; once both exist with matching names, the
 *   sync only handles whole-name replacements (e.g. paste-rename) cleanly.
 *
 * - Sync where two listeners would otherwise step on each other (multi-
 *   character `replace` operations land in this category). The progressive-
 *   deletion listener interprets a name change as "the original tag was
 *   destroyed" and dispatches a sibling deletion that conflicts with the
 *   rename listener's sibling rename. Single-character inserts avoid this
 *   because of the listener's `toA <= fromA` early return.
 *
 * Both findings are documented in CHANGELOG and CLAUDE.md as "tagSync
 * extension has known sync gaps". Adding behavioral tests here would
 * mean fixing the implementation first.
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

describe('createTagSyncExtension — known quirks (characterization)', () => {
  // The four listeners currently fire independently on the same update.
  // For multi-character `replace` operations the rename listener and the
  // progressive-deletion listener step on each other. These tests pin the
  // observed (surprising) behavior so we notice if the implementation
  // changes — they are NOT what users should rely on.

  it('typing one character into an opening tag name does NOT sync the closing tag (sync gap)', () => {
    // The rename listener looks up a matching tag with the *new* name,
    // which by construction does not exist yet, so it bails. Real UX is
    // covered by `autoCloseTags` creating the pair at `>` time; this
    // characterization documents what tagSync alone does.
    mount('<foo>x</foo>', 4);
    view.dispatch({
      changes: { from: 4, to: 4, insert: 's' },
      selection: { anchor: 5 },
    });
    expect(view.state.doc.toString()).toBe('<foos>x</foo>');
  });

  it('replacing the closing-tag name in one shot wipes the opening tag (listener interference)', () => {
    mount('<foo>x</foo>');
    view.dispatch({
      changes: { from: 8, to: 11, insert: 'bar' },
      selection: { anchor: 11 },
    });
    expect(view.state.doc.toString()).toBe('x</bar>');
  });

  it('replacing the opening-tag name in one shot wipes the closing tag (listener interference)', () => {
    mount('<foo>x</foo>');
    view.dispatch({
      changes: { from: 1, to: 4, insert: 'bar' },
      selection: { anchor: 4 },
    });
    // Mirror image of the closing-rename quirk above: the progressive-
    // deletion listener interprets the opening rename as "tag destroyed"
    // and the rename listener also runs, with the deletion winning.
    expect(view.state.doc.toString()).toBe('<bar>x');
  });
});
