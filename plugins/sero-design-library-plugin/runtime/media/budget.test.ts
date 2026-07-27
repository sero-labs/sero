import { describe, expect, it, vi } from 'vitest';

import type { MediaProvenance } from '../../shared/media';
import { MediaBudget, createVideoConfirmer } from './budget';

const DESCRIBE = { prompt: 'a hero image', model: 'test/model' };

function provenance(costUsd?: number): MediaProvenance {
  return {
    providerId: 'fake',
    capability: 'text-to-image',
    model: 'test/model',
    prompt: '',
    parameters: {},
    ...(costUsd === undefined ? {} : { costUsd }),
    startedAt: 0,
    completedAt: 1,
  };
}

describe('MediaBudget', () => {
  const approve = vi.fn(async () => true);

  it('allows calls up to the cap and refuses the next one', async () => {
    const budget = new MediaBudget({ callsPerRun: 2, confirmVideo: approve });

    expect(await budget.claim('text-to-image', DESCRIBE)).toEqual({ allowed: true });
    expect(await budget.claim('text-to-image', DESCRIBE)).toEqual({ allowed: true });

    const refused = await budget.claim('text-to-image', DESCRIBE);
    expect(refused.allowed).toBe(false);
    expect(refused).toMatchObject({ kind: 'cap' });
    expect(budget.callsUsed).toBe(2);
    expect(budget.callsRemaining).toBe(0);
  });

  it('reports the cap without pretending the run failed', async () => {
    const budget = new MediaBudget({ callsPerRun: 0, confirmVideo: approve });

    await budget.claim('text-to-image', DESCRIBE);

    // The run carries on; this is the sentence it reports afterwards.
    expect(budget.capWasHit).toBe(true);
    expect(budget.summary()).toMatch(/limit of 0 was reached/);
  });

  it('says nothing when the cap was never reached', async () => {
    const budget = new MediaBudget({ callsPerRun: 3, confirmVideo: approve });
    await budget.claim('text-to-image', DESCRIBE);

    expect(budget.summary()).toBeNull();
  });

  it('counts a call that went on to fail', async () => {
    const budget = new MediaBudget({ callsPerRun: 1, confirmVideo: approve });

    await budget.claim('text-to-image', DESCRIBE);
    // Nothing is recorded — the call failed — and the slot is still gone. A cap
    // that only counted successes would not bound a provider failing in a loop.
    expect((await budget.claim('text-to-image', DESCRIBE)).allowed).toBe(false);
  });

  it('confirms video every time, and never confirms anything else', async () => {
    const confirmVideo = vi.fn(async () => true);
    const budget = new MediaBudget({ callsPerRun: 5, confirmVideo });

    await budget.claim('text-to-image', DESCRIBE);
    await budget.claim('upscale', DESCRIBE);
    expect(confirmVideo).not.toHaveBeenCalled();

    await budget.claim('text-to-video', DESCRIBE);
    await budget.claim('text-to-video', DESCRIBE);
    // Twice, not once: approving one video is not approval for the next.
    expect(confirmVideo).toHaveBeenCalledTimes(2);
  });

  it('refuses a declined video without spending a slot on it', async () => {
    const budget = new MediaBudget({ callsPerRun: 2, confirmVideo: async () => false });

    const refused = await budget.claim('text-to-video', DESCRIBE);

    expect(refused).toMatchObject({ allowed: false, kind: 'declined' });
    expect(budget.callsUsed).toBe(0);
    // Declining is not the cap being hit, and must not be reported as one.
    expect(budget.capWasHit).toBe(false);
  });

  it('totals only the costs the provider actually reported', async () => {
    const budget = new MediaBudget({ callsPerRun: 5, confirmVideo: approve });

    budget.record(provenance(0.03));
    budget.record(provenance());
    budget.record(provenance(0.02));

    expect(budget.reportedCostUsd).toBeCloseTo(0.05);
  });
});

describe('createVideoConfirmer', () => {
  it('approves only on the explicit generate choice', async () => {
    const confirm = createVideoConfirmer({
      requestChoice: async () => ({ choiceId: 'generate', timedOut: false }),
    });

    expect(await confirm(DESCRIBE)).toBe(true);
  });

  it.each([
    { label: 'skip', result: { choiceId: 'skip', timedOut: false } },
    { label: 'a timeout', result: { choiceId: null, timedOut: true } },
    { label: 'a dismissed prompt', result: { choiceId: null, timedOut: false } },
  ])('treats $label as a no', async ({ result }) => {
    const confirm = createVideoConfirmer({ requestChoice: async () => result });

    // Silence is a no. A prompt nobody answered — the app in the background, the
    // user away from the machine — must never become approval to spend.
    expect(await confirm(DESCRIBE)).toBe(false);
  });

  it('shows the prompt and model it is asking about', async () => {
    const seen: string[] = [];
    const confirm = createVideoConfirmer(
      {
        requestChoice: async (options) => {
          seen.push(options.body);
          return { choiceId: 'skip', timedOut: false };
        },
      },
      { designTitle: 'Landing page' },
    );

    await confirm({ prompt: 'a slow pan over water', model: 'vendor/video' });

    expect(seen[0]).toContain('a slow pan over water');
    expect(seen[0]).toContain('vendor/video');
    expect(seen[0]).toContain('Landing page');
  });
});
