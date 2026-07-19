/**
 * Download-fallback save tests (save/recovery track, finding #14).
 *
 * On browsers without the File System Access API, saving falls back to a blob
 * download. The old code revoked the blob URL synchronously (racing the
 * download) and returned unconditional success, so the caller marked the doc
 * clean — the user saw "Saved" and could close with the content nowhere on
 * disk. The fix flags the result as `downloaded` (caller keeps it dirty) and
 * defers the revoke. These tests pin both.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Force the no-File-System-Access branch.
vi.mock('../src/utils/browserCompat', () => ({
  hasFileSystemAccess: () => false,
  hasDirectoryPicker: () => false,
}));

import { saveAsFile, saveFile } from '../src/file/fileSystemAccess';

let revoked: string[];
let clickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  revoked = [];
  // jsdom lacks blob-URL support; stub both sides.
  (URL.createObjectURL as unknown) = vi.fn(() => 'blob:mock-url');
  (URL.revokeObjectURL as unknown) = vi.fn((u: string) => revoked.push(u));
  // An <a download>.click() would try to navigate in jsdom — no-op it.
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  clickSpy.mockRestore();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('saveAsFile download fallback (no File System Access API)', () => {
  it('flags the result as downloaded with no durable handle', async () => {
    const result = await saveAsFile('<TEI/>', 'poem.xml');
    expect(result.downloaded).toBe(true);
    expect(result.fileHandle).toBeNull();
    expect(result.fileName).toBe('poem.xml');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('defers URL revocation instead of racing the download', async () => {
    await saveAsFile('<TEI/>', 'poem.xml');
    // Not revoked synchronously (that races the queued download navigation).
    expect(revoked).toHaveLength(0);
    vi.runAllTimers();
    expect(revoked).toEqual(['blob:mock-url']);
  });

  it('saveFile with no handle also falls back to a flagged download', async () => {
    const result = await saveFile('<TEI/>', null, 'untitled.xml');
    expect(result.downloaded).toBe(true);
    expect(result.fileHandle).toBeNull();
  });
});
