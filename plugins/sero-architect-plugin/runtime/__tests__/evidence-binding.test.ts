/**
 * Evidence follows the current requirements (change
 * rework-autonomous-delivery-and-feedback, task 3.6).
 *
 * A check proves the criteria it names, as they read when it was requested.
 * A criterion that changes afterwards is no longer proved by it, even when no
 * file moved, and proof the change did not touch stays valid.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { provenBy, unaccountedRequirements } from '../../shared/evidence-binding';
import type { EvidenceRecord, Milestone, ProjectRecord } from '../../shared/record';
import { applyDelivery } from '../delivery';
import { createOwnerActions } from '../owner-actions';
import { createServices } from '../services';
import { createTurnOutcomes } from '../turn-outcomes';
import { agreedProject, cleanupHosts, fakeHost, milestone, storeFor, T0 } from './helpers';

afterEach(cleanupHosts);

const owner = { sessionPath: '/sessions/owner.jsonl', cwd: '/home/dan/projects/hollow' };

const working = (criteria: { id: string; text: string; userStated?: boolean; gap?: string }[]) => ({
  revision: 1, objective: 'A synth playable from the keyboard.', approach: 'One HTML file.', assumptions: [], reason: null, updatedAt: T0,
  criteria: criteria.map((criterion) => ({ userStated: true, ...criterion })),
});

const reported = (id: string): Milestone => milestone(id, {
  status: 'verifying', verification: 'reported',
  dispatch: { kind: 'workflow', id: `loop_${id}`, workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null, baseCommit: 'base' },
});

const passedFor = (criteria: { id: string; text: string }[]): EvidenceRecord => ({
  commit: 'abc', checkedAt: T0, commands: [{ command: 'npm test', exitCode: 0, output: 'ok', durationMs: 1 }], diffSummary: null, filesChanged: false,
  preview: null, passed: true, stale: false, binding: { workingRevision: 1, criteria, previewRoute: null },
});

async function setup(record: ProjectRecord) {
  const host = await fakeHost();
  const store = await storeFor(host);
  await store.write(record);
  const services = createServices({ host, store, wake: () => undefined });
  const actions = createOwnerActions({ host, store, outcomes: createTurnOutcomes(), services });
  return { host, store, actions };
}

const milestoneOf = async (store: Awaited<ReturnType<typeof storeFor>>, id: string) => (await store.read('proj_1'))!.milestones.find((item) => item.id === id)!;

describe('evidence bound to criteria', () => {
  it('does not let a late result accept work whose criterion changed while the check ran', async () => {
    const { host, store, actions } = await setup(agreedProject({
      working: working([{ id: 'c1', text: 'Keys A to K play one octave' }]),
      milestones: [reported('m1')],
    }));
    // The check is in flight until the test lets it finish. No file changes.
    let finish: () => void = () => undefined;
    const running = new Promise<void>((resolve) => { finish = resolve; });
    host.runCommand = async () => { await running; return { exitCode: 0, stdout: 'ok', stderr: '' }; };

    expect((await actions.execute(owner, { action: 'evidence', projectId: 'proj_1', milestoneId: 'm1', commands: ['npm test'], criteria: ['c9'] })).ok).toBe(false);
    const started = await actions.execute(owner, { action: 'evidence', projectId: 'proj_1', milestoneId: 'm1', commands: ['npm test'], criteria: ['c1'] });
    expect(started.ok, started.text).toBe(true);

    // The criterion is revised meanwhile. It needs no approval and no decision.
    const revised = await actions.execute(owner, {
      action: 'working', projectId: 'proj_1', reason: 'The user also needs the black keys.',
      criteriaJson: JSON.stringify([{ id: 'c1', text: 'Keys A to K and W to U play one chromatic octave', userStated: true }]),
    });
    expect(revised.ok, revised.text).toBe(true);
    finish();
    await expect.poll(async () => (await milestoneOf(store, 'm1')).evidence?.passed).toBe(true);

    const late = await milestoneOf(store, 'm1');
    expect(late.evidence?.binding).toMatchObject({ workingRevision: 1, criteria: [{ id: 'c1', text: 'Keys A to K play one octave' }] });
    expect(late.verification).toBe('reported');
    expect((await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true })).ok).toBe(false);
    expect((await store.read('proj_1'))!.decisions).toEqual([]);

    // A check for the current criterion accepts it.
    host.runCommand = async () => ({ exitCode: 0, stdout: 'ok', stderr: '' });
    expect((await actions.execute(owner, { action: 'evidence', projectId: 'proj_1', milestoneId: 'm1', commands: ['npm test'], criteria: ['c1'] })).ok).toBe(true);
    await expect.poll(async () => (await milestoneOf(store, 'm1')).verification).toBe('verified');
    const accepted = await actions.execute(owner, { action: 'milestone', projectId: 'proj_1', milestoneId: 'm1', done: true });
    expect(accepted.ok, accepted.text).toBe(true);
    expect(provenBy((await store.read('proj_1'))!, 'c1')?.id).toBe('m1');
  });

  it('reopens only the milestone whose criterion changed, and nothing for a change of approach', async () => {
    const c1 = { id: 'c1', text: 'Keys play' };
    const c2 = { id: 'c2', text: 'Volume changes the level' };
    const done = (id: string, covered: { id: string; text: string }) => ({ ...reported(id), status: 'done' as const, verification: 'accepted' as const, evidence: passedFor([covered]) });
    const { store, actions } = await setup(agreedProject({ working: working([c1, c2]), milestones: [done('m1', c1), done('m2', c2)] }));

    expect((await actions.execute(owner, { action: 'working', projectId: 'proj_1', approach: 'Split the voice into a module.', reason: 'Easier to test.' })).ok).toBe(true);
    expect((await store.read('proj_1'))!.milestones.map((item) => item.status)).toEqual(['done', 'done']);

    const revised = await actions.execute(owner, {
      action: 'working', projectId: 'proj_1', reason: 'The level must also be shown.',
      criteriaJson: JSON.stringify([{ ...c1, userStated: true }, { id: 'c2', text: 'Volume changes the level and shows it', userStated: true }]),
    });
    expect(revised.ok, revised.text).toBe(true);
    const record = (await store.read('proj_1'))!;
    expect(record.milestones.map((item) => [item.status, item.verification])).toEqual([['done', 'accepted'], ['verifying', 'reported']]);
    // The superseded evidence is kept as history, unchanged.
    expect(record.milestones[1]!.evidence).toEqual(passedFor([c2]));
    expect(provenBy(record, 'c1')?.id).toBe('m1');
    expect(provenBy(record, 'c2')).toBeUndefined();
  });

  it('reads evidence saved before bindings as it was, and invents no revision for it', async () => {
    const { binding: _none, ...legacyEvidence } = passedFor([]);
    const before = { ...reported('m1'), status: 'done' as const, verification: 'accepted' as const, evidence: legacyEvidence };
    const { store, actions } = await setup(agreedProject({ working: working([{ id: 'c1', text: 'Keys play' }]), milestones: [before] }));
    expect((await actions.execute(owner, { action: 'working', projectId: 'proj_1', reason: 'Clearer.', criteriaJson: JSON.stringify([{ id: 'c1', text: 'Keys A to K play', userStated: true }]) })).ok).toBe(true);
    const after = await milestoneOf(store, 'm1');
    expect(after).toEqual(before);
    // It proves no named criterion, so it does not account for one either.
    expect(provenBy((await store.read('proj_1'))!, 'c1')).toBeUndefined();
  });
});

describe('a delivery that waited', () => {
  it('completes when the owner states the gap of the requirement that was open', async () => {
    const c1 = { id: 'c1', text: 'Keys play' };
    const delivered = { ...reported('m1'), status: 'done' as const, verification: 'delivered' as const, evidence: passedFor([c1]), receipt: 'workspace-files:index.html' };
    const { store, actions } = await setup(agreedProject({ working: working([c1, { id: 'c2', text: 'Works offline' }]), milestones: [delivered] }));
    const stated = await actions.execute(owner, {
      action: 'working', projectId: 'proj_1', reason: 'There is no way to test offline use here.',
      criteriaJson: JSON.stringify([{ ...c1, userStated: true }, { id: 'c2', text: 'Works offline', userStated: true, gap: 'Not checked: no offline test exists.' }]),
    });
    expect(stated.ok, stated.text).toBe(true);
    const record = (await store.read('proj_1'))!;
    expect(record.phase).toBe('maintain');
    expect(record.milestones[0]!.status).toBe('done');
  });
});

describe('delivery accounts for what the user asked', () => {
  const c1 = { id: 'c1', text: 'Keys play' };
  const delivered = { ...reported('m1'), status: 'done' as const, verification: 'accepted' as const, evidence: passedFor([c1]), receipt: 'workspace-files:index.html' };

  it('is not reported while a stated requirement is neither proved nor has a stated gap', () => {
    const record = agreedProject({ working: working([c1, { id: 'c2', text: 'Works offline' }]), milestones: [delivered] });
    expect(unaccountedRequirements(record).map((criterion) => criterion.id)).toEqual(['c2']);
    const outcome = applyDelivery(record, record.milestones[0]!, T0);
    expect(outcome.record.phase).toBe('build');
    expect(outcome.items.join(' ')).toContain('c2');

    // A worker that only reported completion proves nothing.
    const claimed = agreedProject({ working: working([c1]), milestones: [{ ...delivered, verification: 'reported', status: 'verifying' }] });
    expect(provenBy(claimed, 'c1')).toBeUndefined();
  });

  it('is reported once each stated requirement is proved or its gap is stated', () => {
    const record = agreedProject({ working: working([c1, { id: 'c2', text: 'Works offline', gap: 'Not checked: no offline test exists yet.' }]), milestones: [delivered] });
    expect(unaccountedRequirements(record)).toEqual([]);
    const outcome = applyDelivery(record, record.milestones[0]!, T0);
    expect(outcome.record.phase).toBe('maintain');
    // The gap stays on the record for the user to read.
    expect(outcome.record.working?.criteria[1]?.gap).toBe('Not checked: no offline test exists yet.');
  });

  it('removes what the overview said about work in progress once the result is delivered', () => {
    const base = agreedProject({ working: working([c1]), milestones: [delivered] });
    const record = { ...base, overview: {
      outcome: { text: 'A playable synth.', at: T0 },
      objective: { text: 'Release evidence is running.', at: T0 },
      result: { text: 'Built. Release delivery is running.', at: T0, source: { kind: 'milestone' as const, id: delivered.id } },
    } };
    const outcome = applyDelivery(record, record.milestones[0]!, T0);
    expect(outcome.record.phase).toBe('maintain');
    expect(Object.keys(outcome.record.overview ?? {})).toEqual(['outcome']);
    // The owner is told, so it writes the result again from what is true now.
    expect(outcome.items.join(' ')).toContain('write the result summary again');
  });
});
