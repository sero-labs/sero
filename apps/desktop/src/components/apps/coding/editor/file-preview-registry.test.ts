import { describe, expect, it } from 'vitest';
import {
  getFilePreviewSpec,
  isBinaryPreviewFile,
  shouldDefaultToPreview,
} from './file-preview-registry';

describe('file preview registry', () => {
  it('keeps markdown and HTML on the existing text preview path', () => {
    expect(getFilePreviewSpec('/workspace/README.md')).toMatchObject({
      kind: 'markdown',
      source: 'text',
      supportsCodeView: true,
      defaultViewMode: 'preview',
    });

    expect(getFilePreviewSpec('/workspace/index.html')).toMatchObject({
      kind: 'html',
      source: 'text',
      supportsCodeView: true,
      defaultViewMode: 'preview',
    });
  });

  it('maps media files onto shared binary preview categories', () => {
    expect(getFilePreviewSpec('/workspace/demo.mkv')).toMatchObject({
      kind: 'video',
      source: 'binary',
      mimeType: 'video/x-matroska',
      supportsCodeView: false,
    });

    expect(getFilePreviewSpec('/workspace/clip.ogg')).toMatchObject({
      kind: 'video',
      source: 'binary',
      mimeType: 'video/ogg',
      supportsCodeView: false,
    });

    expect(getFilePreviewSpec('/workspace/song.m4a')).toMatchObject({
      kind: 'audio',
      source: 'binary',
      mimeType: 'audio/mp4',
      supportsCodeView: false,
    });

    expect(getFilePreviewSpec('/workspace/spec.pdf')).toMatchObject({
      kind: 'pdf',
      source: 'binary',
      mimeType: 'application/pdf',
      supportsCodeView: false,
    });
  });

  it('returns null for unsupported extensions', () => {
    expect(getFilePreviewSpec('/workspace/archive.zip')).toBeNull();
    expect(isBinaryPreviewFile('/workspace/archive.zip')).toBe(false);
    expect(shouldDefaultToPreview('/workspace/archive.zip')).toBe(false);
  });
});
