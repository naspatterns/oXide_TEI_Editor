import { createContext, useContext } from 'react';
import type { SchemaInfo } from '../types/schema';

export interface SchemaContextValue {
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

export const SchemaContext = createContext<SchemaContextValue | null>(null);

export function useSchema(): SchemaContextValue {
  const ctx = useContext(SchemaContext);
  if (!ctx) throw new Error('useSchema must be used within SchemaProvider');
  return ctx;
}
