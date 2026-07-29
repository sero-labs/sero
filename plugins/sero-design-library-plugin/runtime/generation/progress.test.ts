import { describe, expect, it, vi } from 'vitest';

import { createGenerationProgressReporter } from './progress';

describe('generation progress writes', () => {
  it('keeps tool-owned updates in order and waits for them', async () => {
    const written: string[] = [];
    const reporter = createGenerationProgressReporter(async (message) => {
      await Promise.resolve();
      written.push(message);
    }, vi.fn());

    reporter.report('Planning the design…');
    reporter.report('Writing the design files…');
    await reporter.settle();

    expect(written).toEqual(['Planning the design…', 'Writing the design files…']);
  });
});
