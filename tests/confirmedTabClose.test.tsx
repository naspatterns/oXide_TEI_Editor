/**
 * Dirty-guarded tab closing (P0, 2026-07).
 *
 * Pins the fix for silent data loss: every close entry point (File menu,
 * Ctrl+W, command palette, tab-bar ×) now routes through
 * useConfirmedTabClose, which refuses to close a dirty document without
 * an explicit confirmation.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { EditorProvider } from '../src/store/EditorContext';
import { useEditor } from '../src/store/useEditor';
import { useConfirmedTabClose } from '../src/hooks/useConfirmedTabClose';

afterEach(cleanup);

function setup() {
  return renderHook(
    () => ({ editor: useEditor(), closer: useConfirmedTabClose() }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <EditorProvider>{children}</EditorProvider>
      ),
    },
  );
}

describe('useConfirmedTabClose', () => {
  it('closes a pristine document immediately, without confirmation', () => {
    const { result } = setup();
    const id = result.current.editor.multiTabState.activeDocumentId!;

    act(() => result.current.closer.requestClose(id));

    expect(result.current.editor.multiTabState.openDocuments).toHaveLength(0);
    expect(result.current.closer.pending).toBeNull();
  });

  it('does NOT close a dirty document — it asks for confirmation instead', () => {
    const { result } = setup();
    const id = result.current.editor.multiTabState.activeDocumentId!;

    act(() => result.current.editor.setContent('<TEI>edited</TEI>'));
    act(() => result.current.closer.requestClose(id));

    // Document survives; a confirmation is pending with its file name.
    expect(result.current.editor.multiTabState.openDocuments).toHaveLength(1);
    expect(result.current.closer.pending).toEqual({ id, fileName: 'Untitled.xml' });
  });

  it('confirm() closes the pending dirty document', () => {
    const { result } = setup();
    const id = result.current.editor.multiTabState.activeDocumentId!;

    act(() => result.current.editor.setContent('<TEI>edited</TEI>'));
    act(() => result.current.closer.requestClose(id));
    act(() => result.current.closer.confirm());

    expect(result.current.editor.multiTabState.openDocuments).toHaveLength(0);
    expect(result.current.closer.pending).toBeNull();
  });

  it('cancel() keeps the dirty document open', () => {
    const { result } = setup();
    const id = result.current.editor.multiTabState.activeDocumentId!;

    act(() => result.current.editor.setContent('<TEI>edited</TEI>'));
    act(() => result.current.closer.requestClose(id));
    act(() => result.current.closer.cancel());

    expect(result.current.editor.multiTabState.openDocuments).toHaveLength(1);
    expect(result.current.closer.pending).toBeNull();
  });

  it('ignores requests for unknown tab ids', () => {
    const { result } = setup();

    act(() => result.current.closer.requestClose('no-such-id'));

    expect(result.current.editor.multiTabState.openDocuments).toHaveLength(1);
    expect(result.current.closer.pending).toBeNull();
  });
});
