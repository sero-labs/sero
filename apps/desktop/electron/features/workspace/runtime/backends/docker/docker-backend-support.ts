/**
 * Small helpers the Docker backend composes its shell commands and
 * callbacks from. Kept apart from `docker-backend.ts` to keep that file
 * under the 500 LOC rule.
 */

import type { RuntimeDevServer } from '../../types';

export function dirname(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  return index <= 0 ? '/' : filePath.slice(0, index);
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function sanitizeLogPathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

export function emitData(callbacks: Set<(chunk: string) => void>, chunk: Buffer): void {
  const text = chunk.toString();
  for (const cb of callbacks) cb(text);
}

export function isRuntimeDevServer(server: RuntimeDevServer | undefined): server is RuntimeDevServer {
  return Boolean(server);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function subscribe<T>(callbacks: Set<(value: T) => void>, cb: (value: T) => void): () => void {
  callbacks.add(cb);
  return () => callbacks.delete(cb);
}
