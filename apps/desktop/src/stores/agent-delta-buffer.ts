/**
 * Animation-frame batched buffer for high-frequency stream events.
 *
 * Text and thinking deltas accumulate per message. Tool output updates are
 * last-write-wins per tool call: each `tool_update` carries the whole partial
 * output, so only the newest one per call must survive a flush. The store then
 * sees at most one update per frame however chatty the stream is.
 */

import type { ToolResultImage } from '@/types/ipc';

export interface BufferedToolOutput {
  output: string | null;
  details?: Record<string, unknown> | null;
  images?: ToolResultImage[];
}

/** sessionId → key → value */
type SessionMap<T> = Map<string, Map<string, T>>;

interface DeltaBuffer {
  text: SessionMap<string>;
  thinking: SessionMap<string>;
  toolOutput: SessionMap<BufferedToolOutput>;
  rafId: number | null;
  /** Other buffers that share the frame and must be empty before it is cancelled. */
  hasExternalWork: () => boolean;
}

const buf: DeltaBuffer = {
  text: new Map(),
  thinking: new Map(),
  toolOutput: new Map(),
  rafId: null,
  hasExternalWork: () => false,
};

function sessionMap<T>(target: SessionMap<T>, sessionId: string): Map<string, T> {
  let map = target.get(sessionId);
  if (!map) {
    map = new Map();
    target.set(sessionId, map);
  }
  return map;
}

function appendToBuf(target: SessionMap<string>, sessionId: string, key: string, delta: string) {
  const map = sessionMap(target, sessionId);
  map.set(key, (map.get(key) ?? '') + delta);
}

export function scheduleDeltaFlush(flushFn: () => void) {
  if (buf.rafId !== null) return;
  buf.rafId = requestAnimationFrame(() => {
    buf.rafId = null;
    flushFn();
  });
}

/** Register a sibling buffer whose pending work keeps the shared frame alive. */
export function setExternalDeltaWork(hasWork: () => boolean) {
  buf.hasExternalWork = hasWork;
}

export function bufferTextDelta(sessionId: string, messageId: string, delta: string, flushFn: () => void) {
  appendToBuf(buf.text, sessionId, messageId, delta);
  scheduleDeltaFlush(flushFn);
}

export function bufferThinkingDelta(sessionId: string, messageId: string, delta: string, flushFn: () => void) {
  appendToBuf(buf.thinking, sessionId, messageId, delta);
  scheduleDeltaFlush(flushFn);
}

export function bufferToolOutput(
  sessionId: string,
  toolCallId: string,
  update: BufferedToolOutput,
  flushFn: () => void,
) {
  sessionMap(buf.toolOutput, sessionId).set(toolCallId, update);
  scheduleDeltaFlush(flushFn);
}

/** Drop a pending partial output once the final result for the call arrived. */
export function discardBufferedToolOutput(sessionId: string, toolCallId: string) {
  buf.toolOutput.get(sessionId)?.delete(toolCallId);
}

export function hasBufferedDeltas(): boolean {
  return buf.text.size > 0 || buf.thinking.size > 0 || buf.toolOutput.size > 0;
}

export function clearBufferedSessionDeltas(sessionId: string): void {
  buf.text.delete(sessionId);
  buf.thinking.delete(sessionId);
  buf.toolOutput.delete(sessionId);
  if (buf.rafId !== null && !hasBufferedDeltas() && !buf.hasExternalWork()) {
    cancelAnimationFrame(buf.rafId);
    buf.rafId = null;
  }
}

/** Take every buffered delta and reset the buffer. */
export function drainDeltaBuffer() {
  const { text, thinking, toolOutput } = buf;
  buf.text = new Map();
  buf.thinking = new Map();
  buf.toolOutput = new Map();
  return { text, thinking, toolOutput };
}
