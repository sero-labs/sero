/**
 * IPC contract for complete tool output.
 *
 * Kept beside the other per-domain IPC type modules so `ipc.ts` stays within
 * its size budget and the shell-facing contract stays easy to find.
 */

/** One file of a captured complete tool output. */
export interface ToolCaptureReadRequest {
  /** Absolute path reported in the tool result's typed capture record. */
  path: string;
  /** Byte offset to start at. Defaults to 0. */
  offset?: number;
  /** Maximum bytes to return. Bounded by the main process. */
  limitBytes?: number;
}

export interface ToolCaptureReadResult {
  /** `unavailable` means the file is gone or unreadable; `content` is then empty. */
  state: 'ok' | 'unavailable';
  content: string;
  /** Byte offset for the next slice. Absent when the end was reached. */
  nextOffset?: number;
  totalBytes: number;
  /** Why the complete output is unavailable. Present when `state` is `unavailable`. */
  reason?: string;
}
