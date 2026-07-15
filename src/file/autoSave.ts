/**
 * IndexedDB-based autosave using the lightweight idb-keyval library.
 * Every 30 seconds, snapshots ALL dirty documents (not just the active tab)
 * so a crash can recover a whole multi-tab session.
 *
 * All read/write entry points accept an optional `onError` callback so the
 * UI layer can surface failures (e.g. Private Mode in Firefox/Safari)
 * instead of relying on console warnings nobody will see.
 */
import { get, set, del } from 'idb-keyval';

const AUTOSAVE_KEY = 'tei-editor-autosave';
const AUTOSAVE_INTERVAL = 30_000; // 30 seconds

/** One document inside an autosave snapshot. */
export interface AutosavedDocument {
  fileName: string | null;
  content: string;
}

export interface AutosaveData {
  documents: AutosavedDocument[];
  timestamp: number;
}

/** Pre-v0.2.4 single-document format, still readable for recovery. */
interface LegacyAutosaveData {
  content: string;
  fileName: string | null;
  timestamp: number;
}

export type AutosaveErrorPhase = 'save' | 'load';
export type AutosaveErrorHandler = (phase: AutosaveErrorPhase, error: unknown) => void;

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start autosaving at regular intervals.
 *
 * `getSnapshot` is called at each tick and must return the documents worth
 * recovering (i.e. the dirty ones). The caller should hand in a stable
 * function that reads current state through a ref — the interval is created
 * once and must NOT be restarted on every keystroke, or it never fires.
 */
export function startAutoSave(
  getSnapshot: () => AutosavedDocument[],
  onError?: AutosaveErrorHandler,
) {
  stopAutoSave();
  timer = setInterval(() => {
    void saveSnapshotToIDB(getSnapshot(), onError);
  }, AUTOSAVE_INTERVAL);
}

/** Stop autosaving */
export function stopAutoSave() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Persist a snapshot. An empty snapshot (nothing dirty) clears the stored
 * record instead — everything is on disk, so there is nothing to recover
 * and no reason to prompt on next launch.
 */
export async function saveSnapshotToIDB(
  documents: AutosavedDocument[],
  onError?: AutosaveErrorHandler,
): Promise<void> {
  try {
    if (documents.length === 0) {
      await del(AUTOSAVE_KEY);
      return;
    }
    const data: AutosaveData = { documents, timestamp: Date.now() };
    await set(AUTOSAVE_KEY, data);
  } catch (error) {
    // IndexedDB unavailable (Private Mode, quota exceeded, ...) — log and
    // hand the error to the caller so the UI can decide how to react.
    console.warn('Autosave unavailable (IndexedDB error):', error);
    onError?.('save', error);
  }
}

/** Retrieve autosaved state (if any), migrating the legacy single-doc format. */
export async function loadFromIDB(
  onError?: AutosaveErrorHandler,
): Promise<AutosaveData | null> {
  try {
    const data = await get<AutosaveData | LegacyAutosaveData>(AUTOSAVE_KEY);
    if (!data) return null;

    if ('documents' in data) {
      return data.documents.length > 0 ? data : null;
    }

    if (typeof data.content === 'string' && data.content.length > 0) {
      return {
        documents: [{ fileName: data.fileName ?? null, content: data.content }],
        timestamp: data.timestamp,
      };
    }

    return null;
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
