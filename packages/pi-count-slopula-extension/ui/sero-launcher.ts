/**
 * Typed access to Sero IPC APIs for creating workspaces,
 * sessions, and launching the agent.
 *
 * These APIs live on `window.sero` (exposed by the Electron preload)
 * but aren't part of @sero/app-runtime — they're shell-level APIs.
 */

interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
}

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
    throw new Error('[count-slopula] window.sero not available');
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

function notifyWorkspaceChanged() {
  window.dispatchEvent(new CustomEvent('sero:workspace-changed'));
}

/**
 * Create a new workspace, open a session, and kick off the agent
 * with a prompt to build the chosen content piece into a web page.
 */
export async function launchPiece(
  pieceName: string,
  buildPrompt: string,
  onProgress?: OnProgress,
): Promise<{ workspaceId: string; sessionId: string; sessionPath: string }> {
  const api = getShellApi();

  onProgress?.('creating-workspace');
  const wsName = `slopula-${pieceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;
  const workspace = await api.workspace.create(wsName);

  onProgress?.('opening-workspace');
  await api.workspace.open(workspace.id);
  notifyWorkspaceChanged();

  onProgress?.('creating-session');
  const session = await api.sessions.create(workspace.id);

  onProgress?.('opening-agent');
  await api.agent.open(session.id, session.path, workspace.id);
  notifyWorkspaceChanged();

  onProgress?.('sending-prompt');
  await api.agent.prompt(session.id, buildPrompt);

  onProgress?.('done');
  return { workspaceId: workspace.id, sessionId: session.id, sessionPath: session.path };
}
