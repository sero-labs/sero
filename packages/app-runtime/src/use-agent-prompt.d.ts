/**
 * useAgentPrompt — send a message to the agent from an app UI.
 *
 * Returns a function that, when called, sends a text prompt to the
 * currently focused agent session via the preload IPC bridge.
 */
/**
 * Returns a function that sends a prompt to the focused agent session.
 *
 * Usage:
 *   const prompt = useAgentPrompt();
 *   prompt("Add a todo: buy milk");
 */
export declare function useAgentPrompt(): (text: string) => void;
