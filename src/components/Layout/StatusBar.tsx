import { useState, useCallback } from 'react';
import { useEditor } from '../../store/EditorContext';
import { useSchema } from '../../store/SchemaContext';
import type { ValidationError } from '../../types/schema';
import './StatusBar.css';

export function StatusBar() {
  const { state, scrollToLine } = useEditor();
  const { schema } = useSchema();
  const [showErrorDialog, setShowErrorDialog] = useState(false);

  const errorCount = state.errors.length;

  const handleDoubleClick = useCallback(() => {
    if (errorCount > 0) {
      setShowErrorDialog(true);
    }
  }, [errorCount]);

  // Navigate to error line when clicked
  const handleErrorClick = useCallback((error: ValidationError) => {
    scrollToLine(error.line);
    setShowErrorDialog(false);
  }, [scrollToLine]);

  const closeDialog = useCallback(() => {
    setShowErrorDialog(false);
  }, []);

  return (
    <>
      <footer className="statusbar" role="status" aria-label="Editor status">
        <div className="statusbar-left" aria-live="polite">
          {state.isValidating ? (
            <span className="statusbar-validating" aria-busy="true">Validating...</span>
          ) : errorCount > 0 ? (
            <span
              className="statusbar-errors statusbar-errors-clickable"
              onClick={() => handleErrorClick(state.errors[0])}
              onDoubleClick={handleDoubleClick}
              title="Click to go to first error • Double-click to see all errors"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleErrorClick(state.errors[0])}
              aria-label={`${errorCount} validation error${errorCount !== 1 ? 's' : ''}. Press Enter to go to first error.`}
            >
              {errorCount} error{errorCount !== 1 ? 's' : ''}: {state.errors[0]?.message}
            </span>
          ) : (
            <span className="statusbar-valid" aria-label="Document is valid">Valid</span>
          )}
        </div>
        <div className="statusbar-center" aria-label="Current file">
          {state.fileName ?? 'Untitled'}
          {state.isDirty && ' *'}
        </div>
        <div className="statusbar-right">
          <span className="statusbar-cursor" aria-label={`Cursor at line ${state.cursorLine}, column ${state.cursorColumn}`}>
            Ln {state.cursorLine}, Col {state.cursorColumn}
          </span>
          {schema && (
            <span className="statusbar-schema" aria-label={`Schema: ${schema.name} with ${schema.elements.length} elements`}>
              {schema.name} ({schema.elements.length})
            </span>
          )}
        </div>
      </footer>

      {/* Error Details Dialog */}
      {showErrorDialog && (
        <div
          className="error-dialog-overlay"
          onClick={closeDialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="error-dialog-title"
        >
          <div className="error-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="error-dialog-header">
              <h3 id="error-dialog-title">Validation Errors ({errorCount})</h3>
              <button
                className="error-dialog-close"
                onClick={closeDialog}
                aria-label="Close error dialog"
              >
                ×
              </button>
            </div>
            <div className="error-dialog-content" role="list">
              {state.errors.map((error, idx) => (
                <div
                  key={idx}
                  className={`error-item error-item-${error.severity} error-item-clickable`}
                  onClick={() => handleErrorClick(error)}
                  onKeyDown={(e) => e.key === 'Enter' && handleErrorClick(error)}
                  title="Click to go to this line"
                  role="listitem"
                  tabIndex={0}
                >
                  <span className="error-icon" aria-hidden="true">
                    {error.severity === 'error' ? '❌' : '⚠️'}
                  </span>
                  <span className="error-location">
                    Ln {error.line}, Col {error.column}
                  </span>
                  <span className="error-message">{error.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
