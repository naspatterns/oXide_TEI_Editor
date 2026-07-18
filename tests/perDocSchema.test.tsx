/**
 * Per-document schema association (M3, 2026-07).
 *
 * Pins:
 *  - pure xml-model → schema-id detection (detectSchemaIdFromContent)
 *  - every open/create path stamps OpenDocument.schemaId
 *  - SET_TAB_SCHEMA rewires one document without touching its siblings
 *  - useActiveSchema resolves the ACTIVE tab's schema and follows tab
 *    switches (the app-level regression the audit called M3: two tabs with
 *    different xml-model PIs must not validate against one global schema)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { EditorProvider } from '../src/store/EditorContext';
import { SchemaProvider } from '../src/store/SchemaContext';
import { useEditor } from '../src/store/useEditor';
import { useActiveSchema } from '../src/hooks/useActiveSchema';
import {
  detectSchemaIdFromContent,
  resolveSchemaIdFromDeclarations,
  detectSchemaDeclarations,
} from '../src/utils/schemaDetector';

afterEach(cleanup);

const LITE_PI = '<?xml-model href="http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_lite.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>';
const ALL_PI = '<?xml-model href="http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_all.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>';

const liteDoc = `<?xml version="1.0"?>\n${LITE_PI}\n<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><p>lite</p></body></text></TEI>`;
const allDoc = `<?xml version="1.0"?>\n${ALL_PI}\n<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><p>all</p></body></text></TEI>`;
const noPiDoc = `<?xml version="1.0"?>\n<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><p>none</p></body></text></TEI>`;

describe('detectSchemaIdFromContent', () => {
  it('maps a tei_all xml-model href to tei_all', () => {
    expect(detectSchemaIdFromContent(allDoc)).toBe('tei_all');
  });

  it('maps a tei_lite xml-model href to tei_lite', () => {
    expect(detectSchemaIdFromContent(liteDoc)).toBe('tei_lite');
  });

  it('returns null when no declaration exists', () => {
    expect(detectSchemaIdFromContent(noPiDoc)).toBeNull();
  });

  it('returns null for a local custom .rng (cannot auto-load from disk)', () => {
    const doc = `<?xml-model href="./mySchema.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>\n<r/>`;
    expect(detectSchemaIdFromContent(doc)).toBeNull();
    // ...but the declaration itself is still detected (alert flow relies on it)
    expect(detectSchemaDeclarations(doc)).toHaveLength(1);
  });

  it('ignores non-rng declarations when resolving', () => {
    const decls = detectSchemaDeclarations(
      `<?xml-model href="http://example.com/tei_all.xsd" type="application/xml"?>\n<r/>`,
    );
    expect(resolveSchemaIdFromDeclarations(decls)).toBeNull();
  });
});

function setup() {
  return renderHook(
    () => ({ editor: useEditor(), activeSchema: useActiveSchema() }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <SchemaProvider>
          <EditorProvider>{children}</EditorProvider>
        </SchemaProvider>
      ),
    },
  );
}

describe('per-document schemaId on open/create', () => {
  it('stamps the detected schemaId when opening a file', () => {
    const { result } = setup();

    act(() => result.current.editor.openFileAsTab(allDoc, 'all.xml', null, null));

    expect(result.current.editor.getActiveDocument()?.schemaId).toBe('tei_all');
  });

  it('falls back to tei_lite when no declaration exists', () => {
    const { result } = setup();

    act(() => result.current.editor.openFileAsTab(noPiDoc, 'plain.xml', null, null));

    expect(result.current.editor.getActiveDocument()?.schemaId).toBe('tei_lite');
  });

  it('createNewTab default template resolves to tei_lite', () => {
    const { result } = setup();

    act(() => result.current.editor.createNewTab());

    expect(result.current.editor.getActiveDocument()?.schemaId).toBe('tei_lite');
  });

  it('setDocumentSchemaId rewires ONE document without touching siblings', () => {
    const { result } = setup();

    act(() => result.current.editor.openFileAsTab(liteDoc, 'a.xml', null, null));
    const aId = result.current.editor.multiTabState.activeDocumentId!;
    act(() => result.current.editor.openFileAsTab(liteDoc, 'b.xml', null, null));
    const bId = result.current.editor.multiTabState.activeDocumentId!;

    act(() => result.current.editor.setDocumentSchemaId(bId, 'custom_mySchema'));

    const docs = result.current.editor.multiTabState.openDocuments;
    expect(docs.find(d => d.id === aId)?.schemaId).toBe('tei_lite');
    expect(docs.find(d => d.id === bId)?.schemaId).toBe('custom_mySchema');
  });
});

describe('useActiveSchema follows the active tab', () => {
  it('resolves each tab to its own schema and switches with the tab', async () => {
    const { result } = setup();

    // Tab A: TEI Lite document
    act(() => result.current.editor.openFileAsTab(liteDoc, 'lite.xml', null, null));
    const liteTabId = result.current.editor.multiTabState.activeDocumentId!;

    await waitFor(() => expect(result.current.activeSchema?.id).toBe('tei_lite'));
    const liteCount = result.current.activeSchema!.elements.length;

    // Tab B: TEI All document — triggers the (real) tei_all load
    act(() => result.current.editor.openFileAsTab(allDoc, 'all.xml', null, null));

    await waitFor(() => expect(result.current.activeSchema?.id).toBe('tei_all'), { timeout: 15000 });
    expect(result.current.activeSchema!.elements.length).toBeGreaterThan(liteCount);

    // Switching back to tab A resolves TEI Lite again — per-tab isolation
    act(() => result.current.editor.setActiveTab(liteTabId));
    await waitFor(() => expect(result.current.activeSchema?.id).toBe('tei_lite'));
  }, 20000);
});
