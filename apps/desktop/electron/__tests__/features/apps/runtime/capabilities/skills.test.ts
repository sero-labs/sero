/**
 * The gated `appRuntime.skills` capability (spec 18).
 *
 * Two claims are under test: a runtime write lands where the HOST decides — not
 * where the caller asks — and an app that is not a bundled built-in never gets
 * the capability at all.
 */

import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ agentDir: '' }));
const discovery = vi.hoisted(() => ({ paths: [] as string[] }));
const reloads = vi.hoisted(() => ({ count: 0 }));

vi.mock('@electron/platform/env', () => ({
  get SERO_AGENT_DIR() { return env.agentDir; },
  get SERO_HOME() { return env.agentDir; },
}));

vi.mock('@electron/platform/protocols/builtin-resources', () => ({
  discoverBuiltinPluginPaths: () => discovery.paths,
}));

vi.mock('@electron/ipc/agent/core/agent', () => ({
  reloadAllSessionResources: async () => { reloads.count += 1; },
}));

const BUNDLED_DIR = 'sero-orchestrator-plugin';

let skillsDir = '';
let bundled = '';
let imposter = '';

beforeAll(async () => {
  const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sero-skills-cap-')));
  env.agentDir = path.join(tmp, 'agent');
  skillsDir = path.join(env.agentDir, 'skills');
  await mkdir(skillsDir, { recursive: true });

  bundled = path.join(tmp, 'plugins', BUNDLED_DIR);
  imposter = path.join(tmp, 'elsewhere', BUNDLED_DIR);
  await mkdir(bundled, { recursive: true });
  await mkdir(imposter, { recursive: true });
  discovery.paths = [bundled];
});

beforeEach(() => {
  reloads.count = 0;
});

async function importCapability() {
  return import('@electron/features/apps/runtime/capabilities/skills');
}

function target(packagePath: string, id = 'orchestrator') {
  return {
    manifest: { id, packagePath },
    workspace: { id: 'ws-1', path: '/tmp/ws' },
    stateFilePath: '/tmp/ws/state.json',
  } as unknown as Parameters<Awaited<ReturnType<typeof importCapability>>['installSkills']>[0];
}

describe('installSkills gate', () => {
  it('installs for the bundled plugin at its canonical path', async () => {
    const { installSkills } = await importCapability();
    expect(await installSkills(target(bundled))).not.toBeNull();
  });

  it('refuses a directory that only claims the allowlisted id', async () => {
    const { installSkills } = await importCapability();
    expect(await installSkills(target(imposter))).toBeNull();
  });

  it('refuses an app that is not allowlisted', async () => {
    const { installSkills } = await importCapability();
    expect(await installSkills(target(bundled, 'some-other-plugin'))).toBeNull();
  });
});

describe('skills.write', () => {
  it('writes SKILL.md under the skills dir and hot-reloads sessions', async () => {
    const { createSkillsApi } = await importCapability();
    const result = await createSkillsApi().write({
      name: 'release-notes',
      description: 'Draft release notes. Use when a milestone closes.',
      body: '# Release notes\n\nDo the thing.\n',
      origin: 'sero-workflow:loop_1',
    });

    expect(result).toEqual({ filePath: path.join(skillsDir, 'release-notes', 'SKILL.md'), created: true });
    const written = await readFile(result.filePath, 'utf-8');
    expect(written).toBe(
      '---\nname: release-notes\n'
      + 'description: Draft release notes. Use when a milestone closes.\n'
      + 'origin: sero-workflow:loop_1\n---\n'
      + '# Release notes\n\nDo the thing.\n',
    );
    expect(reloads.count).toBe(1);
  });

  it('rejects a name that is not a safe directory name', async () => {
    const { createSkillsApi } = await importCapability();
    const api = createSkillsApi();
    for (const name of ['../escape', '', 'Upper', 'has space', '/abs']) {
      await expect(api.write({ name, description: 'd', body: 'b' })).rejects.toThrow(/Invalid skill name/);
    }
    expect(reloads.count).toBe(0);
  });

  it('rejects an empty description or body', async () => {
    const { createSkillsApi } = await importCapability();
    const api = createSkillsApi();
    await expect(api.write({ name: 'ok-name', description: '  ', body: 'b' })).rejects.toThrow(/description/);
    await expect(api.write({ name: 'ok-name', description: 'd', body: '  ' })).rejects.toThrow(/body/);
  });

  it('refuses an existing name unless overwrite is asked for', async () => {
    const { createSkillsApi } = await importCapability();
    const api = createSkillsApi();
    const existing = path.join(skillsDir, 'taken');
    await mkdir(existing, { recursive: true });
    await writeFile(path.join(existing, 'SKILL.md'), '---\nname: taken\ndescription: old\n---\nold body\n');

    await expect(api.write({ name: 'taken', description: 'new', body: 'new body' }))
      .rejects.toThrow(/already exists/);

    const result = await api.write({ name: 'taken', description: 'new', body: 'new body', overwrite: true });
    expect(result.created).toBe(false);
    expect(await readFile(result.filePath, 'utf-8')).toContain('new body');
  });
});

describe('skills.list', () => {
  it('returns the profile user skills', async () => {
    const { createSkillsApi } = await importCapability();
    const listed = await createSkillsApi().list();
    expect(listed.map((s) => s.name)).toContain('release-notes');
    expect(listed.every((s) => s.filePath.startsWith(skillsDir))).toBe(true);
  });
});
