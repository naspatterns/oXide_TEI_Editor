import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { CursorContext } from './useCursor';

/**
 * Live cursor position, separated from the heavy multi-tab editor state so
 * cursor moves (which fire on every arrow-key press and mouse click) don't
 * trigger re-renders of every editor consumer.
 *
 * Only StatusBar and BreadcrumbBar actually read this. The active document's
 * `cursorLine` / `cursorColumn` in OpenDocument are still updated, but on a
 * 500 ms debounce by XmlEditor — cheap enough that tab switches can restore
 * the saved cursor without the typing-frequency reducer churn.
 */
export function CursorProvider({ children }: { children: ReactNode }) {
  const [pos, setPos] = useState({ line: 1, column: 1 });

  const setLiveCursor = useCallback((line: number, column: number) => {
    setPos((prev) => (prev.line === line && prev.column === column ? prev : { line, column }));
  }, []);

  const value = useMemo(
    () => ({ line: pos.line, column: pos.column, setLiveCursor }),
    [pos.line, pos.column, setLiveCursor],
  );

  return <CursorContext.Provider value={value}>{children}</CursorContext.Provider>;
}
