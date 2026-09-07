import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  approveCharter,
  block,
  charge,
  deriveOverlay,
  mayDispatch,
  mayWakeForWork,
  pause,
  resume,
  setAutonomy,
  setCap,
  unblock,
} from '../lifecycle';
import { PHASE_ORDER, createProjectRecord, needsYouCount, type Decision, type ProjectRecord } from '../record';

const T0 = '2026-09-06T10:00:00.000Z';
const T1 = '2026-09-06T10:01:00.000Z';

function fresh(): ProjectRecord {
  return createProjectRecord({ id: 'hollow-depths', name: 'Hollow Depths', idea: 'A roguelike.', folder: '~/p', now: T0 });
}

function must(outcome: ReturnType<typeof advancePhase>): ProjectRecord {
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.record;
}

function inCharter(): ProjectRecord {
  let r: ProjectRecord = { ...fresh(), workspaceId: 'ws-1' };
  r = must(advancePhase(r, 'discovery', T1, 'grant approved'));
  r = must(advancePhase(r, 'charter', T1, 'brief written'));
  return {
    ...r,
    charter: { milestoneIds: ['m1'], escalationPolicy: 'ask on scope', autonomy: 'milestones', capUsd: 40, proposedAt: T1, approvedAt: null },
  };
}

function inBuild(): ProjectRecord {
  const approved = must(approveCharter(inCharter(), T1));
  return must(advancePhase(approved, 'build', T1, 'charter approved'));
}

function decision(id: string, dependsOn: string[] = []): Decision {
  return {
    id, question: 'Which renderer?', options: [{ id: 'a', label: 'A', consequence: 'x' }, { id: 'b', label: 'B', consequence: 'y' }],
    recommendation: 'a', reason: 'charter is silent', dependsOn, raisedAt: T1, proposal: null, answer: null,
  };
}

describe('phase transitions', () => {
  it('advances one step at a time through every phase, recording each cause', () => {
    let r: ProjectRecord = { ...fresh(), workspaceId: 'ws-1' };
    r = must(advancePhase(r, 'discovery', T1, 'grant approved'));
    r = must(advancePhase(r, 'charter', T1, 'brief written'));
    r = { ...r, charter: { milestoneIds: [], escalationPolicy: '', autonomy: 'milestones', capUsd: 10, proposedAt: T1, approvedAt: null } };
    r = must(approveCharter(r, T1));
    r = must(advancePhase(r, 'build', T1, 'charter approved'));
    r = must(advancePhase(r, 'release', T1, 'all milestones accepted'));
    r = must(advancePhase(r, 'maintain', T1, 'release delivered'));
    expect(r.phase).toBe('maintain');
    expect(r.history.map((h) => h.phase)).toEqual(['intake', 'discovery', 'charter', 'charter', 'build', 'release', 'maintain']);
    expect(r.history.map((h) => h.cause)).toContain('user approved the charter');
  });

  it('refuses a skip, a step back and a repeat', () => {
    const r = { ...fresh(), workspaceId: 'ws-1' };
    expect(advancePhase(r, 'charter', T1, 'skip')).toMatchObject({ ok: false, error: expect.stringContaining('one step forward') });
    expect(advancePhase(r, 'intake', T1, 'repeat').ok).toBe(false);
    const built = inBuild();
    expect(advancePhase(built, 'charter', T1, 'back').ok).toBe(false);
    expect(advancePhase({ ...built, phase: 'maintain' }, 'maintain', T1, 'past the end').ok).toBe(false);
  });

  it('will not start discovery without a registered workspace', () => {
    expect(advancePhase(fresh(), 'discovery', T1, 'too early')).toMatchObject({ ok: false, error: expect.stringContaining('workspace') });
  });

  it('gates build on an approved charter with a cap', () => {
    const proposed = inCharter();
    expect(advancePhase(proposed, 'build', T1, 'eager')).toMatchObject({ ok: false, error: expect.stringContaining('not approved') });
    expect(advancePhase({ ...proposed, charter: null }, 'build', T1, 'eager')).toMatchObject({ ok: false, error: expect.stringContaining('no charter') });
    // Approval carries the cap onto the budget, so an approved charter always has one.
    const approved = must(approveCharter(proposed, T1));
    expect(approved.budget.capUsd).toBe(40);
    expect(approved.charter?.approvedAt).toBe(T1);
    expect(advancePhase({ ...approved, budget: { ...approved.budget, capUsd: null } }, 'build', T1, 'x')).toMatchObject({ ok: false, error: expect.stringContaining('cost cap') });
    expect(advancePhase(approved, 'build', T1, 'go').ok).toBe(true);
    expect(approveCharter(approved, T1)).toMatchObject({ ok: false, error: expect.stringContaining('already approved') });
    expect(approveCharter(fresh(), T1).ok).toBe(false);
  });
});

describe('overlays', () => {
  it('derives decision from open decisions and clears it when they are answered', () => {
    const r = { ...inBuild(), decisions: [decision('d1', ['m1'])] };
    expect(deriveOverlay(r)).toBe('decision');
    expect(needsYouCount(r)).toBe(1);
    const answered = { ...r, decisions: [{ ...r.decisions[0], answer: { optionId: 'a', note: null, answeredAt: T1 } }] };
    expect(deriveOverlay(answered)).toBeNull();
    expect(needsYouCount(answered)).toBe(0);
  });

  it('pause and resume are the user\'s own stop', () => {
    const paused = must(pause(inBuild(), T1));
    expect(paused.overlay).toBe('paused');
    expect(pause(paused, T1).ok).toBe(false);
    const resumed = must(resume(paused, T1));
    expect(resumed.overlay).toBeNull();
    expect(resume(resumed, T1).ok).toBe(false);
  });

  it('block needs a reason and unblock records its cause', () => {
    expect(block(inBuild(), T1, '  ').ok).toBe(false);
    const blocked = must(block(inBuild(), T1, 'three silent turns'));
    expect(blocked.overlay).toBe('blocked');
    expect(blocked.history.at(-1)?.cause).toBe('blocked: three silent turns');
    expect(unblock(inBuild(), T1, 'x').ok).toBe(false);
    expect(must(unblock(blocked, T1, 'user answered')).overlay).toBeNull();
  });

  it('a reached cap is limited, keeps the phase, and is recorded as the cause', () => {
    const r = inBuild();
    const partly = charge(r, 'dispatched', 15, T1);
    expect(partly.overlay).toBeNull();
    expect(partly.budget).toMatchObject({ spentUsd: 15, sources: { dispatched: 15 } });
    const limited = charge(partly, 'owner', 25, T1);
    expect(limited.overlay).toBe('limited');
    expect(limited.phase).toBe('build');
    expect(limited.history.at(-1)?.cause).toBe('reached the $40 cost cap');
    // A further charge past the cap does not write the cause twice.
    expect(charge(limited, 'research', 1, T1).history).toHaveLength(limited.history.length);
    expect(charge(limited, 'research', 0, T1)).toBe(limited);
  });

  it('raising the cap above usage clears limited; lowering below usage sets it', () => {
    const limited = charge(inBuild(), 'dispatched', 40, T1);
    const raised = must(setCap(limited, 60, T1));
    expect(raised.overlay).toBeNull();
    expect(raised.charter?.capUsd).toBe(60);
    expect(raised.history.at(-1)?.cause).toContain('limit cleared');
    expect(must(setCap(raised, 30, T1)).overlay).toBe('limited');
    expect(setCap(raised, 0, T1).ok).toBe(false);
  });

  it('shows one overlay in precedence: blocked, limited, paused, decision', () => {
    let r = { ...inBuild(), decisions: [decision('d1')] };
    expect(deriveOverlay(r)).toBe('decision');
    r = must(pause(r, T1));
    expect(r.overlay).toBe('paused');
    r = charge(r, 'owner', 40, T1);
    expect(r.overlay).toBe('limited');
    r = must(block(r, T1, 'grant revoked'));
    expect(r.overlay).toBe('blocked');
    r = must(unblock(r, T1, 'grant restored'));
    expect(r.overlay).toBe('limited');
  });

  it('stops work on any overlay but leaves directives reachable', () => {
    const quiet = inBuild();
    expect(mayDispatch(quiet)).toBe(true);
    expect(mayWakeForWork(quiet)).toBe(true);
    const withDecision = { ...quiet, decisions: [decision('d1', ['m2'])] };
    expect(mayDispatch(withDecision)).toBe(false);
    expect(mayWakeForWork(withDecision)).toBe(true);
    expect(mayDispatch(must(pause(quiet, T1)))).toBe(false);
    expect(mayWakeForWork(charge(quiet, 'owner', 40, T1))).toBe(false);
    expect(mayDispatch(inCharter())).toBe(false);
  });
});

describe('autonomy and approvals', () => {
  it('defaults to milestones and follows the charter on approval', () => {
    expect(fresh().autonomy).toBe('milestones');
    const approved = must(approveCharter({ ...inCharter(), charter: { ...inCharter().charter!, autonomy: 'charter-only' } }, T1));
    expect(approved.autonomy).toBe('charter-only');
    expect(setAutonomy(approved, 'charter-only', T1).ok).toBe(false);
    const changed = must(setAutonomy(approved, 'model-judged', T1));
    expect(changed.charter?.autonomy).toBe('model-judged');
  });

  it('counts the charter approval and pending milestone plans as needs-you', () => {
    expect(needsYouCount(inCharter())).toBe(1);
    const built = inBuild();
    const planned = { ...built, milestones: [{ id: 'm1', title: 'Grid', status: 'planned' as const, plan: 'do it', preview: null, dispatch: null, evidence: null, verification: null, parkedBy: null, parkedFrom: null, receipt: null }] };
    expect(needsYouCount(planned)).toBe(1);
    expect(needsYouCount({ ...planned, autonomy: 'charter-only' })).toBe(0);
  });

  it('keeps the idea verbatim while the brief changes', () => {
    const r = { ...fresh(), brief: 'A short brief' };
    expect(r.idea).toBe('A roguelike.');
    expect(PHASE_ORDER).toHaveLength(6);
  });
});
