import { createHash } from 'node:crypto';
import { createReadStream, existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import type { AgentPluginSourceKind } from '@sero-ai/common';
import { runPluginHostCommand } from '@electron/features/plugins/host-command-runner';
import { AGENT_PLUGIN_STAGING_DIR } from './constants';

export interface StagedAgentPluginSource {
  root: string;
  tempRoot: string;
  sourceKind: AgentPluginSourceKind;
  contentDigest: string;
}

const NPM_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const NPM_PACKAGE_SELECTOR = /^[a-zA-Z0-9*^~<>=|.+_-]+$/;

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
  if (sourceKind === 'git') {
    const url = source.startsWith('git:') && !source.startsWith('git://') ? source.slice(4) : source;
    return stageGitSource(url);
  }
  return stageLocalSource(source);
}

async function stageNpmSource(spec: string): Promise<StagedAgentPluginSource> {
  if (!spec.trim()) throw new Error('Agent Plugin npm source needs a package specifier.');
  if (!isRegistryPackageSpecifier(spec)) {
    throw new Error('Agent Plugin npm sources must use a registry package name with an optional version or tag.');
  }
  const tempRoot = await createTempRoot('npm');
  try {
    const result = await runPluginHostCommand(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', '.', '--', spec],
      tempRoot,
    );
    const records = JSON.parse(result.stdout) as Array<{ filename?: string }>;
    const tarball = records.at(-1)?.filename;
    if (!tarball) throw new Error(`npm pack did not produce a package for ${spec}.`);
    const extracted = path.join(tempRoot, 'extracted');
    await fs.mkdir(extracted, { recursive: true });
    await runPluginHostCommand('tar', ['-xzf', path.join(tempRoot, tarball), '-C', extracted], tempRoot);
    return finalizeStagedSource(path.join(extracted, 'package'), tempRoot, 'npm');
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function stageGitSource(url: string): Promise<StagedAgentPluginSource> {
  if (!url.trim()) throw new Error('Agent Plugin git source needs a repository URL.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Agent Plugin git source must be an absolute repository URL.');
  }
  if (!['https:', 'ssh:', 'git:'].includes(parsed.protocol)) {
    throw new Error('Agent Plugin git source must use HTTPS, SSH, or Git transport.');
  }
  const tempRoot = await createTempRoot('git');
  const root = path.join(tempRoot, 'package');
  try {
    await runPluginHostCommand('git', ['clone', '--depth', '1', '--', url, root], tempRoot);
    await fs.rm(path.join(root, '.git'), { recursive: true, force: true });
    return finalizeStagedSource(root, tempRoot, 'git');
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function stageLocalSource(source: string): Promise<StagedAgentPluginSource> {
  if (!path.isAbsolute(source)) throw new Error('Local Agent Plugin source must be an absolute directory path.');
  const resolved = path.resolve(source);
  if (!existsSync(resolved)) throw new Error(`Local Agent Plugin source does not exist: ${resolved}`);
  if (!(await fs.stat(resolved)).isDirectory()) throw new Error('Local Agent Plugin source must be a directory.');
  const tempRoot = await createTempRoot('local');
  const root = path.join(tempRoot, 'package');
  try {
    await fs.cp(resolved, root, { recursive: true, verbatimSymlinks: true });
    return finalizeStagedSource(root, tempRoot, 'local');
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function isRegistryPackageSpecifier(spec: string): boolean {
  const value = spec.trim();
  const selectorIndex = value.startsWith('@')
    ? value.indexOf('@', value.indexOf('/') + 1)
    : value.indexOf('@');
  const packageName = selectorIndex < 0 ? value : value.slice(0, selectorIndex);
  const selector = selectorIndex < 0 ? null : value.slice(selectorIndex + 1);
  return value.length <= 214
    && NPM_PACKAGE_NAME.test(packageName)
    && (selector === null || (selector.length > 0 && NPM_PACKAGE_SELECTOR.test(selector)));
}

async function finalizeStagedSource(
  root: string,
  tempRoot: string,
  sourceKind: AgentPluginSourceKind,
): Promise<StagedAgentPluginSource> {
  return { root, tempRoot, sourceKind, contentDigest: await digestDirectory(root) };
}

async function digestDirectory(root: string): Promise<string> {
  const hash = createHash('sha256');

  async function visit(directory: string, relativeDirectory = ''): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(directory, entry.name);
      const stat = await fs.lstat(absolutePath);
      hash.update(`${entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'symlink' : 'other'}\0${relativePath}\0${stat.mode}\0`);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
      } else if (entry.isSymbolicLink()) {
        hash.update(await fs.readlink(absolutePath));
      } else {
        throw new Error(`Agent Plugin source contains an unsupported file type: ${relativePath}`);
      }
      hash.update('\0');
    }
  }

  await visit(root);
  return hash.digest('hex');
}
