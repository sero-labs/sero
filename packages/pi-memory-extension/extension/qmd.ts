/**
 * QMD integration — detection, auto-install, collection management, search.
 *
 * QMD is an external CLI tool providing BM25 keyword, vector semantic,
 * and hybrid search over markdown files. All interaction is via child
 * process (execFile) — same pattern as Sero's git integration.
 *
 * Graceful degradation: if QMD or Bun is missing, all functions
 * return safe defaults (false, empty string, etc.).
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveMemoryRoot } from './memory-manager';

// ── State ──────────────────────────────────────────────────────

let qmdAvailable = false;
let qmdPath = 'qmd';
let bunPath = 'bun';
let updateTimer: ReturnType<typeof setTimeout> | null = null;

const QMD_COLLECTION = 'sero-memory';
const QMD_PACKAGE = '@tobilu/qmd';
const SEARCH_TIMEOUT_MS = 3_000;
const UPDATE_DEBOUNCE_MS = 500;

// ── Binary resolution ──────────────────────────────────────────

/** Find a binary by checking common locations Electron might miss. */
function findBinary(name: string): string {
  const home = os.homedir();
  const candidates = [
    name, // on PATH already
    path.join(home, '.bun', 'bin', name),
    path.join(home, '.local', 'bin', name),
    `/usr/local/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
  ];
  for (const candidate of candidates) {
    if (candidate === name) continue; // skip bare name, test via exec
    if (existsSync(candidate)) return candidate;
  }
  return name; // fallback to bare name
}

function resolvePaths(): void {
  qmdPath = findBinary('qmd');
  bunPath = findBinary('bun');
}

// ── Detection ──────────────────────────────────────────────────

export function isQmdAvailable(): boolean {
  return qmdAvailable;
}

export function detectQmd(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(qmdPath, ['status'], { timeout: 5_000 }, (err) => {
      resolve(!err);
    });
  });
}

export function detectBun(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bunPath, ['--version'], { timeout: 5_000 }, (err) => {
      resolve(!err);
    });
  });
}

// ── Auto-install ───────────────────────────────────────────────

export async function tryInstallQmd(): Promise<boolean> {
  const hasBun = await detectBun();
  if (!hasBun) return false;

  return new Promise((resolve) => {
    execFile(
      bunPath,
      ['install', '-g', QMD_PACKAGE],
      { timeout: 60_000 },
      (err) => resolve(!err),
    );
  });
}

export function installInstructions(): string {
  const root = resolveMemoryRoot();
  return [
    'memory_search requires qmd (semantic search engine).',
    '',
    'Install (requires Bun):',
    `  bun install -g ${QMD_PACKAGE}`,
    '',
    'Or install Bun first:',
    '  curl -fsSL https://bun.sh/install | bash',
    '',
    'Then restart Sero — QMD will be auto-configured.',
  ].join('\n');
}

// ── Collection management ──────────────────────────────────────

export function checkCollection(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(qmdPath, ['collection', 'list', '--json'], { timeout: 10_000 }, (err, stdout) => {
      if (err) { resolve(false); return; }
      try {
        const parsed = JSON.parse(stdout);
        const collections = Array.isArray(parsed) ? parsed : [];
        resolve(collections.some((e: unknown) => {
          if (typeof e === 'string') return e === QMD_COLLECTION;
          if (e && typeof e === 'object' && 'name' in e) {
            return (e as { name?: string }).name === QMD_COLLECTION;
          }
          return false;
        }));
      } catch {
        resolve(stdout.includes(QMD_COLLECTION));
      }
    });
  });
}

export async function setupCollection(): Promise<boolean> {
  const root = resolveMemoryRoot();

  // Create collection
  try {
    await execPromise(qmdPath, ['collection', 'add', root, '--name', QMD_COLLECTION], 10_000);
  } catch {
    return false;
  }

  // Add path contexts (best-effort)
  const contexts: [string, string][] = [
    ['/memory/daily', 'Daily append-only work logs organised by date'],
    ['/', 'Curated long-term memory: decisions, preferences, facts, lessons'],
  ];
  for (const [ctxPath, desc] of contexts) {
    try {
      await execPromise(qmdPath, ['context', 'add', ctxPath, desc, '-c', QMD_COLLECTION], 10_000);
    } catch { /* context may already exist */ }
  }

  return true;
}

// ── Initialisation (called on session_start) ───────────────────

export async function initQmd(): Promise<boolean> {
  resolvePaths();
  qmdAvailable = await detectQmd();

  if (!qmdAvailable) {
    // Try auto-install
    const installed = await tryInstallQmd();
    if (installed) {
      qmdAvailable = await detectQmd();
    }
  }

  if (!qmdAvailable) return false;

  // Ensure collection exists
  const hasCollection = await checkCollection();
  if (!hasCollection) {
    await setupCollection();
  }

  return true;
}

// ── Search ─────────────────────────────────────────────────────

export type QmdSearchMode = 'keyword' | 'semantic' | 'deep';

export interface QmdSearchResult {
  path?: string;
  file?: string;
  score?: number;
  content?: string;
  chunk?: string;
  snippet?: string;
  [key: string]: unknown;
}

function getResultPath(r: QmdSearchResult): string | undefined {
  return r.path ?? r.file;
}

function getResultText(r: QmdSearchResult): string {
  return r.content ?? r.chunk ?? r.snippet ?? '';
}

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, '');
}

function parseQmdJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed || trimmed === 'No results found.' || trimmed === 'No results found') return [];

  const cleaned = stripAnsi(stdout);
  const lines = cleaned.split(/\r?\n/);
  const startLine = lines.findIndex((l) => {
    const s = l.trimStart();
    return s.startsWith('[') || s.startsWith('{');
  });
  if (startLine === -1) return [];

  const jsonText = lines.slice(startLine).join('\n').trim();
  if (!jsonText) return [];
  return JSON.parse(jsonText);
}

export async function runSearch(
  mode: QmdSearchMode,
  query: string,
  limit: number,
): Promise<{ results: QmdSearchResult[]; stderr: string }> {
  const subcommand = mode === 'keyword' ? 'search' : mode === 'semantic' ? 'vsearch' : 'query';
  const args = [subcommand, '--json', '-c', QMD_COLLECTION, '-n', String(limit), query];

  const { stdout, stderr } = await execPromise(qmdPath, args, 60_000);
  const parsed = parseQmdJson(stdout);
  const results = Array.isArray(parsed)
    ? parsed
    : ((parsed as Record<string, unknown>).results ?? (parsed as Record<string, unknown>).hits ?? []);

  return { results: results as QmdSearchResult[], stderr };
}

/**
 * Search for memories relevant to a user prompt.
 * Used for selective injection (before_agent_start).
 * Returns formatted markdown or empty string on error.
 */
export async function searchRelevantMemories(prompt: string): Promise<string> {
  if (!qmdAvailable || !prompt.trim()) return '';

  const sanitised = prompt
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, 200);
  if (!sanitised) return '';

  try {
    const hasCol = await checkCollection();
    if (!hasCol) return '';

    const { results } = await Promise.race([
      runSearch('keyword', sanitised, 3),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), SEARCH_TIMEOUT_MS),
      ),
    ]);

    if (!results || results.length === 0) return '';

    const snippets = results
      .map((r) => {
        const text = getResultText(r);
        if (!text.trim()) return null;
        const filePath = getResultPath(r);
        const filePart = filePath ? `_${filePath}_` : '';
        return filePart ? `${filePart}\n${text.trim()}` : text.trim();
      })
      .filter(Boolean);

    if (snippets.length === 0) return '';
    return snippets.join('\n\n---\n\n');
  } catch {
    return '';
  }
}

// ── Re-indexing (debounced) ────────────────────────────────────

export function scheduleQmdUpdate(): void {
  if (!qmdAvailable) return;
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    updateTimer = null;
    execFile(qmdPath, ['update'], { timeout: 30_000 }, () => {});
  }, UPDATE_DEBOUNCE_MS);
}

export async function runQmdUpdateNow(): Promise<void> {
  if (!qmdAvailable) return;
  await execPromise(qmdPath, ['update'], 30_000).catch(() => {});
}

export function clearUpdateTimer(): void {
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
}

// ── Helper ─────────────────────────────────────────────────────

function execPromise(
  cmd: string,
  args: string[],
  timeout: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}
