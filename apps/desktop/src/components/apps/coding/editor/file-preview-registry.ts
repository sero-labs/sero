import type { ViewMode } from './ViewModeToggle';

/**
 * Data-driven preview registry for CodingWorkspace.
 *
 * New file extensions should map onto an existing preview category whenever
 * possible so we do not need a bespoke renderer for every single file type.
 */

export type TextPreviewKind = 'markdown' | 'html';
export type BinaryPreviewKind = 'image' | 'video' | 'audio' | 'pdf';
export type FilePreviewKind = TextPreviewKind | BinaryPreviewKind;

interface BasePreviewSpec<Kind extends FilePreviewKind> {
  kind: Kind;
  label: string;
  supportsCodeView: boolean;
  defaultViewMode: ViewMode;
}

export interface TextPreviewSpec extends BasePreviewSpec<TextPreviewKind> {
  source: 'text';
}

export interface BinaryPreviewSpec extends BasePreviewSpec<BinaryPreviewKind> {
  source: 'binary';
  mimeType: string;
}

export type FilePreviewSpec = TextPreviewSpec | BinaryPreviewSpec;

function textPreview(kind: TextPreviewKind, label: string): TextPreviewSpec {
  return {
    kind,
    source: 'text',
    label,
    supportsCodeView: true,
    defaultViewMode: 'preview',
  };
}

function binaryPreview(
  kind: BinaryPreviewKind,
  label: string,
  mimeType: string,
): BinaryPreviewSpec {
  return {
    kind,
    source: 'binary',
    label,
    mimeType,
    supportsCodeView: false,
    defaultViewMode: 'preview',
  };
}

const PREVIEW_SPEC_BY_EXTENSION: Record<string, FilePreviewSpec> = {
  md: textPreview('markdown', 'Markdown Preview'),
  mdx: textPreview('markdown', 'Markdown Preview'),
  markdown: textPreview('markdown', 'Markdown Preview'),
  html: textPreview('html', 'HTML Preview'),
  htm: textPreview('html', 'HTML Preview'),

  png: binaryPreview('image', 'Image Preview', 'image/png'),
  jpg: binaryPreview('image', 'Image Preview', 'image/jpeg'),
  jpeg: binaryPreview('image', 'Image Preview', 'image/jpeg'),
  gif: binaryPreview('image', 'Image Preview', 'image/gif'),
  webp: binaryPreview('image', 'Image Preview', 'image/webp'),
  svg: binaryPreview('image', 'Image Preview', 'image/svg+xml'),
  bmp: binaryPreview('image', 'Image Preview', 'image/bmp'),
  ico: binaryPreview('image', 'Image Preview', 'image/x-icon'),
  avif: binaryPreview('image', 'Image Preview', 'image/avif'),
  tif: binaryPreview('image', 'Image Preview', 'image/tiff'),
  tiff: binaryPreview('image', 'Image Preview', 'image/tiff'),

  mp4: binaryPreview('video', 'Video Preview', 'video/mp4'),
  webm: binaryPreview('video', 'Video Preview', 'video/webm'),
  mov: binaryPreview('video', 'Video Preview', 'video/quicktime'),
  m4v: binaryPreview('video', 'Video Preview', 'video/mp4'),
  ogv: binaryPreview('video', 'Video Preview', 'video/ogg'),
  avi: binaryPreview('video', 'Video Preview', 'video/x-msvideo'),
  mkv: binaryPreview('video', 'Video Preview', 'video/x-matroska'),
  mpg: binaryPreview('video', 'Video Preview', 'video/mpeg'),
  mpeg: binaryPreview('video', 'Video Preview', 'video/mpeg'),

  mp3: binaryPreview('audio', 'Audio Preview', 'audio/mpeg'),
  wav: binaryPreview('audio', 'Audio Preview', 'audio/wav'),
  ogg: binaryPreview('audio', 'Audio Preview', 'audio/ogg'),
  oga: binaryPreview('audio', 'Audio Preview', 'audio/ogg'),
  m4a: binaryPreview('audio', 'Audio Preview', 'audio/mp4'),
  aac: binaryPreview('audio', 'Audio Preview', 'audio/aac'),
  flac: binaryPreview('audio', 'Audio Preview', 'audio/flac'),
  opus: binaryPreview('audio', 'Audio Preview', 'audio/ogg'),
  weba: binaryPreview('audio', 'Audio Preview', 'audio/webm'),

  pdf: binaryPreview('pdf', 'PDF Preview', 'application/pdf'),
};

/** Get the lowercase extension for a file path. */
export function getFileExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? '';
}

/** Resolve the preview configuration for a file path, if one exists. */
export function getFilePreviewSpec(filePath: string): FilePreviewSpec | null {
  const ext = getFileExtension(filePath);
  return PREVIEW_SPEC_BY_EXTENSION[ext] ?? null;
}

export function isBinaryPreviewFile(filePath: string): boolean {
  return getFilePreviewSpec(filePath)?.source === 'binary';
}

export function shouldDefaultToPreview(filePath: string): boolean {
  return getFilePreviewSpec(filePath)?.defaultViewMode === 'preview';
}
