/**
 * Model store — the model each session runs on, and what it could
 * switch to.
 *
 * The host is the single source of truth. Nothing is applied here until
 * the host answers, so a refused change leaves the chip where it was and
 * the error banner says why.
 *
 * State is kept per session id, because two sessions can run different
 * models and the phone switches between them.
 */

import { create } from 'zustand';
import type { GatewayMessage } from '@/lib/gateway-client';
import { useConnectionStore } from './connection';
import { useWorkspaceStore } from './workspace';

/** One provider's models, as the picker groups them. */
export interface ModelGroup {
  provider: string;
  displayName: string;
  logo: string;
  models: Array<{
    provider: string;
    modelId: string;
    name: string;
    reasoning: boolean;
  }>;
}

/** What the host says about one session's model. */
export interface SessionModel {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
  thinkingLevel: string;
  availableThinkingLevels: string[];
  availableModels: ModelGroup[];
}

interface ModelsStore {
  /** Model state per session id. Absent until the host answers. */
  bySession: Record<string, SessionModel>;

  /** Ask the host for a session's model. Opens the session. */
  fetch: (workspaceId: string, sessionId: string) => void;
  selectModel: (
    workspaceId: string,
    sessionId: string,
    provider: string,
    modelId: string,
  ) => void;
  selectThinking: (workspaceId: string, sessionId: string, level: string) => void;
  handleMessage: (msg: GatewayMessage) => void;
}

/** The request types this store answers to, in the order they arrive. */
const MODEL_REQUEST_TYPES = new Set([
  'get_session_model',
  'set_session_model',
  'set_session_thinking',
]);

function isSessionModel(value: unknown): value is SessionModel {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SessionModel>;
  return (
    typeof candidate.provider === 'string'
    && typeof candidate.modelId === 'string'
    && typeof candidate.name === 'string'
    && Array.isArray(candidate.availableModels)
  );
}

export const useModelsStore = create<ModelsStore>((set) => {
  const getClient = () => useConnectionStore.getState().client;

  /**
   * Track which session a reply belongs to.
   *
   * A response carries the state but not the session it is for. One
   * ordered socket makes first-in-first-out correct, the same way the
   * session-list fetch queue works.
   */
  const awaiting: string[] = [];

  const start = (sessionId: string) => {
    awaiting.push(sessionId);
  };

  return {
    bySession: {},

    fetch: (workspaceId, sessionId) => {
      start(sessionId);
      getClient().requestSessionModel(workspaceId, sessionId);
    },

    selectModel: (workspaceId, sessionId, provider, modelId) => {
      start(sessionId);
      getClient().setSessionModel(workspaceId, sessionId, provider, modelId);
    },

    selectThinking: (workspaceId, sessionId, level) => {
      start(sessionId);
      getClient().setSessionThinking(workspaceId, sessionId, level);
    },

    handleMessage: (msg) => {
      if (msg.type !== 'ok' && msg.type !== 'error') return;
      if (!('requestType' in msg) || typeof msg.requestType !== 'string') return;
      if (!MODEL_REQUEST_TYPES.has(msg.requestType)) return;

      const sessionId = awaiting.shift();
      if (!sessionId) return;

      // A refusal changes nothing: the chip keeps the model the host
      // last confirmed, and the connection store shows the error.
      if (msg.type === 'error') return;

      const data = (msg as { data?: unknown }).data;
      if (!isSessionModel(data)) return;
      set((s) => ({ bySession: { ...s.bySession, [sessionId]: data } }));
    },
  };
});

/** The model of one session, or null before the host has answered. */
export function selectSessionModel(
  state: ModelsStore,
  sessionId: string | null,
): SessionModel | null {
  if (!sessionId) return null;
  return state.bySession[sessionId] ?? null;
}

/**
 * Keep the model in step with the session on screen.
 *
 * A session's model is asked for once, when it first comes on screen.
 * Nothing polls: after that the host answers every change we send, and
 * the answer carries the new state.
 *
 * Call it once, at the app root.
 */
export function startModelSync(): () => void {
  let fetched: string | null = null;

  const apply = () => {
    if (useConnectionStore.getState().state !== 'connected') {
      // A reconnect gets a fresh read: the desktop may have moved on.
      fetched = null;
      return;
    }

    const { activeWorkspaceId, activeSessionId } = useWorkspaceStore.getState();
    if (!activeWorkspaceId || !activeSessionId) return;
    if (activeSessionId === fetched) return;

    fetched = activeSessionId;
    useModelsStore.getState().fetch(activeWorkspaceId, activeSessionId);
  };

  const stops = [
    useConnectionStore.subscribe(apply),
    useWorkspaceStore.subscribe(apply),
  ];
  apply();

  return () => {
    for (const stop of stops) stop();
  };
}
