import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ArchitectHost } from './host';
import type { ProjectsActions, ProjectsOutcome } from './projects-actions';
import type { RecordStore } from './record-store';

export const SAMPLE_REQUEST = 'Repair truncate.cjs so truncated text fits every nonnegative character limit, including limits shorter than the ellipsis. Keep short text unchanged. Run node --test repair.test.cjs, record the check and the source diff, and deliver the checked repair. Do not change the test or add dependencies. This is a disposable sample; stop after delivery.';
export const SAMPLE_FILES: Record<string, string> = {
  '.gitignore': '.sero/\n',
  'truncate.cjs': "module.exports = (text, max) => text.length > max ? text.slice(0, max) + '...' : text;\n",
  'repair.test.cjs': "const {test} = require('node:test');\nconst assert = require('node:assert/strict');\nconst truncate = require('./truncate.cjs');\ntest('truncation fits every nonnegative limit', () => {\n  for (const max of [0, 1, 2, 3, 4, 6, 20]) assert.ok(truncate('abcdef', max).length <= max);\n  assert.equal(truncate('ab', 5), 'ab');\n  assert.equal(truncate('hello world', 8), 'hello...');\n});\n",
  'README.md': '# Sample repair\n\nThis disposable repository contains a broken text helper. Run `node --test repair.test.cjs`: the check fails until the helper is repaired. Keep the test unchanged. Review the passing check and Git diff, then open truncate.cjs to see the result. No package installation is needed.\n',
};

export type SampleOutcome = ProjectsOutcome & { needsStart?: boolean };
interface SampleState { name: string; workspaceId?: string }

/** One saved destination per profile. A retry never seeds over an existing baseline. */
export function createSampleRepair(deps: { host: ArchitectHost; store: RecordStore; projects: Pick<ProjectsActions, 'create'> }): () => Promise<SampleOutcome> {
  let inFlight: Promise<SampleOutcome> | null = null;
  const prepare = async (): Promise<SampleOutcome> => {
    const { host, store, projects } = deps;
    const home = await host.homeDir();
    const stateFile = path.join(home, 'sample-repair.json');
    const save = async (state: SampleState) => {
      await fs.writeFile(`${stateFile}.tmp`, JSON.stringify(state));
      await fs.rename(`${stateFile}.tmp`, stateFile);
    };
    const saved: unknown = await host.pathExists(stateFile) ? JSON.parse(await fs.readFile(stateFile, 'utf8')) : null;
    let state: SampleState;
    if (saved === null) {
      state = { name: `Sample repair ${host.newId('sample')}` };
      await save(state);
    } else {
      if (typeof saved !== 'object' || !('name' in saved) || typeof saved.name !== 'string'
        || !/^Sample repair sample_[a-z0-9]+$/.test(saved.name)) throw new Error('The saved sample identity is invalid. Its files have been kept.');
      state = { name: saved.name, ...('workspaceId' in saved && typeof saved.workspaceId === 'string' ? { workspaceId: saved.workspaceId } : {}) };
    }
    const workspaces = await host.listWorkspaces();
    let workspace = state.workspaceId ? workspaces.find((item) => item.id === state.workspaceId) : workspaces.find((item) => item.name === state.name);
    if (state.workspaceId && !workspace) throw new Error('The sample workspace was removed. Its saved files have been kept; restore the workspace to open it.');
    if (!workspace) {
      // The manager owns the profile workspace root, including custom profiles
      // and symlinked homes. Passing a guessed parent would bypass that choice.
      workspace = await host.createWorkspace(state.name, undefined, true);
    }
    await save({ ...state, workspaceId: workspace.id });
    const existing = (await store.list()).find((record) => record.workspaceId === workspace.id);
    if (existing) return { ok: true, text: 'Opening your existing sample. Use Resume if you want to continue stopped work.', projectId: existing.id };

    const git = async (args: string[]) => {
      const result = await host.exec('git', args, workspace.path);
      if (result.exitCode !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || 'Git could not prepare the sample. Retry to continue.');
      return result;
    };
    await git(['init']);
    const head = await host.exec('git', ['rev-parse', '--verify', 'HEAD'], workspace.path);
    if (head.exitCode !== 0) {
      for (const [name, content] of Object.entries(SAMPLE_FILES)) {
        const target = path.join(workspace.path, name);
        if (await host.pathExists(target)) {
          if (await fs.readFile(target, 'utf8') !== content) throw new Error(`The sample file ${name} changed before setup finished. It has been kept.`);
        } else await fs.writeFile(target, content, { flag: 'wx' });
      }
      await git(['add', '--', ...Object.keys(SAMPLE_FILES)]);
      await git(['-c', 'user.name=Sero Sample', '-c', 'user.email=sample@sero.local', '-c', 'commit.gpgsign=false', 'commit', '-m', 'chore: seed faulty sample repair']);
    }
    // Run through the selected workspace runtime. Never silently switch to Host.
    const node = await host.runCommand(workspace.id, workspace.path, 'node --version', 120_000);
    if (node.exitCode !== 0) throw new Error(`The sample runtime is not ready: ${node.stderr || node.stdout}. Retry after checking runtime setup. Your files are kept.`);
    const check = await host.runCommand(workspace.id, workspace.path, 'node --test --test-reporter=tap repair.test.cjs', 120_000);
    if (check.exitCode !== 1 || !/# fail 1\b/.test(check.stdout)) throw new Error('The sample check did not report the expected fault. Your files are kept; inspect the workspace before trying again.');
    const created = await projects.create({ idea: SAMPLE_REQUEST, workspaceId: workspace.id, capUsd: 5, executionMode: 'workspace', openSpecEnabled: false });
    return { ...created, needsStart: created.ok };
  };
  return () => {
    if (!inFlight) inFlight = prepare().catch((error: unknown): SampleOutcome => ({ ok: false, text: error instanceof Error ? error.message : String(error) })).finally(() => { inFlight = null; });
    return inFlight;
  };
}
