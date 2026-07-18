import { createContext, useContext } from 'react';
import type { SchemaInfo } from '../types/schema';
import type { SchematronSchema } from '../schema/schematron';

export interface SchemaContextValue {
  /** Legacy app-level schema (the default). Prefer useActiveSchema(). */
  schema: SchemaInfo | null;
  /** Registry of loaded schemas, keyed by schema id (M3). */
  schemasById: Record<string, SchemaInfo>;
  /** Available built-in schema IDs */
  availableSchemas: string[];
  /** Whether a schema is loading */
  isLoading: boolean;
  /** Legacy: load a builtin and make it the app-level schema */
  loadSchema: (id: string) => Promise<void>;
  /** Legacy: register + select a custom schema */
  setSchema: (schema: SchemaInfo) => void;
  /** Idempotently load a builtin schema into the registry */
  ensureSchema: (id: string) => Promise<SchemaInfo | null>;
  /** Sync registry read — null while loading; undefined id → default */
  resolveSchema: (id: string | undefined) => SchemaInfo | null;
  /** Put an uploaded custom schema into the registry */
  registerCustomSchema: (info: SchemaInfo) => void;
  /** Active Schematron project rules (app-level second validation layer) */
  schematron: SchematronSchema | null;
  /** Parse + activate a Schematron ruleset; throws on unusable input */
  loadSchematron: (schXml: string, name: string) => SchematronSchema;
  /** Deactivate the Schematron ruleset */
  clearSchematron: () => void;
}

export const SchemaContext = createContext<SchemaContextValue | null>(null);

export function useSchema(): SchemaContextValue {
  const ctx = useContext(SchemaContext);
  if (!ctx) throw new Error('useSchema must be used within SchemaProvider');
  return ctx;
}
