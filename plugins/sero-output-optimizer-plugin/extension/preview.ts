/**
 * Build the bounded model-facing preview from a complete candidate.
 *
 * The payload limits match the bash tool's: 2,000 lines or 50 KB, whichever is
 * hit first. Truncation never touches the source capture.
 */

export const PREVIEW_MAX_LINES = 2000;
export const PREVIEW_MAX_BYTES = 50 * 1024;

export interface PreviewResult {
  content: string;
  truncated: boolean;
  totalLines: number;
  totalBytes: number;
  shownLines: number;
  omittedLines: number;
}

export function buildPreview(
  text: string,
  maxLines = PREVIEW_MAX_LINES,
  maxBytes = PREVIEW_MAX_BYTES,
): PreviewResult {
  const totalBytes = Buffer.byteLength(text, 'utf8');
  const lines = text.split('\n');
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content: text,
      truncated: false,
      totalLines,
      totalBytes,
      shownLines: totalLines,
      omittedLines: 0,
    };
  }

  const shown: string[] = [];
  let bytes = 0;
  for (let index = 0; index < lines.length && shown.length < maxLines; index += 1) {
    const line = lines[index] ?? '';
    const lineBytes = Buffer.byteLength(line, 'utf8') + (shown.length > 0 ? 1 : 0);
    if (bytes + lineBytes > maxBytes) break;
    shown.push(line);
    bytes += lineBytes;
  }

  return {
    content: shown.join('\n'),
    truncated: true,
    totalLines,
    totalBytes,
    shownLines: shown.length,
    omittedLines: totalLines - shown.length,
  };
}

/** A byte-exact read of a stream whose presentation preview is incomplete. */
export function incompleteStructuredPreview(content: string, totalBytes: number): string {
  return [
    content,
    '',
    `[Incomplete preview: ${totalBytes} bytes on stdout. The complete document is in the stdout capture file.]`,
  ].join('\n');
}
