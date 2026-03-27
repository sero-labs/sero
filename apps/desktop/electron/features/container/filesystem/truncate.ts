/**
 * Shared truncation utilities for container tool outputs.
 *
 * Ported from Pi SDK's core/tools/truncate.ts for consistent behaviour.
 *
 * Two independent limits — whichever is hit first wins:
 *  - Line limit  (default: 2000 lines)
 *  - Byte limit  (default: 50 KB)
 *
 * Never returns partial lines (except bash tail truncation edge case).
 */

export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024; // 50 KB

export interface TruncationResult {
  content: string;
  truncated: boolean;
  truncatedBy: 'lines' | 'bytes' | null;
  totalLines: number;
  totalBytes: number;
  outputLines: number;
  outputBytes: number;
  /** Only for tail truncation when last line alone exceeds the byte limit. */
  lastLinePartial: boolean;
  /** Only for head truncation when the first line exceeds the byte limit. */
  firstLineExceedsLimit: boolean;
  maxLines: number;
  maxBytes: number;
}

export interface TruncationOptions {
  maxLines?: number;
  maxBytes?: number;
}

/** Human-readable byte size. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── Head truncation (keep first N lines/bytes) ──────────────

/**
 * Keep the beginning of the content — suitable for file reads where the
 * user wants to see the start of the file.
 */
export function truncateHead(
  content: string,
  options: TruncationOptions = {},
): TruncationResult {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const totalBytes = Buffer.byteLength(content, 'utf-8');
  const lines = content.split('\n');
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines,
      maxBytes,
    };
  }

  // First line alone exceeds byte limit
  if (Buffer.byteLength(lines[0], 'utf-8') > maxBytes) {
    return {
      content: '',
      truncated: true,
      truncatedBy: 'bytes',
      totalLines,
      totalBytes,
      outputLines: 0,
      outputBytes: 0,
      lastLinePartial: false,
      firstLineExceedsLimit: true,
      maxLines,
      maxBytes,
    };
  }

  const outputLinesArr: string[] = [];
  let outputBytesCount = 0;
  let truncatedBy: 'lines' | 'bytes' = 'lines';

  for (let i = 0; i < lines.length && i < maxLines; i++) {
    const lineBytes = Buffer.byteLength(lines[i], 'utf-8') + (i > 0 ? 1 : 0);
    if (outputBytesCount + lineBytes > maxBytes) {
      truncatedBy = 'bytes';
      break;
    }
    outputLinesArr.push(lines[i]);
    outputBytesCount += lineBytes;
  }

  if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
    truncatedBy = 'lines';
  }

  const outputContent = outputLinesArr.join('\n');
  return {
    content: outputContent,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: outputLinesArr.length,
    outputBytes: Buffer.byteLength(outputContent, 'utf-8'),
    lastLinePartial: false,
    firstLineExceedsLimit: false,
    maxLines,
    maxBytes,
  };
}

// ── Tail truncation (keep last N lines/bytes) ───────────────

/**
 * Keep the end of the content — suitable for bash output where the
 * user wants to see errors / final results.
 */
export function truncateTail(
  content: string,
  options: TruncationOptions = {},
): TruncationResult {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const totalBytes = Buffer.byteLength(content, 'utf-8');
  const lines = content.split('\n');
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines,
      maxBytes,
    };
  }

  const outputLinesArr: string[] = [];
  let outputBytesCount = 0;
  let truncatedBy: 'lines' | 'bytes' = 'lines';
  let lastLinePartial = false;

  for (let i = lines.length - 1; i >= 0 && outputLinesArr.length < maxLines; i--) {
    const lineBytes =
      Buffer.byteLength(lines[i], 'utf-8') + (outputLinesArr.length > 0 ? 1 : 0);

    if (outputBytesCount + lineBytes > maxBytes) {
      truncatedBy = 'bytes';
      if (outputLinesArr.length === 0) {
        // Edge case: last line alone exceeds limit — take the end of it
        const truncated = truncateStringBytesFromEnd(lines[i], maxBytes);
        outputLinesArr.unshift(truncated);
        outputBytesCount = Buffer.byteLength(truncated, 'utf-8');
        lastLinePartial = true;
      }
      break;
    }

    outputLinesArr.unshift(lines[i]);
    outputBytesCount += lineBytes;
  }

  if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
    truncatedBy = 'lines';
  }

  const outputContent = outputLinesArr.join('\n');
  return {
    content: outputContent,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: outputLinesArr.length,
    outputBytes: Buffer.byteLength(outputContent, 'utf-8'),
    lastLinePartial,
    firstLineExceedsLimit: false,
    maxLines,
    maxBytes,
  };
}

// ── Internal helpers ────────────────────────────────────────

/** Take the last `maxBytes` of a string, respecting UTF-8 char boundaries. */
function truncateStringBytesFromEnd(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, 'utf-8');
  if (buf.length <= maxBytes) return str;

  let start = buf.length - maxBytes;
  // Advance past continuation bytes to a valid UTF-8 boundary
  while (start < buf.length && (buf[start] & 0xc0) === 0x80) {
    start++;
  }
  return buf.slice(start).toString('utf-8');
}
