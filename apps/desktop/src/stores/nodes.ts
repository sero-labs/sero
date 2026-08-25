import { create } from 'zustand';
import { persistLayout } from '@/lib/persist-layout';
import type {
  AgentNodeController,
  AgentNodeEvent,
  AgentNodeInfo,
  AgentNodeMessage,
  AgentNodeProvider,
  AgentNodeSession,
} from '@/types/agent-node';
import type { SeroAgentNodeAPI } from '@/types/agent-node';

export function agentNodeApi(): SeroAgentNodeAPI {
  const api = window.sero.agentNode;
  if (!api) throw new Error('Agent Node support is not available in this build');
  return api;
}

export type SessionLocation =
  | { kind: 'local'; sessionId: string }
  | { kind: 'node'; nodeId: string; sessionId: string };

export function sessionLocationKey(location: SessionLocation): string {
  if (location.kind === 'local') return `local:${encodeURIComponent(location.sessionId)}`;
  return `node:${encodeURIComponent(location.nodeId)}:${encodeURIComponent(location.sessionId)}`;
}

export function parseSessionLocationKey(key: string | null): SessionLocation | null {
  if (!key) return null;
  const [kind, first, second, ...extra] = key.split(':');
  if (extra.length > 0 || !first) return null;
  if (kind === 'local' && second === undefined) {
    return { kind: 'local', sessionId: decodeURIComponent(first) };
  }
  if (kind === 'node' && second) {
    return { kind: 'node', nodeId: decodeURIComponent(first), sessionId: decodeURIComponent(second) };
  }
  return null;
}

interface NodesState {
  nodes: AgentNodeInfo[];
  sessions: Record<string, AgentNodeSession[]>;
  messages: Record<string, AgentNodeMessage[]>;
  providers: Record<string, AgentNodeProvider[]>;
  controllers: Record<string, AgentNodeController[]>;
  activeLocationKey: string | null;
  expandedNodeIds: Set<string>;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  handleEvent: (event: AgentNodeEvent) => void;
  hydrateLocation: (key: string | null | undefined) => void;
  enrol: (input: { address: string; code: string; fingerprint: string }) => Promise<AgentNodeInfo>;
  remove: (nodeId: string) => Promise<void>;
  retry: (nodeId: string) => Promise<void>;
  toggleNode: (nodeId: string) => void;
  selectRemoteSession: (nodeId: string, sessionId: string) => void;
  clearRemoteSelection: () => void;
  loadSessions: (nodeId: string) => Promise<void>;
  createSession: (nodeId: string, workspaceId: string, model: string) => Promise<void>;
  deleteSession: (nodeId: string, sessionId: string) => Promise<void>;
  sendMessage: (nodeId: string, sessionId: string, text: string) => Promise<void>;
  cancelTask: (nodeId: string, taskId: string) => Promise<void>;
  setSessionModel: (nodeId: string, sessionId: string, model: string) => Promise<void>;
  loadSettings: (nodeId: string) => Promise<void>;
  login: (nodeId: string, providerId: string) => Promise<void>;
  logout: (nodeId: string, providerId: string) => Promise<void>;
  setApiKey: (nodeId: string, providerId: string, apiKey: string) => Promise<void>;
  removeApiKey: (nodeId: string, providerId: string) => Promise<void>;
  revokeController: (nodeId: string, controllerId: string) => Promise<void>;
  mintEnrolmentCode: (nodeId: string) => Promise<{ code: string; fingerprint: string; expiresAt: string }>;
}

const messageKey = (nodeId: string, sessionId: string) => sessionLocationKey({ kind: 'node', nodeId, sessionId });
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Agent Node request failed';

export const useNodesStore = create<NodesState>((set, get) => ({
  nodes: [], sessions: {}, messages: {}, providers: {}, controllers: {},
  activeLocationKey: null, expandedNodeIds: new Set(), loading: false, error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const nodes = await agentNodeApi().listNodes();
      set({ nodes, loading: false });
      await Promise.all(nodes.map((node) => get().loadSessions(node.id)));
    } catch (error) { set({ error: errorText(error), loading: false }); }
  },
  handleEvent: (event) => {
    if (event.type === 'nodes-changed') set({ nodes: event.nodes });
    if (event.type === 'sessions-changed') set((state) => ({ sessions: { ...state.sessions, [event.nodeId]: event.sessions } }));
    if (event.type === 'messages-changed') set((state) => ({ messages: { ...state.messages, [messageKey(event.nodeId, event.sessionId)]: event.messages } }));
  },
  hydrateLocation: (key) => set({ activeLocationKey: parseSessionLocationKey(key ?? null)?.kind === 'node' ? key ?? null : null }),
  enrol: async (input) => {
    const node = await agentNodeApi().enrolNode(input);
    set((state) => ({ nodes: [...state.nodes.filter((item) => item.id !== node.id), node] }));
    return node;
  },
  remove: async (nodeId) => {
    await agentNodeApi().removeNode(nodeId);
    const location = parseSessionLocationKey(get().activeLocationKey);
    const clearActive = location?.kind === 'node' && location.nodeId === nodeId;
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== nodeId),
      activeLocationKey: clearActive ? null : state.activeLocationKey,
    }));
    if (clearActive) persistLayout({ activeSessionLocationKey: null });
  },
  retry: (nodeId) => agentNodeApi().retryNode(nodeId),
  toggleNode: (nodeId) => {
    const expandedNodeIds = new Set(get().expandedNodeIds);
    expandedNodeIds.has(nodeId) ? expandedNodeIds.delete(nodeId) : expandedNodeIds.add(nodeId);
    set({ expandedNodeIds });
  },
  selectRemoteSession: (nodeId, sessionId) => {
    const activeLocationKey = sessionLocationKey({ kind: 'node', nodeId, sessionId });
    set({ activeLocationKey });
    persistLayout({ activeSessionLocationKey: activeLocationKey });
  },
  clearRemoteSelection: () => set({ activeLocationKey: null }),
  loadSessions: async (nodeId) => {
    const items = await agentNodeApi().listSessions(nodeId);
    set((state) => ({ sessions: { ...state.sessions, [nodeId]: items } }));
  },
  createSession: async (nodeId, workspaceId, model) => {
    const session = await agentNodeApi().createSession(nodeId, { workspaceId, model });
    set((state) => ({ sessions: { ...state.sessions, [nodeId]: [session, ...(state.sessions[nodeId] ?? [])] } }));
    get().selectRemoteSession(nodeId, session.id);
  },
  deleteSession: async (nodeId, sessionId) => {
    await agentNodeApi().deleteSession(nodeId, sessionId);
    const deletedKey = sessionLocationKey({ kind: 'node', nodeId, sessionId });
    const clearActive = get().activeLocationKey === deletedKey;
    set((state) => ({
      sessions: { ...state.sessions, [nodeId]: (state.sessions[nodeId] ?? []).filter((item) => item.id !== sessionId) },
      activeLocationKey: clearActive ? null : state.activeLocationKey,
    }));
    if (clearActive) persistLayout({ activeSessionLocationKey: null });
  },
  sendMessage: (nodeId, sessionId, text) => agentNodeApi().sendMessage(nodeId, sessionId, text),
  cancelTask: (nodeId, taskId) => agentNodeApi().cancelTask(nodeId, taskId),
  setSessionModel: async (nodeId, sessionId, model) => {
    await agentNodeApi().setSessionModel(nodeId, sessionId, model);
    set((state) => ({ sessions: { ...state.sessions, [nodeId]: (state.sessions[nodeId] ?? []).map((item) => item.id === sessionId ? { ...item, model } : item) } }));
  },
  loadSettings: async (nodeId) => {
    const [providers, controllers] = await Promise.all([
      agentNodeApi().getProviders(nodeId), agentNodeApi().listControllers(nodeId),
    ]);
    set((state) => ({ providers: { ...state.providers, [nodeId]: providers }, controllers: { ...state.controllers, [nodeId]: controllers } }));
  },
  login: async (nodeId, providerId) => { await agentNodeApi().login(nodeId, providerId); await get().loadSettings(nodeId); },
  logout: async (nodeId, providerId) => { await agentNodeApi().logout(nodeId, providerId); await get().loadSettings(nodeId); },
  setApiKey: async (nodeId, providerId, apiKey) => { await agentNodeApi().setApiKey(nodeId, providerId, apiKey); await get().loadSettings(nodeId); },
  removeApiKey: async (nodeId, providerId) => { await agentNodeApi().removeApiKey(nodeId, providerId); await get().loadSettings(nodeId); },
  revokeController: async (nodeId, controllerId) => { await agentNodeApi().revokeController(nodeId, controllerId); await get().loadSettings(nodeId); },
  mintEnrolmentCode: (nodeId) => agentNodeApi().mintEnrolmentCode(nodeId),
}));
