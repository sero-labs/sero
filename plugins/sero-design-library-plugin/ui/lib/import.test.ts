import { describe, expect, it } from 'vitest';

import { importableFiles } from './import';

/**
 * Importing your own video is deferred. A dropped video has no preview path
 * and would reach the Librarian as image bytes, so every entry point has to
 * agree on images only until frame extraction ships.
 */

function file(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe('importableFiles', () => {
  it('accepts the image types the picker offers', () => {
    const accepted = importableFiles([
      file('a.png', 'image/png'),
      file('b.jpg', 'image/jpeg'),
      file('c.webp', 'image/webp'),
      file('d.svg', 'image/svg+xml'),
    ]);
    expect(accepted.map((entry) => entry.name)).toEqual(['a.png', 'b.jpg', 'c.webp', 'd.svg']);
  });

  it('drops video files', () => {
    const accepted = importableFiles([
      file('clip.mp4', 'video/mp4'),
      file('clip.webm', 'video/webm'),
      file('keep.png', 'image/png'),
    ]);
    expect(accepted.map((entry) => entry.name)).toEqual(['keep.png']);
  });

  it('drops anything that is not an image at all', () => {
    const accepted = importableFiles([
      file('notes.txt', 'text/plain'),
      file('archive.zip', 'application/zip'),
      file('unknown.bin', ''),
    ]);
    expect(accepted).toEqual([]);
  });
});
