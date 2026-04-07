/**
 * MemoryManager — file I/O for the memory system.
 *
 * All memory files live in the global workspace root:
 *   ~/.sero-ui/workspaces/global/
 *
 * Layout:
 *   MEMORY.md         — long-term facts, decisions, preferences
 *   IDENTITY.md       — agent persona and behavioural rules
 *   USER.md           — user profile (already exists in most setups)
 *   memory/daily/     — daily log files (YYYY-MM-DD.md)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import type { MemorySearchResult, MemoryFileList } from '../shared/types';
import { format } from 'date-fns';
import { nowTimestamp, stripEntryIdComments, stripManagedFileMetadata } from './memory-format';

// ── Constants ──────────────────────────────────────────────────

/** Only these root-level .md files are managed by the memory system. */
const MEMORY_ROOT_FILES = new Set(['MEMORY.md', 'IDENTITY.md', 'USER.md', 'SCRATCHPAD.md']);

export type CapacityTarget = 'memory' | 'identity' | 'user' | 'scratchpad';

const TARGET_CAPACITIES: Record<CapacityTarget, number> = {
  memory: 4_000,
  user: 2_000,
  identity: 2_000,
  scratchpad: 2_000,
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

export function getDailyDir(root: string): string {
  return path.join(root, 'memory', 'daily');
}

export function getDailyPath(root: string, date: string): string {
  return path.join(getDailyDir(root), `${date}.md`);
}

export function getSessionTranscriptDir(root: string): string {
  return path.join(root, 'memory', 'sessions');
}

export function getSessionTranscriptPath(root: string, date: string, sessionId: string): string {
  const shortId = sessionId.slice(0, 8);
  return path.join(getSessionTranscriptDir(root), `${date}-${shortId}.md`);
}

export function getScratchpadPath(root: string): string {
  return path.join(root, 'SCRATCHPAD.md');
}

export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// ── Directory setup ────────────────────────────────────────────

export async function ensureDirectories(root: string): Promise<void> {
  await fs.mkdir(getDailyDir(root), { recursive: true });
  await fs.mkdir(getSessionTranscriptDir(root), { recursive: true });
}

// ── Read / Write / Append ──────────────────────────────────────

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

export async function appendFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const existing = await readFile(filePath);
  const separator = existing?.trim() ? '\n\n' : '';
  const timestamp = nowTimestamp();
  const stamped = `<!-- ${timestamp} -->\n${content}`;
  await fs.writeFile(filePath, (existing ?? '') + separator + stamped, 'utf-8');
}

function normalizeVisibleContent(target: CapacityTarget, content: string): string {
  switch (target) {
    case 'memory':
      return stripEntryIdComments(stripManagedFileMetadata(content)).trim();
    case 'identity':
    case 'user':
      return stripManagedFileMetadata(content).trim();
    case 'scratchpad':
      return content.trim();
  }
}

export function getCapacityForTarget(target: CapacityTarget): number {
  return TARGET_CAPACITIES[target];
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

// ── Context files (for system prompt injection) ────────────────

export async function getContextFiles(
  root: string,
): Promise<{ name: string; content: string }[]> {
  const files: { name: string; content: string }[] = [];

  const pairs: [string, string][] = [
    ['MEMORY.md', getMemoryPath(root)],
    ['IDENTITY.md', getIdentityPath(root)],
    ['USER.md', getUserPath(root)],
  ];

  for (const [name, filePath] of pairs) {
    const content = await readFile(filePath);
    if (content?.trim()) {
      files.push({ name, content: content.trim() });
    }
  }

  return files;
}

// ── Search ─────────────────────────────────────────────────────

export async function searchFiles(
  root: string,
  query: string,
  maxResults: number,
): Promise<MemorySearchResult[]> {
  const results: MemorySearchResult[] = [];
  const needle = query.toLowerCase();

  const searchDirs: { dir: string; prefix: string }[] = [
    { dir: root, prefix: '' },
    { dir: getDailyDir(root), prefix: 'memory/daily' },
  ];

  for (const { dir, prefix } of searchDirs) {
    if (results.length >= maxResults) break;

    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }

    // At the root level, only search known memory files (not AGENTS.md etc.)
    const mdFiles = entries
      .filter((f) => (prefix ? f.endsWith('.md') : MEMORY_ROOT_FILES.has(f)))
      .sort();

    for (const file of mdFiles) {
      if (results.length >= maxResults) break;

      const filePath = path.join(dir, file);
      const content = await readFile(filePath);
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        if (lines[i]!.toLowerCase().includes(needle)) {
          results.push({
            file: prefix ? `${prefix}/${file}` : file,
            line: i + 1,
            text: lines[i]!.trimEnd(),
          });
        }
      }
    }
  }

  return results;
}

// ── List ───────────────────────────────────────────────────────

export async function listFiles(root: string): Promise<MemoryFileList> {
  const rootFiles: string[] = [];
  const dailyFiles: string[] = [];

  try {
    const entries = await fs.readdir(root);
    // Only list known memory files (not AGENTS.md, README.md, etc.)
    for (const f of entries.filter((e) => MEMORY_ROOT_FILES.has(e)).sort()) {
      rootFiles.push(f);
    }
  } catch {
    // directory may not exist
  }

  try {
    const entries = await fs.readdir(getDailyDir(root));
    for (const f of entries.filter((e) => e.endsWith('.md')).sort().reverse()) {
      dailyFiles.push(f);
    }
  } catch {
    // directory may not exist
  }

  return { root: rootFiles, daily: dailyFiles };
}

// ── Target → file path resolution ─────────────────────────────

export function resolveTargetPath(
  root: string,
  target: string,
  date?: string,
): { path: string; displayName: string } | null {
  switch (target) {
    case 'memory':
      return { path: getMemoryPath(root), displayName: 'MEMORY.md' };
    case 'identity':
      return { path: getIdentityPath(root), displayName: 'IDENTITY.md' };
    case 'user':
      return { path: getUserPath(root), displayName: 'USER.md' };
    case 'daily': {
      const d = date || todayStr();
      return { path: getDailyPath(root, d), displayName: `memory/daily/${d}.md` };
    }
    default:
      return null;
  }
}
