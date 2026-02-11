/** Whether the File System Access API is available (Chrome/Edge 86+) */
export function hasFileSystemAccess(): boolean {
  return 'showOpenFilePicker' in window;
}

/** Whether the Directory Picker is available (Chrome/Edge 86+) */
export function hasDirectoryPicker(): boolean {
  return 'showDirectoryPicker' in window;
}

/** Whether IndexedDB is available */
export function hasIndexedDB(): boolean {
  return 'indexedDB' in window;
}

/** Whether Service Workers are available */
export function hasServiceWorker(): boolean {
  return 'serviceWorker' in navigator;
}
