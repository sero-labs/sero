/**
 * useAI — make ad-hoc LLM calls from an app UI.
 *
 * Each app gets a dedicated agent session managed by the main process.
 * Calls go through `window.sero.appAgent.prompt()` — no active chat
 * session required. The session persists for the app × workspace pair,
 * so the LLM accumulates context across calls.
 *
 * Usage:
 *   const ai = useAI();
 *   const response = await ai.prompt("Generate an inspirational quote.");
 */

import { useContext, useCallback, useMemo } from 'react';
import { AppContext } from './context';
import { getSeroApi } from './sero-bridge';

export interface AppAI {
  /** Send a prompt to the app's dedicated agent session. Returns the LLM's text response. */
  prompt: (text: string) => Promise<string>;
  /** Send a prompt and receive text deltas as they stream in. Returns the final full text. */
  promptStream: (text: string, onDelta: (delta: string) => void) => Promise<string>;
}

export function useAI(): AppAI {
  const ctx = useContext(AppContext);

  const prompt = useCallback(
    async (text: string): Promise<string> => {
      if (!ctx?.appId || !ctx?.workspaceId) {
        throw new Error('[useAI] No app context — must be used inside a Sero app');
      }

      const { appAgent } = getSeroApi();
      return appAgent.prompt(ctx.appId, ctx.workspaceId, text);
    },
    [ctx],
  );

  const promptStream = useCallback(
    async (text: string, onDelta: (delta: string) => void): Promise<string> => {
      if (!ctx?.appId || !ctx?.workspaceId) {
        throw new Error('[useAI] No app context — must be used inside a Sero app');
      }

      const { appAgent } = getSeroApi();

      // Fall back to non-streaming if bridge doesn't support it
      if (!appAgent.promptStream) {
        return appAgent.prompt(ctx.appId, ctx.workspaceId, text);
      }

      return appAgent.promptStream(ctx.appId, ctx.workspaceId, text, onDelta);
    },
    [ctx],
  );

  return useMemo(() => ({ prompt, promptStream }), [prompt, promptStream]);
}
