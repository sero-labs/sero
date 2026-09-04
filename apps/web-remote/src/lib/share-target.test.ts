import { describe, expect, it, beforeEach, vi } from 'vitest';
import { clearShareFlag, hasSharedFile, takeSharedFile } from './share-target';

/** A cache holding one shared file, the way the worker leaves it. */
function installCaches(entry: Response | null): { deleted: string[] } {
  const deleted: string[] = [];
  const cache = {
    match: vi.fn(async () => entry ?? undefined),
    delete: vi.fn(async (key: string) => {
      deleted.push(key);
      return true;
    }),
  };
  Reflect.set(globalThis, 'caches', { open: vi.fn(async () => cache) });
  return { deleted };
}

beforeEach(() => {
  Reflect.deleteProperty(globalThis, 'caches');
});

describe('hasSharedFile', () => {
  it('is true for the query the worker redirects with', () => {
    expect(hasSharedFile('?share=file')).toBe(true);
  });

  it('is false for any other load', () => {
    expect(hasSharedFile('')).toBe(false);
    expect(hasSharedFile('?workspace=ws-1')).toBe(false);
  });
});

describe('takeSharedFile', () => {
  it('reads the file, with the name the worker recorded', async () => {
    installCaches(new Response('hello', {
      headers: {
        'Content-Type': 'text/plain',
        'X-Shared-Name': encodeURIComponent('notes from a walk.txt'),
      },
    }));

    const file = await takeSharedFile();

    expect(file?.name).toBe('notes from a walk.txt');
    expect(file?.type).toBe('text/plain');
    // The bytes are not asserted: jsdom's `File` constructor turns a
    // Blob part into the string "[object Blob]", which says nothing
    // about a real browser.
  });

  it('removes the entry, so a reload does not upload it twice', async () => {
    const { deleted } = installCaches(new Response('hello'));

    await takeSharedFile();

    expect(deleted).toEqual(['/shared-file']);
  });

  it('is null when nothing was shared', async () => {
    installCaches(null);

    expect(await takeSharedFile()).toBeNull();
  });

  it('is null in a browser with no cache storage', async () => {
    expect(await takeSharedFile()).toBeNull();
  });
});

describe('clearShareFlag', () => {
  it('drops the share query and keeps the rest of the address', () => {
    window.history.replaceState(null, '', '/?share=file&workspace=ws-1');

    clearShareFlag();

    expect(window.location.search).toBe('?workspace=ws-1');
  });
});
