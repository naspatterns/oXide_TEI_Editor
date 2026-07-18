import { useCallback } from 'react';
import { useWorkspace } from '../../store/useWorkspace';
import { useEditor } from '../../store/useEditor';
import { useBatchValidation } from '../../hooks/useBatchValidation';
import { readFileContent } from '../../file/fileSystemAccess';
import type { BatchFileResult } from '../../file/batchValidation';
import type { ValidationError } from '../../types/schema';
import './ProblemsPanel.css';

/**
 * Corpus-wide validation results (P2 batch validation).
 *
 * "Validate workspace" runs every XML file in the tree through the same
 * schema (+ Schematron) validators the editor uses live; results group by
 * file and a click opens the file (deduped by path) at the offending line.
 */
export function ProblemsPanel() {
  const { state, batch, findFileNode } = useWorkspace();
  const { openFileAsTab, goToLine } = useEditor();
  const runBatch = useBatchValidation();

  const handleDiagnosticClick = useCallback(
    async (result: BatchFileResult, error: ValidationError) => {
      const node = findFileNode(result.path);
      if (!node || node.type !== 'file') return;

      try {
        const content = await readFileContent(node.handle as FileSystemFileHandle);
        // OPEN_TAB dedupes by filePath: an already-open (possibly dirty) tab
        // is simply activated — its content is NOT overwritten.
        openFileAsTab(content, node.name, node.handle as FileSystemFileHandle, result.path);
      } catch {
        return; // File unreadable (moved/permission) — nothing to navigate to.
      }

      // The editor remounts asynchronously when a new tab opens, and
      // goToLine targets the live view ref. Navigate once quickly (covers
      // the already-open case) and once after the remount settles.
      setTimeout(() => goToLine(error.line), 50);
      setTimeout(() => goToLine(error.line), 400);
    },
    [findFileNode, openFileAsTab, goToLine],
  );

  const hasWorkspace = state.rootHandle !== null;
  const results = batch.results;
  const dirtyResults = results?.filter(r => r.errors.length > 0) ?? [];
  const totalErrors = results?.reduce((n, r) => n + r.errorCount, 0) ?? 0;
  const totalWarnings = results?.reduce((n, r) => n + r.warningCount, 0) ?? 0;

  return (
    <div className="problems-panel">
      <div className="problems-header">
        <span className="problems-title">Problems</span>
        <button
          className="problems-run-btn"
          onClick={runBatch}
          disabled={!hasWorkspace || batch.running}
          title={hasWorkspace ? 'Validate every XML file in the workspace' : 'Open a project folder first'}
        >
          {batch.running ? `Validating… ${batch.done}/${batch.total}` : 'Validate workspace'}
        </button>
      </div>

      {!hasWorkspace && (
        <div className="problems-empty">Open a project folder to validate the whole corpus.</div>
      )}

      {hasWorkspace && !batch.running && results === null && (
        <div className="problems-empty">
          Run “Validate workspace” to check every XML file against its schema
          and the active Schematron rules.
        </div>
      )}

      {results !== null && !batch.running && (
        <>
          <div className="problems-summary">
            {results.length} file{results.length === 1 ? '' : 's'} checked ·{' '}
            <span className="problems-count-error">{totalErrors} error{totalErrors === 1 ? '' : 's'}</span> ·{' '}
            <span className="problems-count-warning">{totalWarnings} warning{totalWarnings === 1 ? '' : 's'}</span>
          </div>

          {dirtyResults.length === 0 ? (
            <div className="problems-clean">✓ All files valid</div>
          ) : (
            <div className="problems-list">
              {dirtyResults.map(result => (
                <div key={result.path} className="problems-file">
                  <div className="problems-file-header" title={result.path}>
                    <span className="problems-file-name">{result.fileName}</span>
                    <span className="problems-file-schema">{result.schemaId}</span>
                    <span className="problems-file-counts">
                      {result.errorCount > 0 && <span className="problems-count-error">{result.errorCount}✕</span>}
                      {result.warningCount > 0 && <span className="problems-count-warning">{result.warningCount}⚠</span>}
                    </span>
                  </div>
                  {result.errors.map((error, i) => (
                    <button
                      key={`${result.path}-${i}`}
                      className={`problems-item problems-item-${error.severity}`}
                      onClick={() => handleDiagnosticClick(result, error)}
                      title={`${result.path}:${error.line}`}
                    >
                      <span className="problems-item-line">:{error.line}</span>
                      <span className="problems-item-message">{error.message}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
