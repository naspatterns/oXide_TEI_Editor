/**
 * Autosave module tests (P0, 2026-07).
 *
 * Pins the v0.2.4 redesign:
 *  - the interval snapshots ALL dirty documents, not just the active tab
 *  - the snapshot function is re-read at every tick (ref pattern in App)
 *  - an empty snapshot clears the stored record instead of writing one
 *  - the legacy single-document format is still readable (migration)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get, set, del } from 'idb-keyval';
import {
  startAutoSave,
  stopAutoSave,
  saveSnapshotToIDB,
  loadFromIDB,
  clearAutoSave,
  type AutosavedDocument,
} from '../src/file/autoSave';

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

const mockGet = vi.mocked(get);
const mockSet = vi.mocked(set);
const mockDel = vi.mocked(del);

const AUTOSAVE_KEY = 'tei-editor-autosave';

beforeEach(() => {
  vi.useFakeTimers();
  mockGet.mockReset();
  mockSet.mockReset().mockResolvedValue(undefined);
  mockDel.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  stopAutoSave();
  vi.useRealTimers();
});

describe('startAutoSave interval', () => {
  it('persists all dirty documents on each 30s tick', async () => {
    const snapshot: AutosavedDocument[] = [
      { fileName: 'a.xml', content: '<a/>' },
      { fileName: null, content: '<b/>' },
    ];
    startAutoSave(() => snapshot);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [key, data] = mockSet.mock.calls[0];
    expect(key).toBe(AUTOSAVE_KEY);
    expect(data).toEqual({
      documents: snapshot,
      timestamp: expect.any(Number),
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockSet).toHaveBeenCalledTimes(2);
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

  it('clears the stored record when nothing is dirty', async () => {
    startAutoSave(() => []);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockDel).toHaveBeenCalledWith(AUTOSAVE_KEY);
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

describe('loadFromIDB', () => {
  it('returns current-format data as-is', async () => {
    const data = {
      documents: [{ fileName: 'a.xml', content: '<a/>' }],
      timestamp: 123,
    };
    mockGet.mockResolvedValueOnce(data);

    expect(await loadFromIDB()).toEqual(data);
  });

  it('migrates the legacy single-document format', async () => {
    mockGet.mockResolvedValueOnce({
      content: '<old/>',
      fileName: 'old.xml',
      timestamp: 456,
    });

    expect(await loadFromIDB()).toEqual({
      documents: [{ fileName: 'old.xml', content: '<old/>' }],
      timestamp: 456,
    });
  });

  it('returns null for empty records', async () => {
    mockGet.mockResolvedValueOnce(undefined);
    expect(await loadFromIDB()).toBeNull();

    mockGet.mockResolvedValueOnce({ documents: [], timestamp: 1 });
    expect(await loadFromIDB()).toBeNull();

    mockGet.mockResolvedValueOnce({ content: '', fileName: null, timestamp: 1 });
    expect(await loadFromIDB()).toBeNull();
  });

  it('reports read failures through onError and returns null', async () => {
    const error = new Error('idb unavailable');
    mockGet.mockRejectedValueOnce(error);
    const onError = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await loadFromIDB(onError)).toBeNull();
    expect(onError).toHaveBeenCalledWith('load', error);
    warn.mockRestore();
  });
});

describe('clearAutoSave', () => {
  it('deletes the stored record and swallows errors', async () => {
    await clearAutoSave();
    expect(mockDel).toHaveBeenCalledWith(AUTOSAVE_KEY);

    mockDel.mockRejectedValueOnce(new Error('private mode'));
    await expect(clearAutoSave()).resolves.toBeUndefined();
  });
});
