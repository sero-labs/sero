import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { Api, Model } from '@mariozechner/pi-ai';
import { clearUnavailableSessionModel } from './agent-session-model-sync';

type SessionWithMutableRuntimeModel = AgentSession & {
  agent: {
    setModel(model: NonNullable<AgentSession['model']> | undefined): void;
  };
};

export function appSessionMatchesSharedModel(
  session: AgentSession,
  model: Model<Api>,
): boolean {
  return session.model?.provider === model.provider && session.model?.id === model.id;
}

function setRuntimeSessionModel(session: AgentSession, model: Model<Api>): void {
  const runtimeMutableSession = session as unknown as SessionWithMutableRuntimeModel;
  runtimeMutableSession.agent.setModel(model);
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
  let updated = 0;
  for (const session of sessions) {
    try {
      if (await syncAppSessionModel(session, sharedModel)) {
        updated += 1;
      }
    } catch (error) {
      console.warn('[app-agent-model-sync] Failed to reconcile app session model:', error);
    }
  }
  return updated;
}
