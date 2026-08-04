// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Assembling a clip the renderer can actually play (D4).
 *
 * The whole point is that the element gets a Blob URL rather than a `data:`
 * URL of the entire file — one it can seek and stream. So what is asserted is
 * the assembly: every slice asked for in order, and the bytes handed to the
 * Blob identical to the bytes on the other side.
 */

const CHUNK = 4;
let file: Uint8Array;
const offsets: number[] = [];
/** Lets a test bend one answer, to stand in for a file that moved underneath. */
let bend: ((slice: Record<string, unknown>, call: number) => Record<string, unknown>) | null = null;

vi.mock('@sero-ai/app-runtime', () => ({
  useAppTools: () => ({
    run: async (_name: string, params: Record<string, unknown>) => {
      const offset = Number(params.offset ?? 0);
      const call = offsets.push(offset);
      const slice = file.slice(offset, offset + CHUNK);
      const details: Record<string, unknown> = {
        total: file.byteLength,
        offset,
        bytes: slice.byteLength,
        mediaType: 'video/mp4',
        identity: '1:2:10:1700000000000',
        data: Buffer.from(slice).toString('base64'),
      };
      return { content: [], details: bend ? bend(details, call) : details };
    },
  }),
}));

// eslint-disable-next-line import/first -- must follow the mock above
import { useAssetObjectUrl } from './useAssetObjectUrl';

const blobs: Blob[] = [];
const revoked: string[] = [];

/** Through `FileReader`: jsdom's Blob has no `arrayBuffer`, and undici's
 *  `Response` does not recognise it and stringifies it instead. */
function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('could not read the blob'));
    reader.readAsArrayBuffer(blob);
  });
}

function Probe({ itemId }: { itemId?: string }) {
  const url = useAssetObjectUrl(itemId);
  return <span data-testid="url">{url ?? 'none'}</span>;
}

beforeEach(() => {
  offsets.length = 0;
  blobs.length = 0;
  revoked.length = 0;
  bend = null;
  file = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return `blob:fake/${blobs.length}`;
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

describe('a clip read through the tool channel', () => {
  it('asks for every slice in order and rebuilds the file', async () => {
    render(<Probe itemId="item-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('url').textContent).toBe('blob:fake/1');
    });

    expect(offsets).toEqual([0, 4, 8]);
    expect(blobs[0]?.type).toBe('video/mp4');
    expect(Array.from(await bytesOf(blobs[0]!))).toEqual(Array.from(file));
  });

  it('asks for nothing without an item, and gives the URL back when it goes', async () => {
    const { rerender, unmount } = render(<Probe />);
    expect(offsets).toEqual([]);

    rerender(<Probe itemId="item-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('url').textContent).toBe('blob:fake/1');
    });

    // Nothing is showing it any more, so the bytes are released rather than
    // held for the life of the window.
    unmount();
    expect(revoked).toEqual(['blob:fake/1']);
  });
});

/**
 * Nothing half-read ever reaches the player.
 *
 * A truncated video that plays is worse than one that does not: it looks like
 * the artwork that was paid for, and it is not. Every one of these ends with no
 * URL rather than a short one.
 */
describe('a read that does not come back whole', () => {
  async function expectNoUrl() {
    render(<Probe itemId="item-1" />);
    // Long enough for every slice the happy path would have taken.
    await waitFor(() => {
      expect(offsets.length).toBeGreaterThan(0);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('url').textContent).toBe('none');
    expect(blobs).toHaveLength(0);
  }

  it('refuses a file that changed size mid-read', async () => {
    bend = (slice, call) => (call === 2 ? { ...slice, total: 6 } : slice);
    await expectNoUrl();
  });

  it('refuses a slice that stops early', async () => {
    bend = (slice, call) => (call === 2 ? { ...slice, bytes: 0, data: '' } : slice);
    await expectNoUrl();
  });

  it('refuses a slice that answers about the wrong place', async () => {
    bend = (slice, call) => (call === 2 ? { ...slice, offset: 99 } : slice);
    await expectNoUrl();
  });

  it('refuses a slice whose bytes do not match what it claims', async () => {
    bend = (slice, call) => (call === 2 ? { ...slice, bytes: 4, data: 'AQ==' } : slice);
    await expectNoUrl();
  });

  it('refuses a file swapped for another of exactly the same size', async () => {
    // The size check cannot see this one: the file is reopened for every slice,
    // so a replacement of identical length satisfies it while the bytes come
    // from two different files.
    bend = (slice, call) => (call === 2 ? { ...slice, identity: '1:9:10:1700000009999' } : slice);
    await expectNoUrl();
  });

  it('refuses a file too large to hold in memory', async () => {
    bend = (slice) => ({ ...slice, total: 512 * 1024 * 1024 });
    await expectNoUrl();
  });

  it('asks for nothing more once the item changes mid-read', async () => {
    const { rerender } = render(<Probe itemId="item-1" />);
    rerender(<Probe itemId={undefined} />);
    const asked = offsets.length;

    await new Promise((resolve) => setTimeout(resolve, 20));
    // The abandoned read stops rather than running to completion, and never
    // publishes the clip nobody is looking at any more.
    expect(offsets.length).toBeLessThanOrEqual(asked + 1);
    expect(screen.getByTestId('url').textContent).toBe('none');
  });
});

/**
 * The identity check has to fail closed.
 *
 * It was optional once: a slice that simply omitted it settled the expected
 * identity to `undefined`, and every later omission then matched. Dropping it
 * on the other side would have turned the protection off without a sound.
 */
describe('a reader that stops saying which file the bytes came from', () => {
  it('refuses the read rather than trusting it', async () => {
    bend = (slice) => {
      const { identity: _identity, ...rest } = slice;
      return rest;
    };

    render(<Probe itemId="item-1" />);
    await waitFor(() => {
      expect(offsets.length).toBeGreaterThan(0);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.getByTestId('url').textContent).toBe('none');
    expect(blobs).toHaveLength(0);
  });
});
