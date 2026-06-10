import { mkdir } from 'node:fs/promises';
import path from 'node:path';
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
  tokenBudget: number;
  exclude: string[];
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
  if (options.tokenBudget > 0) args.push('--token-budget', String(options.tokenBudget));
  for (const pattern of options.exclude) args.push('--exclude', pattern);
  return args;
}

export async function buildWorkspaceGraph(deps: RunnerDeps, options: BuildOptions): Promise<WorkspaceIndexStats> {
  await mkdir(options.workspaceDir, { recursive: true });
  const result = await deps.exec(deps.graphifyPath, buildArgs(options), {
    cwd: options.workspaceDir,
    env: deps.env,
    timeoutMs: BUILD_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) {
    throw new Error(`graphify extract failed (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`);
  }
  // Report generation (GRAPH_REPORT.md + community names) — non-fatal if it fails.
  // cluster-only resolves the graph at <path>/graphify-out/, so it gets the store dir.
  await deps.exec(deps.graphifyPath, ['cluster-only', options.workspaceDir, '--no-viz'], {
    cwd: options.workspaceDir,
    env: deps.env,
    timeoutMs: BUILD_TIMEOUT_MS,
  });
  return parseBuildStats(result.stdout);
}

export async function updateWorkspaceGraph(deps: RunnerDeps, options: BuildOptions): Promise<WorkspaceIndexStats> {
  // `update` writes to <inputPath>/$GRAPHIFY_OUT; an absolute GRAPHIFY_OUT
  // redirects everything into the store dir (verified live in the spike).
  const result = await deps.exec(deps.graphifyPath, ['update', options.inputPath], {
    cwd: options.workspaceDir,
    env: { ...deps.env, GRAPHIFY_OUT: path.join(options.workspaceDir, 'graphify-out') },
    timeoutMs: BUILD_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) {
    throw new Error(`graphify update failed (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`);
  }
  return parseBuildStats(result.stdout);
}

export async function mergeProfileGraph(deps: RunnerDeps, graphPaths: string[], outPath: string): Promise<void> {
  await mkdir(path.dirname(outPath), { recursive: true });
  const result = await deps.exec(deps.graphifyPath, ['merge-graphs', ...graphPaths, '--out', outPath], {
    cwd: path.dirname(outPath),
    env: deps.env,
    timeoutMs: 10 * 60_000,
  });
  if (result.exitCode !== 0) {
    throw new Error(`graphify merge-graphs failed (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`);
  }
}
