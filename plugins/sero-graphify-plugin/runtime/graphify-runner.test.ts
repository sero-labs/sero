import { describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { buildWorkspaceGraph, updateWorkspaceGraph, mergeProfileGraph, parseBuildStats, ensureGraphifyIgnore } from './graphify-runner';
import type { BuildOptions } from './graphify-runner';
import type { ModelChoice } from '../shared/types';
import type { ExecResult } from './bounded-exec';

const STORE = path.join(os.tmpdir(), 'graphify-runner-test', 'ws1');
const PROFILE_GRAPH = path.join(os.tmpdir(), 'graphify-runner-test', 'profile', 'graph.json');

const EXTRACT_STDOUT = [
  `[graphify extract] wrote ${STORE}/graphify-out/graph.json: 1,234 nodes, 5,678 edges, 12 communities`,
  '[graphify extract] tokens: 45,000 in / 9,000 out, est. cost (~claude): $0.5100',
  'processed 87 files',
].join('\n');

const UPDATE_STDOUT = '[graphify watch] Rebuilt: 35 nodes, 42 edges, 5 communities';

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0, truncated: false });

const MODEL: ModelChoice = { backend: 'claude', modelId: 'gpt-5.6-luna', chosenAt: 'now' };

function buildOpts(overrides: Partial<BuildOptions> = {}): BuildOptions {
  return {
    workspaceDir: STORE,
    inputPath: '/p',
    model: MODEL,
    tokenBudget: 0,
    maxConcurrency: 0,
    exclude: [],
    ...overrides,
  };
}

describe('parseBuildStats', () => {
  it('parses comma-formatted stats and tokens', () => {
    expect(parseBuildStats(EXTRACT_STDOUT)).toEqual({
      usageMeasured: true,
      stats: { nodes: 1234, edges: 5678, communities: 12, inputTokens: 45000, outputTokens: 9000 },
    });
  });
  it('parses graphify update output', () => {
    // No token line: usage is unknown, NOT zero. Settling a reservation on this
    // would write $0 over a conservative debit and hand back the daily cap.
    expect(parseBuildStats(UPDATE_STDOUT)).toEqual({
      usageMeasured: false,
      stats: { nodes: 35, edges: 42, communities: 5, inputTokens: 0, outputTokens: 0 },
    });
  });
  it('defaults to zeros on unparseable output', () => {
    expect(parseBuildStats('done')).toEqual({
      usageMeasured: false,
      stats: { nodes: 0, edges: 0, communities: 0, inputTokens: 0, outputTokens: 0 },
    });
  });
});

describe('buildWorkspaceGraph', () => {
  it('runs extract with backend/budget/excludes and --out at the workspace store dir', async () => {
    const exec = vi.fn().mockResolvedValue(ok(EXTRACT_STDOUT));
    const stats = await buildWorkspaceGraph(
      { exec, graphifyPath: '/tools/bin/graphify', env: {} },
      buildOpts({ inputPath: '/home/me/proj', tokenBudget: 4096, exclude: ['node_modules'] }),
    );
    expect(stats.stats.nodes).toBe(1234);
    const [cmd, args, opts] = exec.mock.calls[0];
    expect(cmd).toBe('/tools/bin/graphify');
    expect(args).toEqual([
      'extract', '/home/me/proj', '--backend', 'claude', '--out', STORE,
      '--model', 'gpt-5.6-luna', '--api-timeout', '300',
      '--token-budget', '4096', '--exclude', 'node_modules',
    ]);
    expect(opts.cwd).toBe(STORE);
    // Report generation runs against the store dir (where graphify-out/ lives).
    const [, reportArgs] = exec.mock.calls[1];
    expect(reportArgs).toEqual(['cluster-only', STORE, '--no-viz', '--no-label']);
  });

  it('redirects the extraction cache into the store dir via GRAPHIFY_OUT', async () => {
    // `--out` only moves the graph output; the AST/semantic cache resolves from
    // the GRAPHIFY_OUT env var and otherwise lands inside the workspace
    // (observed live: <workspace>/graphify-out/cache/*).
    const exec = vi.fn().mockResolvedValue(ok(EXTRACT_STDOUT));
    await buildWorkspaceGraph(
      { exec, graphifyPath: 'g', env: { PATH: '/bin' } },
      buildOpts({ inputPath: '/home/me/proj' }),
    );
    for (const call of exec.mock.calls) {
      expect(call[2].env.GRAPHIFY_OUT).toBe(path.join(STORE, 'graphify-out'));
    }
  });

  it('throws with stderr tail on failure', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: 'boom', exitCode: 1, truncated: false });
    await expect(buildWorkspaceGraph(
      { exec, graphifyPath: 'g', env: {} },
      buildOpts({}),
    )).rejects.toThrow(/boom/);
  });

  it('always passes the chosen model', async () => {
    const exec = vi.fn().mockResolvedValue(ok(EXTRACT_STDOUT));
    await buildWorkspaceGraph(
      { exec, graphifyPath: 'g', env: {} },
      buildOpts({ model: { backend: 'claude', modelId: 'claude-haiku-4-5-20251001', chosenAt: 'now' } }),
    );
    const [, args] = exec.mock.calls[0];
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('claude-haiku-4-5-20251001');
  });

  it('never runs the paid naming pass inside a build', async () => {
    // Naming is a second LLM pass the pre-flight estimate never covered, so
    // running it here would leave part of the authorised job outside both caps.
    const exec = vi.fn().mockResolvedValue(ok(EXTRACT_STDOUT));
    await buildWorkspaceGraph({ exec, graphifyPath: 'g', env: {} }, buildOpts({}));
    const [, reportArgs] = exec.mock.calls[1];
    expect(reportArgs).toEqual(['cluster-only', STORE, '--no-viz', '--no-label']);
  });

  it('debits only at the spawn boundary, after preparation succeeded', async () => {
    const order: string[] = [];
    const exec = vi.fn().mockImplementation(async () => {
      order.push('exec');
      return ok(EXTRACT_STDOUT);
    });
    await buildWorkspaceGraph({ exec, graphifyPath: 'g', env: {} }, buildOpts({
      beforePaidSpawn: async () => { order.push('reserve'); },
    }));
    expect(order[0]).toBe('reserve');
    expect(order[1]).toBe('exec');
  });

  it('keeps a built graph when the report step fails', async () => {
    // The extraction is already paid for by then; throwing the result away
    // over a failed report would mean paying for it twice.
    const exec = vi.fn()
      .mockResolvedValueOnce(ok(EXTRACT_STDOUT))
      .mockResolvedValueOnce({ stdout: '', stderr: 'cluster boom', exitCode: 1, truncated: false });
    const stats = await buildWorkspaceGraph({ exec, graphifyPath: 'g', env: {} }, buildOpts({}));
    expect(stats.stats.nodes).toBe(1234);
  });

  it('does not let a chatty build be killed for its output', async () => {
    const exec = vi.fn().mockResolvedValue(ok(EXTRACT_STDOUT));
    await buildWorkspaceGraph({ exec, graphifyPath: 'g', env: {} }, buildOpts({}));
    expect(exec.mock.calls[0][2].onOutputLimit).toBe('truncate');
  });

  it('streams progress lines with unbuffered python output', async () => {
    const exec = vi.fn().mockImplementation(async (_cmd, _args, opts) => {
      opts.onLine?.('[graphify extract] scanning /p');
      return ok(EXTRACT_STDOUT);
    });
    const progress: string[] = [];
    await buildWorkspaceGraph(
      { exec, graphifyPath: 'g', env: { PATH: '/bin' } },
      buildOpts({ onProgress: (m: string) => progress.push(m) }),
    );
    expect(progress).toContain('[graphify extract] scanning /p');
    expect(exec.mock.calls[0][2].env.PYTHONUNBUFFERED).toBe('1');
  });
});

describe('updateWorkspaceGraph', () => {
  it('redirects output into the store dir via GRAPHIFY_OUT', async () => {
    const exec = vi.fn().mockResolvedValue(ok(UPDATE_STDOUT));
    const stats = await updateWorkspaceGraph(
      { exec, graphifyPath: 'g', env: { PATH: '/bin' } },
      { workspaceDir: STORE, inputPath: '/home/me/proj' },
    );
    expect(stats.stats.nodes).toBe(35);
    const [, args, opts] = exec.mock.calls[0];
    expect(args).toEqual(['update', '/home/me/proj']);
    expect(opts.env.GRAPHIFY_OUT).toBe(path.join(STORE, 'graphify-out'));
    expect(opts.env.PATH).toBe('/bin');
  });
});

describe('ensureGraphifyIgnore', () => {
  it('creates .graphifyignore with all Sero internals in the workspace', async () => {
    const { mkdtemp, readFile } = await import('node:fs/promises');
    const ws = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    await ensureGraphifyIgnore(ws);
    const content = await readFile(path.join(ws, '.graphifyignore'), 'utf8');
    expect(content).toContain('.sero/');
    expect(content).toContain('.pnpm-store/');
  });

  it('appends to an existing ignore file without clobbering it', async () => {
    const { mkdtemp, readFile, writeFile } = await import('node:fs/promises');
    const ws = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    await writeFile(path.join(ws, '.graphifyignore'), 'custom-dir/\n');
    await ensureGraphifyIgnore(ws);
    const content = await readFile(path.join(ws, '.graphifyignore'), 'utf8');
    expect(content).toContain('custom-dir/');
    expect(content).toContain('.sero/');
    expect(content).toContain('.pnpm-store/');
  });

  it('tops up files written by older versions with newly required entries', async () => {
    const { mkdtemp, readFile, writeFile } = await import('node:fs/promises');
    const ws = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    await writeFile(path.join(ws, '.graphifyignore'), '# Added by Sero Graphify: keep Sero workspace internals out of the knowledge graph\n.sero/\n');
    await ensureGraphifyIgnore(ws);
    const content = await readFile(path.join(ws, '.graphifyignore'), 'utf8');
    expect(content).toContain('.pnpm-store/');
    expect(content.match(/\.sero\//g)).toHaveLength(1); // no duplicates
  });

  it('is idempotent and never throws on bad paths', async () => {
    const { mkdtemp, readFile } = await import('node:fs/promises');
    const ws = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    await ensureGraphifyIgnore(ws);
    const first = await readFile(path.join(ws, '.graphifyignore'), 'utf8');
    await ensureGraphifyIgnore(ws);
    expect(await readFile(path.join(ws, '.graphifyignore'), 'utf8')).toBe(first);
    await expect(ensureGraphifyIgnore('/nonexistent/nowhere')).resolves.toBeUndefined();
  });
});

describe('mergeProfileGraph', () => {
  it('passes all graph paths and --out', async () => {
    const exec = vi.fn().mockResolvedValue(ok('Merged 2 graphs -> 61 nodes, 76 edges'));
    await mergeProfileGraph({ exec, graphifyPath: 'g', env: {} }, ['/a/graph.json', '/b/graph.json'], PROFILE_GRAPH);
    expect(exec.mock.calls[0][1]).toEqual(['merge-graphs', '/a/graph.json', '/b/graph.json', '--out', PROFILE_GRAPH]);
  });

  it('copies the single graph when only one workspace is indexed (merge-graphs needs two)', async () => {
    const { mkdtemp, mkdir, writeFile, readFile } = await import('node:fs/promises');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'graphify-merge-'));
    const source = path.join(dir, 'ws1', 'graph.json');
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, '{"nodes":[],"links":[]}');
    const out = path.join(dir, 'profile', 'graph.json');
    const exec = vi.fn();
    await mergeProfileGraph({ exec, graphifyPath: 'g', env: {} }, [source], out);
    expect(exec).not.toHaveBeenCalled();
    expect(await readFile(out, 'utf8')).toBe('{"nodes":[],"links":[]}');
  });
});
