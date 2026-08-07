import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runPluginHostCommand: vi.fn(),
  stagingRoot: `/tmp/sero-agent-plugin-source-test-${process.pid}`,
}));

vi.mock('@electron/features/plugins/host-command-runner', () => ({
  runPluginHostCommand: mocks.runPluginHostCommand,
}));

vi.mock('@electron/features/agent-plugins/constants', () => ({
  AGENT_PLUGIN_STAGING_DIR: mocks.stagingRoot,
}));

import {
  cleanupStagedAgentPlugin,
  stageAgentPluginSource,
} from '@electron/features/agent-plugins/source';

const tempRoots: string[] = [];

beforeEach(() => {
  mocks.runPluginHostCommand.mockReset();
});

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  await fs.rm(mocks.stagingRoot, { recursive: true, force: true });
});

describe('Agent Plugin source staging', () => {
  it('rejects non-registry npm specifiers before npm runs', async () => {
    await expect(stageAgentPluginSource('npm:git+https://example.com/plugin.git'))
      .rejects.toThrow('registry package name');
    expect(mocks.runPluginHostCommand).not.toHaveBeenCalled();
  });

  it('rejects relative local directories', async () => {
    await expect(stageAgentPluginSource('./plugin')).rejects.toThrow('absolute directory path');
  });

  it('keeps a git protocol URL intact and validates its scheme', async () => {
    mocks.runPluginHostCommand.mockImplementation(async (command: string, args: string[]) => {
      if (command === 'git') {
        const root = args.at(-1)!;
        await fs.mkdir(root, { recursive: true });
        await fs.writeFile(path.join(root, 'plugin.json'), '{}');
      }
      return { stdout: '', stderr: '' };
    });

    const staged = await stageAgentPluginSource('git://example.com/plugin.git');
    expect(mocks.runPluginHostCommand).toHaveBeenCalledWith(
      'git',
      ['clone', '--depth', '1', '--', 'git://example.com/plugin.git', staged.root],
      staged.tempRoot,
    );
    await cleanupStagedAgentPlugin(staged);
    await expect(stageAgentPluginSource('git:ftp://example.com/plugin.git'))
      .rejects.toThrow('HTTPS, SSH, or Git');
  });

  it('changes the content digest when staged package bytes change', async () => {
    const source = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-agent-plugin-source-'));
    tempRoots.push(source);
    await fs.writeFile(path.join(source, 'plugin.json'), '{"name":"first"}');
    const first = await stageAgentPluginSource(source);
    await fs.writeFile(path.join(source, 'plugin.json'), '{"name":"second"}');
    const second = await stageAgentPluginSource(source);

    expect(first.contentDigest).not.toBe(second.contentDigest);
    await Promise.all([cleanupStagedAgentPlugin(first), cleanupStagedAgentPlugin(second)]);
  });
});
