import { describe, expect, it } from 'vitest';

import { DECISION, FIXTURES } from '../__preview__/fixture';
import { spendTone, suggestedCapFor } from './helpers';
import {
  acceptedCount,
  directiveThread,
  evidenceLines,
  isAwake,
  needsYouItems,
  parkedTitles,
  railRows,
  recommendedOption,
} from '../lib/view-model';

describe('needs-you items', () => {
  it('lists the open decision first and nothing for a quiet build', () => {
    const decision = needsYouItems(FIXTURES.decision!);
    expect(decision.map((item) => item.kind)).toEqual(['decision']);
    expect(needsYouItems(FIXTURES.build!)).toEqual([]);
  });

  it('adds the charter gate while the charter waits for approval', () => {
    expect(needsYouItems(FIXTURES.charter!).map((item) => item.kind)).toEqual(['charter']);
  });

  it('adds a plan approval per planned milestone with a plan under milestone autonomy, and none otherwise', () => {
    const planned = { ...FIXTURES.build!, milestones: FIXTURES.build!.milestones.map((m) => (m.id === 'm3' ? { ...m, plan: 'Do the thing.' } : m)) };
    expect(needsYouItems(planned).map((item) => item.kind)).toEqual(['milestone']);
    expect(needsYouItems({ ...planned, autonomy: 'charter-only' })).toEqual([]);
  });

  it('preselects the recommendation and names what the decision parks', () => {
    expect(recommendedOption(DECISION)?.id).toBe('canvas');
    expect(parkedTitles(DECISION, FIXTURES.decision!)).toEqual(['Browser build and a playable demo page']);
  });
});

describe('the milestone rail', () => {
  it('maps status to dot, label and one link per dispatched milestone', () => {
    const rows = railRows(FIXTURES.decision!);
    expect(rows.map((row) => [row.milestone.id, row.dot, row.label, row.link?.id ?? null])).toEqual([
      ['m1', 'check', 'accepted', 'workflow-m1'],
      ['m2', 'check', 'accepted', 'workflow-m2'],
      ['m3', 'ring', 'running', 'room-m3'],
      ['m4', 'parked', 'parked', null],
      ['m5', 'hollow', 'planned', null],
    ]);
    expect(rows[3]?.sub).toBe('Waiting for your answer: How should the dungeon be drawn?');
    expect(acceptedCount(FIXTURES.decision!)).toBe(2);
  });

  it('shows the maintenance subscription as watching, with only its next run', () => {
    const base = FIXTURES.maintain!;
    const record = {
      ...base,
      milestones: base.milestones.map((m) => (m.id === 'maintenance' && m.dispatch
        ? { ...m, dispatch: { ...m.dispatch, lastRunAt: '2026-09-14T19:46:17.412Z', nextRunAt: '2026-09-21T08:00:00.000Z' } }
        : m)),
    };
    const row = railRows(record).find((r) => r.milestone.id === 'maintenance');
    expect(row?.label).toBe('watching');
    expect(row?.sub).toMatch(/^Next run /);
    expect(row?.sub).not.toContain('running');
    // A stamp-less record, as written before the watcher stamped it, says nothing rather than "running".
    expect(railRows(base).find((r) => r.milestone.id === 'maintenance')?.sub).toBeNull();
  });

  it('places the ladder on the verification state and keeps a lower state from looking higher', () => {
    const rows = railRows(FIXTURES.maintain!);
    expect(rows.find((row) => row.milestone.id === 'f12')?.ladder).toBe(0);
    expect(rows.find((row) => row.milestone.id === 'm5')?.ladder).toBe(3);
    expect(rows.find((row) => row.milestone.id === 'maintenance')?.ladder).toBeNull();
  });

  it('gives every check its own row, in run order', () => {
    const evidence = FIXTURES.build!.milestones[0]!.evidence!;
    expect(evidenceLines(evidence).map((check) => [check.state, check.name])).toEqual([
      ['ok', 'pnpm test'],
      ['ok', 'pnpm typecheck'],
      ['ok', 'changed files'],
    ]);
  });

  it('keeps each command\'s complete output rather than the last 400 characters', () => {
    const base = FIXTURES.build!.milestones[0]!.evidence!;
    const long = `first line\n${'x'.repeat(900)}\nlast line`;
    const checks = evidenceLines({ ...base, commands: [{ command: 'pnpm build', exitCode: 0, output: long, durationMs: 833 }] });
    expect(checks[0].output).toBe(long);
    expect(checks[0].durationMs).toBe(833);
  });

  it('counts new files apart from files git already tracks', () => {
    const base = FIXTURES.build!.milestones[0]!.evidence!;
    const onlyNew = evidenceLines({ ...base, commands: [], diffSummary: 'untracked:\na.md\nb.md\nc.md' });
    expect(onlyNew).toHaveLength(1);
    expect(onlyNew[0].name).toBe('3 new files');
    expect(onlyNew[0].state).toBe('ok');

    const mixed = evidenceLines({
      ...base,
      commands: [],
      diffSummary: 'src/game.js | 4 ++--\n1 file changed, 2 insertions(+), 2 deletions(-)\nuntracked:\na.md\nb.md',
    });
    expect(mixed[0].name).toBe('changed files · 2 new files');

    const oneNew = evidenceLines({ ...base, commands: [], diffSummary: 'untracked:\nonly.md' });
    expect(oneNew[0].name).toBe('1 new file');
  });

  it('never invents a duration or an outcome the record does not hold', () => {
    const base = FIXTURES.build!.milestones[0]!.evidence!;
    const checks = evidenceLines({
      ...base,
      commands: [{ command: 'pnpm test', exitCode: 1, output: '', durationMs: 100 }],
      diffSummary: null,
      preview: { route: '/play', smokePassed: false, capturePath: null, failure: 'Dev server did not start: address in use' },
    });
    // A failed command keeps its exit state and its own duration.
    expect(checks[0]).toMatchObject({ state: 'err', name: 'pnpm test', durationMs: 100 });
    // A failed smoke check says why, and has no duration to give.
    const smoke = checks.find((check) => check.detail);
    expect(smoke).toMatchObject({ state: 'err', name: 'Page /play', detail: 'Dev server did not start: address in use' });
    expect(smoke?.durationMs).toBeUndefined();
    // No capture is not a failure, and it carries neither a duration nor an
    // output, nor the preview control that would have nothing to open.
    const capture = checks.at(-1)!;
    expect(capture).toMatchObject({ state: 'dim', name: 'No screenshot of /play' });
    expect(capture.durationMs).toBeUndefined();
    expect(capture.opensPreview).toBeUndefined();
  });

  it('offers the preview from the capture row when a capture exists, and no duration for it', () => {
    const base = FIXTURES.build!.milestones[0]!.evidence!;
    const checks = evidenceLines({
      ...base,
      commands: [],
      diffSummary: null,
      preview: { route: '/', smokePassed: true, capturePath: 'evidence/m3/shot.png' },
    });
    expect(checks[0]).toMatchObject({ state: 'ok', name: 'Page / responded' });
    expect(checks[1]).toMatchObject({ state: 'ok', name: 'Screenshot of /', opensPreview: true });
    expect(checks[1].durationMs).toBeUndefined();
  });
});

describe('directives, wakefulness and caps', () => {
  it('keeps the newest directive as the thread and the rest behind the disclosure', () => {
    const thread = directiveThread(FIXTURES.build!);
    expect(thread.latest?.id).toBe('dir3');
    expect(thread.older.map((d) => d.id)).toEqual(['dir2', 'dir1']);
  });

  it('reports the owner as not woken when paused, limited, blocked or still in intake', () => {
    expect(isAwake(FIXTURES.build!)).toBe(true);
    expect(isAwake({ ...FIXTURES.build!, paused: true })).toBe(false);
    expect(isAwake(FIXTURES.limited!)).toBe(false);
    expect(isAwake({ ...FIXTURES.build!, overlay: 'blocked' })).toBe(false);
    expect(isAwake(FIXTURES.intake!)).toBe(false);
  });

  it('tones the spend against the cap and suggests the next round cap', () => {
    expect([spendTone(11.4, 40), spendTone(33, 40), spendTone(40, 40), spendTone(5, null)]).toEqual(['ok', 'warn', 'err', 'none']);
    expect([suggestedCapFor(40), suggestedCapFor(null), suggestedCapFor(35)]).toEqual([60, 20, 60]);
  });
});
