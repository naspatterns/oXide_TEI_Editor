import type { SchemaInfo, ElementSpec } from '../types/schema';
import { getTeiLiteElements, getTeiAllElements, getElementCounts } from './teiStaticSchema';
import { parseRng } from './rngParser';

/**
 * SchemaEngine is the central module for loading, parsing, and managing TEI schemas.
 * It provides ElementSpec[] data for autocompletion and validation.
 *
 * Built-in schemas are always freshly constructed from the static data
 * to avoid stale cache issues during development (HMR).
 * Custom schemas (uploaded .rng files) are cached since they're expensive to parse.
 */
export class SchemaEngine {
  private customCache = new Map<string, SchemaInfo>();

  /** Load a built-in schema by ID */
  async loadBuiltin(id: string): Promise<SchemaInfo> {
    let elements: ElementSpec[];
    let name: string;

    switch (id) {
      case 'tei_lite':
        elements = getTeiLiteElements();
        name = 'TEI Lite';
        break;
      case 'tei_all':
        // Triggers a one-time dynamic import of teiP5Generated (~528 KB).
        elements = await getTeiAllElements();
        name = 'TEI All';
        // Log element counts for diagnostics (dev mode only)
        if (import.meta.env.DEV) {
          const counts = await getElementCounts();
          console.log('[SchemaEngine] TEI All element counts:', counts);
          console.log(`[SchemaEngine] Total unique elements: ${elements.length}`);
        }
        break;
      default:
        throw new Error(`Unknown builtin schema: ${id}`);
    }

    return this.buildSchemaInfo(id, name, elements);
  }

  /** Load a custom schema from RNG XML string */
  async loadCustomRng(rngXml: string, name: string): Promise<SchemaInfo> {
    const id = `custom_${name}`;
    // Cache by CONTENT, not by name: re-uploading an edited schema with the
    // same file name must reflect the edits (previously it returned the
    // stale first parse until a full page reload).
    const cacheKey = `${id}#${hashString(rngXml)}`;
    const cached = this.customCache.get(cacheKey);
    if (cached) return cached;

    const elements = parseRng(rngXml);
    const info = this.buildSchemaInfo(id, name, elements);

    // Bound the cache — schema-iteration workflows would otherwise
    // accumulate one entry per edit for the whole session.
    if (this.customCache.size >= 8) {
      this.customCache.clear();
    }
    this.customCache.set(cacheKey, info);
    return info;
  }

  /** Build SchemaInfo from element specs */
  private buildSchemaInfo(id: string, name: string, elements: ElementSpec[]): SchemaInfo {
    const elementMap = new Map<string, ElementSpec>();
    for (const el of elements) {
      elementMap.set(el.name, el);
    }

    return {
      id,
      name,
      elements,
      elementMap,
      hasSalveGrammar: false,
    };
  }
}

/** djb2 — cheap, stable content fingerprint for the custom-schema cache. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Singleton engine instance */
export const schemaEngine = new SchemaEngine();
