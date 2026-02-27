/**
 * gogcli execution helper — spawns `gog` with --json --no-input.
 *
 * Works on the host (Pi CLI or Sero main process). Probes common
 * install locations since Electron may not inherit the shell PATH.
 * Install via: brew install steipete/tap/gogcli
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export interface GogResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const GOG_TIMEOUT_MS = 30_000;

const GOG_SEARCH_PATHS = [
  '/opt/homebrew/bin/gog',
  '/usr/local/bin/gog',
  path.join(homedir(), '.local/bin/gog'),
  path.join(homedir(), 'go/bin/gog'),
];

let _gogPath: string | null | undefined;

function findGog(): string {
  if (_gogPath !== undefined) return _gogPath ?? 'gog';
  for (const p of GOG_SEARCH_PATHS) {
    if (existsSync(p)) { _gogPath = p; return p; }
  }
  _gogPath = null;
  return 'gog';
}

function enhancedPath(): string {
  const existing = process.env.PATH || '';
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', path.join(homedir(), '.local/bin')];
  return [...new Set([...extra, ...existing.split(':')])].join(':');
}

/**
 * Run a gogcli command and return raw output.
 */
export function runGog(
  args: string[],
  opts?: { account?: string; timeoutMs?: number; json?: boolean },
): Promise<GogResult> {
  return new Promise((resolve) => {
    const fullArgs: string[] = [];
    if (opts?.account) fullArgs.push('--account', opts.account);
    if (opts?.json !== false) fullArgs.push('--json');
    fullArgs.push('--no-input', ...args);

    const child = execFile(findGog(), fullArgs, {
      timeout: opts?.timeoutMs ?? GOG_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PATH: enhancedPath() },
    }, (error, stdout, stderr) => {
      if (error && (error as any).code === 'ENOENT') {
        resolve({ stdout: '', stderr: 'gog binary not found', exitCode: 127 });
        return;
      }
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: error ? ((error as any).status ?? 1) : 0,
      });
    });

    child.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: 127 });
    });
  });
}

/**
 * Run gogcli and parse the JSON output. Returns null on failure.
 */
export async function runGogJson<T = unknown>(
  args: string[],
  opts?: { account?: string; timeoutMs?: number },
): Promise<{ data: T | null; error: string | null }> {
  const result = await runGog(args, { ...opts, json: true });

  if (result.exitCode === 127) {
    return { data: null, error: 'gogcli (gog) not found. Install: brew install steipete/tap/gogcli' };
  }
  if (result.exitCode !== 0) {
    return { data: null, error: result.stderr.trim() || result.stdout.trim() || 'Command failed' };
  }
  try {
    return { data: JSON.parse(result.stdout) as T, error: null };
  } catch {
    return { data: null, error: result.stdout.trim() || 'Failed to parse output' };
  }
}
