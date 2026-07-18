import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { SchemaInfo } from '../types/schema';
import { schemaEngine } from '../schema/SchemaEngine';
import { SchemaContext } from './useSchema';

const BUILTIN_SCHEMAS = ['tei_lite', 'tei_all'];
const DEFAULT_SCHEMA_ID = 'tei_lite';

/**
 * Schema REGISTRY provider (M3): schemas are loaded once and kept in an
 * id-keyed map so each document/tab can resolve its own schema. The legacy
 * single-`schema` field is retained for backward compatibility and now
 * means "the default/app-level schema" — new consumers should go through
 * `resolveSchema`/`ensureSchema` (usually via the `useActiveSchema` hook).
 */
export function SchemaProvider({ children }: { children: ReactNode }) {
  const [schemasById, setSchemasById] = useState<Record<string, SchemaInfo>>({});
  const [isLoading, setIsLoading] = useState(false);
  // In-flight builtin loads, so concurrent ensureSchema('tei_all') calls
  // share one dynamic import instead of racing.
  const pendingRef = useRef<Map<string, Promise<SchemaInfo | null>>>(new Map());

  const registerCustomSchema = useCallback((info: SchemaInfo) => {
    setSchemasById(prev => ({ ...prev, [info.id]: info }));
  }, []);

  /**
   * Idempotently load a schema into the registry and return it.
   * Built-in ids go through schemaEngine (tei_all keeps its lazy ~528KB
   * dynamic import); unknown/custom ids resolve to whatever the registry
   * already holds (custom schemas enter via registerCustomSchema).
   */
  const ensureSchema = useCallback(async (id: string): Promise<SchemaInfo | null> => {
    const pending = pendingRef.current.get(id);
    if (pending) return pending;

    if (!BUILTIN_SCHEMAS.includes(id)) {
      // Custom ids are registered explicitly at upload time; nothing to load.
      return null;
    }

    const load = (async () => {
      setIsLoading(true);
      try {
        const info = await schemaEngine.loadBuiltin(id);
        setSchemasById(prev => (prev[id] === info ? prev : { ...prev, [id]: info }));
        return info;
      } catch (err) {
        console.error('Failed to load schema:', err);
        return null;
      } finally {
        setIsLoading(false);
        pendingRef.current.delete(id);
      }
    })();
    pendingRef.current.set(id, load);
    return load;
  }, []);

  /** Synchronous registry read — null while a schema is still loading. */
  const resolveSchema = useCallback(
    (id: string | undefined): SchemaInfo | null => schemasById[id ?? DEFAULT_SCHEMA_ID] ?? null,
    [schemasById],
  );

  // ─── Legacy single-schema API (backward compatibility) ───

  const [legacySchemaId, setLegacySchemaId] = useState<string>(DEFAULT_SCHEMA_ID);

  const loadSchema = useCallback(async (id: string) => {
    await ensureSchema(id);
    setLegacySchemaId(id);
  }, [ensureSchema]);

  const setSchema = useCallback((s: SchemaInfo) => {
    registerCustomSchema(s);
    setLegacySchemaId(s.id);
  }, [registerCustomSchema]);

  const schema = schemasById[legacySchemaId] ?? null;

  // Auto-load TEI Lite on mount.
  // This is a legitimate one-time async data fetch on mount; the alternative
  // (Suspense + use()) would require restructuring the whole provider tree.
  useEffect(() => {
    ensureSchema(DEFAULT_SCHEMA_ID);
  }, [ensureSchema]);

  const value = useMemo(
    () => ({
      schema,
      schemasById,
      availableSchemas: BUILTIN_SCHEMAS,
      isLoading,
      loadSchema,
      setSchema,
      ensureSchema,
      resolveSchema,
      registerCustomSchema,
    }),
    [schema, schemasById, isLoading, loadSchema, setSchema, ensureSchema, resolveSchema, registerCustomSchema],
  );

  return <SchemaContext.Provider value={value}>{children}</SchemaContext.Provider>;
}
