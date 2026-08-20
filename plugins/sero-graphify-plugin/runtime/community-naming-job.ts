import { settleRun } from '../shared/ledger';
import { costUsd } from '../shared/pricing';
import type { GraphifyState, WorkspaceIndexEntry, WorkspaceIndexStatus } from '../shared/types';
import { authorizeCommunityNaming, type CommunityNamingDecision } from './community-naming';
import type { IndexerHost } from './indexer-host';
import { reserveEstimate } from './spend-record';

interface Helpers {
  refuse(workspaceId: string, decision: Extract<CommunityNamingDecision, { allowed: false }>): Promise<void>;
  merge(): Promise<void>;
}

async function setStatus(
  host: IndexerHost,
  workspaceId: string,
  status: WorkspaceIndexStatus,
  patch: Partial<WorkspaceIndexEntry>,
): Promise<void> {
  await host.updateState((state) => {
    const entry = state.workspaces[workspaceId];
    if (!entry) return state;
    return { ...state, workspaces: { ...state.workspaces, [workspaceId]: { ...entry, ...patch, status } } };
  });
}

/** Execute, reserve and settle the separately confirmed community-name pass. */
export async function runCommunityNamingJob(
  host: IndexerHost,
  state: GraphifyState,
  entry: WorkspaceIndexEntry,
  helpers: Helpers,
): Promise<void> {
  const decision = await authorizeCommunityNaming(host, state, entry, new Date());
  if (!decision.allowed) {
    await helpers.refuse(entry.workspaceId, decision);
    return;
  }

  const startedAt = new Date().toISOString();
  let reservationId: string | null = null;
  await setStatus(host, entry.workspaceId, 'naming', {
    progress: 'Starting community naming…',
    lastAttemptAt: startedAt,
    lastPaidAttemptAt: startedAt,
  });
  try {
    await host.ensureProvisioned();
    const outcome = await host.nameCommunities(
      { workspaceId: entry.workspaceId, path: entry.path },
      state.settings,
      {
        beforePaidSpawn: async () => {
          reservationId = await reserveEstimate(
            host,
            entry.workspaceId,
            state.settings,
            decision.estimate,
            startedAt,
            'community-naming',
          );
        },
        onProgress: (message) => void setStatus(host, entry.workspaceId, 'naming', { progress: message.slice(0, 300) }),
      },
    );
    const choice = state.settings.model!;
    const spentUsd = costUsd(choice, outcome.stats.inputTokens, outcome.stats.outputTokens);
    await host.updateState((current) => {
      const currentEntry = current.workspaces[entry.workspaceId];
      if (!currentEntry) return current;
      const next: GraphifyState = {
        ...current,
        workspaces: {
          ...current.workspaces,
          [entry.workspaceId]: {
            ...currentEntry,
            status: 'idle',
            progress: undefined,
            lastError: undefined,
            communityNaming: {
              communities: outcome.stats.communities || entry.stats?.communities || 0,
              inputTokens: outcome.stats.inputTokens,
              outputTokens: outcome.stats.outputTokens,
              costUsd: outcome.usageMeasured ? spentUsd ?? undefined : undefined,
              model: choice.modelId,
              backend: choice.backend,
              namedAt: new Date().toISOString(),
            },
          },
        },
      };
      if (!reservationId || !outcome.usageMeasured) return next;
      return {
        ...next,
        spend: settleRun(current.spend, reservationId, {
          inputTokens: outcome.stats.inputTokens,
          outputTokens: outcome.stats.outputTokens,
          usd: spentUsd ?? 0,
        }),
      };
    });
    await helpers.merge();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setStatus(host, entry.workspaceId, 'idle', {
      progress: undefined,
      lastError: `Community naming failed: ${message}`,
    });
    host.notify({
      kind: 'refused',
      message: `Community naming for ${entry.name} failed: ${message}`,
      at: new Date().toISOString(),
    });
  }
}
