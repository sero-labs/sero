import fs from 'fs';
import path from 'path';

import { SERO_AGENT_DIR, SERO_HOST_RTK_STATE_ROOT, SERO_CAPTURE_ROOT } from '@electron/platform/env';
import { activeCaptureDirectories } from './active-captures';
import {
  FORK_REFERENCE_SUFFIX,
  sessionIdFromReferenceFileName,
} from './fork-references';
import { TOOL_CAPTURE_RECORD_VERSION } from './types';

/**
 * Capture retention.
 *
 * Reference sources, in order of authority:
 *   1. the session file, whose tool results carry the typed capture record;
 *   2. a fork's reference sidecar, written at fork publication because the Pi
 *      session writer defers a forked file until its first assistant message.
 *
 * A capture that a running command owns is never orphaned, whatever its age:
 * its reference exists only after the command finishes and publishes a result.
 *
 * No separate ownership index exists, so nothing can drift out of sync. Cleanup
 * runs only on a complete inventory. A capture or RTK state directory inside the
 * grace window is never removed: its producing session may not have persisted
 * the reference yet.
 */

/** Captures younger than this are never removed; their reference may still be in flight. */
export const DEFAULT_RETENTION_GRACE_MS = 15 * 60_000;

/** Default session directory. Mirrors `SERO_SESSION_DIR` in shared-infra. */
export const DEFAULT_SESSION_DIR = path.join(SERO_AGENT_DIR, 'sessions');

export interface CaptureInventory {
  /** True only when every reference source was read. Deletion is unsafe otherwise. */
  complete: boolean;
  /** Every capture id a surviving session file or fork sidecar references. */
  referencedCaptureIds: Set<string>;
  /**
   * Session ids that still exist. A session counts as live when it has a
   * session file, and also when a fork sidecar names it: the Pi writer defers a
   * forked file until its first assistant message, so the sidecar is the only
   * proof that such a fork is still alive.
   */
  sessionIds: Set<string>;
  /** Fork reference sidecars that were read. */
  forkReferenceFiles: string[];
  reason?: string;
}

export interface CaptureInventorySource {
  listSessionFiles(): Promise<string[]>;
  listForkReferenceFiles(): Promise<string[]>;
  readTextFile(filePath: string): Promise<string>;
  fileExists(filePath: string): Promise<boolean>;
}

export interface CaptureDirectory {
  captureId: string;
  /** Producing session's directory key, which is the encoded session id. */
  sessionKey: string;
  directory: string;
  modifiedMs: number;
}

export interface RtkStateDirectory {
  sessionKey: string;
  directory: string;
  modifiedMs: number;
}

export interface CaptureCleanupPlan {
  captureDirectories: string[];
  rtkStateDirectories: string[];
  forkReferenceFiles: string[];
}

export interface SweepResult {
  deferred: boolean;
  reason?: string;
  removedCaptures: string[];
  removedRtkStates: string[];
  removedForkReferences: string[];
}

export interface SweepOptions {
  captureRoot?: string;
  rtkStateRoot?: string;
  sessionDir?: string;
  graceMs?: number;
  now?: () => number;
  source?: CaptureInventorySource;
  /** Directories owned by running commands. Defaults to the process registry. */
  activeCaptureDirectories?: ReadonlySet<string>;
}

export function nodeCaptureInventorySource(sessionDir: string = DEFAULT_SESSION_DIR): CaptureInventorySource {
  return {
    async listSessionFiles() {
      const names = await listFileNames(sessionDir, '.jsonl');
      return names.map((name) => path.join(sessionDir, name));
    },
    async listForkReferenceFiles() {
      const names = await listFileNames(sessionDir, FORK_REFERENCE_SUFFIX);
      return names.map((name) => path.join(sessionDir, name));
    },
    readTextFile: (filePath) => fs.promises.readFile(filePath, 'utf8'),
    async fileExists(filePath) {
      try {
        await fs.promises.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
  };
}

async function listFileNames(directory: string, suffix: string): Promise<string[]> {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(suffix)) names.push(entry.name);
  }
  return names;
}

export async function readCaptureInventory(source: CaptureInventorySource): Promise<CaptureInventory> {
  const referencedCaptureIds = new Set<string>();
  const sessionIds = new Set<string>();
  const forkReferenceFiles: string[] = [];

  let sessionFiles: string[];
  try {
    sessionFiles = await source.listSessionFiles();
  } catch (error) {
    return incomplete(reasoned('session inventory unavailable', error));
  }
  for (const file of sessionFiles) {
    sessionIds.add(sessionIdFromReferenceFileName(file));
    const text = await readText(source, file);
    if (text === null) return incomplete(reasoned('session inventory is incomplete', file));
    collectCaptureReferences(text, referencedCaptureIds);
  }

  let referenceFiles: string[];
  try {
    referenceFiles = await source.listForkReferenceFiles();
  } catch (error) {
    return incomplete(reasoned('fork reference inventory unavailable', error));
  }
  for (const file of referenceFiles) {
    const text = await readText(source, file);
    if (text === null) return incomplete(reasoned('fork reference inventory is incomplete', file));
    const captureIds = parseForkReferenceDocument(text);
    if (captureIds === null) return incomplete(reasoned('fork reference document is unreadable', file));
    for (const captureId of captureIds) referencedCaptureIds.add(captureId);
    // The sidecar names its fork, which may not have a session file yet.
    sessionIds.add(sessionIdFromReferenceFileName(file));
    forkReferenceFiles.push(file);
  }

  return { complete: true, referencedCaptureIds, sessionIds, forkReferenceFiles };

  function incomplete(reason: string): CaptureInventory {
    return { complete: false, referencedCaptureIds, sessionIds, forkReferenceFiles, reason };
  }
}

async function readText(source: CaptureInventorySource, filePath: string): Promise<string | null> {
  try {
    return await source.readTextFile(filePath);
  } catch {
    return null;
  }
}

function reasoned(prefix: string, detail: unknown): string {
  return `${prefix}: ${detail instanceof Error ? detail.message : String(detail)}`;
}

function collectCaptureReferences(text: string, referencedCaptureIds: Set<string>): void {
  for (const line of text.split('\n')) {
    if (!line.includes('toolResult') || !line.includes('"capture"')) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const captureId = captureIdFromEntry(entry);
    if (captureId) referencedCaptureIds.add(captureId);
  }
}

function captureIdFromEntry(entry: unknown): string | undefined {
  if (!isRecord(entry) || entry.type !== 'message') return undefined;
  const message = entry.message;
  if (!isRecord(message) || message.role !== 'toolResult') return undefined;
  const details = message.details;
  if (!isRecord(details)) return undefined;
  const capture = details.capture;
  if (!isRecord(capture) || capture.version !== TOOL_CAPTURE_RECORD_VERSION) return undefined;
  return typeof capture.captureId === 'string' && capture.captureId.length > 0 ? capture.captureId : undefined;
}

/** Parse a fork reference document. Returns null when the document is unreadable. */
export function parseForkReferenceDocument(text: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.captures)) return null;
    return parsed.captures.filter((value): value is string => typeof value === 'string' && value.length > 0);
  } catch {
    return null;
  }
}

export async function listCaptureDirectories(captureRoot: string): Promise<CaptureDirectory[]> {
  const directories: CaptureDirectory[] = [];
  for (const sessionKey of await readDirectories(captureRoot)) {
    const sessionRoot = path.join(captureRoot, sessionKey);
    for (const captureId of await readDirectories(sessionRoot)) {
      const directory = path.join(sessionRoot, captureId);
      directories.push({ captureId, sessionKey, directory, modifiedMs: await modifiedMs(directory) });
    }
  }
  return directories;
}

export async function listRtkStateDirectories(rtkStateRoot: string): Promise<RtkStateDirectory[]> {
  const directories: RtkStateDirectory[] = [];
  for (const sessionKey of await readDirectories(rtkStateRoot)) {
    const directory = path.join(rtkStateRoot, sessionKey);
    directories.push({ sessionKey, directory, modifiedMs: await modifiedMs(directory) });
  }
  return directories;
}

/**
 * Decide what to remove.
 *
 * A capture is removed only when no surviving session references it. Host RTK
 * state is removed only when its owning session is gone and no surviving
 * inherited capture was produced by that session. A fork reference sidecar is
 * removed once its session file exists, because the file is then authoritative.
 * The caller must have confirmed that both directories exist.
 */
export function planCaptureCleanup(input: {
  inventory: CaptureInventory;
  captures: CaptureDirectory[];
  rtkStates: RtkStateDirectory[];
  existingSessionFiles: Set<string>;
  graceMs: number;
  now: number;
  /**
   * Captures owned by a running command. Such a directory has no reference yet,
   * so age alone cannot prove that it is orphaned.
   */
  activeDirectories?: ReadonlySet<string>;
}): CaptureCleanupPlan {
  const { inventory, captures, rtkStates, existingSessionFiles, graceMs, now, activeDirectories } = input;
  const liveSessionKeys = new Set<string>();
  for (const sessionId of inventory.sessionIds) liveSessionKeys.add(encodeURIComponent(sessionId));

  const retainedProducerKeys = new Set<string>();
  for (const capture of captures) {
    if (inventory.referencedCaptureIds.has(capture.captureId)) {
      retainedProducerKeys.add(capture.sessionKey);
    }
  }

  return {
    captureDirectories: selectDirectories(
      captures,
      (capture) => capture.directory,
      (capture) => !inventory.referencedCaptureIds.has(capture.captureId)
        && !activeDirectories?.has(capture.directory)
        && outsideGrace(capture.modifiedMs, graceMs, now),
    ),
    rtkStateDirectories: selectDirectories(
      rtkStates,
      (state) => state.directory,
      (state) => !liveSessionKeys.has(state.sessionKey)
        && !retainedProducerKeys.has(state.sessionKey)
        && outsideGrace(state.modifiedMs, graceMs, now),
    ),
    forkReferenceFiles: inventory.forkReferenceFiles.filter((file) => (
      existingSessionFiles.has(file.slice(0, -FORK_REFERENCE_SUFFIX.length))
    )),
  };
}

/**
 * True when a directory is old enough to be removed.
 *
 * A filesystem mtime carries sub-millisecond precision, so a directory created
 * moments earlier can appear a fraction of a millisecond ahead of the sweep
 * clock. One millisecond of tolerance keeps a just-created directory inside the
 * grace window. A stat failure reports infinity and therefore retains.
 */
function outsideGrace(modifiedMs: number, graceMs: number, now: number): boolean {
  return now + 1 - modifiedMs >= graceMs;
}

function selectDirectories<T>(
  items: T[],
  directoryOf: (item: T) => string,
  isOrphaned: (item: T) => boolean,
): string[] {
  const selected: string[] = [];
  for (const item of items) {
    if (isOrphaned(item)) selected.push(directoryOf(item));
  }
  return selected;
}

export async function sweepOrphanedCaptures(options: SweepOptions = {}): Promise<SweepResult> {
  const captureRoot = options.captureRoot ?? SERO_CAPTURE_ROOT;
  const rtkStateRoot = options.rtkStateRoot ?? SERO_HOST_RTK_STATE_ROOT;
  const graceMs = options.graceMs ?? DEFAULT_RETENTION_GRACE_MS;
  const now = (options.now ?? Date.now)();
  const source = options.source ?? nodeCaptureInventorySource(options.sessionDir);

  const inventory = await readCaptureInventory(source);
  if (!inventory.complete) {
    return { deferred: true, reason: inventory.reason, removedCaptures: [], removedRtkStates: [], removedForkReferences: [] };
  }

  const plan = planCaptureCleanup({
    inventory,
    captures: await listCaptureDirectories(captureRoot),
    rtkStates: await listRtkStateDirectories(rtkStateRoot),
    existingSessionFiles: await existingSessionFiles(inventory.forkReferenceFiles, source),
    graceMs,
    now,
    activeDirectories: options.activeCaptureDirectories ?? activeCaptureDirectories(),
  });

  // A failed removal is retried by the next sweep; nothing is advertised as gone.
  return {
    deferred: false,
    removedCaptures: await removeAll(plan.captureDirectories),
    removedRtkStates: await removeAll(plan.rtkStateDirectories),
    removedForkReferences: await removeAllFiles(plan.forkReferenceFiles),
  };
}

async function existingSessionFiles(
  forkReferenceFiles: string[],
  source: CaptureInventorySource,
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const file of forkReferenceFiles) {
    const sessionPath = file.slice(0, -FORK_REFERENCE_SUFFIX.length);
    if (await source.fileExists(sessionPath)) existing.add(sessionPath);
  }
  return existing;
}

async function removeAll(directories: string[]): Promise<string[]> {
  const removed: string[] = [];
  for (const directory of directories) {
    try {
      await fs.promises.rm(directory, { recursive: true, force: true });
      removed.push(directory);
    } catch {
      // Retried on the next sweep.
    }
  }
  return removed;
}

async function removeAllFiles(files: string[]): Promise<string[]> {
  const removed: string[] = [];
  for (const file of files) {
    try {
      await fs.promises.rm(file, { force: true });
      removed.push(file);
    } catch {
      // Retried on the next sweep.
    }
  }
  return removed;
}

async function readDirectories(root: string): Promise<string[]> {
  const directories: string[] = [];
  try {
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) directories.push(entry.name);
    }
  } catch {
    return [];
  }
  return directories;
}

async function modifiedMs(target: string): Promise<number> {
  try {
    const stats = await fs.promises.stat(target);
    return stats.mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
