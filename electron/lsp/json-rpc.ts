/**
 * JSON-RPC message framing for LSP communication over stdio.
 * Handles Content-Length header protocol used by LSP servers.
 */
import { EventEmitter } from 'events';
import type { JsonRpcMessage } from './types';

const HEADER_DELIMITER = '\r\n\r\n';
const CONTENT_LENGTH_RE = /Content-Length:\s*(\d+)/i;

/**
 * Parses LSP JSON-RPC messages from a byte stream.
 * Emits 'message' events with parsed JsonRpcMessage objects.
 */
export class JsonRpcParser extends EventEmitter {
  private buffer = Buffer.alloc(0);
  private contentLength = -1;

  /** Feed raw data from the language server's stdout. */
  feed(data: Buffer | string): void {
    const chunk = typeof data === 'string' ? Buffer.from(data) : data;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.parse();
  }

  /** Reset parser state. */
  reset(): void {
    this.buffer = Buffer.alloc(0);
    this.contentLength = -1;
  }

  private parse(): void {
    // Keep extracting messages while we have enough data
    while (true) {
      // Phase 1: Read headers to get content length
      if (this.contentLength === -1) {
        const headerEnd = this.buffer.indexOf(HEADER_DELIMITER);
        if (headerEnd === -1) return; // Need more data for headers

        const headerStr = this.buffer.subarray(0, headerEnd).toString('ascii');
        const match = CONTENT_LENGTH_RE.exec(headerStr);
        if (!match) {
          // Invalid header — skip past it
          this.buffer = this.buffer.subarray(headerEnd + HEADER_DELIMITER.length);
          continue;
        }

        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.subarray(headerEnd + HEADER_DELIMITER.length);
      }

      // Phase 2: Read the message body
      if (this.buffer.length < this.contentLength) return; // Need more data

      const body = this.buffer.subarray(0, this.contentLength).toString('utf-8');
      this.buffer = this.buffer.subarray(this.contentLength);
      this.contentLength = -1;

      try {
        const message = JSON.parse(body) as JsonRpcMessage;
        this.emit('message', message);
      } catch (err) {
        this.emit('error', new Error(`Failed to parse JSON-RPC message: ${err}`));
      }
    }
  }
}

/** Encode a JSON-RPC message with Content-Length header for sending to stdin. */
export function encodeMessage(message: JsonRpcMessage): Buffer {
  const body = JSON.stringify(message);
  const bodyBytes = Buffer.from(body, 'utf-8');
  const header = `Content-Length: ${bodyBytes.length}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, 'ascii'), bodyBytes]);
}
