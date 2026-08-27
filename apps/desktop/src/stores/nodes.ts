import { create } from 'zustand';
import { persistLayout } from '@/lib/persist-layout';
import type {
  AgentNodeController,
  AgentNodeEvent,
  AgentNodeInfo,
  AgentNodeMessage,
  AgentNodeModel,
  AgentNodeProvider,
  AgentNodeSession,
} from '@/types/agent-node';
import type { SeroAgentNodeAPI } from '@/types/agent-node';
import type {
  AgentNodeArtifact,
  AgentNodeApproval,
  AgentNodeInfo as IpcAgentNodeInfo,
  AgentNodeSession as IpcAgentNodeSession,
} from '@/types/ipc-agent-node';
import type { AgentStreamEvent } from '@/types/agent';
import type { AuthEvent } from '@sero-ai/a2a';
import {
  applyToolInputDelta,
  applyToolInputEnd,
  applyToolStart,
  createStreamingToolMessage,
} from '@/stores/agent-tool-input';

export function agentNodeApi(): SeroAgentNodeAPI {
  const api = window.sero.agentNodes;
  return {
    listNodes: async () => (await api.list()).map(toRendererNode),
    enrolNode: async (input) => toRendererNode(await api.enrol({ ...input, name: input.address })),
    removeNode: api.remove,
    listSessions: async (nodeId) => {
      const result = await api.control(nodeId, { operation: 'listSessions', params: {} });
      return result.sessions.map(toRendererSession);
    },
    createSession: async (nodeId, input) => {
      const result = await api.control(nodeId, {
        operation: 'createSession',
        params: { workspace: relativeWorkspaceId(input.workspaceId), model: modelReference(input.model) },
      });
      return toRendererSession(result.session);
    },
    deleteSession: async (nodeId, sessionId) => {
      await api.control(nodeId, { operation: 'deleteSession', params: { contextId: sessionId } });
    },
    sendMessage: (nodeId, sessionId, text) => api.send({ nodeId, contextId: sessionId, text }),
    respondApproval: (nodeId, sessionId, taskId, approvalId, approved, scope) => api.send({
      nodeId, contextId: sessionId, taskId, text: '', approval: { id: approvalId, approved, scope },
    }),
    attachSession: async (nodeId, sessionId, taskId) => api.attach(nodeId, sessionId, undefined, taskId),
    cancelTask: api.cancelTask,
    readArtifact: api.readBlob,
    getProviders: async (nodeId) => {
      const result = await api.control(nodeId, { operation: 'getProviders', params: {} });
      return [
        ...result.oauth.map((provider) => ({ id: provider.id, name: provider.name, status: provider.isLoggedIn ? 'connected' : 'not connected' })),
        ...result.apiKey.map((provider) => ({ id: provider.id, name: provider.name, status: provider.hasKey || provider.fromEnv ? 'connected' : 'not connected' })),
      ];
    },
    getModels: async (nodeId) => {
      const result = await api.control(nodeId, { operation: 'getProviders', params: {} });
      return result.models.map((model): AgentNodeModel => ({ ...model }));
    },
    login: async (nodeId, providerId) => { await api.control(nodeId, { operation: 'login', params: { providerId } }); },
    logout: async (nodeId, providerId) => { await api.control(nodeId, { operation: 'logout', params: { providerId } }); },
    setApiKey: async (nodeId, providerId, key) => { await api.control(nodeId, { operation: 'setApiKey', params: { providerId, key } }); },
    removeApiKey: async (nodeId, providerId) => { await api.control(nodeId, { operation: 'removeApiKey', params: { providerId } }); },
    respondPrompt: async (nodeId, value) => { await api.control(nodeId, { operation: 'respondPrompt', params: { value } }); },
    respondSelect: async (nodeId, value) => { await api.control(nodeId, { operation: 'respondSelect', params: { value } }); },
    respondManualCode: async (nodeId, value) => { await api.control(nodeId, { operation: 'respondManualCode', params: { value } }); },
    cancelLogin: async (nodeId) => { await api.control(nodeId, { operation: 'cancel', params: {} }); },
    setSessionModel: async (nodeId, sessionId, model) => {
      await api.control(nodeId, { operation: 'setSessionModel', params: { contextId: sessionId, model: modelReference(model) } });
    },
    setSessionApprovalMode: async (nodeId, sessionId, approvalMode) => toRendererSession((await api.control<'setSessionApprovalMode'>(nodeId, {
      operation: 'setSessionApprovalMode', params: { contextId: sessionId, approvalMode },
    })).session),
    listControllers: async (nodeId) => (await api.control(nodeId, { operation: 'listControllers', params: {} })).controllers,
    mintEnrolmentCode: async (nodeId) => {
      const result = await api.control(nodeId, { operation: 'mintEnrolmentCode', params: {} });
      const node = (await api.list()).find((item) => item.id === nodeId);
      if (!node) throw new Error('Agent Node is not registered');
      return { ...result, fingerprint: node.fingerprint };
    },
    revokeController: async (nodeId, controllerId) => { await api.control(nodeId, { operation: 'revokeController', params: { controllerId } }); },
    retryNode: async (nodeId) => { await api.connect(nodeId); },
    subscribe: (listener) => api.onEvent((event) => {
      if (event.type === 'connection') {
        listener({ type: 'connection', nodeId: event.nodeId, state: event.state === 'disconnected' ? 'unreachable' : event.state });
      } else if (event.type === 'conversation' || event.type === 'auth'
        || event.type === 'artifact' || event.type === 'approval') {
        listener(event);
      }
    }),
  };
}

function toRendererNode(node: IpcAgentNodeInfo): AgentNodeInfo {
  const connectionState = node.state === 'disconnected' ? 'unreachable' : node.state;
  return {
    id: node.id,
    name: node.name,
    address: node.address,
    fingerprint: node.fingerprint,
    connectionState,
    lastSeen: node.lastSeenAt ?? undefined,
    tools: node.tools,
    workspaces: [],
  };
}

function toRendererSession(session: IpcAgentNodeSession): AgentNodeSession {
  return {
    id: session.contextId,
    workspaceId: relativeWorkspaceId(session.workspace),
    name: session.name,
    modified: session.updatedAt,
    engine: 'Pi',
    model: `${session.model.providerId}/${session.model.modelId}`,
    approvalMode: session.approvalMode,
    taskId: session.runningTaskId ?? undefined,
  };
}

export function relativeWorkspaceId(workspace: string): string {
  const normalized = workspace.trim().replaceAll('\\', '/');
  const marker = '/workspaces/';
  const candidate = normalized.startsWith('/') && normalized.includes(marker)
    ? normalized.slice(normalized.lastIndexOf(marker) + marker.length) : normalized;
  const parts = candidate.split('/');
  if (!candidate || candidate.startsWith('/') || /^[A-Za-z]:/u.test(candidate)
    || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Workspace must be a relative path inside the node workspace root');
  }
  return parts.join('/');
}

function modelReference(model: string): IpcAgentNodeSession['model'] {
  const separator = model.indexOf('/');
  if (separator < 1 || separator === model.length - 1) throw new Error('Select a provider and model');
  return { providerId: model.slice(0, separator), modelId: model.slice(separator + 1) };
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
  models: Record<string, AgentNodeModel[]>;
  controllers: Record<string, AgentNodeController[]>;
  authEvents: Record<string, AuthEvent | null>;
  artifacts: Record<string, AgentNodeArtifact[]>;
  approvals: Record<string, AgentNodeApproval | null>;
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
  selectRemoteSession: (nodeId: string, sessionId: string) => Promise<void>;
  clearRemoteSelection: () => void;
  loadSessions: (nodeId: string) => Promise<void>;
  createSession: (nodeId: string, workspaceId: string, model: string) => Promise<void>;
  deleteSession: (nodeId: string, sessionId: string) => Promise<void>;
  sendMessage: (nodeId: string, sessionId: string, text: string) => Promise<void>;
  cancelTask: (nodeId: string, taskId: string) => Promise<void>;
  setSessionModel: (nodeId: string, sessionId: string, model: string) => Promise<void>;
  loadModels: (nodeId: string) => Promise<void>;
  respondApproval: (nodeId: string, sessionId: string, approved: boolean, scope?: 'once' | 'task' | 'session') => Promise<void>;
  setSessionApprovalMode: (nodeId: string, sessionId: string, approvalMode: 'ask' | 'allow') => Promise<void>;
  clearArtifacts: (sessionKey: string) => void;
  loadSettings: (nodeId: string) => Promise<void>;
  login: (nodeId: string, providerId: string) => Promise<void>;
  logout: (nodeId: string, providerId: string) => Promise<void>;
  setApiKey: (nodeId: string, providerId: string, apiKey: string) => Promise<void>;
  removeApiKey: (nodeId: string, providerId: string) => Promise<void>;
  respondAuth: (nodeId: string, value: string) => Promise<void>;
  cancelLogin: (nodeId: string) => Promise<void>;
  readArtifact: (nodeId: string, artifact: AgentNodeArtifact) => Promise<string>;
  revokeController: (nodeId: string, controllerId: string) => Promise<void>;
  mintEnrolmentCode: (nodeId: string) => Promise<{ code: string; fingerprint: string; expiresAt: string }>;
}

const messageKey = (nodeId: string, sessionId: string) => sessionLocationKey({ kind: 'node', nodeId, sessionId });
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Agent Node request failed';

function applyConversationEvent(messages: AgentNodeMessage[], event: AgentStreamEvent): AgentNodeMessage[] {
  if (event.type === 'messages_loaded') return event.messages;
  if (event.type === 'message_start') {
    const userText = event.message.type === 'user' ? event.message.text : null;
    const optimistic = userText !== null && !event.message.id.startsWith('remote:')
      ? messages.findIndex((item) => item.type === 'user' && item.id.startsWith('remote:') && item.text === userText)
      : -1;
    if (optimistic >= 0) return messages.map((item, index) => index === optimistic ? event.message : item);
    const liveAssistant = event.message.type === 'assistant' && !event.message.id.startsWith('live:')
      ? messages.findIndex((item) => item.type === 'assistant' && item.id.startsWith('live:'))
      : -1;
    if (liveAssistant >= 0) return messages.map((item, index) => index === liveAssistant ? event.message : item);
    return [...messages.filter((item) => item.id !== event.message.id), event.message];
  }
  if (event.type === 'message_end') return messages.map((item) => item.id === event.messageId && item.type === 'assistant'
    ? { ...item, text: event.text, isStreaming: false } : item);
  if (event.type === 'text_delta' || event.type === 'thinking_delta') {
    return messages.map((item) => item.id === event.messageId && item.type === 'assistant'
      ? event.type === 'text_delta'
        ? { ...item, text: item.text + event.delta }
        : { ...item, thinking: (item.thinking ?? '') + event.delta }
      : item);
  }
  if (event.type === 'tool_input_start') {
    return [...messages, createStreamingToolMessage(event.streamKey, event.toolName)];
  }
  if (event.type === 'tool_input_delta') {
    return applyToolInputDelta(messages, event.streamKey, {
      text: event.delta,
      replace: event.replace,
      path: event.path,
    });
  }
  if (event.type === 'tool_input_end') {
    return applyToolInputEnd(messages, event.streamKey, event.toolCallId);
  }
  if (event.type === 'tool_start') return applyToolStart(messages, event.tool);
  if (event.type === 'tool_update' || event.type === 'tool_end') {
    return messages.map((message) => message.type === 'tool' && message.toolCallId === event.toolCallId
      ? {
          ...message,
          output: event.output,
          details: event.details ?? message.details,
          images: event.images ?? message.images,
          isError: event.type === 'tool_end' ? event.isError : message.isError,
          state: event.type === 'tool_update' ? 'running' : event.isError ? 'error' : 'completed',
          isPartialOutput: event.type === 'tool_update',
        }
      : message);
  }
  return messages;
}

function artifactDataUrl(bytes: Uint8Array, mediaType: string): string {
  let binary = '';
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}

export const useNodesStore = create<NodesState>((set, get) => ({
  nodes: [], sessions: {}, messages: {}, providers: {}, models: {}, controllers: {}, authEvents: {}, artifacts: {}, approvals: {},
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
    if (event.type === 'connection') set((state) => ({ nodes: state.nodes.map((node) => node.id === event.nodeId ? { ...node, connectionState: event.state } : node) }));
    if (event.type === 'conversation') set((state) => ({ messages: {
      ...state.messages,
      [event.event.sessionId]: applyConversationEvent(state.messages[event.event.sessionId] ?? [], event.event),
    }, sessions: event.event.type === 'agent_end' ? {
      ...state.sessions,
      [event.nodeId]: (state.sessions[event.nodeId] ?? []).map((session) => messageKey(event.nodeId, session.id) === event.event.sessionId
        ? { ...session, taskId: undefined } : session),
    } : state.sessions }));
    if (event.type === 'auth') set((state) => ({ authEvents: { ...state.authEvents, [event.nodeId]: event.event } }));
    if (event.type === 'artifact') set((state) => ({ artifacts: {
      ...state.artifacts,
      [event.sessionKey]: [...(state.artifacts[event.sessionKey] ?? []).filter((item) => item.id !== event.artifact.id), event.artifact],
    } }));
    if (event.type === 'approval') set((state) => ({ approvals: { ...state.approvals, [event.sessionKey]: event.approval } }));
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
  selectRemoteSession: async (nodeId, sessionId) => {
    const activeLocationKey = sessionLocationKey({ kind: 'node', nodeId, sessionId });
    set({ activeLocationKey });
    persistLayout({ activeSessionLocationKey: activeLocationKey });
    try {
      const session = (get().sessions[nodeId] ?? []).find((item) => item.id === sessionId);
      const attached = await agentNodeApi().attachSession(nodeId, sessionId, session?.taskId);
      set((state) => ({ messages: { ...state.messages, [activeLocationKey]: attached.messages } }));
    } catch (error) {
      set({ error: errorText(error) });
    }
  },
  clearRemoteSelection: () => set({ activeLocationKey: null }),
  loadSessions: async (nodeId) => {
    const items = await agentNodeApi().listSessions(nodeId);
    const workspaces = [...new Set(items.map((item) => item.workspaceId))]
      .map((id) => ({ id, name: id.split('/').filter(Boolean).at(-1) ?? id }));
    set((state) => ({
      sessions: { ...state.sessions, [nodeId]: items },
      nodes: state.nodes.map((node) => node.id === nodeId ? { ...node, workspaces } : node),
    }));
  },
  createSession: async (nodeId, workspaceId, model) => {
    const session = await agentNodeApi().createSession(nodeId, { workspaceId, model });
    set((state) => ({ sessions: { ...state.sessions, [nodeId]: [session, ...(state.sessions[nodeId] ?? [])] } }));
    await get().selectRemoteSession(nodeId, session.id);
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
  sendMessage: async (nodeId, sessionId, text) => {
    const result = await agentNodeApi().sendMessage(nodeId, sessionId, text);
    set((state) => ({ sessions: { ...state.sessions, [nodeId]: (state.sessions[nodeId] ?? []).map((item) => item.id === sessionId
      ? { ...item, taskId: result.taskId } : item) } }));
  },
  cancelTask: async (nodeId, taskId) => {
    await agentNodeApi().cancelTask(nodeId, taskId);
    set((state) => ({ sessions: { ...state.sessions, [nodeId]: (state.sessions[nodeId] ?? []).map((item) => item.taskId === taskId
      ? { ...item, taskId: undefined } : item) } }));
  },
  setSessionModel: async (nodeId, sessionId, model) => {
    await agentNodeApi().setSessionModel(nodeId, sessionId, model);
    set((state) => ({ sessions: { ...state.sessions, [nodeId]: (state.sessions[nodeId] ?? []).map((item) => item.id === sessionId ? { ...item, model } : item) } }));
  },
  loadModels: async (nodeId) => {
    const models = await agentNodeApi().getModels(nodeId);
    set((state) => ({ models: { ...state.models, [nodeId]: models } }));
  },
  respondApproval: async (nodeId, sessionId, approved, scope = 'once') => {
    const key = messageKey(nodeId, sessionId);
    const approval = get().approvals[key];
    if (!approval) return;
    await agentNodeApi().respondApproval(nodeId, sessionId, approval.taskId, approval.id, approved, scope);
    set((state) => ({
      approvals: { ...state.approvals, [key]: null },
      sessions: approved && scope === 'session' ? { ...state.sessions, [nodeId]: (state.sessions[nodeId] ?? []).map((item) => item.id === sessionId ? { ...item, approvalMode: 'allow' } : item) } : state.sessions,
    }));
  },
  setSessionApprovalMode: async (nodeId, sessionId, approvalMode) => {
    const updated = await agentNodeApi().setSessionApprovalMode(nodeId, sessionId, approvalMode);
    set((state) => ({ sessions: { ...state.sessions, [nodeId]: (state.sessions[nodeId] ?? []).map((item) => item.id === sessionId ? updated : item) } }));
  },
  clearArtifacts: (sessionKey) => set((state) => ({ artifacts: { ...state.artifacts, [sessionKey]: [] } })),
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
  respondAuth: async (nodeId, value) => {
    const event = get().authEvents[nodeId];
    if (event?.type === 'prompt') await agentNodeApi().respondPrompt(nodeId, value);
    else if (event?.type === 'select') await agentNodeApi().respondSelect(nodeId, value);
    else if (event?.type === 'manual_input') await agentNodeApi().respondManualCode(nodeId, value);
    set((state) => ({ authEvents: { ...state.authEvents, [nodeId]: null } }));
  },
  cancelLogin: async (nodeId) => {
    await agentNodeApi().cancelLogin(nodeId);
    set((state) => ({ authEvents: { ...state.authEvents, [nodeId]: null } }));
  },
  readArtifact: async (nodeId, artifact) => {
    if (artifact.inlineBase64) return `data:${artifact.mediaType};base64,${artifact.inlineBase64}`;
    if (!artifact.blobId) throw new Error('Artifact has no readable content');
    const bytes = await agentNodeApi().readArtifact(nodeId, artifact.blobId);
    return artifactDataUrl(bytes, artifact.mediaType);
  },
  revokeController: async (nodeId, controllerId) => { await agentNodeApi().revokeController(nodeId, controllerId); await get().loadSettings(nodeId); },
  mintEnrolmentCode: (nodeId) => agentNodeApi().mintEnrolmentCode(nodeId),
}));
