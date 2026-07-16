/**
 * Autosave module tests (P0 redesign + P2 multi-instance isolation).
 *
 * Pins:
 *  - the interval snapshots ALL dirty documents under a PER-INSTANCE key
 *  - the snapshot function is re-read at every tick (ref pattern in App)
 *  - an empty snapshot clears this instance's record instead of writing one
 *  - collectSnapshots reads OTHER instances' records, migrates the legacy
 *    formats, and GC's records older than 24h
 *  - pickRecoverable never offers a record owned by a live instance, always
 *    offers legacy (instanceId null), and picks the most recent otherwise
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get, set, del, keys } from 'idb-keyval';
import {
  startAutoSave,
  stopAutoSave,
  saveSnapshotToIDB,
  collectSnapshots,
  pickRecoverable,
  clearSnapshotByKey,
  clearAutoSave,
  INSTANCE_ID,
  type AutosavedDocument,
  type RecoverableSnapshot,
} from '../src/file/autoSave';

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
}));

const mockGet = vi.mocked(get);
const mockSet = vi.mocked(set);
const mockDel = vi.mocked(del);
const mockKeys = vi.mocked(keys);

const PREFIX = 'tei-editor-autosave';
const SELF_KEY = `${PREFIX}:${INSTANCE_ID}`;
const BASE = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  mockGet.mockReset();
  mockSet.mockReset().mockResolvedValue(undefined);
  mockDel.mockReset().mockResolvedValue(undefined);
  mockKeys.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  stopAutoSave();
  vi.useRealTimers();
});

describe('startAutoSave interval', () => {
  it('persists all dirty documents to THIS instance key each 30s tick', async () => {
    const snapshot: AutosavedDocument[] = [
      { fileName: 'a.xml', content: '<a/>' },
      { fileName: null, content: '<b/>' },
    ];
    startAutoSave(() => snapshot);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [key, data] = mockSet.mock.calls[0];
    expect(key).toBe(SELF_KEY);
    // The tick fires after 30s of fake time, so Date.now() == BASE + 30_000.
    expect(data).toEqual({ instanceId: INSTANCE_ID, documents: snapshot, timestamp: BASE + 30_000 });
  });

  it('re-reads the snapshot at every tick (latest state wins)', async () => {
    let current: AutosavedDocument[] = [{ fileName: 'a.xml', content: 'v1' }];
    startAutoSave(() => current);

    await vi.advanceTimersByTimeAsync(30_000);
    current = [{ fileName: 'a.xml', content: 'v2' }];
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect((mockSet.mock.calls[1][1] as { documents: AutosavedDocument[] }).documents[0].content).toBe('v2');
  });

  it('clears this instance record when nothing is dirty', async () => {
    startAutoSave(() => []);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockDel).toHaveBeenCalledWith(SELF_KEY);
  });

  it('stopAutoSave stops the interval', async () => {
    startAutoSave(() => [{ fileName: 'a.xml', content: 'x' }]);
    stopAutoSave();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe('saveSnapshotToIDB', () => {
  it('reports write failures through onError instead of throwing', async () => {
    const error = new Error('quota exceeded');
    mockSet.mockRejectedValueOnce(error);
    const onError = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await saveSnapshotToIDB([{ fileName: 'a.xml', content: 'x' }], onError);
    expect(onError).toHaveBeenCalledWith('save', error);
    warn.mockRestore();
  });
});

describe('collectSnapshots', () => {
  function stubStore(store: Record<string, unknown>) {
    mockKeys.mockResolvedValue(Object.keys(store));
    mockGet.mockImplementation((k: unknown) => Promise.resolve(store[k as string]));
  }

  it('excludes this instance own key and returns other instances', async () => {
    stubStore({
      [SELF_KEY]: { instanceId: INSTANCE_ID, documents: [{ fileName: 'self.xml', content: 'x' }], timestamp: BASE },
      [`${PREFIX}:other`]: { instanceId: 'other', documents: [{ fileName: 'o.xml', content: 'y' }], timestamp: BASE - 1000 },
    });
    const result = await collectSnapshots();
    expect(result).toHaveLength(1);
    expect(result[0].instanceId).toBe('other');
    expect(result[0].sourceKey).toBe(`${PREFIX}:other`);
    expect(result[0].documents[0].fileName).toBe('o.xml');
  });

  it('migrates the pre-P2 multi-doc legacy key', async () => {
    stubStore({ [PREFIX]: { documents: [{ fileName: 'legacy.xml', content: 'z' }], timestamp: BASE - 5000 } });
    const result = await collectSnapshots();
    expect(result).toHaveLength(1);
    expect(result[0].instanceId).toBeNull();
    expect(result[0].sourceKey).toBe(PREFIX);
  });

  it('migrates the pre-v0.2.4 single-doc legacy key', async () => {
    stubStore({ [PREFIX]: { content: '<old/>', fileName: 'old.xml', timestamp: BASE - 5000 } });
    const result = await collectSnapshots();
    expect(result[0].documents).toEqual([{ fileName: 'old.xml', content: '<old/>' }]);
  });

  it('GC deletes records older than 24h and does not return them', async () => {
    stubStore({
      [`${PREFIX}:stale`]: { instanceId: 'stale', documents: [{ fileName: 's.xml', content: 'q' }], timestamp: BASE - DAY - 1 },
    });
    const result = await collectSnapshots();
    expect(result).toHaveLength(0);
    expect(mockDel).toHaveBeenCalledWith(`${PREFIX}:stale`);
  });

  it('reports read failures through onError and returns empty', async () => {
    const error = new Error('idb down');
    mockKeys.mockRejectedValueOnce(error);
    const onError = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await collectSnapshots(onError)).toEqual([]);
    expect(onError).toHaveBeenCalledWith('load', error);
    warn.mockRestore();
  });
});

describe('pickRecoverable', () => {
  const mk = (instanceId: string | null, timestamp: number): RecoverableSnapshot => ({
    instanceId,
    timestamp,
    sourceKey: `${PREFIX}:${instanceId ?? 'legacy'}`,
    documents: [{ fileName: 'd.xml', content: 'c' }],
  });

  it('never offers a record owned by a live instance', () => {
    const live = new Set(['A']);
    expect(pickRecoverable([mk('A', BASE)], live)).toBeNull();
  });

  it('offers a crashed (non-live) instance record even if recent', () => {
    const live = new Set(['A']); // A is live, B crashed
    const picked = pickRecoverable([mk('B', BASE)], live);
    expect(picked?.instanceId).toBe('B');
  });

  it('always offers legacy records (instanceId null)', () => {
    expect(pickRecoverable([mk(null, BASE)], new Set())?.instanceId).toBeNull();
  });

  it('picks the most recent eligible record', () => {
    const picked = pickRecoverable(
      [mk('B', BASE - 10_000), mk('C', BASE), mk('D', BASE - 5000)],
      new Set(),
    );
    expect(picked?.instanceId).toBe('C');
  });

  it('skips live and picks the newest of the rest', () => {
    const picked = pickRecoverable(
      [mk('A', BASE), mk('B', BASE - 1000)],
      new Set(['A']),
    );
    expect(picked?.instanceId).toBe('B');
  });
});

describe('clearSnapshotByKey / clearAutoSave', () => {
  it('deletes the given key and swallows errors', async () => {
    await clearSnapshotByKey(`${PREFIX}:x`);
    expect(mockDel).toHaveBeenCalledWith(`${PREFIX}:x`);

    mockDel.mockRejectedValueOnce(new Error('private mode'));
    await expect(clearSnapshotByKey(`${PREFIX}:y`)).resolves.toBeUndefined();
  });

  it('clearAutoSave clears this instance own record', async () => {
    await clearAutoSave();
    expect(mockDel).toHaveBeenCalledWith(SELF_KEY);
  });
});
