import { app } from 'electron';
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import type {
  AgentStreamEvent,
  ChatHistoryPage,
  ContextOverrides,
  ContextToolInfo,
} from '@/types/ipc';
import { workspaceManager } from '@electron/features/workspace/manager';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { createRuntimeTools } from '@electron/features/container/tools';
import { containerPromptState } from '@electron/features/container/tools/container-prompt-state';
import { createRunCodeController } from '@electron/features/code-mode';
import { preserveBashFailureStatus } from '@electron/features/tool-capture/bash-result-error-status';
import { createSeroExtensionFactory } from '@electron/features/apps/extensions/create-sero-extension';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import {
  SERO_SESSION_DIR,
  ensureInfra,
  subagentManager,
} from '@electron/shared/infra/shared-infra';
import type { RuntimeBackendId } from '@electron/features/workspace/runtime/types';
import { bridgeExtensionTools } from '@electron/cli';
import { dropToolsNotForSessionKind } from '@electron/features/plugins/bridge-policy';
import { createSkillVisibilityOverride } from '@electron/features/apps/extensions/skill-visibility';
import {
  filterCompatiblePluginAgentsFiles,
  filterCompatiblePluginExtensions,
  filterCompatiblePluginPrompts,
  filterCompatiblePluginSkills,
  filterCompatiblePluginThemes,
} from '@electron/features/plugins/resource-compatibility';
import { withAgentPluginSkills } from '@electron/features/agent-plugins/skills';
import { readGlobalAgentsMd } from './global-agents';
import { readNewestTurns } from './agent-history-window';
import { readPersistedContextOverrides, applyContextOverrides } from './agent-context-overrides';
import { subscribeToSession } from './agent-subscription';
import { sessionStartEventFor, startSessionExtensions } from './agent-session-events';

export interface PoolEntry {
  session: AgentSession;
  loader: DefaultResourceLoader;
  unsubscribe: () => void;
  workspaceId: string;
  sessionPath: string;
  runtimeBackend: RuntimeBackendId;
  currentAssistantId: string | null;
  lastSessionName: string | undefined;
  /** Renderer user-message id awaiting same-turn undo metadata after the active turn ends. */
  pendingTurnUndoUserMessageId: string | null;
  contextOverrides: ContextOverrides | null;
  baseSystemPrompt: string;
  baseTools: ContextToolInfo[];
}

interface OpenSessionInPoolArgs {
  pool: Map<string, PoolEntry>;
  sessionId: string;
  sessionPath: string;
  workspaceId: string;
  sendEvent: (event: AgentStreamEvent) => void;
  closeExisting?: (sessionId: string) => Promise<void>;
  /** The source session file when this session was just forked from it. */
  forkedFrom?: string;
}

const AUTOMATION_BROWSER_TOOL = 'automation_browser';

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isContainerLikeRuntime(backend: string): boolean {
  return backend === 'apple-container' || backend === 'docker';
}

export async function openSessionInPool({
  pool,
  sessionId,
  sessionPath,
  workspaceId,
  sendEvent,
  closeExisting,
  forkedFrom,
}: OpenSessionInPoolArgs): Promise<ChatHistoryPage> {
  const workspacePath = workspaceManager.getPath(workspaceId);
  if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);

  const runtime = await runtimeManager.getRuntime(workspaceId);

  const existing = pool.get(sessionId);
  if (existing) {
    if (existing.workspaceId === workspaceId && existing.runtimeBackend === runtime.backend) {
      return readNewestTurns(existing.session, existing.workspaceId);
    }

    console.log(
      `[agent] Reopening session ${sessionId} after runtime change `
      + `(${existing.workspaceId}:${existing.runtimeBackend} -> ${workspaceId}:${runtime.backend})`,
    );
    if (closeExisting) {
      await closeExisting(sessionId);
    } else {
      existing.unsubscribe();
      existing.session.dispose();
      pool.delete(sessionId);
    }
  }

  const infra = await ensureInfra();
  console.log(`[agent] Using ${runtime.backend} runtime for workspace ${workspaceId}`);
  if (isContainerLikeRuntime(runtime.backend)) {
    sendEvent({ type: 'container_starting', sessionId, workspaceId });
  }

  try {
    const session = await runtime.ensure();
    if (isContainerLikeRuntime(runtime.backend)) {
      sendEvent({ type: 'container_ready', sessionId, workspaceId, ipAddress: session.containerId });
    }
  } catch (runtimeError) {
    const message = toErrorMessage(runtimeError, 'Runtime failed to start');
    console.error(`[agent] Runtime failed for ${workspaceId}:`, message);
    sendEvent({ type: 'container_error', sessionId, workspaceId, error: message });
    throw new Error(`${runtime.backend} runtime failed to start for workspace ${workspaceId}: ${message}`);
  }

  const [runtimeTools, globalAgentsFile] = await Promise.all([
    createRuntimeTools(runtime, sessionId),
    readGlobalAgentsMd(workspaceId),
  ]);
  // Chat reaches the automation browser as a `sero-cli` command, which keeps its
  // large schema out of every request.
  const platformTools = runtimeTools.filter((tool) => tool.name !== AUTOMATION_BROWSER_TOOL);
  const cliSessionTools = runtimeTools.filter((tool) => tool.name === AUTOMATION_BROWSER_TOOL);
  const runCode = createRunCodeController();
  platformTools.push(runCode.tool);
  const hostRuntimeOptions = runtime.backend === 'host'
    ? { workspacePath, platform: process.platform, devBuild: !app.isPackaged }
    : undefined;

  const skillVisibilityOverride = createSkillVisibilityOverride(infra.settingsManager);
  const loader = new DefaultResourceLoader({
    cwd: workspacePath,
    agentDir: SERO_AGENT_DIR,
    settingsManager: infra.settingsManager,
    extensionFactories: [
      createSeroExtensionFactory(workspaceManager, workspaceId, sessionId, containerPromptState(runtime), {
        subagentManager,
        enableAgentManagementTools: true,
        hostRuntime: hostRuntimeOptions,
        runtime,
      }),
    ],
    skillsOverride: (base) => withAgentPluginSkills(
      filterCompatiblePluginSkills(skillVisibilityOverride(base)),
    ),
    promptsOverride: filterCompatiblePluginPrompts,
    themesOverride: filterCompatiblePluginThemes,
    extensionsOverride: (base) => bridgeExtensionTools(
      dropToolsNotForSessionKind(filterCompatiblePluginExtensions(base), 'chat'),
      { sessionId, sessionTools: cliSessionTools },
    ),
    agentsFilesOverride: (discovered: { agentsFiles: Array<{ path: string; content: string }> }) => {
      const withGlobalAgents = globalAgentsFile
        ? {
            agentsFiles: [
              globalAgentsFile,
              ...discovered.agentsFiles.filter((file) => file.path !== globalAgentsFile.path),
            ],
          }
        : discovered;

      return filterCompatiblePluginAgentsFiles(withGlobalAgents);
    },
  });
  await loader.reload();

  const sessionManager = SessionManager.open(sessionPath, SERO_SESSION_DIR);
  const { session } = await createAgentSession({
    cwd: workspacePath,
    agentDir: SERO_AGENT_DIR,
    modelRuntime: infra.modelRuntime,
    noTools: 'builtin',
    customTools: platformTools,
    resourceLoader: loader,
    sessionManager,
    settingsManager: infra.settingsManager,
    sessionStartEvent: sessionStartEventFor(sessionManager, forkedFrom),
  });
  runCode.bind(session.agent);
  preserveBashFailureStatus(session.agent);

  await startSessionExtensions(session);

  const baseTools: ContextToolInfo[] = session.agent.state.tools.map((tool) => ({
    name: tool.name,
    label: (tool as { label?: string }).label,
    description: tool.description,
  }));
  // No run is active yet, so this is the base prompt with no override in it.
  const baseSystemPrompt = session.systemPrompt;
  const persistedOverrides = readPersistedContextOverrides(
    session,
    baseTools.map((tool) => tool.name),
  );

  const entry: PoolEntry = {
    session,
    loader,
    unsubscribe: subscribeToSession(
      sessionId,
      session,
      () => pool.get(sessionId),
      sendEvent,
    ),
    workspaceId,
    sessionPath,
    runtimeBackend: runtime.backend,
    currentAssistantId: null,
    lastSessionName: session.sessionName,
    pendingTurnUndoUserMessageId: null,
    contextOverrides: null,
    baseSystemPrompt,
    baseTools,
  };

  if (persistedOverrides) {
    applyContextOverrides(entry, persistedOverrides);
  }

  pool.set(sessionId, entry);
  return readNewestTurns(session, workspaceId);
}
