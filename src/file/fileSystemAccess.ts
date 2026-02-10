/**
 * File operations using the File System Access API (Chrome/Edge 86+).
 * Falls back to legacy methods when unavailable.
 */

import { hasFileSystemAccess } from '../utils/browserCompat';

const XML_FILE_TYPES = [
  {
    description: 'XML Files',
    accept: { 'application/xml': ['.xml', '.tei', '.rng'] },
  },
];

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
