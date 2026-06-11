import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE_COMMON_IGNORES } from '@sero-ai/common';
import type { ExecFn } from './bounded-exec';
import type { GraphifyBackend, WorkspaceIndexStats } from '../shared/types';

export interface RunnerDeps {
  exec: ExecFn;
  graphifyPath: string;
  env: NodeJS.ProcessEnv;
}

export interface BuildOptions {
  /** Sero-managed per-workspace store dir — graphify-out/ lands here, never in the workspace. */
  workspaceDir: string;
  /** Workspace root host path (graphify input). */
  inputPath: string;
  backend: GraphifyBackend;
  /** Model override; empty string = the backend's default model. */
  model?: string;
  tokenBudget: number;
  exclude: string[];
  /** Receives graphify's progress lines as they stream. */
  onProgress?: (message: string) => void;
}

const BUILD_TIMEOUT_MS = 60 * 60_000;

function tail(text: string, max = 2000): string {
  return text.length > max ? `…${text.slice(-max)}` : text;
}

/**
 * Parse stats from graphify stdout. Matches both shapes seen in the spike:
 *   "[graphify extract] wrote …: 1,234 nodes, 5,678 edges, 12 communities"
 *   "[graphify watch] Rebuilt: 35 nodes, 42 edges, 5 communities"
 *   "[graphify extract] tokens: 45,000 in / 9,000 out, est. cost (~claude): $0.51"
 */
export function parseBuildStats(stdout: string): WorkspaceIndexStats {
  const summary = stdout.match(/(\d[\d,]*)\s+nodes?,\s*(\d[\d,]*)\s+edges?,\s*(\d[\d,]*)\s+communities/i);
  const parse = (value: string | undefined) => (value ? Number.parseInt(value.replace(/,/g, ''), 10) : 0);
  const tokens = stdout.match(/(\d[\d,]*)\s+in\s*\/\s*(\d[\d,]*)\s+out/i);
  return {
    nodes: parse(summary?.[1] ?? stdout.match(/(\d[\d,]*)\s+nodes?/i)?.[1]),
    edges: parse(summary?.[2] ?? stdout.match(/(\d[\d,]*)\s+edges?/i)?.[1]),
    communities: parse(summary?.[3]),
    inputTokens: parse(tokens?.[1]),
    outputTokens: parse(tokens?.[2]),
  };
}

function buildArgs(options: BuildOptions): string[] {
  // --out redirects graphify-out/ into the store dir (verified in the spike:
  // default output is input-path-relative, which would pollute the workspace).
  const args = ['extract', options.inputPath, '--backend', options.backend, '--out', options.workspaceDir];
  if (options.model) args.push('--model', options.model);
  if (options.tokenBudget > 0) args.push('--token-budget', String(options.tokenBudget));
  for (const pattern of options.exclude) args.push('--exclude', pattern);
  return args;
}

/** Python block-buffers stdout when piped; unbuffered keeps progress lines live. */
function liveEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, PYTHONUNBUFFERED: '1' };
}

const SERO_IGNORE_HEADER = '# Added by Sero Graphify: keep Sero workspace internals out of the knowledge graph';

/**
 * Graphify honors .gitignore/.graphifyignore but cannot know about Sero's
 * workspace internals (`.sero/`, `.pnpm-store/`, …) or be trusted with
 * secrets (`.env`). The canonical list lives in @sero-ai/common
 * (WORKSPACE_COMMON_IGNORES). CLI --exclude only applies to `extract`, not
 * `update`, so an ignore file is the one mechanism covering both.
 * Idempotent and best-effort: never fails the build, never duplicates lines.
 */
export async function ensureGraphifyIgnore(inputPath: string): Promise<void> {
  const ignorePath = path.join(inputPath, '.graphifyignore');
  try {
    const existing = await readFile(ignorePath, 'utf8').catch(() => null);
    const lines = new Set((existing ?? '').split('\n').map((line) => line.trim()));
    const missing = WORKSPACE_COMMON_IGNORES.filter((entry) => !lines.has(entry));
    if (existing !== null && missing.length === 0) return;
    const base = existing === null ? '' : existing.replace(/\n?$/, '\n');
    const header = base.includes(SERO_IGNORE_HEADER) ? '' : `${SERO_IGNORE_HEADER}\n`;
    await writeFile(ignorePath, `${base}${header}${missing.join('\n')}\n`, 'utf8');
  } catch {
    // Unwritable workspace → extract will surface its own clearer error.
  }
}

export async function buildWorkspaceGraph(deps: RunnerDeps, options: BuildOptions): Promise<WorkspaceIndexStats> {
  await mkdir(options.workspaceDir, { recursive: true });
  await ensureGraphifyIgnore(options.inputPath);
  // `--out` only redirects the graph; the AST/semantic extraction cache
  // resolves from the GRAPHIFY_OUT env var and would otherwise land inside
  // the workspace as <inputPath>/graphify-out/cache (observed live).
  const storeOutEnv = { ...liveEnv(deps.env), GRAPHIFY_OUT: path.join(options.workspaceDir, 'graphify-out') };
  const result = await deps.exec(deps.graphifyPath, buildArgs(options), {
    cwd: options.workspaceDir,
    env: storeOutEnv,
    timeoutMs: BUILD_TIMEOUT_MS,
    onLine: options.onProgress,
  });
  if (result.exitCode !== 0) {
    throw new Error(`graphify extract failed (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`);
  }
  // Report generation (GRAPH_REPORT.md + community names) — non-fatal if it fails.
  // cluster-only resolves the graph at <path>/graphify-out/, so it gets the store dir.
  options.onProgress?.('Generating GRAPH_REPORT.md and naming communities…');
  await deps.exec(deps.graphifyPath, ['cluster-only', options.workspaceDir, '--no-viz'], {
    cwd: options.workspaceDir,
    env: storeOutEnv,
    timeoutMs: BUILD_TIMEOUT_MS,
    onLine: options.onProgress,
  });
  return parseBuildStats(result.stdout);
}

export async function updateWorkspaceGraph(deps: RunnerDeps, options: BuildOptions): Promise<WorkspaceIndexStats> {
  await ensureGraphifyIgnore(options.inputPath);
  // `update` writes to <inputPath>/$GRAPHIFY_OUT; an absolute GRAPHIFY_OUT
  // redirects everything into the store dir (verified live in the spike).
  const result = await deps.exec(deps.graphifyPath, ['update', options.inputPath], {
    cwd: options.workspaceDir,
    env: { ...liveEnv(deps.env), GRAPHIFY_OUT: path.join(options.workspaceDir, 'graphify-out') },
    timeoutMs: BUILD_TIMEOUT_MS,
    onLine: options.onProgress,
  });
  if (result.exitCode !== 0) {
    throw new Error(`graphify update failed (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`);
  }
  return parseBuildStats(result.stdout);
}

export async function mergeProfileGraph(deps: RunnerDeps, graphPaths: string[], outPath: string): Promise<void> {
  await mkdir(path.dirname(outPath), { recursive: true });
  // merge-graphs requires at least two graphs; one workspace IS the profile graph.
  if (graphPaths.length === 1) {
    await copyFile(graphPaths[0], outPath);
    return;
  }
  const result = await deps.exec(deps.graphifyPath, ['merge-graphs', ...graphPaths, '--out', outPath], {
    cwd: path.dirname(outPath),
    env: deps.env,
    timeoutMs: 10 * 60_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(`graphify merge-graphs failed (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`);
  }
}
