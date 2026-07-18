import { useCallback } from 'react';
import type { FileTreeNode } from '../types/workspace';
import { useWorkspace } from '../store/useWorkspace';
import { useSchema } from '../store/useSchema';
import { runBatchValidation } from '../file/batchValidation';

/**
 * Run corpus validation over the whole workspace tree.
 *
 * Joins WorkspaceContext (file tree + shared batch state) with
 * SchemaContext (per-file schema resolution via the M3 registry + the
 * app-level Schematron ruleset) — the usual two-provider join hook so the
 * providers stay decoupled.
 */
export function useBatchValidation(): () => Promise<void> {
  const { state, batch, startBatch, reportBatchProgress, finishBatch } = useWorkspace();
  const { ensureSchema, schematron } = useSchema();

  return useCallback(async () => {
    if (batch.running) return;

    // Count first so the progress bar has a stable total.
    const countFiles = (nodes: FileTreeNode[]): number =>
      nodes.reduce((n, node) => n + (node.type === 'file' ? 1 : 0) + (node.children ? countFiles(node.children) : 0), 0);
    startBatch(countFiles(state.fileTree));

    const results = await runBatchValidation(
      state.fileTree,
      // Detector only yields built-in ids; ensureSchema loads + caches them
      // (tei_all stays lazy and is fetched once for the whole run).
      (schemaId) => ensureSchema(schemaId),
      schematron,
      ({ done }) => reportBatchProgress(done),
    );

    finishBatch(results);
  }, [batch.running, state.fileTree, startBatch, reportBatchProgress, finishBatch, ensureSchema, schematron]);
}
