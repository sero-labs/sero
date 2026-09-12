import { PREVIEW_MAX_BYTES, PREVIEW_MAX_LINES, type PreviewResult } from '../preview';

/**
 * A bounded preview sink.
 *
 * Rules emit their complete candidate line by line. This sink counts the
 * complete candidate in UTF-8 bytes and keeps only the preview window, so the
 * plugin never holds a second full candidate.
 */
export class BoundedPreviewEmitter {
  private candidateBytes = 0;
  private totalLines = 0;
  private readonly shown: string[] = [];
  private shownBytes = 0;
  private truncated = false;

  constructor(
    private readonly maxLines = PREVIEW_MAX_LINES,
    private readonly maxBytes = PREVIEW_MAX_BYTES,
  ) {}

  emit(line: string): void {
    this.totalLines += 1;
    const lineBytes = Buffer.byteLength(line, 'utf8') + (this.candidateBytes > 0 ? 1 : 0);
    this.candidateBytes += lineBytes;
    if (this.truncated) return;

    if (this.shown.length >= this.maxLines || this.shownBytes + lineBytes > this.maxBytes) {
      this.truncated = true;
      return;
    }
    this.shown.push(line);
    this.shownBytes += lineBytes;
  }

  bytes(): number {
    return this.candidateBytes;
  }

  result(): PreviewResult {
    return {
      content: this.shown.join('\n'),
      truncated: this.truncated,
      totalLines: this.totalLines,
      totalBytes: this.candidateBytes,
      shownLines: this.shown.length,
      omittedLines: this.totalLines - this.shown.length,
    };
  }
}

export function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}
