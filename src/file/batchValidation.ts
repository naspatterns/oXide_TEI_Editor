/**
 * Batch (corpus) validation core — P2's last item.
 *
 * Validates every XML file in the workspace tree against its OWN detected
 * schema (M3) plus the optional app-level Schematron ruleset, reusing the
 * exact validators the editor runs per keystroke. Pure of React: the
 * caller supplies a schema resolver and receives progress callbacks, so
 * this module is unit-testable with fake file handles.
 */

import type { FileTreeNode } from '../types/workspace';
import type { SchemaInfo, ValidationError } from '../types/schema';
import { validateXml } from '../schema/xmlValidator';
import { validateSchematron, type SchematronSchema } from '../schema/schematron';
import { detectSchemaIdFromContent } from '../utils/schemaDetector';
import { readFileContent } from './fileSystemAccess';

export interface BatchFileResult {
  /** Workspace-relative path (FileTreeNode.path). */
  path: string;
  fileName: string;
  /** Schema the file was validated against. */
  schemaId: string;
  errors: ValidationError[];
  errorCount: number;
  warningCount: number;
}

export type SchemaResolver = (schemaId: string) => Promise<SchemaInfo | null>;

export interface BatchProgress {
  done: number;
  total: number;
  currentPath: string;
}

/** Flatten the workspace tree into file nodes only, in tree order. */
export function flattenFileNodes(tree: FileTreeNode[]): FileTreeNode[] {
  const out: FileTreeNode[] = [];
  const walk = (nodes: FileTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === 'file') out.push(node);
      if (node.children) walk(node.children);
    }
  };
  walk(tree);
  return out;
}

/**
 * Validate every file in the tree. Never throws for individual files — a
 * file that cannot be read yields a synthetic error result so the corpus
 * report stays complete.
 */
export async function runBatchValidation(
  tree: FileTreeNode[],
  resolveSchema: SchemaResolver,
  schematron: SchematronSchema | null,
  onProgress?: (progress: BatchProgress) => void,
): Promise<BatchFileResult[]> {
  const files = flattenFileNodes(tree);
  const results: BatchFileResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const node = files[i];
    onProgress?.({ done: i, total: files.length, currentPath: node.path });

    let errors: ValidationError[];
    let schemaId = 'tei_lite';

    try {
      // FileTreeNode.handle is typed FileSystemHandle; file nodes always
      // carry a FileSystemFileHandle (buildFileTree only stores files here).
      const content = await readFileContent(node.handle as FileSystemFileHandle);
      schemaId = detectSchemaIdFromContent(content) ?? 'tei_lite';
      const schema = await resolveSchema(schemaId);
      errors = validateXml(content, schema);
      if (schematron) {
        errors.push(...validateSchematron(content, schematron));
      }
    } catch (err) {
      errors = [{
        message: `Could not read file: ${err instanceof Error ? err.message : 'unknown error'}`,
        line: 1,
        column: 1,
        severity: 'error',
      }];
    }

    results.push({
      path: node.path,
      fileName: node.name,
      schemaId,
      errors,
      errorCount: errors.filter(e => e.severity === 'error').length,
      warningCount: errors.filter(e => e.severity === 'warning').length,
    });

    // Yield to the UI thread between files so a large corpus doesn't
    // freeze rendering (progress stays visible).
    if (i % 5 === 4) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  onProgress?.({ done: files.length, total: files.length, currentPath: '' });
  return results;
}
