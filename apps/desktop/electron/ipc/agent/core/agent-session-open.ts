import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type AgentSession,
} from '@mariozechner/pi-coding-agent';
import type {
  AgentStreamEvent,
  ChatMessage,
  ContextOverrides,
  ContextToolInfo,
} from '@/types/ipc';
import { workspaceManager } from '@electron/features/workspace/manager';
import { createWorkspaceRuntimeFacade } from '@electron/features/workspace/runtime/runtime-facade';
import { createRuntimeCodingTools } from '@electron/features/workspace/runtime/runtime-tools';
import { createSeroExtensionFactory } from '@electron/features/apps/extensions/create-sero-extension';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import {
  SERO_SESSION_DIR,
  buildContainerConfig,
  containerManager,
  ensureInfra,
  subagentManager,
} from '@electron/shared/infra/shared-infra';
import type { ContainerState } from '@electron/features/container';
import { createSeroUIContext } from '@electron/features/apps/extensions/ui-context';
import { bridgeExtensionTools } from '@electron/cli';
import { createSkillVisibilityOverride } from '@electron/features/apps/extensions/skill-visibility';
import {
  filterCompatiblePluginAgentsFiles,
  filterCompatiblePluginExtensions,
  filterCompatiblePluginPrompts,
  filterCompatiblePluginSkills,
  filterCompatiblePluginThemes,
} from '@electron/features/plugins/resource-compatibility';
import { readGlobalAgentsMd } from './global-agents';
import {
  buildTurnUndoMapByTurn,
  convertSessionMessages,
  getBaseSystemPrompt,
} from './agent-helpers';
import { readPersistedContextOverrides, applyContextOverrides } from './agent-context-overrides';
import { subscribeToSession } from './agent-subscription';

export interface PoolEntry {
  session: AgentSession;
  loader: DefaultResourceLoader;
  unsubscribe: () => void;
  workspaceId: string;
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
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function openSessionInPool({
  pool,
  sessionId,
  sessionPath,
  workspaceId,
  sendEvent,
}: OpenSessionInPoolArgs): Promise<ChatMessage[]> {
  const existing = pool.get(sessionId);
  if (existing) {
    return convertSessionMessages(
      existing.session.messages,
      buildTurnUndoMapByTurn(existing.session, existing.workspaceId),
    );
  }

  const infra = await ensureInfra();
  const workspacePath = workspaceManager.getPath(workspaceId);
  if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);

  let runtime = await createWorkspaceRuntimeFacade(workspaceId);
  const initialRuntime = runtime.resolution;
  const containerEnabled = initialRuntime.containerEnabled;
  let containerState: ContainerState | null = null;
  if (!containerEnabled) {
    console.log(`[agent] Container disabled for workspace ${workspaceId}, using host tools`);
  }

  try {
    if (containerEnabled) {
      sendEvent({ type: 'container_starting', sessionId, workspaceId });
      const containerConfig = await buildContainerConfig(workspaceId, workspacePath);
      containerState = await containerManager.ensure(containerConfig);
      runtime = await createWorkspaceRuntimeFacade(workspaceId);
      sendEvent({ type: 'container_ready', sessionId, workspaceId, ipAddress: containerState.ipAddress });
    }
  } catch (containerError) {
    const message = toErrorMessage(containerError, 'Container failed to start');
    console.error(`[agent] Container failed for ${workspaceId}:`, message);
    sendEvent({ type: 'container_error', sessionId, workspaceId, error: message });
    sendEvent({
      type: 'runtime_notice',
      sessionId,
      workspaceId,
      runtime: 'host',
      message:
        'This session is continuing in host mode because the workspace container could not be started. Browser automation, containerized language servers, and managed dev-server automation will stay unavailable until containers are healthy again.',
    });
  }

  const useContainer = !!containerState;
  if (!useContainer && containerEnabled && initialRuntime.actualRuntime === 'host' && initialRuntime.fallbackReason) {
    console.warn(`[agent] ${initialRuntime.fallbackReason}`);
  }
  const platformTools = createRuntimeCodingTools(runtime, {
    sessionId,
    forceHost: containerEnabled && !useContainer,
  });
  const globalAgentsFile = await readGlobalAgentsMd(workspaceId);

  const skillVisibilityOverride = createSkillVisibilityOverride(infra.settingsManager);
  const loader = new DefaultResourceLoader({
    cwd: workspacePath,
    agentDir: SERO_AGENT_DIR,
    settingsManager: infra.settingsManager,
    extensionFactories: [
      createSeroExtensionFactory(workspaceManager, workspaceId, sessionId, containerState ?? undefined, {
        subagentManager,
        enableAgentManagementTools: true,
      }),
    ],
    skillsOverride: (base) => filterCompatiblePluginSkills(skillVisibilityOverride(base)),
    promptsOverride: filterCompatiblePluginPrompts,
    themesOverride: filterCompatiblePluginThemes,
    extensionsOverride: (base) => bridgeExtensionTools(filterCompatiblePluginExtensions(base), { sessionId }),
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

  const { session } = await createAgentSession({
    cwd: workspacePath,
    agentDir: SERO_AGENT_DIR,
    authStorage: infra.authStorage,
    modelRegistry: infra.modelRegistry,
    noTools: 'builtin',
    customTools: platformTools,
    resourceLoader: loader,
    sessionManager: SessionManager.open(sessionPath, SERO_SESSION_DIR),
    settingsManager: infra.settingsManager,
  });

  session.extensionRunner?.setUIContext(createSeroUIContext());

  const baseTools: ContextToolInfo[] = session.agent.state.tools.map((tool) => ({
    name: tool.name,
    label: (tool as { label?: string }).label,
    description: tool.description,
  }));
  const baseSystemPrompt = getBaseSystemPrompt(session) ?? session.agent.state.systemPrompt ?? '';
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
  return convertSessionMessages(session.messages, buildTurnUndoMapByTurn(session, workspaceId));
}
