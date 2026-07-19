/**
 * validationErrorsEqual tests (roadmap #3, finding #17).
 *
 * This equality guard lets the SET_ERRORS reducer skip a state update (and the
 * whole downstream re-render + Outline reparse) when a lint pass produced the
 * same diagnostics as the previous one. It must compare EVERY field so a real
 * change is never suppressed.
 */
import { describe, it, expect } from 'vitest';
import { validationErrorsEqual } from '../src/utils/validationErrors';
import type { ValidationError } from '../src/types/schema';

const e = (over: Partial<ValidationError> = {}): ValidationError => ({
  message: 'msg',
  line: 1,
  column: 1,
  severity: 'error',
  ...over,
});

describe('validationErrorsEqual', () => {
  it('is true for the same reference and for empty arrays', () => {
    const arr = [e()];
    expect(validationErrorsEqual(arr, arr)).toBe(true);
    expect(validationErrorsEqual([], [])).toBe(true);
  });

  it('is true for structurally identical arrays', () => {
    expect(validationErrorsEqual([e({ line: 3 }), e({ line: 5 })], [e({ line: 3 }), e({ line: 5 })])).toBe(true);
  });

  it('is false when the length differs', () => {
    expect(validationErrorsEqual([e()], [e(), e()])).toBe(false);
    expect(validationErrorsEqual([e()], [])).toBe(false);
  });

  it('is false when any compared field differs', () => {
    expect(validationErrorsEqual([e({ line: 1 })], [e({ line: 2 })])).toBe(false);
    expect(validationErrorsEqual([e({ column: 1 })], [e({ column: 2 })])).toBe(false);
    expect(validationErrorsEqual([e({ severity: 'error' })], [e({ severity: 'warning' })])).toBe(false);
    expect(validationErrorsEqual([e({ message: 'a' })], [e({ message: 'b' })])).toBe(false);
    expect(validationErrorsEqual([e({ endLine: 2 })], [e({ endLine: 3 })])).toBe(false);
    expect(validationErrorsEqual([e({ endColumn: 4 })], [e({ endColumn: 5 })])).toBe(false);
  });

  it('treats a missing optional field as distinct from a present one', () => {
    expect(validationErrorsEqual([e()], [e({ endLine: 2 })])).toBe(false);
  });
});
