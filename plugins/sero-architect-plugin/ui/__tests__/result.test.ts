import { describe, expect, it } from 'vitest';
import { sessionStartedAt } from '@sero-ai/common';
import { projectActivity } from '../../shared/activity';
import type { ProjectRecord } from '../../shared/record';
import { DELIVERY_FIXTURES } from '../__preview__/delivery-fixture';
import { boardOf } from '../lib/board';
import { evidenceProblem, receiptUrl, resultGaps, resultNeedsReview } from '../lib/result';

const base = DELIVERY_FIXTURES['board-done']!;
const criterion = { id: 'length', text: 'The shortened value fits the limit.', userStated: true };
const record: ProjectRecord = {
  ...base,
  working: { ...base.working!, criteria: [criterion] },
  milestones: [{ ...base.milestones[0]!, verification: 'delivered', receipt: '/work/result', evidence: {
    commit: 'abc1234', checkedAt: base.updatedAt, commands: [{ command: 'node --test', exitCode: 0, output: '1 pass', durationMs: 8 }],
    filesChanged: true, diffSummary: 'truncate.js | 2 +-', preview: null, passed: true, stale: false,
    binding: { workingRevision: 2, criteria: [criterion], previewRoute: null },
  } }],
};

describe('the recorded result', () => {
  it('requires accepted current evidence for the requested criteria', () => {
    expect(resultNeedsReview(record)).toBe(false);
    expect(resultGaps(record)).toEqual([]);
    const changed = { ...record, working: { ...record.working!, criteria: [{ ...criterion, text: 'A new requirement' }] } };
    expect(resultNeedsReview(changed)).toBe(true);
    expect(resultGaps(changed).map((gap) => gap.id)).toEqual(['length']);
    expect(evidenceProblem(changed, changed.milestones[0]!)).toContain('changed after the check');
  });

  it.each(['missing', 'stale', 'failed', 'revision unavailable', 'reported'] as const)('cannot present %s proof as successful delivery', (kind) => {
    const milestone = record.milestones[0]!;
    const evidence = milestone.evidence!;
    const changed: ProjectRecord = { ...record, milestones: [{ ...milestone,
      verification: kind === 'reported' ? 'reported' : 'delivered',
      evidence: kind === 'missing' ? null : { ...evidence, stale: kind === 'stale', passed: kind !== 'failed', commit: kind === 'revision unavailable' ? '' : evidence.commit },
    }] };
    const activity = projectActivity(changed, { sessionStartedAt: sessionStartedAt(), runtimeRunning: true });
    const board = boardOf(changed, activity, { live: false });
    expect(resultNeedsReview(changed)).toBe(true);
    expect(board.tone).not.toBe('done');
    expect(changed.milestones[0]?.receipt).toBe('/work/result');
  });

  it('shows explicit gaps even if checks cover the criterion, and does not infer missing coverage', () => {
    const changed = { ...record, working: { ...record.working!, criteria: [{ ...criterion, gap: 'Needs a person to review the output.' }] } };
    expect(resultGaps(changed)[0]?.reason).toBe('Needs a person to review the output.');
    expect(resultNeedsReview({ ...record, working: undefined })).toBe(true);
  });

  it('keeps opaque receipts as text and links only web destinations', () => {
    expect(receiptUrl('https://example.com/result')).toBe('https://example.com/result');
    for (const receipt of ['javascript:alert(1)', 'file:///etc/passwd', '/workspace', 'feat/repair', 'PR #14 merged']) expect(receiptUrl(receipt)).toBeNull();
  });
});
