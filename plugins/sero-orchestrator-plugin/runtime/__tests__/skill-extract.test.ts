/**
 * Skill extraction (specs/18-skill-extraction.md).
 *
 * Two properties matter here and both are deterministic: the pass never writes a
 * skill (only a draft), and `save_skill` writes the USER'S edited values through
 * the gated host capability — never the model's proposal.
 */

import { describe, expect, it } from 'vitest';
import { hasCompletedRun, proposeSkill } from '../skill-extract';
import { handleSkillAction } from '../skill-actions';
import { digestsPath } from '../digest';
import { createFakeHost, type FakeHost } from './fake-host';
import { seedActiveLoop, sequentialPlan } from './fixtures';
import type { DigestLog, Loop, RunDigest } from '../../shared/types';

function digest(runNumber: number, completion: RunDigest['completion'] = 'complete'): RunDigest {
  return {
    runNumber,
    status: 'completed',
    completion,
    startedAt: 't0',
    endedAt: 't1',
    steps: [{ id: 'a', title: 'First', status: 'succeeded', attempts: 2, failureSummary: undefined }],
    recoveries: [{ stepId: 'a', decision: 'retry-step', reason: 'lockfile was stale' }],
  };
}

/** Puts digests where `gatherHistory` reads them. */
function seedDigests(host: FakeHost, loopId: string, digests: RunDigest[]): void {
  const log: DigestLog = { version: 1, digests };
  host.artifacts.set(`artifact://${digestsPath(loopId)}`, JSON.stringify(log));
}

function skillResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    skill: {
      name: 'stale-lockfile-recovery',
      description: 'Recover a build blocked by a stale lockfile. Use when install fails after a dependency bump.',
      body: '# Stale lockfile\n\n1. Delete the lockfile.\n2. Reinstall.\n',
      rationale: 'every run retried the install step for the same reason',
      ...overrides,
    },
  });
}

function seedLoop(host: FakeHost): Loop {
  const loop = seedActiveLoop(host, sequentialPlan().plan);
  seedDigests(host, loop.id, [digest(1)]);
  return loop;
}

describe('proposeSkill', () => {
  it('drafts a skill and stores the body as an artifact, writing no skill file', async () => {
    const host = createFakeHost();
    const loop = seedLoop(host);
    host.modelResponses.push({ response: skillResponse() });

    const out = await proposeSkill(host, loop, [digest(1)]);

    expect('draft' in out).toBe(true);
    if (!('draft' in out)) return;
    expect(out.draft.name).toBe('stale-lockfile-recovery');
    expect(out.draft.status).toBe('pending');
    expect(out.draft.fromRunNumbers).toEqual([1]);
    expect(await host.readArtifact(out.draft.bodyRef)).toContain('Delete the lockfile');
    expect(host.skills.written).toHaveLength(0);
  });

  it('runs read-only in the workspace so it can load skill-creator and read files', async () => {
    const host = createFakeHost();
    const loop = seedLoop(host);
    host.modelResponses.push({ response: skillResponse() });

    await proposeSkill(host, loop, [digest(1)]);

    expect(host.modelCalls[0].platformTools).toBe('readOnly');
    expect(host.modelCalls[0].cwd).toBe(host.workspacePath);
    expect(host.modelCalls[0].systemPrompt).toContain('skill-creator');
  });

  it('declines with a reason when the workflow teaches nothing durable', async () => {
    const host = createFakeHost();
    const loop = seedLoop(host);
    host.modelResponses.push({ response: JSON.stringify({ skill: null, reason: 'a one-off cleanup' }) });

    const out = await proposeSkill(host, loop, [digest(1)]);

    expect(out).toEqual({ declined: 'a one-off cleanup' });
  });

  it('repairs an invalid name once, then declines rather than surfacing a bad draft', async () => {
    const host = createFakeHost();
    const loop = seedLoop(host);
    host.modelResponses.push({ response: skillResponse({ name: 'Not A Slug' }) });
    host.modelResponses.push({ response: skillResponse({ name: 'still Bad' }) });

    const out = await proposeSkill(host, loop, [digest(1)]);

    expect('declined' in out).toBe(true);
    expect(host.modelCalls).toHaveLength(2);
    expect(host.modelCalls[1].task).toContain('previous extraction JSON was invalid');
  });

  it('accepts the repaired reply', async () => {
    const host = createFakeHost();
    const loop = seedLoop(host);
    host.modelResponses.push({ response: skillResponse({ name: 'Not A Slug' }) });
    host.modelResponses.push({ response: skillResponse() });

    const out = await proposeSkill(host, loop, [digest(1)]);

    expect('draft' in out).toBe(true);
  });

  it('tells the model which skills already exist', async () => {
    const host = createFakeHost();
    const loop = seedLoop(host);
    host.skills.existing.push({ name: 'release-notes', description: 'Draft release notes.', filePath: '/x/SKILL.md' });
    host.modelResponses.push({ response: skillResponse() });

    await proposeSkill(host, loop, [digest(1)]);

    expect(host.modelCalls[0].task).toContain('release-notes');
  });
});

describe('hasCompletedRun', () => {
  it('is true only when a run reached completion', () => {
    expect(hasCompletedRun([digest(1, 'blocked')])).toBe(false);
    expect(hasCompletedRun([digest(1, 'blocked'), digest(2)])).toBe(true);
    expect(hasCompletedRun([])).toBe(false);
  });
});

describe('extract_skill action', () => {
  it('is refused until a run has completed', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    seedDigests(host, loop.id, [digest(1, 'blocked')]);

    const res = await handleSkillAction(host, { kind: 'extract_skill', loopId: loop.id });

    expect(res.ok).toBe(false);
    expect(res.error).toBe('No successful run yet — a skill is extracted from what worked.');
    expect(host.modelCalls).toHaveLength(0);
  });

  it('stores the pending draft on the loop and returns its body', async () => {
    const host = createFakeHost();
    const loop = seedLoop(host);
    host.modelResponses.push({ response: skillResponse() });

    const res = await handleSkillAction(host, { kind: 'extract_skill', loopId: loop.id });

    expect(res.ok).toBe(true);
    expect(res.skillDraftBody).toContain('Delete the lockfile');
    expect(host.state.loops[0].skillDraft?.status).toBe('pending');
  });

  it('stores nothing when the pass declines', async () => {
    const host = createFakeHost();
    const loop = seedLoop(host);
    host.modelResponses.push({ response: JSON.stringify({ skill: null, reason: 'too simple' }) });

    const res = await handleSkillAction(host, { kind: 'extract_skill', loopId: loop.id });

    expect(res).toMatchObject({ ok: true, skillDeclined: 'too simple' });
    expect(host.state.loops[0].skillDraft).toBeUndefined();
  });
});

describe('save_skill action', () => {
  async function withDraft(host: FakeHost): Promise<Loop> {
    const loop = seedLoop(host);
    host.modelResponses.push({ response: skillResponse() });
    await handleSkillAction(host, { kind: 'extract_skill', loopId: loop.id });
    return host.state.loops[0];
  }

  it('writes the user’s edited values, not the proposed ones, and links the loop', async () => {
    const host = createFakeHost();
    const loop = await withDraft(host);

    const res = await handleSkillAction(host, {
      kind: 'save_skill',
      loopId: loop.id,
      draftId: loop.skillDraft!.id,
      name: 'lockfile-recovery',
      description: 'Edited description. Use when install fails.',
      body: '# Edited body\n',
    });

    expect(res.ok).toBe(true);
    expect(host.skills.written).toEqual([{
      name: 'lockfile-recovery',
      description: 'Edited description. Use when install fails.',
      body: '# Edited body\n',
      origin: `sero-workflow:${loop.id}`,
      overwrite: undefined,
      // Names the draft the user reviewed; the host matches it to the approval
      // the app issued and consumes it once.
      approval: { scope: `${loop.id}:${loop.skillDraft!.id}` },
    }]);
    expect(host.state.loops[0].skillLink).toMatchObject({ name: 'lockfile-recovery' });
    expect(host.state.loops[0].skillDraft?.status).toBe('saved');
  });

  it('refuses a taken name and reports the conflict, writing nothing', async () => {
    const host = createFakeHost();
    const loop = await withDraft(host);
    host.skills.existing.push({ name: 'taken', description: 'x', filePath: '/agent/skills/taken/SKILL.md' });

    const res = await handleSkillAction(host, {
      kind: 'save_skill', loopId: loop.id, draftId: loop.skillDraft!.id, name: 'taken', description: 'd', body: 'b',
    });

    expect(res.ok).toBe(false);
    expect(res.skillConflict).toEqual({ name: 'taken', filePath: '/agent/skills/taken/SKILL.md' });
    expect(host.skills.written).toHaveLength(0);
  });

  it('replaces a taken name once the user chose overwrite', async () => {
    const host = createFakeHost();
    const loop = await withDraft(host);
    host.skills.existing.push({ name: 'taken', description: 'x', filePath: '/agent/skills/taken/SKILL.md' });

    const res = await handleSkillAction(host, {
      kind: 'save_skill', loopId: loop.id, draftId: loop.skillDraft!.id, name: 'taken', description: 'd', body: 'b', overwrite: true,
    });

    expect(res.ok).toBe(true);
    expect(host.skills.written[0].overwrite).toBe(true);
  });

  it('rejects an invalid name, an empty description and an empty body', async () => {
    const host = createFakeHost();
    const loop = await withDraft(host);
    const base = { kind: 'save_skill' as const, loopId: loop.id, draftId: loop.skillDraft!.id, name: 'ok-name', description: 'd', body: 'b' };

    expect((await handleSkillAction(host, { ...base, name: '../escape' })).error).toMatch(/Invalid skill name/);
    expect((await handleSkillAction(host, { ...base, description: '  ' })).error).toMatch(/description/);
    expect((await handleSkillAction(host, { ...base, body: '  ' })).error).toMatch(/body/);
    expect(host.skills.written).toHaveLength(0);
  });

  it('fails clearly on a host without the capability', async () => {
    const host = createFakeHost();
    const loop = await withDraft(host);
    (host as { skills?: unknown }).skills = undefined;

    const res = await handleSkillAction(host, {
      kind: 'save_skill', loopId: loop.id, draftId: loop.skillDraft!.id, name: 'ok-name', description: 'd', body: 'b',
    });

    expect(res.ok).toBe(false);
    expect(res.error).toBe('This Sero build cannot save skills from the Orchestrator.');
  });

  it('needs a draft first', async () => {
    const host = createFakeHost();
    const loop = seedLoop(host);

    const res = await handleSkillAction(host, {
      kind: 'save_skill', loopId: loop.id, draftId: 'skill-x', name: 'ok-name', description: 'd', body: 'b',
    });

    expect(res.error).toBe('No skill draft is waiting for review — extract one first.');
    expect(host.skills.written).toHaveLength(0);
  });

  it('refuses a draft id that is not the current one', async () => {
    const host = createFakeHost();
    const loop = await withDraft(host);

    const res = await handleSkillAction(host, {
      kind: 'save_skill', loopId: loop.id, draftId: 'skill-stale', name: 'ok-name', description: 'd', body: 'b',
    });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no longer the current one/);
    expect(host.skills.written).toHaveLength(0);
  });

  it('refuses a second save of a draft that was already decided', async () => {
    const host = createFakeHost();
    const loop = await withDraft(host);
    const draftId = loop.skillDraft!.id;
    const save = { kind: 'save_skill' as const, loopId: loop.id, draftId, name: 'ok-name', description: 'd', body: 'b' };

    expect((await handleSkillAction(host, save)).ok).toBe(true);
    const second = await handleSkillAction(host, save);

    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/No skill draft is waiting for review/);
    expect(host.skills.written).toHaveLength(1);
  });
});

describe('discard_skill_draft action', () => {
  it('marks the draft discarded and writes nothing', async () => {
    const host = createFakeHost();
    const loop = seedLoop(host);
    host.modelResponses.push({ response: skillResponse() });
    await handleSkillAction(host, { kind: 'extract_skill', loopId: loop.id });

    const res = await handleSkillAction(host, { kind: 'discard_skill_draft', loopId: loop.id });

    expect(res.ok).toBe(true);
    expect(host.state.loops[0].skillDraft?.status).toBe('discarded');
    expect(host.skills.written).toHaveLength(0);
  });
});

describe('a malformed reply', () => {
  it('is repaired, not read as a refusal', async () => {
    const host = createFakeHost();
    const loop = seedLoop(host);
    host.modelResponses.push({ response: JSON.stringify({ nothing: true }) });
    host.modelResponses.push({ response: skillResponse() });

    const out = await proposeSkill(host, loop, [digest(1)]);

    expect('draft' in out).toBe(true);
    expect(host.modelCalls).toHaveLength(2);
  });
});
