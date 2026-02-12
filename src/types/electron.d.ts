/** Types for the `window.sero` API exposed by the preload script. */

import type {
  SeroSessionInfo,
  ChatMessage,
  AgentStreamEvent,
} from './ipc';

interface SeroSessionsAPI {
  list(): Promise<SeroSessionInfo[]>;
  create(): Promise<SeroSessionInfo>;
  delete(sessionPath: string): Promise<void>;
}

interface SeroAgentAPI {
  /** Open a session and load its history. */
  open(sessionPath: string): Promise<ChatMessage[]>;
  /** Send a prompt. Resolves when the agent finishes its turn. */
  prompt(text: string): Promise<void>;
  /** Abort the current agent operation. */
  abort(): Promise<void>;
  /** Close the current session and dispose resources. */
  close(): Promise<void>;
  /** Subscribe to streaming events pushed from main process. Returns unsubscribe. */
  onEvent(callback: (event: AgentStreamEvent) => void): () => void;
}

interface SeroAPI {
  platform: string;
  sessions: SeroSessionsAPI;
  agent: SeroAgentAPI;
}

declare global {
  interface Window {
    sero: SeroAPI;
  }
}

export {};
