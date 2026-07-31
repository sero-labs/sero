import { describe, expect, it } from 'vitest';

import { isSafeId } from '../../../shared/safe-id';
import { STAGE_CHUNK_BYTES, chunkBytes, frameName, newSpriteId, toBase64 } from './requests';

/**
 * What goes to the runtime.
 *
 * Two rules carry weight here. An id allocated by the page becomes a directory
 * name on the other side, so it has to be a safe path segment; and a staged
 * frame's name decides where it lands in the animation, so `10` must not sort
 * before `2`.
 */

describe('ids the page allocates', () => {
  it('are safe path segments, because that is what they become', () => {
    expect(isSafeId(newSpriteId('char'))).toBe(true);
    expect(isSafeId(newSpriteId('frames'))).toBe(true);
  });

  it('are different every time, so a replay cannot make a second character', () => {
    expect(newSpriteId('char')).not.toBe(newSpriteId('char'));
  });
});

describe('staged frame names', () => {
  it('are padded, because the read back is in name order and that order is the animation', () => {
    expect(frameName(0)).toBe('000');
    expect(frameName(2)).toBe('002');
    expect(frameName(10)).toBe('010');
    const ordered = [0, 2, 10, 60].map(frameName).toSorted();
    expect(ordered).toEqual(['000', '002', '010', '060']);
  });
});

describe('cutting a file into chunks', () => {
  it('keeps every chunk within what one call will carry', () => {
    const bytes = new Uint8Array(STAGE_CHUNK_BYTES * 2 + 17);
    const chunks = chunkBytes(bytes);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.byteLength <= STAGE_CHUNK_BYTES)).toBe(true);
    expect(chunks.reduce((total, chunk) => total + chunk.byteLength, 0)).toBe(bytes.byteLength);
  });

  it('sends an empty file as one empty chunk rather than nothing at all', () => {
    expect(chunkBytes(new Uint8Array(0))).toHaveLength(1);
  });

  it('round-trips the bytes it encodes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    const decoded = Uint8Array.from(atob(toBase64(bytes)), (char) => char.charCodeAt(0));
    expect([...decoded]).toEqual([...bytes]);
  });
});
