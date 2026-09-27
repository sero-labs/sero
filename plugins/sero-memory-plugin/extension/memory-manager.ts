/**
 * MemoryManager — file I/O for the memory system.
 *
 * All memory files live in the global workspace root:
 *   ~/.sero-ui/workspaces/global/
 *
 * Layout:
 *   MEMORY.md         — long-term facts, decisions, preferences
 *   IDENTITY.md       — agent persona and behavioural rules
 *   USER.md           — user profile
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { stripEntryIdComments, stripManagedFileMetadata } from './memory-format';

// ── Constants ──────────────────────────────────────────────────

export type CapacityTarget = 'memory' | 'identity' | 'user';

const TARGET_CAPACITIES: Record<CapacityTarget, number> = {
  memory: 4_000,
  user: 2_000,
  identity: 2_000,
};

// ── Path resolution ────────────────────────────────────────────

/** Resolve the global workspace root, where all memory files live. */
export function resolveMemoryRoot(): string {
  const seroHome = process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');
  return path.join(seroHome, 'workspaces', 'global');
}

// ── File paths ─────────────────────────────────────────────────

export function getMemoryPath(root: string): string {
  return path.join(root, 'MEMORY.md');
}

export function getIdentityPath(root: string): string {
  return path.join(root, 'IDENTITY.md');
}

export function getUserPath(root: string): string {
  return path.join(root, 'USER.md');
}

// ── Read / Write ───────────────────────────────────────────────

export async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function statFile(filePath: string): Promise<{ mtime: Date } | null> {
  try {
    const stat = await fs.stat(filePath);
    return { mtime: stat.mtime };
  } catch {
    return null;
  }
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

function normalizeVisibleContent(target: CapacityTarget, content: string): string {
  switch (target) {
    case 'memory':
      return stripEntryIdComments(stripManagedFileMetadata(content)).trim();
    case 'identity':
    case 'user':
      return stripManagedFileMetadata(content).trim();
  }
}

export function getTargetUsage(target: CapacityTarget, content: string): {
  chars: number;
  max: number;
  percent: number;
} {
  const visible = normalizeVisibleContent(target, content);
  const chars = visible.length;
  const max = TARGET_CAPACITIES[target];
  const percent = max === 0 ? 0 : Math.min(999, Math.round((chars / max) * 100));
  return { chars, max, percent };
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ── Target → file path resolution ─────────────────────────────

export function resolveTargetPath(
  root: string,
  target: string,
): { path: string; displayName: string } | null {
  switch (target) {
    case 'memory':
      return { path: getMemoryPath(root), displayName: 'MEMORY.md' };
    case 'identity':
      return { path: getIdentityPath(root), displayName: 'IDENTITY.md' };
    case 'user':
      return { path: getUserPath(root), displayName: 'USER.md' };
    default:
      return null;
  }
}
