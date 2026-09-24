/**
 * Project-lifetime totals (spec architect-run-observability).
 *
 * A shared charge links to several runs and is counted once, and spend no
 * journal holds is shown as unassigned instead of being spread over runs.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectRecord } from '../../shared/record';
import { createRunJournal } from '../run-journal';
import { queryLifetime } from '../trace-lifetime';
import { buildingProject, cleanupHosts, fakeHost } from './helpers';

afterEach(cleanupHosts);

describe('project lifetime', () => {
  it('counts a shared record once across three runs and reads no detail pages beyond each run', async () => {
    const host = await fakeHost();
    const journal = createRunJournal({ homeDir: await host.homeDir() });
    const project = buildingProject({
      runs: [
        { id: 'r1', kind: 'initial', objectiveId: null, startedAt: 't0', endedAt: 't1', outcome: 'delivered' },
        { id: 'r2', kind: 'maintenance', objectiveId: 'torch light leaks through walls (#12)', startedAt: 't2', endedAt: null, outcome: 'in-progress' },
        { id: 'r3', kind: 'maintenance', objectiveId: 'stale CI event', startedAt: 't3', endedAt: 't4', outcome: 'no-work-needed' },
      ],
    } as Partial<ProjectRecord>);
    await journal.append('proj_1', 'r1', { kind: 'usage', at: '2026-09-16T10:00:00.000Z', source: 'owner:s', costUsd: 1.5, coverage: 'aggregate' });
    await journal.append('proj_1', 'r2', { kind: 'usage', at: '2026-09-16T11:00:00.000Z', source: 'owner:s', costUsd: 1, coverage: 'aggregate' });
    await journal.append('proj_1', 'r3', { kind: 'usage', at: '2026-09-16T12:00:00.000Z', source: 'owner:s', costUsd: 0.03, coverage: 'aggregate' });
    await journal.appendShared('proj_1', { kind: 'shared', at: '2026-09-16T11:30:00.000Z', source: 'owner:wake', key: 'a1', costUsd: 0.06, runIds: ['r2', 'r3'] });

    const answer = await queryLifetime({ journal, readProject: async (id) => (id === 'proj_1' ? project : null) }, 'proj_1', 3);
    expect(answer?.sharedUsd).toBeCloseTo(0.06);
    expect(answer?.runs.map((run) => [run.label, run.linkedSharedUsd])).toEqual([
      ['Initial delivery', 0],
      ['Maintenance · torch light leaks through walls (#12)', 0.06],
      ['Maintenance · stale CI event', 0.06],
    ]);
    const total = (answer?.runs.reduce((sum, run) => sum + run.attributableUsd, 0) ?? 0) + (answer?.sharedUsd ?? 0);
    expect(total).toBeCloseTo(2.59);
    // The budget charged 3.00; the journals hold 2.59, so 0.41 is unassigned.
    expect(answer?.unassignedUsd).toBeCloseTo(0.41);
  });

  it('reads nothing for a project the caller cannot see', async () => {
    const host = await fakeHost();
    const journal = createRunJournal({ homeDir: await host.homeDir() });
    expect(await queryLifetime({ journal, readProject: async () => null }, 'proj_other')).toBeNull();
  });
});
