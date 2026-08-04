import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';

import {
  createSyntheticSourceInfo,
  type LoadExtensionsResult,
  type PromptTemplate,
  type Skill,
  type Theme,
} from '@earendil-works/pi-coding-agent';
import { SERO_PLUGIN_RUNTIME_ABI } from '@sero-ai/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearPackageCompatibilityCache,
  filterCompatiblePluginAgentsFiles,
  filterCompatiblePluginExtensions,
  filterCompatiblePluginPrompts,
  filterCompatiblePluginSkills,
  filterCompatiblePluginThemes,
} from '@electron/features/plugins/resource-compatibility';

describe('plugin resource compatibility filtering', () => {
  let tempRoot = '';

  beforeEach(async () => {
    clearPackageCompatibilityCache();
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-plugin-resource-compat-'));
  });

  afterEach(async () => {
    clearPackageCompatibilityCache();
    await rm(tempRoot, { recursive: true, force: true });
  });

  async function createPluginPackage(pluginId: string, minSeroVersion?: string): Promise<string> {
    const pluginDir = path.join(tempRoot, pluginId);
    await mkdir(path.join(pluginDir, 'extension'), { recursive: true });
    await mkdir(path.join(pluginDir, 'skills'), { recursive: true });
    await mkdir(path.join(pluginDir, 'prompts'), { recursive: true });
    await mkdir(path.join(pluginDir, 'themes'), { recursive: true });
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: pluginId,
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'utilities',
            tags: ['test'],
            runtimeAbi: SERO_PLUGIN_RUNTIME_ABI,
            ...(minSeroVersion ? { minSeroVersion } : {}),
          },
        },
      }, null, 2),
      'utf8',
    );
    await writeFile(path.join(pluginDir, 'extension', 'index.ts'), 'export default {}\n', 'utf8');
    await writeFile(path.join(pluginDir, 'skills', 'demo.md'), '# Demo\n', 'utf8');
    await writeFile(path.join(pluginDir, 'prompts', 'demo.md'), '# Prompt\n', 'utf8');
    await writeFile(path.join(pluginDir, 'themes', 'demo.json'), '{}\n', 'utf8');
    await writeFile(path.join(pluginDir, 'AGENTS.md'), '# Agents\n', 'utf8');
    return pluginDir;
  }

  it('drops incompatible plugin resources from all loader override buckets', async () => {
    const pluginDir = await createPluginPackage('future-plugin', '9.9.9');

    const extensions = filterCompatiblePluginExtensions({
      extensions: [{
        path: path.join(pluginDir, 'extension', 'index.ts'),
        resolvedPath: path.join(pluginDir, 'extension', 'index.ts'),
        sourceInfo: createSyntheticSourceInfo(path.join(pluginDir, 'extension', 'index.ts'), { source: 'extension' }),
        handlers: new Map(),
        tools: new Map(),
        messageRenderers: new Map(),
        commands: new Map(),
        flags: new Map(),
        shortcuts: new Map(),
      }],
      errors: [],
      runtime: {} as LoadExtensionsResult['runtime'],
    });
    const skills = filterCompatiblePluginSkills({
      skills: [{
        name: 'demo',
        description: 'Demo skill',
        filePath: path.join(pluginDir, 'skills', 'demo.md'),
        baseDir: path.join(pluginDir, 'skills'),
        sourceInfo: createSyntheticSourceInfo(path.join(pluginDir, 'skills', 'demo.md'), { source: pluginDir }),
        disableModelInvocation: false,
      } satisfies Skill],
      diagnostics: [],
    });
    const prompts = filterCompatiblePluginPrompts({
      prompts: [{
        name: 'demo',
        description: 'Demo prompt',
        content: 'demo',
        filePath: path.join(pluginDir, 'prompts', 'demo.md'),
        sourceInfo: createSyntheticSourceInfo(path.join(pluginDir, 'prompts', 'demo.md'), { source: pluginDir }),
      } satisfies PromptTemplate],
      diagnostics: [],
    });
    const themes = filterCompatiblePluginThemes({
      themes: [{
        sourcePath: path.join(pluginDir, 'themes', 'demo.json'),
      } as Theme],
      diagnostics: [],
    });
    const agentsFiles = filterCompatiblePluginAgentsFiles({
      agentsFiles: [{ path: path.join(pluginDir, 'AGENTS.md'), content: '# Agents' }],
    });

    expect(extensions.extensions).toHaveLength(0);
    expect(skills.skills).toHaveLength(0);
    expect(prompts.prompts).toHaveLength(0);
    expect(themes.themes).toHaveLength(0);
    expect(agentsFiles.agentsFiles).toHaveLength(0);
  });

  it('keeps compatible plugin resources intact', async () => {
    const pluginDir = await createPluginPackage('compatible-plugin');

    const extensions = filterCompatiblePluginExtensions({
      extensions: [{
        path: path.join(pluginDir, 'extension', 'index.ts'),
        resolvedPath: path.join(pluginDir, 'extension', 'index.ts'),
        sourceInfo: createSyntheticSourceInfo(path.join(pluginDir, 'extension', 'index.ts'), { source: 'extension' }),
        handlers: new Map(),
        tools: new Map(),
        messageRenderers: new Map(),
        commands: new Map(),
        flags: new Map(),
        shortcuts: new Map(),
      }],
      errors: [],
      runtime: {} as LoadExtensionsResult['runtime'],
    });

    expect(extensions.extensions).toHaveLength(1);
  });
});
