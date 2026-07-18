/**
 * Gateway connection limits and early-error helpers. Split from
 * gateway/index.ts to keep it under the 500-LOC rule.
 */

/**
 * Maximum WebSocket message payload (36 MB).
 *
 * This is the *first* gate: `ws` enforces it during frame reassembly, before
 * we ever see the bytes — over-limit messages close the socket with code
 * 1009. Sized to accommodate the voice transcription path: the OpenAI helper
 * caps decoded audio at 25 MB, which becomes ~33.4 MB after base64 encoding
 * plus the JSON envelope.
 *
 * Once a frame fits, two further checks run in order:
 *   1. `validateRequest` (protocol.ts) rejects voice payloads above 35 MB
 *      to short-circuit clearly bogus inputs.
 *   2. The OpenAI transcription helper enforces the 25 MB decoded ceiling.
 */
export const MAX_PAYLOAD_BYTES = 36 * 1024 * 1024;
/** Maximum total concurrent WebSocket connections. */
export const MAX_TOTAL_CONNECTIONS = 50;
/** Maximum concurrent WebSocket connections per source IP. */
export const MAX_CONNECTIONS_PER_IP = 10;
/** Idle timeout for authenticated connections (30 minutes). */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** Auth timeout for unauthenticated connections (10 seconds). */
export const AUTH_TIMEOUT_MS = 10_000;

/**
 * Best-effort `requestId` extraction for early errors that fail before
 * `validateRequest` produces a typed request. Lets the client correlate the
 * error with its outstanding promise instead of leaving it pending.
 */
export function readBestEffortRequestId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = (raw as { requestId?: unknown }).requestId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
