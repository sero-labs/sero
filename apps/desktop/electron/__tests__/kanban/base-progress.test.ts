import { describe, expect, it, vi } from 'vitest';

import { PlanningProgressTracker } from '../../kanban/planning-progress';

function latestPlanningProgress(writeCard: ReturnType<typeof vi.fn>) {
  return writeCard.mock.calls.at(-1)?.[2].planningProgress;
}

describe('PlanningProgressTracker tool parsing', () => {
  it('does not treat markdown card headings as tool activity', async () => {
    const writeCard = vi.fn().mockResolvedValue(undefined);
    const tracker = new PlanningProgressTracker('/tmp/state.json', '1', writeCard);

    tracker.addLogLine('# Card: Make the text red');
    await tracker.flush();

    expect(latestPlanningProgress(writeCard)?.recentTools).toEqual([]);
    expect(latestPlanningProgress(writeCard)?.log).toContain('# Card: Make the text red');
  });

  it('still captures real tool updates in recent tools', async () => {
    const writeCard = vi.fn().mockResolvedValue(undefined);
    const tracker = new PlanningProgressTracker('/tmp/state.json', '1', writeCard);

    tracker.addLogLine('📂 bash: cd /workspace && npm test');
    await tracker.flush();

    expect(latestPlanningProgress(writeCard)?.recentTools).toEqual([
      {
        tool: 'bash',
        args: 'cd /workspace && npm test',
        running: true,
      },
    ]);
  });
});
