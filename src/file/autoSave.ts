/**
 * IndexedDB-based autosave using the lightweight idb-keyval library.
 * Saves document state every 30 seconds, recoverable after crash.
 *
 * All read/write entry points accept an optional `onError` callback so the
 * UI layer can surface failures (e.g. Private Mode in Firefox/Safari)
 * instead of relying on console warnings nobody will see.
 */
import { get, set, del } from 'idb-keyval';

const AUTOSAVE_KEY = 'tei-editor-autosave';
const AUTOSAVE_INTERVAL = 30_000; // 30 seconds

interface AutosaveData {
  content: string;
  fileName: string | null;
  timestamp: number;
}

export type AutosaveErrorPhase = 'save' | 'load';
export type AutosaveErrorHandler = (phase: AutosaveErrorPhase, error: unknown) => void;

let timer: ReturnType<typeof setInterval> | null = null;

/** Start autosaving at regular intervals. */
export function startAutoSave(
  getContent: () => { content: string; fileName: string | null },
  onError?: AutosaveErrorHandler,
) {
  stopAutoSave();
  timer = setInterval(async () => {
    const { content, fileName } = getContent();
    await saveToIDB(content, fileName, onError);
  }, AUTOSAVE_INTERVAL);
}

/** Stop autosaving */
export function stopAutoSave() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Save current state to IndexedDB. */
export async function saveToIDB(
  content: string,
  fileName: string | null,
  onError?: AutosaveErrorHandler,
): Promise<void> {
  try {
    const data: AutosaveData = {
      content,
      fileName,
      timestamp: Date.now(),
    };
    await set(AUTOSAVE_KEY, data);
  } catch (error) {
    // IndexedDB unavailable (Private Mode, quota exceeded, ...) — log and
    // hand the error to the caller so the UI can decide how to react.
    console.warn('Autosave unavailable (IndexedDB error):', error);
    onError?.('save', error);
  }
}

/** Retrieve autosaved state (if any). */
export async function loadFromIDB(
  onError?: AutosaveErrorHandler,
): Promise<AutosaveData | null> {
  try {
    const data = await get<AutosaveData>(AUTOSAVE_KEY);
    return data ?? null;
  } catch (error) {
    console.warn('Autosave recovery unavailable (IndexedDB error):', error);
    onError?.('load', error);
    return null;
  }
}

/** Clear autosaved state (handles Private Mode) */
export async function clearAutoSave(): Promise<void> {
  try {
    await del(AUTOSAVE_KEY);
  } catch {
    // Ignore — no data to clear in Private Mode
  }
}
