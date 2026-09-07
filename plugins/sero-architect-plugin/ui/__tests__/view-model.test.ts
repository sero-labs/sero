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
    expect(rows[3]?.sub).toBe('Parked on: How should the dungeon be drawn?');
    expect(acceptedCount(FIXTURES.decision!)).toBe(2);
  });

  it('places the ladder on the verification state and keeps a lower state from looking higher', () => {
    const rows = railRows(FIXTURES.maintain!);
    expect(rows.find((row) => row.milestone.id === 'f12')?.ladder).toBe(0);
    expect(rows.find((row) => row.milestone.id === 'm5')?.ladder).toBe(3);
    expect(rows.find((row) => row.milestone.id === 'maintenance')?.ladder).toBeNull();
  });

  it('renders evidence lines from commands, diff and preview in run order', () => {
    const evidence = FIXTURES.build!.milestones[0]!.evidence!;
    expect(evidenceLines(evidence).map((line) => [line.state, line.check])).toEqual([
      ['ok', 'pnpm test'],
      ['ok', 'pnpm typecheck'],
      ['ok', 'git diff'],
    ]);
    const failed = evidenceLines({ ...evidence, commands: [{ command: 'pnpm test', exitCode: 1, output: '', durationMs: 100 }], preview: { route: '/play', smokePassed: false, capturePath: null } });
    expect(failed.map((line) => line.state)).toEqual(['err', 'ok', 'err', 'dim']);
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
