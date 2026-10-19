/**
 * The limits that apply to one project, and who set each. Built from the
 * record and the constants, so a view can show them without asking the runtime.
 * Origins: `user` typed or approved by the person; `safety` an internal
 * watchdog; `default` a built-in value nobody chose for this project; `agent`
 * a value an agent picked inside the user's envelope.
 */

import { RESEARCH_START_USD } from './budget';
import type { ProjectRecord } from './record';
import { OWNER_STALL_GRACE_MS, OWNER_STALL_WINDOW_MS, SILENT_TURN_LIMIT } from './stall-limits';

export type LimitOrigin = 'user' | 'safety' | 'default' | 'agent';

export interface EffectiveLimit {
  id: string;
  label: string;
  value: string;
  origin: LimitOrigin;
}

const usd = (amount: number): string => `$${amount.toFixed(2)}`;
const minutes = (ms: number): string => `${ms / 60_000} minutes`;

export function effectiveLimits(record: ProjectRecord): EffectiveLimit[] {
  const limits: EffectiveLimit[] = [];
  if (record.budget.capUsd !== null) {
    limits.push({ id: 'project-cost-cap', label: 'Project cost cap', value: usd(record.budget.capUsd), origin: 'user' });
    limits.push({ id: 'research-start', label: 'Budget promised to a research start', value: usd(RESEARCH_START_USD), origin: 'default' });
  }
  limits.push(
    { id: 'owner-stall-window', label: 'Owner silence before it is asked to checkpoint', value: minutes(OWNER_STALL_WINDOW_MS), origin: 'safety' },
    { id: 'owner-stall-grace', label: 'Further silence before the turn is stopped', value: minutes(OWNER_STALL_GRACE_MS), origin: 'safety' },
    { id: 'silent-turns', label: 'Turns in a row with no declared outcome before a hold', value: String(SILENT_TURN_LIMIT), origin: 'safety' },
  );
  const authority = record.agreement?.authority;
  if (authority) {
    limits.push({ id: 'delegated-sessions', label: 'Agents the project may start (live / total)', value: `${authority.maxLiveSessions} / ${authority.maxTotalSessions}`, origin: 'default' });
  }
  for (const milestone of record.milestones) {
    const allocated = milestone.pendingDispatch?.allocatedUsd ?? (milestone.status === 'running' ? milestone.dispatch?.allocatedUsd : undefined);
    if (allocated !== undefined) {
      limits.push({ id: `allocation:${milestone.id}`, label: `Budget for "${milestone.title}"`, value: usd(allocated), origin: 'agent' });
    }
  }
  return limits;
}
