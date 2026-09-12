import fs from 'fs';
import path from 'path';

import { TOOL_CAPTURE_RECORD_VERSION } from './types';

/**
 * Capture references inherited by a fork.
 *
 * The Pi session writer defers a forked session file until its first assistant
 * message. A fork that waits for a user turn therefore has no file, so a
 * deletion sweep that read only session files could remove captures the fork
 * already inherits. Fork publication writes this sidecar next to the session
 * file so the inherited references are durable immediately.
 *
 * The session file remains the authority once it exists; the sidecar is an
 * additional reference source, so a stale sidecar can only retain data, never
 * release it early.
 */

export const FORK_REFERENCE_SUFFIX = '.captures.json';

interface ForkReferenceDocument {
  version: number;
  sessionId: string;
  captures: string[];
}

export function forkReferencePath(sessionPath: string): string {
  return `${sessionPath}${FORK_REFERENCE_SUFFIX}`;
}

/** Session id from a session file or fork reference file name. */
export function sessionIdFromReferenceFileName(fileName: string): string {
  const base = path.basename(fileName).replace(FORK_REFERENCE_SUFFIX, '').replace(/\.jsonl$/, '');
  const separator = base.indexOf('_');
  return separator === -1 ? base : base.slice(separator + 1);
}

/** Collect every capture id referenced by a branch's tool results. */
export function collectCaptureIdsFromEntries(entries: readonly unknown[]): string[] {
  const captureIds = new Set<string>();
  for (const entry of entries) {
    if (!isRecord(entry) || entry.type !== 'message') continue;
    const message = entry.message;
    if (!isRecord(message) || message.role !== 'toolResult') continue;
    const details = message.details;
    if (!isRecord(details)) continue;
    const capture = details.capture;
    if (!isRecord(capture) || capture.version !== TOOL_CAPTURE_RECORD_VERSION) continue;
    if (typeof capture.captureId === 'string' && capture.captureId.length > 0) {
      captureIds.add(capture.captureId);
    }
  }
  return [...captureIds];
}

export async function writeForkReferences(
  sessionPath: string,
  sessionId: string,
  captureIds: string[],
): Promise<void> {
  if (captureIds.length === 0) return;
  const document: ForkReferenceDocument = { version: 1, sessionId, captures: captureIds };
  const target = forkReferencePath(sessionPath);
  const temporary = `${target}.tmp-${process.pid}`;
  await fs.promises.writeFile(temporary, `${JSON.stringify(document)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.promises.rename(temporary, target);
}

/** Read a fork's inherited references. Returns null when the document is unreadable. */
export async function readForkReferences(sessionPath: string): Promise<string[] | null> {
  const target = forkReferencePath(sessionPath);
  let raw: string;
  try {
    raw = await fs.promises.readFile(target, 'utf8');
  } catch (error) {
    if (isNotFound(error)) return [];
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.captures)) return null;
    return parsed.captures.filter((value): value is string => typeof value === 'string' && value.length > 0);
  } catch {
    return null;
  }
}

/** Remove a fork's reference sidecar together with its session file. */
export async function removeForkReferences(sessionPath: string): Promise<void> {
  try {
    await fs.promises.rm(forkReferencePath(sessionPath), { force: true });
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
