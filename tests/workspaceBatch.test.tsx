/**
 * Workspace batch-state reset tests (unverified-tier fix #2/#12).
 *
 * clearBatch was defined and exposed but never called: neither openWorkspace
 * nor closeWorkspace reset the corpus-validation results, so results from a
 * previous workspace survived a switch/close. A diagnostic click then resolved
 * a stale file path against the new tree — wrong file or none. Both paths now
 * clear the batch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { WorkspaceProvider } from '../src/store/WorkspaceContext';
import { useWorkspace } from '../src/store/useWorkspace';
import type { BatchFileResult } from '../src/file/batchValidation';

const fsa = vi.hoisted(() => ({
  openDirectory: vi.fn(),
  buildFileTree: vi.fn(),
  supportsDirectoryPicker: vi.fn(() => true),
}));
vi.mock('../src/file/fileSystemAccess', () => fsa);

function renderWorkspace() {
  return renderHook(() => useWorkspace(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <WorkspaceProvider>{children}</WorkspaceProvider>
    ),
  });
}

const SAMPLE_RESULTS: BatchFileResult[] = [
  { path: 'old/a.xml', fileName: 'a.xml', schemaId: 'tei_lite', errors: [], errorCount: 0, warningCount: 0 },
];

afterEach(() => {
  cleanup();
  fsa.openDirectory.mockReset();
  fsa.buildFileTree.mockReset();
});

describe('workspace batch reset (#2/#12)', () => {
  it('closeWorkspace clears stale corpus results', () => {
    const { result } = renderWorkspace();
    act(() => result.current.finishBatch(SAMPLE_RESULTS));
    expect(result.current.batch.results).toHaveLength(1);

    act(() => result.current.closeWorkspace());
    expect(result.current.batch.results).toBeNull();
    expect(result.current.batch.running).toBe(false);
  });

  it('openWorkspace clears the previous workspace results before loading the new tree', async () => {
    fsa.openDirectory.mockResolvedValue({ handle: {}, name: 'new-project' });
    fsa.buildFileTree.mockResolvedValue({
      name: 'new-project',
      type: 'directory',
      path: 'new-project',
      children: [],
    });

    const { result } = renderWorkspace();
    act(() => result.current.finishBatch(SAMPLE_RESULTS));
    expect(result.current.batch.results).toHaveLength(1);

    await act(async () => {
      await result.current.openWorkspace();
    });

    expect(result.current.batch.results).toBeNull();
    expect(result.current.state.rootName).toBe('new-project');
  });

  it('leaves batch results intact when the open picker is cancelled', async () => {
    fsa.openDirectory.mockRejectedValue(new DOMException('cancelled', 'AbortError'));

    const { result } = renderWorkspace();
    act(() => result.current.finishBatch(SAMPLE_RESULTS));

    await act(async () => {
      await result.current.openWorkspace();
    });

    // No new workspace was opened, so the existing results should survive.
    expect(result.current.batch.results).toHaveLength(1);
  });
});
