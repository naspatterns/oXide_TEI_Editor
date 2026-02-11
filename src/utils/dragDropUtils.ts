/**
 * Drag and Drop Utilities
 */

const ALLOWED_EXTENSIONS = ['.xml', '.tei', '.rng'];

/** Check if a file name has a valid XML extension. */
export function isValidXmlFile(fileName: string): boolean {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = fileName.toLowerCase().slice(lastDot);
  return ALLOWED_EXTENSIONS.includes(ext);
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal Drag Data Store
// ═══════════════════════════════════════════════════════════════════════════
// HTML5 dataTransfer only stores strings, but FileSystemFileHandle can't be
// serialized. We store handles in a Map and pass only the ID via dataTransfer.
// ═══════════════════════════════════════════════════════════════════════════

/** MIME type for internal drag operations */
export const INTERNAL_DRAG_TYPE = 'application/x-oxide-file';

/** Data stored for internal drag operations */
export interface InternalDragData {
  filePath: string;
  fileHandle: FileSystemFileHandle;
  fileName: string;
}

const dragDataStore = new Map<string, InternalDragData>();
let dragIdCounter = 0;

/** Generate a unique ID and store drag data. Returns the ID. */
export function setDragData(data: InternalDragData): string {
  const id = `drag-${++dragIdCounter}`;
  dragDataStore.set(id, data);
  return id;
}

/** Retrieve and remove drag data by ID. */
export function getDragData(id: string): InternalDragData | undefined {
  const data = dragDataStore.get(id);
  dragDataStore.delete(id);
  return data;
}
