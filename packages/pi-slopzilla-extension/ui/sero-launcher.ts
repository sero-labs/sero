/**
 * Typed access to Sero IPC APIs for creating workspaces,
 * sessions, and launching the agent.
 *
 * These APIs live on `window.sero` (exposed by the Electron preload)
 * but aren't part of @sero-ai/app-runtime — they're shell-level APIs.
 *
 * NOTE: The types below are duplicated from the host app because
 * federated remotes can't import host-only modules directly.
 * If you change the host API, update these types to match.
 */

// SYNC WITH: apps/desktop/src/types/ipc.ts — WorkspaceInfo
interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
}

// SYNC WITH: apps/desktop/src/types/ipc.ts — SeroSessionInfo
interface SessionInfo {
  path: string;
  id: string;
  cwd: string;
  workspaceId: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
}

// SYNC WITH: apps/desktop/src/types/electron.d.ts — SeroWorkspaceAPI, SeroSessionsAPI, SeroAgentAPI
interface SeroShellApi {
  workspace: {
    create: (name: string, parentPath?: string) => Promise<WorkspaceInfo>;
    open: (id: string) => Promise<void>;
  };
  sessions: {
    create: (workspaceId?: string) => Promise<SessionInfo>;
  };
  agent: {
    open: (sessionId: string, sessionPath: string, workspaceId: string) => Promise<unknown>;
    prompt: (
      sessionId: string,
      text: string,
      attachments?: unknown[],
      clientMessageId?: string,
    ) => Promise<void>;
  };
}

function getShellApi(): SeroShellApi {
  const sero = (window as unknown as { sero?: SeroShellApi }).sero;
  if (!sero) {
    throw new Error('[slopzilla] window.sero not available');
  }
  return sero;
}

// ── Launch steps ───────────────────────────────────────────

export type LaunchStep =
  | 'creating-workspace'
  | 'opening-workspace'
  | 'creating-session'
  | 'opening-agent'
  | 'sending-prompt'
  | 'done';

export type OnProgress = (step: LaunchStep) => void;

/**
 * Notify the host shell that a workspace was created/opened so the
 * Zustand store picks it up without a restart.  The host's
 * WorkspaceTree listens for this CustomEvent.
 */
function notifyWorkspaceChanged() {
  window.dispatchEvent(new CustomEvent('sero:workspace-changed'));
}

/**
 * Create a new workspace, open a session, and kick off the agent
 * with a prompt to build the chosen app idea.
 *
 * Returns the workspace ID and session ID.
 */
export async function launchIdea(
  ideaName: string,
  buildPrompt: string,
  onProgress?: OnProgress,
): Promise<{ workspaceId: string; sessionId: string; sessionPath: string }> {
  const api = getShellApi();

  // 1. Create workspace
  onProgress?.('creating-workspace');
  const wsName = `slopzilla-${ideaName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;
  const workspace = await api.workspace.create(wsName);

  // 2. Open the workspace in the sidebar
  onProgress?.('opening-workspace');
  await api.workspace.open(workspace.id);
  notifyWorkspaceChanged();

  // 3. Create a session in that workspace
  onProgress?.('creating-session');
  const session = await api.sessions.create(workspace.id);

  // 4. Open the agent session
  onProgress?.('opening-agent');
  await api.agent.open(session.id, session.path, workspace.id);
  notifyWorkspaceChanged();

  // 5. Send the build prompt
  onProgress?.('sending-prompt');
  await api.agent.prompt(session.id, buildPrompt);

  onProgress?.('done');
  return { workspaceId: workspace.id, sessionId: session.id, sessionPath: session.path };
}
