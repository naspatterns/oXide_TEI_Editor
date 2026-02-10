import { linter, type Diagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import type { SchemaInfo } from '../../types/schema';
import type { ValidationError } from '../../types/schema';
import { validateXml } from '../../schema/xmlValidator';

/**
 * Creates a CodeMirror 6 linter extension that validates XML against
 * the loaded TEI schema.
 *
 * CM6's linter API provides:
 * - Debouncing (delay option)
 * - Inline underline markers
 * - Gutter error indicators (via lintGutter() in extensions.ts)
 * - Tooltip on hover over errors
 */
export function createValidationLinter(
  schema: SchemaInfo | null,
  onErrors?: (errors: ValidationError[]) => void,
): Extension {
  return linter(
    (view) => {
      const doc = view.state.doc.toString();
      const errors = validateXml(doc, schema);

      // Report errors to parent (for StatusBar)
      onErrors?.(errors);

      // Convert ValidationError[] to CM6 Diagnostic[]
      return errors
        .map((err) => validationErrorToDiagnostic(err, view.state.doc))
        .filter((d): d is Diagnostic => d !== null);
    },
    {
      delay: 500,
    },
  );
}

/** Convert a ValidationError (line/col based) to a CM6 Diagnostic (offset based) */
function validationErrorToDiagnostic(
  error: ValidationError,
  doc: { line: (n: number) => { from: number; to: number }; lines: number },
): Diagnostic | null {
  // Clamp line to valid range
  const lineNum = Math.max(1, Math.min(error.line, doc.lines));
  const lineInfo = doc.line(lineNum);

  const from = lineInfo.from + Math.max(0, error.column - 1);
  // Highlight to end of line or end position
  const to = error.endColumn
    ? lineInfo.from + Math.max(0, error.endColumn - 1)
    : Math.min(from + 20, lineInfo.to); // Highlight ~20 chars by default

  if (from > lineInfo.to) return null;

  return {
    from: Math.min(from, lineInfo.to),
    to: Math.min(to, lineInfo.to),
    severity: error.severity === 'error' ? 'error' : 'warning',
    message: error.message,
  };
}
