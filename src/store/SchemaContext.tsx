import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import type { SchemaInfo } from '../types/schema';
import { schemaEngine } from '../schema/SchemaEngine';
import { SchemaContext } from './useSchema';

const BUILTIN_SCHEMAS = ['tei_lite', 'tei_all'];

export function SchemaProvider({ children }: { children: ReactNode }) {
  const [schema, setSchemaState] = useState<SchemaInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadSchema = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const info = await schemaEngine.loadBuiltin(id);
      setSchemaState(info);
    } catch (err) {
      console.error('Failed to load schema:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setSchema = useCallback((s: SchemaInfo) => {
    setSchemaState(s);
  }, []);

  // Auto-load TEI Lite on mount.
  // This is a legitimate one-time async data fetch on mount; the alternative
  // (Suspense + use()) would require restructuring the whole provider tree.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSchema('tei_lite');
  }, [loadSchema]);

  const value = useMemo(
    () => ({
      schema,
      availableSchemas: BUILTIN_SCHEMAS,
      isLoading,
      loadSchema,
      setSchema,
    }),
    [schema, isLoading, loadSchema, setSchema],
  );

  return <SchemaContext.Provider value={value}>{children}</SchemaContext.Provider>;
}
