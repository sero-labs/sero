/**
 * Paths and file I/O for the global memory root:
 *   ~/.sero-ui/workspaces/global/
 *
 *   IDENTITY.md  — agent persona and behavioural rules
 *   USER.md      — user profile
 *   MEMORY.md    — the old long-term memory file; read once by the conversion
 *   memory/      — entry folders (see entry-store.ts)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { stripManagedFileMetadata } from './memory-format';

export type ProfileTarget = 'identity' | 'user';

const PROFILE_CAPACITIES: Record<ProfileTarget, number> = {
  user: 2_000,
  identity: 2_000,
};

/** Resolve the global workspace root, where all memory files live. */
export function resolveMemoryRoot(): string {
  const seroHome = process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');
  return path.join(seroHome, 'workspaces', 'global');
}

export function getMemoryPath(root: string): string {
  return path.join(root, 'MEMORY.md');
}

export function getIdentityPath(root: string): string {
  return path.join(root, 'IDENTITY.md');
}

export function getUserPath(root: string): string {
  return path.join(root, 'USER.md');
}

export async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function getTargetUsage(target: ProfileTarget, content: string): { chars: number; max: number } {
  return { chars: stripManagedFileMetadata(content).trim().length, max: PROFILE_CAPACITIES[target] };
}

export function resolveTargetPath(root: string, target: ProfileTarget): { path: string; displayName: string } {
  return target === 'identity'
    ? { path: getIdentityPath(root), displayName: 'IDENTITY.md' }
    : { path: getUserPath(root), displayName: 'USER.md' };
}
