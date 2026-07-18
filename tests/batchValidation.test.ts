/**
 * Batch (corpus) validation core tests (P2, 2026-07).
 *
 * Uses fake FileSystemFileHandles (plain objects with getFile().text())
 * and the REAL validators/schemas, so a passing suite means the corpus
 * report agrees with what the editor shows per-file.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { runBatchValidation, flattenFileNodes } from '../src/file/batchValidation';
import { parseSchematron } from '../src/schema/schematron';
import { schemaEngine } from '../src/schema/SchemaEngine';
import type { SchemaInfo } from '../src/types/schema';
import type { FileTreeNode } from '../src/types/workspace';

function fakeFile(name: string, path: string, content: string): FileTreeNode {
  return {
    name,
    path,
    type: 'file',
    handle: {
      kind: 'file',
      name,
      getFile: async () => ({ text: async () => content }),
    } as unknown as FileSystemHandle,
  };
}

function fakeDir(name: string, path: string, children: FileTreeNode[]): FileTreeNode {
  return {
    name,
    path,
    type: 'directory',
    handle: { kind: 'directory', name } as unknown as FileSystemHandle,
    children,
    isExpanded: false,
  };
}

const VALID_TEI = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc>
    <titleStmt><title>t</title></titleStmt>
    <publicationStmt><p>u</p></publicationStmt>
    <sourceDesc><p>s</p></sourceDesc>
  </fileDesc></teiHeader>
  <text><body><p>ok</p></body></text>
</TEI>`;

const INVALID_TEI = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body><nosuchelement>x</nosuchelement></body></text>
</TEI>`;

const ALL_PI_TEI = `<?xml version="1.0"?>
<?xml-model href="http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_all.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><p>all</p></body></text></TEI>`;

let teiLite: SchemaInfo;
beforeAll(async () => {
  teiLite = await schemaEngine.loadBuiltin('tei_lite');
});

describe('flattenFileNodes', () => {
  it('collects files depth-first, skipping directories', () => {
    const tree = [
      fakeDir('sub', 'sub', [fakeFile('b.xml', 'sub/b.xml', ''), fakeFile('c.xml', 'sub/c.xml', '')]),
      fakeFile('a.xml', 'a.xml', ''),
    ];
    expect(flattenFileNodes(tree).map(f => f.path)).toEqual(['sub/b.xml', 'sub/c.xml', 'a.xml']);
  });
});

describe('runBatchValidation', () => {
  it('validates each file against its detected schema and counts severities', async () => {
    const tree = [
      fakeFile('good.xml', 'good.xml', VALID_TEI),
      fakeDir('poems', 'poems', [fakeFile('bad.xml', 'poems/bad.xml', INVALID_TEI)]),
    ];
    const resolver = vi.fn(async () => teiLite);

    const results = await runBatchValidation(tree, resolver, null);

    expect(results.map(r => r.path)).toEqual(['good.xml', 'poems/bad.xml']);
    const good = results[0];
    expect(good.errorCount).toBe(0);
    expect(good.warningCount).toBe(0);

    const bad = results[1];
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(bad.errors.some(e => e.message.includes('nosuchelement'))).toBe(true);
  });

  it('routes each file to its OWN detected schema id (M3 per-file)', async () => {
    const tree = [
      fakeFile('lite.xml', 'lite.xml', VALID_TEI),
      fakeFile('all.xml', 'all.xml', ALL_PI_TEI),
    ];
    const seen: string[] = [];
    const resolver = vi.fn(async (id: string) => { seen.push(id); return teiLite; });

    const results = await runBatchValidation(tree, resolver, null);

    expect(seen).toEqual(['tei_lite', 'tei_all']);
    expect(results[0].schemaId).toBe('tei_lite');
    expect(results[1].schemaId).toBe('tei_all');
  });

  it('layers Schematron diagnostics on top of schema validation', async () => {
    // No-namespace doc + no-namespace rules (jsdom-evaluable XPath)
    const sch = parseSchematron(
      `<schema xmlns="http://purl.oclc.org/dsdl/schematron"><pattern>
        <rule context="chapter"><assert test="@title">chapter needs title</assert></rule>
      </pattern></schema>`,
      'rules',
    );
    const tree = [fakeFile('book.xml', 'book.xml', '<book>\n<chapter/>\n</book>')];

    const results = await runBatchValidation(tree, async () => null, sch);

    expect(results[0].errors.some(e => e.message.includes('[Schematron] chapter needs title'))).toBe(true);
    expect(results[0].errors.find(e => e.message.includes('[Schematron]'))?.line).toBe(2);
  });

  it('reports unreadable files as a synthetic error instead of aborting the run', async () => {
    const broken: FileTreeNode = {
      name: 'broken.xml',
      path: 'broken.xml',
      type: 'file',
      handle: { kind: 'file', name: 'broken.xml', getFile: async () => { throw new Error('NotAllowedError'); } } as unknown as FileSystemHandle,
    };
    const tree = [broken, fakeFile('ok.xml', 'ok.xml', VALID_TEI)];

    const results = await runBatchValidation(tree, async () => teiLite, null);

    expect(results).toHaveLength(2);
    expect(results[0].errorCount).toBe(1);
    expect(results[0].errors[0].message).toContain('Could not read file');
    expect(results[1].errorCount).toBe(0);
  });

  it('reports progress per file and a final completion tick', async () => {
    const tree = [fakeFile('a.xml', 'a.xml', VALID_TEI), fakeFile('b.xml', 'b.xml', VALID_TEI)];
    const ticks: Array<{ done: number; total: number }> = [];

    await runBatchValidation(tree, async () => teiLite, null, p => ticks.push({ done: p.done, total: p.total }));

    expect(ticks).toEqual([
      { done: 0, total: 2 },
      { done: 1, total: 2 },
      { done: 2, total: 2 },
    ]);
  });

  it('returns an empty report for an empty workspace', async () => {
    expect(await runBatchValidation([], async () => teiLite, null)).toEqual([]);
  });
});
