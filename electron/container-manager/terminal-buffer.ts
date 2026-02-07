/**
 * Ring buffer that keeps the last N characters of terminal output.
 * Used by the agent's read_terminal tool to see dev server logs.
 */
export class TerminalOutputBuffer {
  private buffer = '';
  private maxSize: number;

  constructor(maxSize = 32_000) {
    this.maxSize = maxSize;
  }

  append(data: string): void {
    this.buffer += data;
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize);
    }
  }

  /** Get the last `n` characters (default: all) */
  read(n?: number): string {
    if (n && n < this.buffer.length) {
      return this.buffer.slice(-n);
    }
    return this.buffer;
  }

  /** Get only the last `n` lines */
  readLines(n = 100): string {
    const lines = this.buffer.split('\n');
    return lines.slice(-n).join('\n');
  }

  clear(): void {
    this.buffer = '';
  }
}
