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

vi.mock('@sero-ai/app-runtime', () => ({
  useAppTools: () => ({
    run: async (_name: string, params: Record<string, unknown>) => {
      const offset = Number(params.offset ?? 0);
      offsets.push(offset);
      const slice = file.slice(offset, offset + CHUNK);
      return {
        content: [],
        details: {
          total: file.byteLength,
          offset,
          bytes: slice.byteLength,
          mediaType: 'video/mp4',
          data: Buffer.from(slice).toString('base64'),
        },
      };
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
