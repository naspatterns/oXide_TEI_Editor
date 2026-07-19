import { useReducer, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { FileTreeNode, WorkspaceState } from '../types/workspace';
import type { BatchFileResult } from '../file/batchValidation';
import { openDirectory, buildFileTree, supportsDirectoryPicker } from '../file/fileSystemAccess';
import { WorkspaceContext, type BatchValidationState } from './useWorkspace';

const IDLE_BATCH: BatchValidationState = { running: false, done: 0, total: 0, results: null };

/**
 * Actions for workspace state management.
 */
type WorkspaceAction =
  | { type: 'SET_ROOT'; handle: FileSystemDirectoryHandle; name: string }
  | { type: 'SET_FILE_TREE'; fileTree: FileTreeNode[] }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'CLOSE_WORKSPACE' }
  | { type: 'TOGGLE_DIRECTORY'; path: string };

function reducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_ROOT':
      return {
        ...state,
        rootHandle: action.handle,
        rootName: action.name,
        isLoading: true,
      };

    case 'SET_FILE_TREE':
      return {
        ...state,
        fileTree: action.fileTree,
        isLoading: false,
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };

    case 'CLOSE_WORKSPACE':
      return {
        rootHandle: null,
        rootName: null,
        fileTree: [],
        isLoading: false,
      };

    case 'TOGGLE_DIRECTORY': {
      // Recursively find and toggle the directory
      const toggleDir = (nodes: FileTreeNode[]): FileTreeNode[] =>
        nodes.map((node) => {
          if (node.path === action.path && node.type === 'directory') {
            return { ...node, isExpanded: !node.isExpanded };
          }
          if (node.children) {
            return { ...node, children: toggleDir(node.children) };
          }
          return node;
        });

      return { ...state, fileTree: toggleDir(state.fileTree) };
    }

    default:
      return state;
  }
}

const initialState: WorkspaceState = {
  rootHandle: null,
  rootName: null,
  fileTree: [],
  isLoading: false,
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const isSupported = supportsDirectoryPicker();

  // ─── Batch validation state (the RUN logic lives in useBatchValidation,
  //     which joins this provider with SchemaContext — A1 boundary) ───
  const [batch, setBatch] = useState<BatchValidationState>(IDLE_BATCH);

  const startBatch = useCallback((total: number) => {
    setBatch({ running: true, done: 0, total, results: null });
  }, []);

  const reportBatchProgress = useCallback((done: number) => {
    setBatch(prev => (prev.running ? { ...prev, done } : prev));
  }, []);

  const finishBatch = useCallback((results: BatchFileResult[]) => {
    setBatch(prev => ({ running: false, done: prev.total, total: prev.total, results }));
  }, []);

  const clearBatch = useCallback(() => setBatch(IDLE_BATCH), []);

  const openWorkspace = useCallback(async () => {
    try {
      const { handle, name } = await openDirectory();
      dispatch({ type: 'SET_ROOT', handle, name });
      // Corpus results from the previous workspace are stale — their file
      // paths no longer resolve here, so a diagnostic click could open the
      // wrong file (or nothing). Reset before the new tree loads (#2/#12).
      clearBatch();

      // Build file tree
      const fileTree = await buildFileTree(handle);
      dispatch({ type: 'SET_FILE_TREE', fileTree });
    } catch (error) {
      // User cancelled or permission denied
      console.warn('Failed to open workspace:', error);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, [clearBatch]);

  const closeWorkspace = useCallback(() => {
    dispatch({ type: 'CLOSE_WORKSPACE' });
    // Drop the closed workspace's corpus results too (#2/#12).
    clearBatch();
  }, [clearBatch]);

  const refreshFileTree = useCallback(async () => {
    if (!state.rootHandle) return;

    dispatch({ type: 'SET_LOADING', isLoading: true });
    try {
      const fileTree = await buildFileTree(state.rootHandle);
      dispatch({ type: 'SET_FILE_TREE', fileTree });
    } catch (error) {
      console.warn('Failed to refresh file tree:', error);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, [state.rootHandle]);

  const toggleDirectory = useCallback((path: string) => {
    dispatch({ type: 'TOGGLE_DIRECTORY', path });
  }, []);

  const findFileNode = useCallback(
    (path: string): FileTreeNode | null => {
      const searchInNodes = (nodes: FileTreeNode[]): FileTreeNode | null => {
        for (const node of nodes) {
          if (node.path === path) return node;
          if (node.children) {
            const found = searchInNodes(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      return searchInNodes(state.fileTree);
    },
    [state.fileTree],
  );

  const value = useMemo(
    () => ({
      state,
      isSupported,
      openWorkspace,
      closeWorkspace,
      refreshFileTree,
      toggleDirectory,
      findFileNode,
      batch,
      startBatch,
      reportBatchProgress,
      finishBatch,
      clearBatch,
    }),
    [state, isSupported, openWorkspace, closeWorkspace, refreshFileTree, toggleDirectory, findFileNode, batch, startBatch, reportBatchProgress, finishBatch, clearBatch],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
