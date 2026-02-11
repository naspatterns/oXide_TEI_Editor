/**
 * File operations using the File System Access API (Chrome/Edge 86+).
 * Falls back to legacy methods when unavailable.
 */

import { hasFileSystemAccess, hasDirectoryPicker } from '../utils/browserCompat';
import type { FileTreeNode } from '../types/workspace';

const XML_FILE_TYPES = [
  {
    description: 'XML Files',
    accept: { 'application/xml': ['.xml', '.tei', '.rng'] },
  },
];

/** File extensions to include in file tree */
const XML_EXTENSIONS = ['.xml', '.tei', '.rng'];

/** Open an XML file using the best available API */
export async function openFile(): Promise<{
  content: string;
  fileName: string;
  fileHandle: FileSystemFileHandle | null;
}> {
  if (hasFileSystemAccess()) {
    return openWithFSA();
  }
  return openWithInput();
}

/** Save content to a file using the best available API */
export async function saveFile(
  content: string,
  fileHandle: FileSystemFileHandle | null,
  fileName: string | null,
): Promise<{
  fileName: string;
  fileHandle: FileSystemFileHandle | null;
}> {
  if (fileHandle && hasFileSystemAccess()) {
    return saveWithFSA(content, fileHandle);
  }
  return saveAsFile(content, fileName);
}

/** Save As — always prompts for new location */
export async function saveAsFile(
  content: string,
  suggestedName: string | null,
): Promise<{
  fileName: string;
  fileHandle: FileSystemFileHandle | null;
}> {
  if (hasFileSystemAccess()) {
    return saveAsWithFSA(content, suggestedName);
  }
  return saveWithDownload(content, suggestedName);
}

// ─── File System Access API implementations ───

async function openWithFSA(): Promise<{
  content: string;
  fileName: string;
  fileHandle: FileSystemFileHandle;
}> {
  const [handle] = await window.showOpenFilePicker({
    types: XML_FILE_TYPES,
    multiple: false,
  });
  const file = await handle.getFile();
  const content = await file.text();
  return { content, fileName: file.name, fileHandle: handle };
}

async function saveWithFSA(
  content: string,
  fileHandle: FileSystemFileHandle,
): Promise<{ fileName: string; fileHandle: FileSystemFileHandle }> {
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  const file = await fileHandle.getFile();
  return { fileName: file.name, fileHandle };
}

async function saveAsWithFSA(
  content: string,
  suggestedName: string | null,
): Promise<{ fileName: string; fileHandle: FileSystemFileHandle }> {
  const handle = await window.showSaveFilePicker({
    types: XML_FILE_TYPES,
    suggestedName: suggestedName ?? 'document.xml',
  });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  const file = await handle.getFile();
  return { fileName: file.name, fileHandle: handle };
}

// ─── Legacy fallback implementations ───

function openWithInput(): Promise<{
  content: string;
  fileName: string;
  fileHandle: null;
}> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml,.tei,.rng,application/xml';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      const content = await file.text();
      resolve({ content, fileName: file.name, fileHandle: null });
    };

    input.oncancel = () => reject(new Error('File selection cancelled'));
    input.click();
  });
}

function saveWithDownload(
  content: string,
  suggestedName: string | null,
): Promise<{ fileName: string; fileHandle: null }> {
  const fileName = suggestedName ?? 'document.xml';
  const blob = new Blob([content], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();

  URL.revokeObjectURL(url);
  return Promise.resolve({ fileName, fileHandle: null });
}

// ─── Directory operations ───

/** Check if directory picker is supported */
export function supportsDirectoryPicker(): boolean {
  return hasDirectoryPicker();
}

/** Error thrown when directory picker is not supported */
export class DirectoryPickerNotSupportedError extends Error {
  constructor() {
    super(
      'Folder opening requires Chrome or Edge browser. ' +
      'In Firefox or Safari, you can still open individual XML files.'
    );
    this.name = 'DirectoryPickerNotSupportedError';
  }
}

/** Open a directory using the Directory Picker API */
export async function openDirectory(): Promise<{
  handle: FileSystemDirectoryHandle;
  name: string;
}> {
  if (!hasDirectoryPicker()) {
    throw new DirectoryPickerNotSupportedError();
  }

  const handle = await window.showDirectoryPicker({
    mode: 'readwrite',
  });

  return { handle, name: handle.name };
}

/**
 * Build a file tree from a directory handle.
 * Only includes XML files and directories containing XML files.
 *
 * @param dirHandle - The directory handle to scan
 * @param basePath - Base path for relative paths (empty for root)
 * @param maxDepth - Maximum depth to scan (default 10)
 */
export async function buildFileTree(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string = '',
  maxDepth: number = 10,
): Promise<FileTreeNode[]> {
  if (maxDepth <= 0) return [];

  const nodes: FileTreeNode[] = [];

  try {
    for await (const [name, handle] of dirHandle.entries()) {
      // Skip hidden files/folders (starting with .)
      if (name.startsWith('.')) continue;

      const path = basePath ? `${basePath}/${name}` : name;

      if (handle.kind === 'directory') {
        // Recursively scan subdirectory
        const children = await buildFileTree(
          handle as FileSystemDirectoryHandle,
          path,
          maxDepth - 1,
        );

        // Only include directories that have XML files (directly or nested)
        if (children.length > 0) {
          nodes.push({
            name,
            path,
            type: 'directory',
            handle,
            children,
            isExpanded: false,
          });
        }
      } else {
        // Check if it's an XML file
        const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
        if (XML_EXTENSIONS.includes(ext)) {
          nodes.push({
            name,
            path,
            type: 'file',
            handle,
          });
        }
      }
    }
  } catch (error) {
    console.warn('Error scanning directory:', error);
  }

  // Sort: directories first, then files, both alphabetically
  return nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Read file content from a file handle.
 */
export async function readFileContent(
  handle: FileSystemFileHandle,
): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

/**
 * Save content to a file handle within a workspace.
 */
export async function saveToHandle(
  handle: FileSystemFileHandle,
  content: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Create a new file in a directory.
 */
export async function createFileInDirectory(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string,
): Promise<FileSystemFileHandle> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  await saveToHandle(fileHandle, content);
  return fileHandle;
}
