/**
 * Shared helpers for the Design Library's Pi tools.
 *
 * Tools are read-and-intent only: they read records straight off disk and
 * append requests to the reactive index. Every domain write is performed by
 * the background runtime, which is the single authoritative writer.
 */

import { mutateState, readState } from '../shared/state-io';
import { storagePathsFromEnv, storagePathsFromRoot, type StoragePaths } from '../shared/paths';
import type { RequestAction, RequestMap } from '../shared/requests';
import path from 'node:path';

export interface ToolContext {
  cwd: string;
}

/**
 * Global apps live under `SERO_HOME`. When neither `SERO_HOME` nor
 * `PI_CODING_AGENT_DIR` is set (plain Pi CLI), fall back to the workspace-local
 * manifest path so the tool still has somewhere consistent to work.
 */
export function resolvePaths(cwd?: string): StoragePaths {
  if (process.env.SERO_HOME || process.env.PI_CODING_AGENT_DIR) {
    return storagePathsFromEnv();
  }
  return storagePathsFromRoot(path.join(cwd ?? process.cwd(), '.sero', 'apps', 'design-library'));
}

export interface ToolOutput {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  details: Record<string, unknown>;
}

export function ok(text: string, details: Record<string, unknown> = {}): ToolOutput {
  return { content: [{ type: 'text', text }], details };
}

export function fail(message: string): ToolOutput {
  return { content: [{ type: 'text', text: `Error: ${message}` }], details: { ok: false } };
}

export function image(data: string, mimeType: string, note: string, details: Record<string, unknown> = {}): ToolOutput {
  return {
    content: [
      { type: 'text', text: note },
      { type: 'image', data, mimeType },
    ],
    details,
  };
}

/** Append one intent request and return its id. */
export async function submitRequest<TAction extends RequestAction>(
  paths: StoragePaths,
  action: TAction,
  payload: RequestMap[TAction],
): Promise<number> {
  let requestId = 0;
  await mutateState(paths.stateFile, (current) => {
    requestId = current.nextRequestId;
    return {
      ...current,
      nextRequestId: requestId + 1,
      requests: [
        // Drop requests the runtime has already consumed so the log stays bounded.
        ...current.requests.filter((entry) => entry.id > current.consumedRequestId),
        {
          id: requestId,
          action,
          payload: payload as unknown as Record<string, unknown>,
          requestedAt: Date.now(),
        },
      ],
    };
  });
  return requestId;
}

export async function currentState(paths: StoragePaths) {
  return readState(paths.stateFile);
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required.`);
  }
  return value;
}
