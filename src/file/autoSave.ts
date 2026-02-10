/**
 * IndexedDB-based autosave using the lightweight idb-keyval library.
 * Saves document state every 30 seconds, recoverable after crash.
 */
import { get, set, del } from 'idb-keyval';

const AUTOSAVE_KEY = 'tei-editor-autosave';
const AUTOSAVE_INTERVAL = 30_000; // 30 seconds

interface AutosaveData {
  content: string;
  fileName: string | null;
  timestamp: number;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start autosaving at regular intervals */
export function startAutoSave(getContent: () => { content: string; fileName: string | null }) {
  stopAutoSave();
  timer = setInterval(async () => {
    const { content, fileName } = getContent();
    await saveToIDB(content, fileName);
  }, AUTOSAVE_INTERVAL);
}

/** Stop autosaving */
export function stopAutoSave() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Save current state to IndexedDB */
export async function saveToIDB(content: string, fileName: string | null): Promise<void> {
  const data: AutosaveData = {
    content,
    fileName,
    timestamp: Date.now(),
  };
  await set(AUTOSAVE_KEY, data);
}

/** Retrieve autosaved state (if any) */
export async function loadFromIDB(): Promise<AutosaveData | null> {
  const data = await get<AutosaveData>(AUTOSAVE_KEY);
  return data ?? null;
}

/** Clear autosaved state */
export async function clearAutoSave(): Promise<void> {
  await del(AUTOSAVE_KEY);
}
