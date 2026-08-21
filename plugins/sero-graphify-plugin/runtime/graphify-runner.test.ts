import { describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { buildWorkspaceGraph, mergeProfileGraph, parseBuildStats, ensureGraphifyIgnore, rebuildWorkspaceGraph } from './graphify-runner';
import type { BuildOptions } from './graphify-runner';
import type { ExecResult } from './bounded-exec';

const STORE = path.join(os.tmpdir(), 'graphify-runner-test', 'ws1');
const PROFILE_GRAPH = path.join(os.tmpdir(), 'graphify-runner-test', 'profile', 'graph.json');

const EXTRACT_STDOUT = [
  `[graphify extract] wrote ${STORE}/graphify-out/graph.json: 1,234 nodes, 5,678 edges, 12 communities`,
  '[graphify extract] tokens: 45,000 in / 9,000 out, est. cost (~claude): $0.5100',
  'processed 87 files',
].join('\n');

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0, truncated: false });

function buildOpts(overrides: Partial<BuildOptions> = {}): BuildOptions {
  return {
    workspaceDir: STORE,
    inputPath: '/p',
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
  it('defaults to zeros on unparseable output', () => {
    expect(parseBuildStats('done')).toEqual({
      usageMeasured: false,
      stats: { nodes: 0, edges: 0, communities: 0, inputTokens: 0, outputTokens: 0 },
    });
  });
});

describe('buildWorkspaceGraph', () => {
  it('runs local code-only extraction and writes to the workspace store', async () => {
    const exec = vi.fn().mockResolvedValue(ok(EXTRACT_STDOUT));
    const stats = await buildWorkspaceGraph(
      { exec, graphifyPath: '/tools/bin/graphify', env: {} },
      buildOpts({ inputPath: '/home/me/proj', exclude: ['node_modules'] }),
    );
    expect(stats.stats.nodes).toBe(1234);
    const [cmd, args, opts] = exec.mock.calls[0];
    expect(cmd).toBe('/tools/bin/graphify');
    expect(args).toEqual([
      'extract', '/home/me/proj', '--code-only', '--no-cluster', '--out', STORE,
      '--exclude', 'node_modules',
    ]);
    expect(stats.changed).toBe(true);
    expect(opts.cwd).toBe(STORE);
    // Report generation runs against the store dir (where graphify-out/ lives).
    const [, reportArgs] = exec.mock.calls[1];
    expect(reportArgs).toEqual(['cluster-only', STORE, '--no-viz']);
  });

  it('keeps incremental refresh arguments free of --force', async () => {
    const exec = vi.fn().mockResolvedValue(ok(EXTRACT_STDOUT));
    await buildWorkspaceGraph({ exec, graphifyPath: 'g', env: {} }, buildOpts());

    expect(exec.mock.calls[0][1]).not.toContain('--force');
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

  it('does not pass a model backend or credential selector', async () => {
    const exec = vi.fn().mockResolvedValue(ok(EXTRACT_STDOUT));
    await buildWorkspaceGraph({ exec, graphifyPath: 'g', env: {} }, buildOpts());
    const [, args] = exec.mock.calls[0];
    expect(args).not.toContain('--model');
    expect(args).not.toContain('--backend');
  });

  it('allows Graphify to create deterministic community labels', async () => {
    const exec = vi.fn().mockResolvedValue(ok(EXTRACT_STDOUT));
    await buildWorkspaceGraph({ exec, graphifyPath: 'g', env: {} }, buildOpts({}));
    const [, reportArgs] = exec.mock.calls[1];
    expect(reportArgs).not.toContain('--no-label');
  });

  it('fails when clustering fails so a raw graph is not accepted as complete', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce(ok(EXTRACT_STDOUT))
      .mockResolvedValueOnce({ stdout: '', stderr: 'cluster boom', exitCode: 1, truncated: false });
    await expect(buildWorkspaceGraph(
      { exec, graphifyPath: 'g', env: {} },
      buildOpts({}),
    )).rejects.toThrow(/cluster boom/);
  });

  it('skips clustering when the incremental scan finds no changes', async () => {
    const stdout = '[graphify extract] no incremental changes detected (--no-cluster); outputs left untouched.';
    const exec = vi.fn().mockResolvedValue(ok(stdout));
    const outcome = await buildWorkspaceGraph({ exec, graphifyPath: 'g', env: {} }, buildOpts({}));

    expect(outcome.changed).toBe(false);
    expect(exec).toHaveBeenCalledTimes(1);
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

describe('rebuildWorkspaceGraph', () => {
  it('passes --force and replaces the active graph after clustering succeeds', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'graphify-rebuild-'));
    const workspaceDir = path.join(parent, 'ws1');
    await mkdir(path.join(workspaceDir, 'graphify-out'), { recursive: true });
    await writeFile(path.join(workspaceDir, 'graphify-out', 'graph.json'), 'old');
    const exec = vi.fn().mockImplementation(async (_cmd, args, options) => {
      if (args[0] === 'extract') {
        await mkdir(path.join(options.cwd, 'graphify-out'), { recursive: true });
        await writeFile(path.join(options.cwd, 'graphify-out', 'graph.json'), 'clean-code-only');
      }
      return ok(EXTRACT_STDOUT);
    });

    await rebuildWorkspaceGraph(
      { exec, graphifyPath: 'g', env: {} },
      buildOpts({ workspaceDir }),
    );

    expect(exec.mock.calls[0][1]).toEqual([
      'extract', '/p', '--force', '--code-only', '--no-cluster', '--out', expect.stringContaining('.rebuild-'),
    ]);
    expect(await readFile(path.join(workspaceDir, 'graphify-out', 'graph.json'), 'utf8')).toBe('clean-code-only');
    expect((await readdir(parent)).filter((name) => name.includes('.rebuild-') || name.includes('.backup-'))).toEqual([]);
  });

  it('keeps the active graph when clean extraction fails', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'graphify-rebuild-fail-'));
    const workspaceDir = path.join(parent, 'ws1');
    await mkdir(path.join(workspaceDir, 'graphify-out'), { recursive: true });
    await writeFile(path.join(workspaceDir, 'graphify-out', 'graph.json'), 'valid-profile-source');
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: 'extract failed', exitCode: 1, truncated: false });

    await expect(rebuildWorkspaceGraph(
      { exec, graphifyPath: 'g', env: {} },
      buildOpts({ workspaceDir }),
    )).rejects.toThrow(/extract failed/);

    expect(await readFile(path.join(workspaceDir, 'graphify-out', 'graph.json'), 'utf8')).toBe('valid-profile-source');
    expect((await readdir(parent)).filter((name) => name.includes('.rebuild-'))).toEqual([]);
  });
});

describe('ensureGraphifyIgnore', () => {
  it('creates .graphifyignore with all Sero internals in the workspace', async () => {
    const ws = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    await ensureGraphifyIgnore(ws);
    const content = await readFile(path.join(ws, '.graphifyignore'), 'utf8');
    expect(content).toContain('.sero/');
    expect(content).toContain('.pnpm-store/');
  });

  it('appends to an existing ignore file without clobbering it', async () => {
    const ws = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    await writeFile(path.join(ws, '.graphifyignore'), 'custom-dir/\n');
    await ensureGraphifyIgnore(ws);
    const content = await readFile(path.join(ws, '.graphifyignore'), 'utf8');
    expect(content).toContain('custom-dir/');
    expect(content).toContain('.sero/');
    expect(content).toContain('.pnpm-store/');
  });

  it('tops up files written by older versions with newly required entries', async () => {
    const ws = await mkdtemp(path.join(os.tmpdir(), 'graphify-ws-'));
    await writeFile(path.join(ws, '.graphifyignore'), '# Added by Sero Graphify: keep Sero workspace internals out of the knowledge graph\n.sero/\n');
    await ensureGraphifyIgnore(ws);
    const content = await readFile(path.join(ws, '.graphifyignore'), 'utf8');
    expect(content).toContain('.pnpm-store/');
    expect(content.match(/\.sero\//g)).toHaveLength(1); // no duplicates
  });

  it('is idempotent and never throws on bad paths', async () => {
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
