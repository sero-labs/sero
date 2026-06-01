import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai';
import { clearUnavailableSessionModel } from './agent-session-model-sync';
import { setRuntimeSessionModel } from './agent-helpers';

export function appSessionMatchesSharedModel(
  session: AgentSession,
  model: Model<Api>,
): boolean {
  return session.model?.provider === model.provider && session.model?.id === model.id;
}

export async function syncAppSessionModel(
  session: AgentSession,
  sharedModel: Model<Api> | null,
): Promise<boolean> {
  if (!sharedModel) {
    return clearUnavailableSessionModel(session);
  }

  const currentModel = session.model;
  if (currentModel === sharedModel) return false;

  if (appSessionMatchesSharedModel(session, sharedModel)) {
    // Reused app sessions can keep a stale runtime model object after auth or
    // local-model registry refreshes. Swap in the refreshed instance without
    // rewriting settings or appending redundant session history entries.
    setRuntimeSessionModel(session, sharedModel);
    return true;
  }

  await session.setModel(sharedModel);
  return true;
}

export async function syncAppSessionPoolModels(
  sessions: Iterable<AgentSession>,
  sharedModel: Model<Api> | null,
): Promise<number> {
  const results = await Promise.all([...sessions].map(async (session) => {
    try {
      return await syncAppSessionModel(session, sharedModel) ? 1 : 0;
    } catch (error) {
      console.warn('[app-agent-model-sync] Failed to reconcile app session model:', error);
      return 0;
    }
  }));
  return results.reduce<number>((total, count) => total + count, 0);
}
