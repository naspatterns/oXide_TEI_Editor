/**
 * Regression tests for `createEditorExtensions` under repeated schema swaps.
 *
 * Background: a 2026-07 audit suspected that switching schemas several times
 * in one editor tab left multiple live copies of the extension set — the
 * reading was a single mouseup dispatching `oxide-quick-tag-menu` nine times
 * with identical payloads, which looks exactly like nine live
 * `createMouseUpExtension` instances.
 *
 * That turned out to be an artifact of the measuring instrument, not a real
 * defect: `@uiw/react-codemirror` re-applies a changed `extensions` prop with
 * `StateEffect.reconfigure`, which REPLACES the configuration rather than
 * appending to it, so each swap leaves exactly one instance. Nine identical
 * payloads are what you get from one dispatch observed by a listener that was
 * re-registered once per schema switch (or from N real mouseups — a
 * double-click alone produces two).
 *
 * These tests pin the replace-don't-append behaviour so a future refactor
 * (e.g. moving to `StateEffect.appendConfig`, or wrapping the set in a
 * Compartment that is `.of()`-ed instead of `.reconfigure()`-d) cannot
 * silently reintroduce the duplication that was originally suspected.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createEditorExtensions, QUICK_TAG_MENU_EVENT } from '../src/components/Editor/extensions';
import type { SchemaInfo } from '../src/types/schema';

const SWITCH_COUNT = 8;

let view: EditorView | undefined;

beforeAll(() => {
  // CodeMirror's built-in mousedown handler measures the primary selection via
  // Range#getClientRects, which jsdom does not implement. Stub it so the real
  // handler runs to completion instead of throwing past our probe.
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    }) as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
});

afterEach(() => {
  view?.destroy();
  view = undefined;
});

function fakeSchema(id: string): SchemaInfo {
  return { id, name: id, elements: [], elementMap: new Map(), hasSalveGrammar: false };
}

function mount(schema: SchemaInfo) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  view = new EditorView({
    state: EditorState.create({
      doc: '<p>hello world</p>',
      extensions: [createEditorExtensions(schema)],
    }),
    parent: host,
  });
  return view;
}

/**
 * Fire one mousedown and count the resulting `cancel` events. The mousedown
 * branch of `createMouseUpExtension` dispatches unconditionally and needs no
 * layout, so in jsdom the count equals the number of live handler instances.
 * (The mouseup branch needs `coordsAtPos`, which jsdom cannot satisfy.)
 */
function countLiveMouseHandlers(v: EditorView): number {
  let n = 0;
  const listener = (e: Event) => {
    if ((e as CustomEvent).detail?.cancel) n++;
  };
  document.addEventListener(QUICK_TAG_MENU_EVENT, listener);
  try {
    v.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  } finally {
    document.removeEventListener(QUICK_TAG_MENU_EVENT, listener);
  }
  return n;
}

function switchSchema(v: EditorView, id: string) {
  // Mirrors how @uiw/react-codemirror re-applies a changed `extensions` prop.
  v.dispatch({
    effects: StateEffect.reconfigure.of([createEditorExtensions(fakeSchema(id))]),
  });
}

describe('createEditorExtensions across schema switches', () => {
  it('keeps exactly one mouse handler instance after repeated schema switches', () => {
    const v = mount(fakeSchema('tei_lite'));
    expect(countLiveMouseHandlers(v)).toBe(1);

    const counts: number[] = [];
    for (let i = 1; i <= SWITCH_COUNT; i++) {
      switchSchema(v, `schema-${i}`);
      counts.push(countLiveMouseHandlers(v));
    }

    // One live instance after every swap — never 2, and never N+1.
    expect(counts).toEqual(Array(SWITCH_COUNT).fill(1));
  });

  it('keeps exactly one scrollbar marker container after repeated schema switches', () => {
    const v = mount(fakeSchema('tei_lite'));
    expect(v.scrollDOM.querySelectorAll('.cm-scrollbar-markers')).toHaveLength(1);

    for (let i = 1; i <= SWITCH_COUNT; i++) {
      switchSchema(v, `schema-${i}`);
    }

    // The ViewPlugin appends a container in its constructor, so a duplicated
    // (or leaked-and-recreated) plugin instance shows up as extra containers.
    expect(v.scrollDOM.querySelectorAll('.cm-scrollbar-markers')).toHaveLength(1);
  });

  it('keeps exactly one line-number gutter after repeated schema switches', () => {
    const v = mount(fakeSchema('tei_lite'));

    for (let i = 1; i <= SWITCH_COUNT; i++) {
      switchSchema(v, `schema-${i}`);
    }

    expect(v.dom.querySelectorAll('.cm-lineNumbers')).toHaveLength(1);
  });
});
