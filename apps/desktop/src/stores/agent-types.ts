import type {
  ChatAttachment,
  ChatComposerPrefill,
  ChatMessage,
  SessionModelState,
  SeroSlashCommandInfo,
} from '@/types/ipc';
import type { WorkspaceRuntimeBackend } from '@/types/workspace-runtime';

export interface AgentRetryState {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
}

/** State for a single agent session in the pool. */
export interface AgentInstance {
  sessionId: string;
  sessionPath: string;
  workspaceId: string;
  runtimeBackend?: WorkspaceRuntimeBackend;
  /** The loaded window of the thread: older turns first, live tail last. */
  messages: ChatMessage[];
  /** Cursor for the next older window, or null once the whole thread is loaded. */
  olderCursor: string | null;
  loadingOlderTurns: boolean;
  isStreaming: boolean;
  retry: AgentRetryState | null;
  error: string | null;
  /** Available slash commands for this session (fetched on open). */
  commands: SeroSlashCommandInfo[];
  /** Current model + thinking level state. */
  modelState: SessionModelState | null;
}

export interface AgentState {
  /** All active agent instances, keyed by session ID. */
  agents: Record<string, AgentInstance>;
  /** Session-scoped composer drafts pushed from the main process. */
  composerPrefills: Record<string, ChatComposerPrefill | undefined>;
  /** Which session is currently shown in the ChatPanel. */
  focusedSessionId: string | null;
  /** Whether to display thinking/reasoning blocks in the chat. */
  showThinkingBlocks: boolean;
  /** Whether to display memory context blocks in the chat. */
  showMemoryBlocks: boolean;
  /** Open a session — creates an AgentSession in the main-process pool. */
  openSession: (
    sessionId: string,
    sessionPath: string,
    workspaceId: string,
    runtimeBackend?: WorkspaceRuntimeBackend,
  ) => Promise<void>;
  /** Close a session — disposes its AgentSession. */
  closeSession: (sessionId: string) => Promise<void>;
  /** Prepend the next older window of user turns to a session. */
  loadOlderTurns: (sessionId: string) => Promise<void>;
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
  /** Queue a session-scoped composer prefill. */
  setComposerPrefill: (sessionId: string, prefill: ChatComposerPrefill) => void;
  /** Clear a session-scoped composer prefill once the prompt area consumes it. */
  clearComposerPrefill: (sessionId: string, requestId?: string) => void;
  /** Subscribe to main-process events. Returns cleanup function. */
  initEventListener: () => () => void;
}
