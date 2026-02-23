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
    throw new Error('[slopzilla] window.sero not available');
  }
  return sero;
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
): Promise<{ workspaceId: string; sessionId: string }> {
  const api = getShellApi();

  // 1. Create workspace
  const wsName = `slopzilla-${ideaName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;
  const workspace = await api.workspace.create(wsName);

  // 2. Open the workspace in the sidebar
  await api.workspace.open(workspace.id);

  // 3. Create a session in that workspace
  const session = await api.sessions.create(workspace.id);

  // 4. Open the agent session
  await api.agent.open(session.id, session.path, workspace.id);

  // 5. Send the build prompt
  await api.agent.prompt(session.id, buildPrompt);

  return { workspaceId: workspace.id, sessionId: session.id };
}
