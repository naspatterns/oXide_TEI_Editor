import { useState, useCallback } from 'react';
import { useEditor } from '../../store/EditorContext';
import { useSchema } from '../../store/SchemaContext';
import './StatusBar.css';

export function StatusBar() {
  const { state } = useEditor();
  const { schema } = useSchema();
  const [showErrorDialog, setShowErrorDialog] = useState(false);

  const errorCount = state.errors.length;

  const handleDoubleClick = useCallback(() => {
    if (errorCount > 0) {
      setShowErrorDialog(true);
    }
  }, [errorCount]);

  const closeDialog = useCallback(() => {
    setShowErrorDialog(false);
  }, []);

  return (
    <>
      <div className="statusbar">
        <div className="statusbar-left">
          {state.isValidating ? (
            <span className="statusbar-validating">Validating...</span>
          ) : errorCount > 0 ? (
            <span
              className="statusbar-errors"
              onDoubleClick={handleDoubleClick}
              title="Double-click to see all errors"
            >
              {errorCount} error{errorCount !== 1 ? 's' : ''}: {state.errors[0]?.message}
            </span>
          ) : (
            <span className="statusbar-valid">Valid</span>
          )}
        </div>
        <div className="statusbar-center">
          {state.fileName ?? 'Untitled'}
          {state.isDirty && ' *'}
        </div>
        <div className="statusbar-right">
          <span className="statusbar-cursor">Ln {state.cursorLine}, Col {state.cursorColumn}</span>
          {schema && <span className="statusbar-schema">{schema.name} ({schema.elements.length})</span>}
        </div>
      </div>

      {/* Error Details Dialog */}
      {showErrorDialog && (
        <div className="error-dialog-overlay" onClick={closeDialog}>
          <div className="error-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="error-dialog-header">
              <h3>Validation Errors ({errorCount})</h3>
              <button className="error-dialog-close" onClick={closeDialog}>×</button>
            </div>
            <div className="error-dialog-content">
              {state.errors.map((error, idx) => (
                <div
                  key={idx}
                  className={`error-item error-item-${error.severity}`}
                >
                  <span className="error-icon">
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
