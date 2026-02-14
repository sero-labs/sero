/**
 * @sero/app-runtime — hooks for Sero federated app modules.
 *
 * Shared via module federation so every app gets the host's singleton.
 * Hooks communicate with the Electron main process via window.sero IPC.
 */
export { AppContext, AppProvider, type AppContextValue } from './context';
export { useAppState } from './use-app-state';
export { useAppInfo } from './use-app-info';
export { useAgentPrompt } from './use-agent-prompt';
