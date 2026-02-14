/**
 * useAgentPrompt — send a message to the agent from an app UI.
 *
 * Returns a function that, when called, sends a text prompt to the
 * currently focused agent session via the preload IPC bridge.
 */

import { useCallback } from 'react';

/** Access the preload-exposed IPC bridge. */
function getSeroApi() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).sero as {
    agent: {
      prompt(sessionId: string, text: string): Promise<void>;
    };
  };
}

/**
 * Returns a function that sends a prompt to the focused agent session.
 *
 * Usage:
 *   const prompt = useAgentPrompt();
 *   prompt("Add a todo: buy milk");
 */
export function useAgentPrompt(): (text: string) => void {
  return useCallback((text: string) => {
    // The focused session ID is stored in localStorage by the sessions store
    const focusedSessionId = localStorage.getItem('sero-focused-session-id');
    if (!focusedSessionId) {
      console.warn('[useAgentPrompt] No focused session — prompt dropped');
      return;
    }
    const api = getSeroApi();
    api.agent.prompt(focusedSessionId, text).catch((err: unknown) => {
      console.error('[useAgentPrompt] Failed to send prompt:', err);
    });
  }, []);
}
