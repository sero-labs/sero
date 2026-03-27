/**
 * gog (gogcli) execution helper for CLI commands.
 *
 * Routes gog commands to the right target:
 *   - Container workspaces → `containerManager.exec()` inside the container
 *   - Filesystem workspaces → local `execFile` on the host with Sero-managed
 *     Google OAuth tokens (GOG_KEYRING_PASSWORD)
 *
 * This ensures a single sign-on: once a user authenticates Google through
 * Sero's UI, all workspaces (container or not) can use those credentials.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { containerManager } from '../../shared/infra/shared-infra';
import { getGoogleAuthManager } from '../../ipc/integrations/google-api';
import type { CliCommandContext, CliResult } from '../core/types';

// ── Shell helpers ────────────────────────────────────────────

/** Single-quote a value for safe inclusion in a sh -c command string. */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/** Build a shell-safe command string from an array of arguments. */
function buildCommand(args: string[]): string {
  return args.map(shQuote).join(' ');
}

// ── Local gog binary resolution ──────────────────────────────

const GOG_SEARCH_PATHS = [
  '/opt/homebrew/bin/gog',
  '/usr/local/bin/gog',
  path.join(homedir(), '.local/bin/gog'),
  path.join(homedir(), 'go/bin/gog'),
];

let _gogPath: string | null | undefined;

function findGogBinary(): string {
  if (_gogPath !== undefined) return _gogPath ?? 'gog';
  for (const p of GOG_SEARCH_PATHS) {
    if (existsSync(p)) { _gogPath = p; return p; }
  }
  _gogPath = null;
  return 'gog';
}

function buildEnhancedPath(): string {
  const existing = process.env.PATH || '';
  const extra = ['/opt/homebrew/bin', '/usr/local/bin',
    path.join(homedir(), '.local/bin'), path.join(homedir(), 'go/bin')];
  return [...new Set([...extra, ...existing.split(':')])].join(':');
}

// ── Types ────────────────────────────────────────────────────

export interface GogResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GogOpts {
  json?: boolean;
  account?: string;
  timeoutMs?: number;
  noInput?: boolean;
}

export const GOG_TIMEOUT_MS = 30_000;
export const GOG_AUTH_TIMEOUT_MS = 60_000;

// ── Local execution (non-container workspaces) ───────────────

/** Run gog locally on the host. Auto-injects Sero account + keyring. */
function runGogLocal(gogArgs: string[], opts?: GogOpts): Promise<GogResult> {
  return new Promise((resolve) => {
    const fullArgs: string[] = [];
    // Auto-inject account from Sero Google auth if none provided
    const account = opts?.account ?? getGoogleAuthManager().getEmail() ?? undefined;
    if (account) fullArgs.push('--account', account);
    if (opts?.json) fullArgs.push('--json');
    if (opts?.noInput !== false) fullArgs.push('--no-input');
    fullArgs.push(...gogArgs);

    const child = execFile(findGogBinary(), fullArgs, {
      timeout: opts?.timeoutMs ?? GOG_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        PATH: buildEnhancedPath(),
        // Use Sero-managed keyring so gog finds the tokens imported
        // during Sero's Google OAuth sign-in flow.
        GOG_KEYRING_PASSWORD: 'sero-google-keyring',
      },
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

// ── Container execution ──────────────────────────────────────

/** Run gog inside a workspace container. */
function runGogContainer(
  gogArgs: string[],
  ctx: CliCommandContext,
  opts?: GogOpts,
): Promise<GogResult> {
  const parts = ['gog'];
  if (opts?.account) parts.push('--account', opts.account);
  if (opts?.json) parts.push('--json');
  if (opts?.noInput !== false) parts.push('--no-input');
  parts.push(...gogArgs);

  const command = buildCommand(parts);
  const timeout = opts?.timeoutMs ?? GOG_TIMEOUT_MS;

  return containerManager.exec(ctx.workspaceId, command, undefined, timeout);
}

// ── Smart router ─────────────────────────────────────────────

/**
 * Run gog — routes to container or local host based on workspace type.
 *
 * Container workspaces with a running container → exec inside container.
 * Everything else → local execFile with Sero-managed Google tokens.
 */
export async function runGog(
  gogArgs: string[],
  ctx: CliCommandContext,
  opts?: GogOpts,
): Promise<GogResult> {
  const useContainer = await ctx.workspaceManager.isContainerEnabled(ctx.workspaceId);
  if (useContainer && containerManager.hasContainer(ctx.workspaceId)) {
    return runGogContainer(gogArgs, ctx, opts);
  }
  return runGogLocal(gogArgs, opts);
}

// ── Result helpers ───────────────────────────────────────────

/** Convert a GogResult into a CliResult with user-friendly error messages. */
export function gogResultToCliResult(result: GogResult): CliResult {
  if (result.exitCode === 127) {
    return {
      output: 'gogcli (gog) not found. Install it: brew install steipete/tap/gogcli\n' +
        'See https://github.com/steipete/gogcli for details.',
      exitCode: 1,
    };
  }

  const output = result.stdout.trim();
  const stderr = result.stderr.trim();

  if (result.exitCode !== 0) {
    const errorText = stderr || output || 'Command failed';
    if (errorText.includes('no authenticated accounts') || errorText.includes('not authenticated')) {
      return {
        output: `${errorText}\n\nHint: Sign in to Google via Sero's Settings > Google, ` +
          `or run "sero google auth add <email>".`,
        exitCode: 1,
      };
    }
    return { output: errorText, exitCode: 1 };
  }

  // Combine stdout (primary) with any stderr warnings
  const parts = [output];
  if (stderr && !stderr.startsWith('{')) {
    parts.push(`\n[stderr] ${stderr}`);
  }
  return { output: parts.join(''), exitCode: 0 };
}
