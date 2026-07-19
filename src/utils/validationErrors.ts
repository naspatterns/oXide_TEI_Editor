import type { ValidationError } from '../types/schema';

/**
 * Structural equality for validation diagnostics.
 *
 * The linter runs on a 500 ms debounce and hands back a freshly-built array on
 * every pass — usually identical to the previous one (e.g. steady typing in a
 * clean document). Comparing here lets the reducer skip the state update, which
 * avoids a full EditorContext re-render and the downstream Outline re-parse for
 * a no-op change. Compares every field so a real change is never suppressed.
 */
export function validationErrorsEqual(a: ValidationError[], b: ValidationError[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.line !== y.line ||
      x.column !== y.column ||
      x.severity !== y.severity ||
      x.message !== y.message ||
      x.endLine !== y.endLine ||
      x.endColumn !== y.endColumn
    ) {
      return false;
    }
  }
  return true;
}
