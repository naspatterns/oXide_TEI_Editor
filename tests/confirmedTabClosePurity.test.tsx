/**
 * useConfirmedTabClose purity test (unverified-tier fix #15).
 *
 * confirm() dispatched closeTab from INSIDE a setPending updater. Updaters must
 * be pure, so React StrictMode's dev double-invocation ran CLOSE_TAB twice.
 * Rendering under <StrictMode> with a spy closeTab pins that confirm now
 * dispatches exactly once.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useConfirmedTabClose } from '../src/hooks/useConfirmedTabClose';

const editor = vi.hoisted(() => ({
  closeTab: vi.fn(),
  getDocument: vi.fn(),
}));
vi.mock('../src/store/useEditor', () => ({ useEditor: () => editor }));

afterEach(() => {
  cleanup();
  editor.closeTab.mockReset();
  editor.getDocument.mockReset();
});

function renderStrict() {
  return renderHook(() => useConfirmedTabClose(), {
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
  });
}

describe('useConfirmedTabClose confirm() purity (#15)', () => {
  it('dispatches closeTab exactly once under StrictMode', () => {
    editor.getDocument.mockReturnValue({ id: 't1', fileName: 'a.xml', isDirty: true });
    const { result } = renderStrict();

    // Dirty doc → asks for confirmation instead of closing.
    act(() => result.current.requestClose('t1'));
    expect(result.current.pending).toEqual({ id: 't1', fileName: 'a.xml' });
    expect(editor.closeTab).not.toHaveBeenCalled();

    act(() => result.current.confirm());
    expect(editor.closeTab).toHaveBeenCalledTimes(1);
    expect(editor.closeTab).toHaveBeenCalledWith('t1');
    expect(result.current.pending).toBeNull();
  });

  it('cancel() clears the pending close without dispatching', () => {
    editor.getDocument.mockReturnValue({ id: 't1', fileName: 'a.xml', isDirty: true });
    const { result } = renderStrict();
    act(() => result.current.requestClose('t1'));
    act(() => result.current.cancel());
    expect(result.current.pending).toBeNull();
    expect(editor.closeTab).not.toHaveBeenCalled();
  });
});
