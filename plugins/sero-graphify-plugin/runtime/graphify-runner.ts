import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE_COMMON_IGNORES } from '@sero-ai/common';
import type { ExecFn } from './bounded-exec';
import { BUILD_MAX_OUTPUT_BYTES } from './bounded-exec';
import type { WorkspaceIndexStats } from '../shared/types';

export interface RunnerDeps {
  exec: ExecFn;
  graphifyPath: string;
  env: NodeJS.ProcessEnv;
}

/** What a local code-only extraction needs. It never calls a model. */
export interface BuildOptions {
  /** Sero-managed per-workspace store dir — graphify-out/ lands here, never in the workspace. */
  workspaceDir: string;
  /** Workspace root host path (graphify input). */
  inputPath: string;
  /** Receives graphify's progress lines as they stream. */
  onProgress?: (message: string) => void;
  exclude: string[];
}

const BUILD_TIMEOUT_MS = 60 * 60_000;

function tail(text: string, max = 2000): string {
  return text.length > max ? `…${text.slice(-max)}` : text;
}

/**
 * What a graphify run reported.
 *
 * `usageMeasured` records whether Graphify printed a token line. Code-only
 * builds normally omit it. The field also gives the smoke test a direct check
 * that this path did not enter semantic extraction.
 */
export interface BuildOutcome {
  stats: WorkspaceIndexStats;
  usageMeasured: boolean;
}

/**
 * Parse stats from graphify stdout. Matches both shapes seen in the spike:
 *   "[graphify extract] wrote …: 1,234 nodes, 5,678 edges, 12 communities"
 *   "[graphify extract] tokens: 45,000 in / 9,000 out, est. cost (~claude): $0.51"
 */
export function parseBuildStats(stdout: string): BuildOutcome {
  const summary = stdout.match(/(\d[\d,]*)\s+nodes?,\s*(\d[\d,]*)\s+edges?,\s*(\d[\d,]*)\s+communities/i);
  const parse = (value: string | undefined) => (value ? Number.parseInt(value.replace(/,/g, ''), 10) : 0);
  const tokens = stdout.match(/(\d[\d,]*)\s+in\s*\/\s*(\d[\d,]*)\s+out/i);
  return {
    usageMeasured: tokens !== null,
    stats: {
      nodes: parse(summary?.[1] ?? stdout.match(/(\d[\d,]*)\s+nodes?/i)?.[1]),
      edges: parse(summary?.[2] ?? stdout.match(/(\d[\d,]*)\s+edges?/i)?.[1]),
      communities: parse(summary?.[3]),
      inputTokens: parse(tokens?.[1]),
      outputTokens: parse(tokens?.[2]),
    },
  };
}

function buildArgs(options: BuildOptions): string[] {
  // --out redirects graphify-out/ into the store dir (verified in the spike:
  // default output is input-path-relative, which would pollute the workspace).
  const args = [
    'extract', options.inputPath,
    // Code extraction is deterministic Tree-sitter work. This also prevents
    // Graphify from sending workspace documents to a model.
    '--code-only',
    '--out', options.workspaceDir,
  ];
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
 * (WORKSPACE_COMMON_IGNORES). The ignore file also protects any direct
 * Graphify command a user runs in the workspace.
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

export async function buildWorkspaceGraph(deps: RunnerDeps, options: BuildOptions): Promise<BuildOutcome> {
  await mkdir(options.workspaceDir, { recursive: true });
  await ensureGraphifyIgnore(options.inputPath);
  // `--out` only redirects the graph; the AST extraction cache
  // resolves from the GRAPHIFY_OUT env var and would otherwise land inside
  // the workspace as <inputPath>/graphify-out/cache (observed live).
  const storeOutEnv = { ...liveEnv(deps.env), GRAPHIFY_OUT: path.join(options.workspaceDir, 'graphify-out') };
  const result = await deps.exec(deps.graphifyPath, buildArgs(options), {
    cwd: options.workspaceDir,
    env: storeOutEnv,
    timeoutMs: BUILD_TIMEOUT_MS,
    // Keep a large local build alive when progress output is verbose.
    maxOutputBytes: BUILD_MAX_OUTPUT_BYTES,
    onOutputLimit: 'truncate',
    onLine: options.onProgress,
  });
  if (result.exitCode !== 0) {
    throw new Error(`graphify extract failed (exit ${result.exitCode}): ${tail(result.stderr || result.stdout)}`);
  }

  const extraction = parseBuildStats(result.stdout);
  const cluster = await clusterGraph(deps, options, storeOutEnv);
  return {
    usageMeasured: extraction.usageMeasured,
    stats: {
      ...extraction.stats,
      communities: cluster.communities || extraction.stats.communities,
    },
  };
}

/** Clustering, deterministic hub labels, and the report are always local. */
async function clusterGraph(
  deps: RunnerDeps,
  options: BuildOptions,
  env: NodeJS.ProcessEnv,
): Promise<WorkspaceIndexStats> {
  options.onProgress?.('Generating GRAPH_REPORT.md…');
  // This child receives no provider credentials. Graphify therefore keeps its
  // deterministic hub labels instead of making an LLM call. `--no-label`
  // would explicitly replace those labels with "Community N" placeholders.
  const args = ['cluster-only', options.workspaceDir, '--no-viz'];

  const result = await deps.exec(deps.graphifyPath, args, {
    cwd: options.workspaceDir,
    env,
    timeoutMs: BUILD_TIMEOUT_MS,
    maxOutputBytes: BUILD_MAX_OUTPUT_BYTES,
    onOutputLimit: 'truncate',
    onLine: options.onProgress,
  });
  // Reported, never fatal: the local graph is already built, and a failed
  // report is not worth discarding it.
  if (result.exitCode !== 0) {
    options.onProgress?.(`Report step failed (exit ${result.exitCode}); the graph itself is complete.`);
    return { nodes: 0, edges: 0, communities: 0, inputTokens: 0, outputTokens: 0 };
  }
  return parseBuildStats(result.stdout).stats;
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
