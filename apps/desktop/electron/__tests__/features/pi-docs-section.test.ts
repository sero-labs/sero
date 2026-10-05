import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { fauxProvider, InMemoryCredentialStore } from '@earendil-works/pi-ai';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it } from 'vitest';

import { removePiDocsSection } from '@electron/features/pi-docs/strip-pi-docs-section';

describe('removePiDocsSection', () => {
  let root = '';

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('removes the Pi documentation section from the prompt Pi really builds', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'sero-pi-docs-section-'));
    const workspace = path.join(root, 'project');
    await mkdir(workspace, { recursive: true });
    const faux = fauxProvider({ provider: 'faux-docs', models: [{ id: 'faux-model' }] });
    const modelRuntime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      allowModelNetwork: false,
    });
    new ModelRegistry(modelRuntime).registerProvider(faux.provider);
    await modelRuntime.setRuntimeApiKey('faux-docs', 'test-key');
    const model = modelRuntime.getModel('faux-docs', 'faux-model');
    if (!model) throw new Error('Expected the faux model to be registered.');
    const settingsManager = SettingsManager.inMemory();
    const resourceLoader = new DefaultResourceLoader({
      cwd: workspace,
      agentDir: path.join(root, 'agent'),
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd: workspace,
      agentDir: path.join(root, 'agent'),
      modelRuntime,
      model,
      resourceLoader,
      sessionManager: SessionManager.inMemory(workspace),
      settingsManager,
    });
    const prompt = session.systemPrompt;
    session.dispose();

    expect(prompt).toContain('Pi documentation (read only when');

    const stripped = removePiDocsSection(prompt);

    expect(stripped).not.toContain('Pi documentation');
    expect(stripped).not.toContain('Main documentation:');
    expect(stripped).not.toContain('Always read pi .md files');
    expect(stripped).not.toContain('<docs>');
    expect(stripped).toContain('<rules>');
    expect(stripped).toContain('<cwd>');
  });

  it('leaves a prompt unchanged when a marker is missing', () => {
    const reworded = 'Guidelines:\n- Be brief\n\nPi documentation (read only when asked):\n- Main documentation: /x\n';
    expect(removePiDocsSection(reworded)).toBe(reworded);
    expect(removePiDocsSection('no section here')).toBe('no section here');
  });
});
