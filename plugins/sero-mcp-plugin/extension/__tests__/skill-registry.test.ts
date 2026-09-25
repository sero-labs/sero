import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { RemoteSkillRegistry } from '../skills/skill-registry';
import type { SkillEntry } from '../skills/skills-client';

const digest = (char: string) => `sha256:${char.repeat(64)}`;

function entry(uri: string, name: string, fileDigest = digest('a')): SkillEntry {
  return { uri, frontmatter: { name, description: `The ${name} skill.` }, resources: [{ uri, digest: fileDigest, size: 10 }] };
}

async function registry() {
  return new RemoteSkillRegistry(path.join(await mkdtemp(path.join(tmpdir(), 'mcp-skills-')), 'skills.json'));
}

describe('remote skill registry', () => {
  it('adds new skills turned off, and tells same-name skills of one server apart by path', async () => {
    const skills = await registry();
    await skills.refresh('docs', [
      entry('skill://acme/billing/refunds/SKILL.md', 'refunds'),
      entry('skill://acme/support/refunds/SKILL.md', 'refunds'),
    ], async () => null);

    expect((await skills.list()).map((skill) => skill.enabled)).toEqual([false, false]);
    expect(await skills.resolve('docs', 'refunds')).toEqual({
      error: 'Server "docs" has 2 skills named "refunds". Use a path: acme/billing/refunds, acme/support/refunds.',
    });
    expect(await skills.resolve('docs', 'acme/support/refunds')).toMatchObject({ uri: 'skill://acme/support/refunds/SKILL.md' });
  });

  it('keeps a skill that is missing from the listing only while skills/get still finds it', async () => {
    const skills = await registry();
    await skills.refresh('docs', [entry('skill://kept/SKILL.md', 'kept'), entry('skill://gone/SKILL.md', 'gone')], async () => null);
    const getSkill = vi.fn(async (uri: string) => (uri === 'skill://kept/SKILL.md' ? entry(uri, 'kept') : null));

    await skills.refresh('docs', [], getSkill);

    expect(getSkill).toHaveBeenCalledTimes(2);
    expect((await skills.list()).map((skill) => skill.uri)).toEqual(['skill://kept/SKILL.md']);
  });

  it('revokes the approval and marks the skill changed when its file list changes', async () => {
    const skills = await registry();
    await skills.refresh('docs', [entry('skill://review/SKILL.md', 'review')], async () => null);
    const approved = (await skills.get('docs', 'skill://review/SKILL.md'))!;
    await skills.approve(approved);
    expect(await skills.isApproved(approved)).toBe(true);

    await skills.refresh('docs', [entry('skill://review/SKILL.md', 'review', digest('b'))], async () => null);

    const refreshed = (await skills.get('docs', 'skill://review/SKILL.md'))!;
    expect(refreshed.changed).toBe(true);
    expect(await skills.isApproved(refreshed)).toBe(false);
  });
});
