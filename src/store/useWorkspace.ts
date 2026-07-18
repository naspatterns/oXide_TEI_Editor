import { createContext, useContext } from 'react';
import type { FileTreeNode, WorkspaceState } from '../types/workspace';
import type { BatchFileResult } from '../file/batchValidation';

/** Batch-validation UI state (results shared between trigger and panel). */
export interface BatchValidationState {
  running: boolean;
  done: number;
  total: number;
  /** null = never run (or cleared); [] = ran on an empty workspace. */
  results: BatchFileResult[] | null;
}

export interface WorkspaceContextValue {
  state: WorkspaceState;
  /** Whether directory picker is supported in this browser */
  isSupported: boolean;
  /** Open a folder as workspace */
  openWorkspace: () => Promise<void>;
  /** Close the current workspace */
  closeWorkspace: () => void;
  /** Refresh the file tree (re-scan directory) */
  refreshFileTree: () => Promise<void>;
  /** Toggle directory expanded/collapsed state */
  toggleDirectory: (path: string) => void;
  /** Find a file node by path */
  findFileNode: (path: string) => FileTreeNode | null;
  /** Batch-validation state (results shown in the Problems panel) */
  batch: BatchValidationState;
  startBatch: (total: number) => void;
  reportBatchProgress: (done: number) => void;
  finishBatch: (results: BatchFileResult[]) => void;
  clearBatch: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
