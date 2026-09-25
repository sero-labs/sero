import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadRemoteSkill, readRemoteSkillFile, SkillActingWindows } from '../skills/skill-loader';
import { RemoteSkillRegistry } from '../skills/skill-registry';
import type { SkillEntry } from '../skills/skills-client';

const SKILL_URI = 'skill://docs/release-notes/SKILL.md';
const TEMPLATE_URI = 'skill://docs/release-notes/templates/summary.md';
const SKILL_MD = '---\nname: release-notes\ndescription: Writes release notes.\n---\n# Release notes\nUse templates/summary.md.\n';
const TEMPLATE = '## Summary\n';

const resource = (uri: string, text: string) => ({
  uri,
  digest: `sha256:${createHash('sha256').update(text).digest('hex')}`,
  size: Buffer.byteLength(text),
});

async function setup(options: { entry?: Partial<SkillEntry>; served?: Record<string, string> } = {}) {
  const registry = new RemoteSkillRegistry(path.join(await mkdtemp(path.join(tmpdir(), 'mcp-skill-loader-')), 'skills.json'));
  const entry: SkillEntry = {
    uri: SKILL_URI,
    frontmatter: { name: 'release-notes', description: 'Writes release notes.' },
    resources: [resource(SKILL_URI, SKILL_MD), resource(TEMPLATE_URI, TEMPLATE)],
    ...options.entry,
  };
  await registry.refresh('docs', [entry], async () => null);
  await registry.setEnabled('docs', SKILL_URI, true);
  const served = options.served ?? { [SKILL_URI]: SKILL_MD, [TEMPLATE_URI]: TEMPLATE };
  const readResource = vi.fn(async (_server: string, uri: string) => ({ contents: [{ uri, text: served[uri] ?? '' }] }));
  const input = { registry, windows: new SkillActingWindows(), readResource };
  return { input, registry, readResource };
}

describe('remote skill loader', () => {
  it('loads a verified SKILL.md tagged with its server, and reads a listed file', async () => {
    const { input } = await setup();

    const loaded = await loadRemoteSkill(input, 'chat-1', 'docs', 'release-notes');
    const read = await readRemoteSkillFile(input, 'chat-1', 'docs', 'release-notes', 'templates/summary.md');

    expect(loaded).toMatchObject({ ok: true, text: expect.stringContaining(`<mcp-skill server="docs" uri="${SKILL_URI}">`) });
    expect(read).toMatchObject({ ok: true, text: expect.stringContaining('## Summary') });
  });

  it('refuses a SKILL.md whose digest does not match and marks the skill changed', async () => {
    const { input, registry } = await setup({ served: { [SKILL_URI]: SKILL_MD.replace('Writes', 'Deletes') } });

    const loaded = await loadRemoteSkill(input, 'chat-1', 'docs', 'release-notes');

    expect(loaded).toMatchObject({ ok: false, error: expect.stringContaining('does not match its listed size and digest') });
    expect((await registry.get('docs', SKILL_URI))?.changed).toBe(true);
  });

  it('refuses a SKILL.md whose frontmatter differs from the entry', async () => {
    const { input } = await setup({ entry: { frontmatter: { name: 'release-notes', description: 'Something else.' } } });

    expect(await loadRemoteSkill(input, 'chat-1', 'docs', 'release-notes')).toMatchObject({
      ok: false,
      error: expect.stringContaining('frontmatter differs'),
    });
  });

  it('refuses to read a file that is not in the held entry', async () => {
    const { input, readResource } = await setup();
    await loadRemoteSkill(input, 'chat-1', 'docs', 'release-notes');
    readResource.mockClear();

    const read = await readRemoteSkillFile(input, 'chat-1', 'docs', 'release-notes', 'scripts/run.sh');

    expect(read).toMatchObject({ ok: false, error: expect.stringContaining('is not in its file list') });
    expect(readResource).not.toHaveBeenCalled();
  });

  it('declines a dynamic skill without reading it', async () => {
    const { input, readResource } = await setup({ entry: { resources: 'dynamic' } });

    expect(await loadRemoteSkill(input, 'chat-1', 'docs', 'release-notes')).toMatchObject({
      ok: false,
      error: expect.stringContaining('it is dynamic'),
    });
    expect(readResource).not.toHaveBeenCalled();
  });
});
