import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { AgentPluginSourceKind } from '@sero-ai/common';
import { runPluginHostCommand } from '@electron/features/plugins/host-command-runner';
import { AGENT_PLUGIN_STAGING_DIR } from './constants';

export interface StagedAgentPluginSource {
  root: string;
  tempRoot: string;
  sourceKind: AgentPluginSourceKind;
}

export function getAgentPluginSourceKind(source: string): AgentPluginSourceKind {
  if (source.startsWith('npm:')) return 'npm';
  if (source.startsWith('git:') || /^(https?|ssh|git):\/\//.test(source)) return 'git';
  return 'local';
}

async function createTempRoot(prefix: string): Promise<string> {
  await fs.mkdir(AGENT_PLUGIN_STAGING_DIR, { recursive: true });
  return fs.mkdtemp(path.join(AGENT_PLUGIN_STAGING_DIR, `${prefix}-`));
}

export async function cleanupStagedAgentPlugin(staged: StagedAgentPluginSource | null): Promise<void> {
  if (!staged) return;
  await fs.rm(staged.tempRoot, { recursive: true, force: true });
}

export async function stageAgentPluginSource(sourceInput: string): Promise<StagedAgentPluginSource> {
  const source = sourceInput.trim();
  if (!source) throw new Error('Agent Plugin source is required.');
  const sourceKind = getAgentPluginSourceKind(source);
  if (sourceKind === 'npm') return stageNpmSource(source.slice(4));
  if (sourceKind === 'git') return stageGitSource(source.startsWith('git:') ? source.slice(4) : source);
  return stageLocalSource(source);
}

async function stageNpmSource(spec: string): Promise<StagedAgentPluginSource> {
  if (!spec.trim()) throw new Error('Agent Plugin npm source needs a package specifier.');
  const tempRoot = await createTempRoot('npm');
  try {
    const result = await runPluginHostCommand(
      'npm',
      ['pack', '--json', '--pack-destination', '.', '--', spec],
      tempRoot,
    );
    const records = JSON.parse(result.stdout) as Array<{ filename?: string }>;
    const tarball = records.at(-1)?.filename;
    if (!tarball) throw new Error(`npm pack did not produce a package for ${spec}.`);
    const extracted = path.join(tempRoot, 'extracted');
    await fs.mkdir(extracted, { recursive: true });
    await runPluginHostCommand('tar', ['-xzf', path.join(tempRoot, tarball), '-C', extracted], tempRoot);
    return { root: path.join(extracted, 'package'), tempRoot, sourceKind: 'npm' };
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function stageGitSource(url: string): Promise<StagedAgentPluginSource> {
  if (!url.trim()) throw new Error('Agent Plugin git source needs a repository URL.');
  const tempRoot = await createTempRoot('git');
  const root = path.join(tempRoot, 'package');
  try {
    await runPluginHostCommand('git', ['clone', '--depth', '1', '--', url, root], tempRoot);
    await fs.rm(path.join(root, '.git'), { recursive: true, force: true });
    return { root, tempRoot, sourceKind: 'git' };
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function stageLocalSource(source: string): Promise<StagedAgentPluginSource> {
  const resolved = path.resolve(source);
  if (!existsSync(resolved)) throw new Error(`Local Agent Plugin source does not exist: ${resolved}`);
  if (!(await fs.stat(resolved)).isDirectory()) throw new Error('Local Agent Plugin source must be a directory.');
  const tempRoot = await createTempRoot('local');
  const root = path.join(tempRoot, 'package');
  try {
    await fs.cp(resolved, root, { recursive: true, verbatimSymlinks: true });
    return { root, tempRoot, sourceKind: 'local' };
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}
