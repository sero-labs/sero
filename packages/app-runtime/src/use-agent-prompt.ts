/**
 * useAgentPrompt — send a message to the agent from an app UI.
 *
 * Returns a function that, when called, sends a text prompt to the
 * currently active agent session. The shell injects the actual
 * prompt function via AppContext — apps never need to know about
 * session IDs or storage details.
 */

import { useContext, useCallback } from 'react';
import { AppContext } from './context';

/**
 * Returns a function that sends a prompt to the active agent session.
 *
 * Usage:
 *   const prompt = useAgentPrompt();
 *   prompt("Add a todo: buy milk");
 */
export function useAgentPrompt(): (text: string) => void {
  const ctx = useContext(AppContext);

  return useCallback(
    (text: string) => {
      if (!ctx?.promptAgent) {
        console.warn('[useAgentPrompt] No promptAgent in context — prompt dropped');
        return;
      }
      ctx.promptAgent(text);
    },
    [ctx],
  );
}
