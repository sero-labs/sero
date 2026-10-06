import { describe, expect, it } from 'vitest';
import { effectiveLimits } from '../effective-limits';
import { buildingProject } from '../../runtime/__tests__/helpers';

describe('effective limits', () => {
  it('lists the user cap only when one is set, with internal limits as safety', () => {
    const record = buildingProject();
    const without = effectiveLimits({ ...record, budget: { ...record.budget, capUsd: null } });
    expect(without.find((l) => l.id === 'project-cost-cap')).toBeUndefined();
    expect(without.filter((l) => l.origin === 'safety').length).toBeGreaterThan(0);
    const withCap = effectiveLimits({ ...record, budget: { ...record.budget, capUsd: 40 } });
    expect(withCap.find((l) => l.id === 'project-cost-cap')).toEqual({ id: 'project-cost-cap', label: 'Project cost cap', value: '$40.00', origin: 'user' });
  });

  it('lists a running allocation as agent-chosen', () => {
    const record = buildingProject();
    const [first, ...rest] = record.milestones;
    const limits = effectiveLimits({ ...record, milestones: [{ ...first, pendingDispatch: { kind: 'workflow', destination: null, startedAt: 't', allocatedUsd: 7 }, }, ...rest] });
    expect(limits.find((l) => l.id === `allocation:${first.id}`)).toMatchObject({ value: '$7.00', origin: 'agent' });
  });
});
