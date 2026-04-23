import { createContext, useContext } from 'react';

export interface CursorContextValue {
  /** Current 1-based line number of the editor caret. */
  line: number;
  /** Current 1-based column number of the editor caret. */
  column: number;
  /**
   * Push a new live cursor position. Cheap (only re-renders cursor
   * consumers — StatusBar, BreadcrumbBar). Does NOT persist to the active
   * document; the editor separately debounces a write to OpenDocument so
   * tab switches restore the cursor.
   */
  setLiveCursor: (line: number, column: number) => void;
}

export const CursorContext = createContext<CursorContextValue | null>(null);

export function useCursor(): CursorContextValue {
  const ctx = useContext(CursorContext);
  if (!ctx) throw new Error('useCursor must be used within CursorProvider');
  return ctx;
}
