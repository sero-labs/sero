import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execLocal, pathExists } from '../host';
import { createSampleRepair, SAMPLE_FILES } from '../sample-repair';
import { createProjectRecord } from '../../shared/record';
import { cleanupHosts, fakeHost, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

async function setup() {
  const host = await fakeHost({ workspaces: [] });
  host.pathExists = pathExists;
  host.exec = (file, args, cwd) => execLocal(file, args, cwd, { ensure: async (tool) => ({ path: tool === 'node' ? process.execPath : 'git' }) });
  host.createWorkspace = vi.fn(async (name, parent, requireEmpty) => {
    expect(parent).toBeUndefined();
    expect(requireEmpty).toBe(true);
    const workspace = { id: 'sample', name, path: path.join(await host.homeDir(), 'managed-workspaces', 'sample-repair'), open: true };
    await fs.mkdir(workspace.path, { recursive: true });
    host.workspaces.push(workspace);
    return workspace;
  });
  host.runCommand = vi.fn(async (_id, cwd, command) => host.exec('node', command.split(' ').slice(1), cwd));
  const store = await storeFor(host);
  const projects = { create: vi.fn(async (input: { idea: string; workspaceId?: string }) => {
    const workspace = host.workspaces[0]!;
    const record = createProjectRecord({ id: 'project', name: 'Sample', idea: input.idea, folder: workspace.path, workspaceId: input.workspaceId, now: T0 });
    await store.write(record);
    return { ok: true as const, projectId: record.id, text: 'created' };
  }) };
  return { host, store, projects, prepare: createSampleRepair({ host, store, projects }) };
}

describe('sample repair preparation', () => {
  it('commits a failing baseline, then preserves the actual repair and project on repeat and restart', async () => {
    const deps = await setup();
    const [first, repeated] = await Promise.all([deps.prepare(), deps.prepare()]);
    expect(first).toMatchObject({ ok: true, projectId: 'project', needsStart: true });
    expect(repeated).toEqual(first);
    expect(deps.host.createWorkspace).toHaveBeenCalledTimes(1);
    const folder = deps.host.workspaces[0]!.path;
    const original = await deps.host.exec('git', ['show', 'HEAD:truncate.cjs'], folder);
    expect(original.stdout).toBe(SAMPLE_FILES['truncate.cjs']);
    const failed = await deps.host.exec('node', ['--test', 'repair.test.cjs'], folder);
    expect(failed.exitCode).toBe(1);
    const fixed = "module.exports = (text, max) => text.length > max ? text.slice(0, Math.max(0, max - 3)) + '.'.repeat(Math.min(3, max)) : text;\n";
    await fs.writeFile(path.join(folder, 'truncate.cjs'), fixed);
    expect((await deps.host.exec('node', ['--test', 'repair.test.cjs'], folder)).exitCode).toBe(0);
    expect((await deps.host.exec('git', ['diff', '--', 'truncate.cjs'], folder)).stdout).toContain('+module.exports');
    const reopened = await createSampleRepair(deps)();
    expect(reopened).toMatchObject({ ok: true, projectId: 'project' });
    expect(reopened.needsStart).toBeUndefined();
    expect(await fs.readFile(path.join(folder, 'truncate.cjs'), 'utf8')).toBe(fixed);
    expect(deps.projects.create).toHaveBeenCalledTimes(1);
    expect(deps.host.sessions.proposals).toHaveLength(0);
  });

  it('keeps the same baseline and destination after a runtime dependency failure', async () => {
    const deps = await setup();
    const run = deps.host.runCommand;
    deps.host.runCommand = async () => ({ exitCode: 127, stdout: '', stderr: 'runtime unavailable' });
    expect(await deps.prepare()).toMatchObject({ ok: false });
    expect(deps.projects.create).not.toHaveBeenCalled();
    const folder = deps.host.workspaces[0]!.path;
    const baseline = (await deps.host.exec('git', ['rev-parse', 'HEAD'], folder)).stdout;
    deps.host.runCommand = run;
    expect(await createSampleRepair(deps)()).toMatchObject({ ok: true });
    expect(deps.host.createWorkspace).toHaveBeenCalledTimes(1);
    expect((await deps.host.exec('git', ['rev-parse', 'HEAD'], folder)).stdout).toBe(baseline);
  });
});
