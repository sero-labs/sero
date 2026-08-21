/**
 * The gated `appRuntime.skills` capability (spec 18).
 *
 * Two claims are under test: a runtime write lands where the HOST decides — not
 * where the caller asks — and an app that is not a bundled built-in never gets
 * the capability at all.
 */

import { createHash } from 'crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'fs/promises';
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

async function importApprovals() {
  return import('@electron/features/skills/write-approvals');
}

/** What the app does before a save: approve exactly these bytes, once. */
async function approve(scope: string, content: { name: string; description: string; body: string }) {
  const { approveSkillWrite } = await importApprovals();
  approveSkillWrite(
    scope,
    createHash('sha256').update(`${content.name}\n${content.description}\n${content.body}`).digest('hex'),
  );
}

const APPROVAL = { scope: 'loop-1:skill-1' };

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
    const content = {
      name: 'release-notes',
      description: 'Draft release notes. Use when a milestone closes.',
      body: '# Release notes\n\nDo the thing.\n',
    };
    await approve(APPROVAL.scope, content);
    const result = await createSkillsApi().write({ ...content, origin: 'sero-workflow:loop_1', approval: APPROVAL });

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
      await expect(api.write({ name, description: 'd', body: 'b', approval: APPROVAL })).rejects.toThrow(/Invalid skill name/);
    }
    expect(reloads.count).toBe(0);
  });

  it('rejects an empty description or body', async () => {
    const { createSkillsApi } = await importCapability();
    const api = createSkillsApi();
    await expect(api.write({ name: 'ok-name', description: '  ', body: 'b', approval: APPROVAL })).rejects.toThrow(/description/);
    await expect(api.write({ name: 'ok-name', description: 'd', body: '  ', approval: APPROVAL })).rejects.toThrow(/body/);
  });

  it('refuses an existing name unless overwrite is asked for', async () => {
    const { createSkillsApi } = await importCapability();
    const api = createSkillsApi();
    const existing = path.join(skillsDir, 'taken');
    await mkdir(existing, { recursive: true });
    await writeFile(path.join(existing, 'SKILL.md'), '---\nname: taken\ndescription: old\n---\nold body\n');

    await approve(APPROVAL.scope, { name: 'taken', description: 'new', body: 'new body' });
    await expect(api.write({ name: 'taken', description: 'new', body: 'new body', approval: APPROVAL }))
      .rejects.toThrow(/already exists/);

    await approve(APPROVAL.scope, { name: 'taken', description: 'new', body: 'new body' });
    const result = await api.write({ name: 'taken', description: 'new', body: 'new body', overwrite: true, approval: APPROVAL });
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

describe('the renderer approval', () => {
  const content = { name: 'needs-approval', description: 'Do a thing. Use when asked.', body: '# body\n' };

  it('refuses a write nobody approved', async () => {
    const { createSkillsApi } = await importCapability();

    await expect(createSkillsApi().write({ ...content, approval: { scope: 'loop-9:skill-9' } }))
      .rejects.toThrow(/not approved in the app/);
  });

  it('refuses content that differs from what was approved', async () => {
    const { createSkillsApi } = await importCapability();
    await approve('loop-2:skill-2', content);

    // The model's body, the user's approval — the hash does not match.
    await expect(createSkillsApi().write({
      ...content,
      body: '# something else\n',
      approval: { scope: 'loop-2:skill-2' },
    })).rejects.toThrow(/not approved in the app/);

    // A wrong guess must not burn the approval the user actually gave.
    const ok = await createSkillsApi().write({ ...content, approval: { scope: 'loop-2:skill-2' } });
    expect(ok.created).toBe(true);
  });

  it('is consumed once', async () => {
    const { createSkillsApi } = await importCapability();
    const second = { ...content, name: 'once-only' };
    await approve('loop-3:skill-3', second);

    await createSkillsApi().write({ ...second, approval: { scope: 'loop-3:skill-3' } });
    await expect(createSkillsApi().write({ ...second, overwrite: true, approval: { scope: 'loop-3:skill-3' } }))
      .rejects.toThrow(/not approved in the app/);
  });

  it('expires', async () => {
    const { approveSkillWrite, consumeSkillWriteApproval } = await importApprovals();
    const hash = createHash('sha256').update('a\nb\nc').digest('hex');
    approveSkillWrite('loop-4:skill-4', hash, 1_000);

    expect(consumeSkillWriteApproval('loop-4:skill-4', hash, 1_000 + 130_000)).toBe(false);
  });
});

describe('replacing an existing skill', () => {
  it('overwrites the file discovery found, not a second copy at the canonical path', async () => {
    const { createSkillsApi } = await importCapability();
    // A nested skill whose directory name differs from its declared name — the
    // shape the shared store explicitly supports.
    const nested = path.join(skillsDir, 'vendor-pack', 'skills', 'search-tool');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, 'SKILL.md'), '---\nname: search\ndescription: old\n---\nold body\n');

    const content = { name: 'search', description: 'new', body: 'new body\n' };
    await approve('loop-5:skill-5', content);
    const result = await createSkillsApi().write({ ...content, overwrite: true, approval: { scope: 'loop-5:skill-5' } });

    expect(result).toEqual({ filePath: path.join(nested, 'SKILL.md'), created: false });
    expect(await readFile(result.filePath, 'utf-8')).toContain('new body');
    // No duplicate at <skills>/search/SKILL.md — two skills of one name is the bug.
    await expect(readFile(path.join(skillsDir, 'search', 'SKILL.md'), 'utf-8')).rejects.toThrow();
    await rm(path.join(skillsDir, 'vendor-pack'), { recursive: true });
  });

  it('refuses when the name is ambiguous rather than picking one', async () => {
    const { createSkillsApi } = await importCapability();
    for (const dir of ['dup-a', 'dup-b']) {
      const full = path.join(skillsDir, dir);
      await mkdir(full, { recursive: true });
      await writeFile(path.join(full, 'SKILL.md'), '---\nname: doubled\ndescription: d\n---\nbody\n');
    }

    const content = { name: 'doubled', description: 'new', body: 'new body\n' };
    await approve('loop-6:skill-6', content);
    await expect(createSkillsApi().write({ ...content, overwrite: true, approval: { scope: 'loop-6:skill-6' } }))
      .rejects.toThrow(/More than one skill is named/);

    for (const dir of ['dup-a', 'dup-b']) await rm(path.join(skillsDir, dir), { recursive: true });
  });
});

describe('frontmatter serialization', () => {
  it('round-trips values that plain `key: value` lines would break', async () => {
    const { createSkillsApi } = await importCapability();
    const { parseFrontmatter } = await import('@earendil-works/pi-coding-agent');

    const content = {
      name: 'tricky-frontmatter',
      // A colon, a hash, quotes, a leading indicator character, and a newline —
      // each of which an unquoted scalar either breaks on or silently re-reads.
      description: 'Build recovery: use when installs fail #urgent, "quoted", @mention\nand a second line',
      body: '# body\n',
    };
    await approve('loop-7:skill-7', content);
    const result = await createSkillsApi().write({ ...content, origin: 'sero-workflow:loop_7', approval: { scope: 'loop-7:skill-7' } });

    const parsed = parseFrontmatter<{ name: string; description: string; origin: string }>(
      await readFile(result.filePath, 'utf-8'),
    );
    expect(parsed.frontmatter.name).toBe(content.name);
    expect(parsed.frontmatter.description).toBe(content.description);
    expect(parsed.frontmatter.origin).toBe('sero-workflow:loop_7');
    expect(parsed.body).toBe('# body');
  });
});
