import type { SchemaInfo, ElementSpec } from '../types/schema';
import { TEI_LITE_ELEMENTS, TEI_ALL_EXTRA_ELEMENTS } from './teiStaticSchema';
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

    switch (id) {
      case 'tei_lite':
        elements = TEI_LITE_ELEMENTS;
        break;
      case 'tei_all':
        elements = [...TEI_LITE_ELEMENTS, ...TEI_ALL_EXTRA_ELEMENTS];
        break;
      default:
        throw new Error(`Unknown builtin schema: ${id}`);
    }

    return this.buildSchemaInfo(id, id === 'tei_lite' ? 'TEI Lite' : 'TEI All', elements);
  }

  /** Load a custom schema from RNG XML string */
  async loadCustomRng(rngXml: string, name: string): Promise<SchemaInfo> {
    const id = `custom_${name}`;
    const cached = this.customCache.get(id);
    if (cached) return cached;

    const elements = parseRng(rngXml);
    const info = this.buildSchemaInfo(id, name, elements);
    this.customCache.set(id, info);
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

/** Singleton engine instance */
export const schemaEngine = new SchemaEngine();
