import { describe, expect, it } from 'vitest';
import { splitFileRefs } from '../lib/file-refs';

const files = (text: string) => splitFileRefs(text).filter((part) => part.file).map((part) => part.file);

describe('splitFileRefs', () => {
  it('finds the files a result names and keeps every character around them', () => {
    const text = 'Captured the radius-3 screenshot at `evidence/m3/radius3-seed42.png`, added NOTE.md, and stopped the server.';
    expect(files(text)).toEqual(['evidence/m3/radius3-seed42.png', 'NOTE.md']);
    // Rejoining the parts gives the text back, so nothing is dropped.
    expect(splitFileRefs(text).map((part) => part.text).join('')).toBe(text);
  });

  it('leaves a URL alone, because the host cannot open one as a file', () => {
    expect(files('See https://github.com/sero-labs/sero/blob/main/README.md for context.')).toEqual([]);
  });

  it('leaves ordinary prose alone', () => {
    expect(files('The suite passed and the work is done.')).toEqual([]);
    expect(files('Version 3.2 is out.')).toEqual([]);
  });

  it('finds a file at the start of the text and one after a bracket', () => {
    expect(files('NOTES.md records the run.')).toEqual(['NOTES.md']);
    expect(files('The capture (evidence/m3/shot.png) is the only one.')).toEqual(['evidence/m3/shot.png']);
  });

  it('keeps the punctuation after a file out of the path', () => {
    const parts = splitFileRefs('Wrote evidence/m3/NOTE.md.');
    expect(parts.find((part) => part.file)?.file).toBe('evidence/m3/NOTE.md');
    expect(parts.at(-1)?.text).toBe('.');
  });
});
