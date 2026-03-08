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

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Directory setup ────────────────────────────────────────────

export async function ensureDirectories(root: string): Promise<void> {
  await fs.mkdir(getDailyDir(root), { recursive: true });
}

// ── Read / Write / Append ──────────────────────────────────────

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

export async function appendFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const existing = await readFile(filePath);
  const separator = existing?.trim() ? '\n\n' : '';
  const timestamp = new Date()
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '');
  const stamped = `<!-- ${timestamp} -->\n${content}`;
  await fs.writeFile(filePath, (existing ?? '') + separator + stamped, 'utf-8');
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

    const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();

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
    for (const f of entries.filter((e) => e.endsWith('.md')).sort()) {
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
