import { create } from 'zustand';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: number;
  toolName?: string;
  isError?: boolean;
  isStreaming?: boolean;
}

export type AgentStatus = 'idle' | 'thinking' | 'tool_executing' | 'error';

interface ProjectAgentState {
  messages: AgentMessage[];
  status: AgentStatus;
  currentToolName?: string;
}

interface AgentStore {
  // projectId → agent state
  states: Map<string, ProjectAgentState>;

  // Actions
  initProject: (projectId: string) => void;
  loadMessages: (projectId: string, messages: AgentMessage[]) => void;
  addMessage: (projectId: string, message: AgentMessage) => void;
  updateLastAssistantMessage: (projectId: string, content: string) => void;
  finishLastAssistantMessage: (projectId: string, content: string) => void;
  setStatus: (projectId: string, status: AgentStatus, toolName?: string) => void;
  clearMessages: (projectId: string) => void;

  // Derived
  getState: (projectId: string) => ProjectAgentState;
}

const defaultState = (): ProjectAgentState => ({
  messages: [],
  status: 'idle',
});

export const useAgentStore = create<AgentStore>((set, get) => ({
  states: new Map(),

  initProject: (projectId) =>
    set((state) => {
      const next = new Map(state.states);
      if (!next.has(projectId)) {
        next.set(projectId, defaultState());
      }
      return { states: next };
    }),

  loadMessages: (projectId, messages) =>
    set((state) => {
      const next = new Map(state.states);
      const ps = next.get(projectId) ?? defaultState();
      // Ensure no messages are left in streaming state from a previous session
      const cleaned = messages.map((m) => ({ ...m, isStreaming: false }));
      next.set(projectId, { ...ps, messages: cleaned });
      return { states: next };
    }),

  addMessage: (projectId, message) =>
    set((state) => {
      const next = new Map(state.states);
      const ps = next.get(projectId) ?? defaultState();
      next.set(projectId, {
        ...ps,
        messages: [...ps.messages, message],
      });
      return { states: next };
    }),

  updateLastAssistantMessage: (projectId, content) =>
    set((state) => {
      const next = new Map(state.states);
      const ps = next.get(projectId);
      if (!ps) return state;

      const messages = [...ps.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], content, isStreaming: true };
          break;
        }
      }
      next.set(projectId, { ...ps, messages });
      return { states: next };
    }),

  finishLastAssistantMessage: (projectId, content) =>
    set((state) => {
      const next = new Map(state.states);
      const ps = next.get(projectId);
      if (!ps) return state;

      const messages = [...ps.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], content, isStreaming: false };
          break;
        }
      }
      next.set(projectId, { ...ps, messages });
      return { states: next };
    }),

  setStatus: (projectId, status, toolName) =>
    set((state) => {
      const next = new Map(state.states);
      const ps = next.get(projectId) ?? defaultState();
      next.set(projectId, { ...ps, status, currentToolName: toolName });
      return { states: next };
    }),

  clearMessages: (projectId) =>
    set((state) => {
      const next = new Map(state.states);
      next.set(projectId, defaultState());
      return { states: next };
    }),

  getState: (projectId) => {
    return get().states.get(projectId) ?? defaultState();
  },
}));
