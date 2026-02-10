import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { SchemaInfo } from '../types/schema';
import { schemaEngine } from '../schema/SchemaEngine';

interface SchemaContextValue {
  /** Currently active schema */
  schema: SchemaInfo | null;
  /** Available schema IDs */
  availableSchemas: string[];
  /** Whether schema is loading */
  isLoading: boolean;
  /** Load a schema by ID */
  loadSchema: (id: string) => Promise<void>;
  /** Set schema directly (for custom uploads) */
  setSchema: (schema: SchemaInfo) => void;
}

const SchemaContext = createContext<SchemaContextValue | null>(null);

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

  // Auto-load TEI Lite on mount
  useEffect(() => {
    loadSchema('tei_lite');
  }, [loadSchema]);

  return (
    <SchemaContext.Provider value={{ schema, availableSchemas: BUILTIN_SCHEMAS, isLoading, loadSchema, setSchema }}>
      {children}
    </SchemaContext.Provider>
  );
}

export function useSchema(): SchemaContextValue {
  const ctx = useContext(SchemaContext);
  if (!ctx) throw new Error('useSchema must be used within SchemaProvider');
  return ctx;
}
