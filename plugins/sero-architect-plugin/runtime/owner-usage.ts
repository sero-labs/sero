/**
 * Reads the owner session's usage and charges it to the project. When a charge
 * takes the project over its cost cap, the running turn is stopped from here:
 * the usage read is the event, so nothing polls and a busy turn cannot spend
 * past what the user allowed.
 */

import type { PersistentSessionsApi } from '@sero-ai/common';

import { setAccountingIncomplete } from '../shared/accounting';
import { charge } from '../shared/lifecycle';
import type { ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';
import { recordCharge, tokenDelta, type TokenCounters } from './project-usage';
import type { RecordStore } from './record-store';
import type { RunJournal } from './run-journal';

export interface OwnerUsageContext {
  deps: { host: ArchitectHost; store: RecordStore; journal?: RunJournal };
  api: Pick<PersistentSessionsApi, 'getSessionUsage'>;
  handleId: string;
  projectId: string;
  /** Where the charges are saved, and the record the turn started from. */
  usageSource: string;
  turnRecord: ProjectRecord;
  tokenMarks: Map<string, TokenCounters>;
  turnRunId?: string;
  wakeId?: string;
  model?: string | null;
  thinking?: string | null;
  /** A directive or decision wake the user asked for: it may run on a project already at its cap. */
  exemptFromCap: boolean;
  /** Called when a read finds a turn that began under the cap at or over it, whoever crossed it. May repeat. */
  overCap(): void;
}

function overCostCap(record: ProjectRecord): boolean {
  return record.budget.capUsd !== null && record.budget.spentUsd >= record.budget.capUsd;
}

/** One read at a time: a read asked for while another runs joins it. */
export function createUsageReader(context: OwnerUsageContext): { read: () => Promise<void>; flush: () => Promise<void> } {
  const { deps, api, handleId, projectId, usageSource, tokenMarks } = context;
  let usageRead: Promise<void> | undefined;
  // An exempt wake may run on a project that is already at its cap, so it is stopped only if it
  // began under the cap. Any other wake is always stopped, whatever the record said at preparation.
  const startedUnderCap = !context.exemptFromCap || !overCostCap(context.turnRecord);
  const read = (): Promise<void> => {
    usageRead ??= (async () => {
      const usage = await api.getSessionUsage(handleId).catch(() => null);
      let delta = 0;
      let crossedCap = false;
      await deps.store.update(projectId, (fresh) => {
        const next = setAccountingIncomplete(fresh, usageSource, !usage || !!usage.incomplete);
        if (!usage) return next;
        const cost = Math.max(next.session.sessionCostUsd, usage.costUsd);
        delta = cost - next.session.sessionCostUsd;
        const charged = charge({ ...next, session: { ...next.session, sessionCostUsd: cost } }, 'owner', delta, deps.host.now());
        crossedCap = startedUnderCap && overCostCap(charged);
        return charged;
      });
      if (crossedCap) context.overCap();
      const tokens = usage ? tokenDelta(tokenMarks.get(usageSource), usage) : null;
      if (usage) tokenMarks.set(usageSource, { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadTokens, cacheWriteTokens: usage.cacheWriteTokens });
      // A charge with its tokens is call detail; one without is a bare total.
      await recordCharge(deps, context.turnRecord, usageSource, delta, tokens ? 'call' : 'aggregate', context.turnRunId, {
        ...(context.wakeId ? { parentOperationId: context.wakeId } : {}),
        ...(context.model ? { model: context.model } : {}),
        ...(context.thinking ? { thinking: context.thinking } : {}),
        ...(tokens ? { usage: tokens } : {}),
      });
    })().finally(() => { usageRead = undefined; });
    return usageRead;
  };
  // The turn is over: let a read in flight finish, then read once more for the final total.
  const flush = async (): Promise<void> => {
    await usageRead;
    await read();
  };
  return { read, flush };
}
