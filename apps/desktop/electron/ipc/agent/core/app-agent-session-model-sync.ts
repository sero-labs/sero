import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { Api, Model } from '@mariozechner/pi-ai';

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
  if (!sharedModel) return false;
  if (appSessionMatchesSharedModel(session, sharedModel)) return false;
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
