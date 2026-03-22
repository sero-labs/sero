import type {
  ChatAttachment,
  ChatMessage,
  SessionModelState,
  SeroSlashCommandInfo,
} from '@/types/ipc';
import type { CollaborationStrategy, DebateConfig } from '@/types/collaboration';
import type { CollaborationSessionMap } from '@/stores/agent-collaboration';

/** State for a single agent session in the pool. */
export interface AgentInstance {
  sessionId: string;
  sessionPath: string;
  workspaceId: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  /** Available slash commands for this session (fetched on open). */
  commands: SeroSlashCommandInfo[];
  /** Current model + thinking level state. */
  modelState: SessionModelState | null;
}

export interface AgentState {
  /** All active agent instances, keyed by session ID. */
  agents: Record<string, AgentInstance>;
  /** Which session is currently shown in the ChatPanel. */
  focusedSessionId: string | null;
  /** Whether to display thinking/reasoning blocks in the chat. */
  showThinkingBlocks: boolean;
  /** Whether to display memory context blocks in the chat. */
  showMemoryBlocks: boolean;
  /** Collaboration UI state, keyed by session ID. */
  collaborations: CollaborationSessionMap;
  /** Open a session — creates an AgentSession in the main-process pool. */
  openSession: (sessionId: string, sessionPath: string, workspaceId: string) => Promise<void>;
  /** Close a session — disposes its AgentSession. */
  closeSession: (sessionId: string) => Promise<void>;
  /** Send a prompt to a specific session, optionally with file attachments. */
  sendPrompt: (sessionId: string, text: string, attachments?: ChatAttachment[]) => Promise<void>;
  /** Steer the agent mid-stream (interrupt after current tool, skip remaining). */
  steerAgent: (sessionId: string, text: string) => Promise<void>;
  /** Abort a specific session. */
  abort: (sessionId: string) => Promise<void>;
  /** Focus a session in the ChatPanel. */
  focusSession: (sessionId: string) => void;
  /** Clear focus (no session shown in the ChatPanel). */
  clearFocus: () => void;
  /** Reload resources (skills, prompts, extensions) for a session. */
  reloadResources: (sessionId: string) => Promise<void>;
  /** Set the model for a session. */
  setModel: (sessionId: string, provider: string, modelId: string) => Promise<void>;
  /** Set thinking level for a session. */
  setThinkingLevel: (sessionId: string, level: string) => Promise<void>;
  /** Fetch model state for a session. */
  fetchModelState: (sessionId: string) => Promise<void>;
  /** Toggle visibility of thinking/reasoning blocks. */
  toggleThinkingBlocks: () => void;
  /** Toggle visibility of memory context blocks. */
  toggleMemoryBlocks: () => void;
  /** Toggle collaboration mode on/off for the focused session. */
  toggleCollaborationMode: () => void;
  /** Set the collaboration strategy for the focused session. */
  setCollaborationStrategy: (strategy: CollaborationStrategy) => void;
  /** Update debate configuration for the focused session. */
  setDebateConfig: (config: Partial<DebateConfig>) => void;
  /** Send a prompt through the collaboration framework. */
  sendCollaborationPrompt: (sessionId: string, text: string) => Promise<void>;
  /** Subscribe to main-process events. Returns cleanup function. */
  initEventListener: () => () => void;
  /** Subscribe to collaboration events. Returns cleanup function. */
  initCollaborationListener: () => () => void;
}
