import { useEffect, useState } from 'react';
import type { SchemaInfo } from '../types/schema';
import { useEditor } from '../store/useEditor';
import { useSchema } from '../store/useSchema';

/**
 * Resolve the ACTIVE document's schema (M3 per-document schema).
 *
 * Joins EditorContext (which knows the active tab's `schemaId`) with the
 * SchemaContext registry (which holds loaded SchemaInfo objects) — the same
 * two-provider join pattern as useWrapSelection, so EditorProvider stays
 * decoupled from SchemaContext.
 *
 * While a schema is still loading (e.g. first switch to the lazy tei_all),
 * the previously-resolved schema is returned instead of null so completion/
 * validation don't flash to "no schema" on tab focus.
 */
export function useActiveSchema(): SchemaInfo | null {
  const { getActiveDocument } = useEditor();
  const { resolveSchema, ensureSchema } = useSchema();

  const schemaId = getActiveDocument()?.schemaId ?? 'tei_lite';
  const resolved = resolveSchema(schemaId);

  // Kick off (idempotent) loading for ids not yet in the registry.
  useEffect(() => {
    void ensureSchema(schemaId);
  }, [schemaId, ensureSchema]);

  // Hold the last non-null resolution to bridge async loads (render-time
  // derived-state pattern — same as QuickTagMenu's prevFilter).
  const [lastResolved, setLastResolved] = useState<SchemaInfo | null>(null);
  if (resolved && resolved !== lastResolved) {
    setLastResolved(resolved);
  }

  return resolved ?? lastResolved;
}
