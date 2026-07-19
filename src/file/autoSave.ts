/**
 * IndexedDB-based autosave using the lightweight idb-keyval library.
 *
 * Every 30 seconds, snapshots ALL dirty documents (not just the active tab)
 * so a crash can recover a whole multi-tab session.
 *
 * MULTI-INSTANCE ISOLATION (P2): each app instance (page load) owns its own
 * record, keyed `tei-editor-autosave:<instanceId>`. Two browser tabs of the
 * app therefore never overwrite each other's recovery copy. On startup an
 * instance offers recovery only from records belonging to instances that are
 * NOT currently alive — determined by a BroadcastChannel ping, not by a
 * timestamp heuristic (a just-crashed instance's record is recent yet must
 * still be offered; a live sibling's record is recent and must NOT be).
 *
 * All read/write entry points accept an optional `onError` callback so the
 * UI layer can surface failures (e.g. Private Mode in Firefox/Safari)
 * instead of relying on console warnings nobody will see.
 */
import { get, set, del, keys } from 'idb-keyval';

const AUTOSAVE_PREFIX = 'tei-editor-autosave'; // also the pre-P2 single key
const LIVENESS_CHANNEL = 'oxide-autosave-liveness';
// Only the BroadcastChannel FALLBACK waits this long (Web Locks is instant and
// deterministic). Kept generous so a briefly-busy sibling still answers in time.
const LIVENESS_WAIT_MS = 1000;
const AUTOSAVE_INTERVAL = 30_000; // 30 seconds
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // records older than this are GC'd

/** Stable per-page-load identifier for this app instance. */
function generateInstanceId(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid;
  } catch {
    // crypto unavailable — fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const INSTANCE_ID = generateInstanceId();
const SELF_KEY = `${AUTOSAVE_PREFIX}:${INSTANCE_ID}`;

/** One document inside an autosave snapshot. */
export interface AutosavedDocument {
  fileName: string | null;
  content: string;
}

/** The record this instance writes to IndexedDB. */
export interface InstanceSnapshot {
  instanceId: string;
  documents: AutosavedDocument[];
  timestamp: number;
}

/** A recovery candidate handed to the UI (carries its source key for clearing). */
export interface RecoverableSnapshot {
  documents: AutosavedDocument[];
  timestamp: number;
  /** IndexedDB key this snapshot came from — pass to clearSnapshotByKey. */
  sourceKey: string;
  /** Owning instance id, or null for a migrated legacy record. */
  instanceId: string | null;
}

/** Pre-P2 multi-doc format ({documents,timestamp}) and pre-v0.2.4 single-doc format. */
interface LegacyMultiDoc { documents: AutosavedDocument[]; timestamp: number; }
interface LegacySingleDoc { content: string; fileName: string | null; timestamp: number; }

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
 * Persist THIS instance's snapshot. An empty snapshot (nothing dirty) clears
 * this instance's record instead — everything is on disk, so there is nothing
 * to recover and no reason to prompt (or linger) on next launch.
 */
export async function saveSnapshotToIDB(
  documents: AutosavedDocument[],
  onError?: AutosaveErrorHandler,
): Promise<void> {
  try {
    if (documents.length === 0) {
      await del(SELF_KEY);
      return;
    }
    const data: InstanceSnapshot = { instanceId: INSTANCE_ID, documents, timestamp: Date.now() };
    await set(SELF_KEY, data);
  } catch (error) {
    // IndexedDB unavailable (Private Mode, quota exceeded, ...) — log and
    // hand the error to the caller so the UI can decide how to react.
    console.warn('Autosave unavailable (IndexedDB error):', error);
    onError?.('save', error);
  }
}

// ─── Liveness (which instances are currently alive) ───
//
// Primary mechanism: the Web Locks API. Each instance holds an exclusive lock
// named by its id for its whole lifetime, so a peer can tell — DETERMINISTICALLY
// and with no timing window — whether we are alive by finding that lock
// unavailable. This replaces the old fixed 250 ms BroadcastChannel ping window,
// which misclassified a sibling whose main thread was busy (corpus validation,
// a heavy Schematron pass) as crashed and then deleted its live recovery record
// (audit P5). BroadcastChannel remains the fallback for browsers without locks.

const LOCK_PREFIX = 'oxide-autosave-lock';
const instanceLockName = (id: string): string => `${LOCK_PREFIX}:${id}`;

function locksAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
}

let responder: BroadcastChannel | null = null;
let selfLockHeld = false;

/**
 * Begin advertising this instance as alive. Call once on startup. Without it, a
 * live sibling would look dead and its open document would be wrongly offered
 * for recovery — and its record deleted — in a newly-opened tab.
 */
export function initAutosaveLiveness(): void {
  // Hold a lifetime lock so peers can detect us via the Web Locks API. The
  // callback returns a promise that never settles, so the lock stays held until
  // this page is destroyed (which releases it automatically).
  if (!selfLockHeld && locksAvailable()) {
    selfLockHeld = true;
    try {
      void navigator.locks.request(instanceLockName(INSTANCE_ID), { mode: 'exclusive' }, () =>
        new Promise<never>(() => { /* held until page unload */ }),
      );
    } catch {
      selfLockHeld = false;
    }
  }

  // Fallback liveness (no Web Locks): answer pings from other instances.
  if (responder || typeof BroadcastChannel === 'undefined') return;
  try {
    responder = new BroadcastChannel(LIVENESS_CHANNEL);
    responder.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'ping' && e.data.from !== INSTANCE_ID) {
        responder?.postMessage({ type: 'pong', from: INSTANCE_ID });
      }
    };
  } catch {
    responder = null;
  }
}

/**
 * Return the ids (among `candidateIds`) of instances that are currently alive.
 *
 * Prefers the Web Locks API: an instance is alive iff its lifetime lock is
 * unavailable (held). Deterministic, no timing window — a busy-but-alive
 * sibling can no longer be mistaken for crashed. Falls back to a
 * BroadcastChannel ping when Web Locks is unavailable. An empty result means
 * "none detected alive", so every candidate is offered (crash-safe).
 */
async function getLiveInstanceIds(candidateIds: string[]): Promise<Set<string>> {
  if (locksAvailable()) {
    const live = new Set<string>();
    await Promise.all(
      candidateIds.map(async (id) => {
        if (await isInstanceLockHeld(id)) live.add(id);
      }),
    );
    return live;
  }
  return getLiveInstanceIdsViaChannel();
}

/**
 * True when instance `id`'s lifetime lock is held (i.e. it is alive). `ifAvailable`
 * makes this non-blocking: a held lock yields a null grant (→ alive); a free
 * lock is granted momentarily (callback returns immediately, releasing it) → dead.
 */
function isInstanceLockHeld(id: string): Promise<boolean> {
  return navigator.locks
    .request(instanceLockName(id), { ifAvailable: true, mode: 'exclusive' }, (lock) => lock === null)
    .catch(() => false);
}

/**
 * BroadcastChannel fallback: ping and collect whoever answers within the
 * window. Returns an empty set when BroadcastChannel is unavailable.
 */
function getLiveInstanceIdsViaChannel(timeoutMs: number = LIVENESS_WAIT_MS): Promise<Set<string>> {
  const live = new Set<string>();
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(live);

  return new Promise((resolve) => {
    let ch: BroadcastChannel;
    try {
      ch = new BroadcastChannel(LIVENESS_CHANNEL);
    } catch {
      resolve(live);
      return;
    }
    ch.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'pong' && e.data.from !== INSTANCE_ID) {
        live.add(e.data.from);
      }
    };
    try {
      ch.postMessage({ type: 'ping', from: INSTANCE_ID });
    } catch {
      // ignore — resolve with whatever answered
    }
    setTimeout(() => {
      try { ch.close(); } catch { /* already closed */ }
      resolve(live);
    }, timeoutMs);
  });
}

// ─── Recovery ───

function migrateLegacy(value: LegacyMultiDoc | LegacySingleDoc | undefined): { documents: AutosavedDocument[]; timestamp: number } | null {
  if (!value) return null;
  if ('documents' in value) {
    return value.documents.length > 0 ? { documents: value.documents, timestamp: value.timestamp } : null;
  }
  if (typeof value.content === 'string' && value.content.length > 0) {
    return { documents: [{ fileName: value.fileName ?? null, content: value.content }], timestamp: value.timestamp };
  }
  return null;
}

/**
 * Read every OTHER instance's snapshot from IndexedDB (plus a migrated legacy
 * record if present). GC's records older than 24h as a side effect. Pure of
 * liveness — see {@link pickRecoverable}.
 *
 * Exported for tests.
 */
export async function collectSnapshots(onError?: AutosaveErrorHandler): Promise<RecoverableSnapshot[]> {
  try {
    const allKeys = await keys();
    const out: RecoverableSnapshot[] = [];
    const now = Date.now();

    for (const rawKey of allKeys) {
      if (typeof rawKey !== 'string') continue;
      if (rawKey === SELF_KEY) continue;

      if (rawKey === AUTOSAVE_PREFIX) {
        // Pre-P2 legacy single record
        const migrated = migrateLegacy(await get(rawKey));
        if (migrated && now - migrated.timestamp < MAX_AGE_MS) {
          out.push({ ...migrated, sourceKey: rawKey, instanceId: null });
        } else if (migrated) {
          await del(rawKey); // stale — GC
        }
        continue;
      }

      if (rawKey.startsWith(`${AUTOSAVE_PREFIX}:`)) {
        const snap = await get<InstanceSnapshot>(rawKey);
        if (snap?.documents?.length) {
          if (now - snap.timestamp < MAX_AGE_MS) {
            out.push({ documents: snap.documents, timestamp: snap.timestamp, sourceKey: rawKey, instanceId: snap.instanceId ?? null });
          } else {
            await del(rawKey); // stale — GC
          }
        }
      }
    }
    return out;
  } catch (error) {
    console.warn('Autosave recovery unavailable (IndexedDB error):', error);
    onError?.('load', error);
    return [];
  }
}

/**
 * Choose the most recent snapshot whose owning instance is NOT currently
 * alive. Legacy records (instanceId null) are always eligible. Pure —
 * exported for tests.
 */
export function pickRecoverable(candidates: RecoverableSnapshot[], liveIds: Set<string>): RecoverableSnapshot | null {
  let best: RecoverableSnapshot | null = null;
  for (const c of candidates) {
    if (c.instanceId !== null && liveIds.has(c.instanceId)) continue; // owned by a live tab
    if (!best || c.timestamp > best.timestamp) best = c;
  }
  return best;
}

/**
 * Retrieve a recoverable snapshot from a crashed/closed instance, or null.
 * Waits briefly for live instances to answer a liveness ping so that a
 * document open in another tab is not offered here.
 */
export async function loadRecoverableSnapshots(onError?: AutosaveErrorHandler): Promise<RecoverableSnapshot | null> {
  const candidates = await collectSnapshots(onError);
  if (candidates.length === 0) return null;
  // Only real (non-legacy) instance ids can be probed for liveness; legacy
  // records (instanceId null) are always eligible via pickRecoverable.
  const candidateIds = candidates
    .map((c) => c.instanceId)
    .filter((id): id is string => id !== null);
  const liveIds = await getLiveInstanceIds(candidateIds);
  return pickRecoverable(candidates, liveIds);
}

/** Delete a specific snapshot record (used when recovering or discarding). */
export async function clearSnapshotByKey(key: string): Promise<void> {
  try {
    await del(key);
  } catch {
    // Ignore — Private Mode / already gone
  }
}

/** Clear THIS instance's snapshot (handles Private Mode). */
export async function clearAutoSave(): Promise<void> {
  await clearSnapshotByKey(SELF_KEY);
}
