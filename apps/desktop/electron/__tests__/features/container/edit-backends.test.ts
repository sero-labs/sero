import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { createHostCodingTools } from '@electron/features/container/tools/tools-host';
import { createEdit, createWrite } from '@electron/features/container/tools/tools-coding';
import { getRuntimeCapabilities } from '@electron/features/workspace/runtime/capabilities';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';

function getTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

async function runTool(tool: ToolDefinition, input: Record<string, unknown>) {
  return tool.execute('tool-call', input, undefined, undefined, undefined as never);
}

async function resolveAlias(hostPath: string): Promise<string> {
  let current = path.resolve(hostPath);
  const missing: string[] = [];
  for (;;) {
    try {
      const resolved = await realpath(current);
      return missing.length > 0 ? path.join(resolved, ...missing.reverse()) : resolved;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(hostPath);
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

interface FakeContainerOptions {
  runtimePath?: string;
  workspaceId?: string;
  readGate?: () => Promise<void>;
}

/** Live-mounted fake container runtime: runtime paths map onto a host temp dir. */
function createFakeContainer(rootDir: string, options: FakeContainerOptions = {}) {
  const runtimePath = options.runtimePath ?? '/workspace';
  const workspaceId = options.workspaceId ?? 'ws-1';
  const isMapped = runtimePath === '/workspace';
  const toHost = (runtimeTarget: string): string => {
    if (!isMapped) return runtimeTarget;
    if (runtimeTarget === runtimePath) return rootDir;
    if (runtimeTarget.startsWith(`${runtimePath}/`)) {
      return path.join(rootDir, ...runtimeTarget.slice(runtimePath.length + 1).split('/'));
    }
    return runtimeTarget;
  };
  const toRuntime = (hostTarget: string): string => {
    if (!isMapped) return hostTarget;
    const relative = path.relative(realpathSync(rootDir), hostTarget);
    if (relative === '') return runtimePath;
    if (relative.startsWith('..') || path.isAbsolute(relative)) return hostTarget;
    return path.posix.join(runtimePath, ...relative.split(path.sep));
  };

  const runtime = {
    backend: 'docker' as const,
    workspaceId,
    hostWorkspacePath: rootDir,
    runtimeWorkspacePath: runtimePath,
    workspaceAccess: 'live-mount' as const,
    capabilities: getRuntimeCapabilities('docker'),
    exec: vi.fn(async ({ command }: { command: string }) => {
      const match = /python3 - '(.+?)' <<'PY'/.exec(command);
      const target = match ? match[1].replace(/'\\''/g, "'") : '';
      const resolved = await resolveAlias(toHost(target));
      return { stdout: `${toRuntime(resolved)}\n`, stderr: '', exitCode: 0 };
    }),
    readFile: vi.fn(async ({ path: target }: { path: string }) => {
      if (options.readGate) await options.readGate();
      return { content: await readFile(toHost(target), 'utf8'), encoding: 'utf8' as const };
    }),
    writeFile: vi.fn(async ({ path: target, content }: { path: string; content: string }) => {
      await mkdir(path.dirname(toHost(target)), { recursive: true });
      await writeFile(toHost(target), content, 'utf8');
    }),
  };

  return { runtime: runtime as unknown as RuntimeBackend, raw: runtime, toHost, toRuntime };
}

describe('host edit aliases', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'sero-edit-host-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('serializes direct, dot, parent, and symlink paths to one file', async () => {
    await writeFile(path.join(workspace, 'a.txt'), 'one\ntwo\nthree\n', 'utf8');
    await symlink(path.join(workspace, 'a.txt'), path.join(workspace, 'link.txt'));

    const first = getTool(createHostCodingTools(workspace), 'edit');
    const second = getTool(createHostCodingTools(workspace), 'edit');
    const third = getTool(createHostCodingTools(workspace), 'edit');

    await Promise.all([
      runTool(first, { path: 'a.txt', oldText: 'one', newText: '1' }),
      runTool(second, { path: './a.txt', oldText: 'two', newText: '2' }),
      runTool(third, { path: 'link.txt', oldText: 'three', newText: '3' }),
    ]);

    expect(await readFile(path.join(workspace, 'a.txt'), 'utf8')).toBe('1\n2\n3\n');
  });

  it('fails a conflicting concurrent edit and keeps the first result', async () => {
    await writeFile(path.join(workspace, 'a.txt'), 'target line\nkeep\n', 'utf8');
    const tools = createHostCodingTools(workspace);
    const edit = getTool(tools, 'edit');

    const first = runTool(edit, { path: 'a.txt', oldText: 'target line', newText: 'replaced' });
    await first;
    await expect(runTool(edit, { path: './a.txt', oldText: 'target line', newText: 'other' }))
      .rejects.toThrow(/Could not match/);

    expect(await readFile(path.join(workspace, 'a.txt'), 'utf8')).toBe('replaced\nkeep\n');
  });

  it('resolves an edit target under a symlinked parent directory', async () => {
    await mkdir(path.join(workspace, 'real'));
    await symlink(path.join(workspace, 'real'), path.join(workspace, 'alias'));
    await writeFile(path.join(workspace, 'real', 'a.txt'), 'one\n', 'utf8');

    const edit = getTool(createHostCodingTools(workspace), 'edit');
    await runTool(edit, { path: 'alias/a.txt', oldText: 'one', newText: '1' });

    expect(await readFile(path.join(workspace, 'real', 'a.txt'), 'utf8')).toBe('1\n');
  });
});

describe('container edit aliases and identity', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'sero-edit-container-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('resolves direct, dot, and symlink paths to one serialization order', async () => {
    await writeFile(path.join(workspace, 'a.txt'), 'one\ntwo\nthree\n', 'utf8');
    await symlink(path.join(workspace, 'a.txt'), path.join(workspace, 'link.txt'));

    const { runtime } = createFakeContainer(workspace);
    const first = createEdit(runtime);
    const second = createEdit(runtime);
    const third = createEdit(runtime);

    await Promise.all([
      runTool(first, { path: 'a.txt', oldText: 'one', newText: '1' }),
      runTool(second, { path: '/workspace/./a.txt', oldText: 'two', newText: '2' }),
      runTool(third, { path: 'link.txt', oldText: 'three', newText: '3' }),
    ]);

    expect(await readFile(path.join(workspace, 'a.txt'), 'utf8')).toBe('1\n2\n3\n');
  });

  it('keeps the host and container tools on one queue for a shared mount', async () => {
    await writeFile(path.join(workspace, 'a.txt'), 'one\ntwo\n', 'utf8');
    const { runtime } = createFakeContainer(workspace);
    const hostEdit = getTool(createHostCodingTools(workspace), 'edit');
    const containerEdit = createEdit(runtime);

    await Promise.all([
      runTool(hostEdit, { path: 'a.txt', oldText: 'one', newText: '1' }),
      runTool(containerEdit, { path: 'a.txt', oldText: 'two', newText: '2' }),
    ]);

    expect(await readFile(path.join(workspace, 'a.txt'), 'utf8')).toBe('1\n2\n');
  });

  it('does not block separate container filesystems at identical paths', async () => {
    const rootB = await mkdtemp(path.join(os.tmpdir(), 'sero-edit-container-b-'));
    try {
      await writeFile(path.join(workspace, 'file.ts'), 'a\n', 'utf8');
      await writeFile(path.join(rootB, 'file.ts'), 'a\n', 'utf8');

      const gate = deferred();
      const first = createFakeContainer(workspace, { workspaceId: 'ws-a', readGate: () => gate.promise });
      const second = createFakeContainer(rootB, { workspaceId: 'ws-b' });

      const pending = runTool(createEdit(first.runtime), {
        path: 'file.ts',
        oldText: 'a',
        newText: 'b',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The second container is not blocked by the first container's in-flight read.
      await expect(runTool(createEdit(second.runtime), {
        path: 'file.ts',
        oldText: 'a',
        newText: 'b',
      })).resolves.toBeTruthy();
      expect(await readFile(path.join(rootB, 'file.ts'), 'utf8')).toBe('b\n');

      gate.resolve();
      await expect(pending).resolves.toBeTruthy();
      expect(await readFile(path.join(workspace, 'file.ts'), 'utf8')).toBe('b\n');
    } finally {
      await rm(rootB, { recursive: true, force: true });
    }
  });
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('host and container parity', () => {
  let workspace: string;
  let hostWorkspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'sero-parity-host-'));
    hostWorkspace = await mkdtemp(path.join(os.tmpdir(), 'sero-parity-container-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
    await rm(hostWorkspace, { recursive: true, force: true });
  });

  async function bothEdits(files: string) {
    await writeFile(path.join(workspace, 'a.ts'), files, 'utf8');
    await writeFile(path.join(hostWorkspace, 'a.ts'), files, 'utf8');
    const hostEdit = getTool(createHostCodingTools(workspace), 'edit');
    const { runtime, raw } = createFakeContainer(hostWorkspace);
    const containerEdit = createEdit(runtime);
    return { hostEdit, containerEdit, raw };
  }

  it('produces the same content for a mixed exact and fuzzy batch', async () => {
    const source = 'const a = 1;   \nconst b = “smart”;\n';
    const { hostEdit, containerEdit, raw } = await bothEdits(source);

    const input = {
      path: 'a.ts',
      edits: [
        { oldText: 'const a = 1;', newText: 'const a = 10;' },
        { oldText: 'const b = "smart";', newText: 'const b = "plain";' },
      ],
    };
    await runTool(hostEdit, input);
    const containerResult = await runTool(containerEdit, input);

    const hostContent = await readFile(path.join(workspace, 'a.ts'), 'utf8');
    const containerContent = await readFile(path.join(hostWorkspace, 'a.ts'), 'utf8');
    expect(containerContent).toBe(hostContent);
    expect(raw.writeFile).toHaveBeenCalledTimes(1);
    expect(containerResult.content[0]).toMatchObject({ type: 'text' });
  });

  it('reports an equivalent failure for an unmatched replacement on both backends', async () => {
    const source = 'alpha\nbeta\n';
    const { hostEdit, containerEdit } = await bothEdits(source);
    const input = {
      path: 'a.ts',
      edits: [
        { oldText: 'alpha', newText: 'ALPHA' },
        { oldText: 'gamma', newText: 'GAMMA' },
      ],
    };

    await expect(runTool(hostEdit, input)).rejects.toThrow(/edits\[1\].*Could not match|Could not match edits\[1\]/);
    await expect(runTool(containerEdit, input)).rejects.toThrow(/edits\[1\].*Could not match|Could not match edits\[1\]/);

    expect(await readFile(path.join(workspace, 'a.ts'), 'utf8')).toBe(source);
    expect(await readFile(path.join(hostWorkspace, 'a.ts'), 'utf8')).toBe(source);
  });

  it('rejects a mixed no-op batch on both backends without writing', async () => {
    const source = 'alpha\nbeta\n';
    const { hostEdit, containerEdit, raw } = await bothEdits(source);
    const input = {
      path: 'a.ts',
      edits: [
        { oldText: 'alpha', newText: 'ALPHA' },
        { oldText: 'beta', newText: 'beta' },
      ],
    };

    await expect(runTool(hostEdit, input)).rejects.toThrow(/identical text/);
    await expect(runTool(containerEdit, input)).rejects.toThrow(/identical text/);
    expect(await readFile(path.join(workspace, 'a.ts'), 'utf8')).toBe(source);
    expect(await readFile(path.join(hostWorkspace, 'a.ts'), 'utf8')).toBe(source);
    expect(raw.writeFile).not.toHaveBeenCalled();
  });
});

describe('container write ordering', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(os.tmpdir(), 'sero-write-container-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('runs a write after an edit and replaces the file with its payload', async () => {
    await writeFile(path.join(workspace, 'a.ts'), 'one\n', 'utf8');
    const { runtime } = createFakeContainer(workspace);
    const edit = createEdit(runtime);
    const write = createWrite(runtime);

    await runTool(edit, { path: 'a.ts', oldText: 'one', newText: '1' });
    await runTool(write, { path: 'a.ts', content: 'whole file\n' });

    expect(await readFile(path.join(workspace, 'a.ts'), 'utf8')).toBe('whole file\n');
  });
});
