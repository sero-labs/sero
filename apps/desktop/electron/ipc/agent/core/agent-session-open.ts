import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import type {
  AgentStreamEvent,
  ChatMessage,
  ContextOverrides,
  ContextToolInfo,
} from '@/types/ipc';
import { workspaceManager } from '@electron/features/workspace/manager';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { createRuntimeTools } from '@electron/features/container/tools';
import { createSeroExtensionFactory } from '@electron/features/apps/extensions/create-sero-extension';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import {
  SERO_SESSION_DIR,
  ensureInfra,
  subagentManager,
} from '@electron/shared/infra/shared-infra';
import { createSeroUIContext } from '@electron/features/apps/extensions/ui-context';
import type { RuntimeBackendId } from '@electron/features/workspace/runtime/types';
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
}

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
}: OpenSessionInPoolArgs): Promise<ChatMessage[]> {
  const workspacePath = workspaceManager.getPath(workspaceId);
  if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);

  const runtime = await runtimeManager.getRuntime(workspaceId);

  const existing = pool.get(sessionId);
  if (existing) {
    if (existing.workspaceId === workspaceId && existing.runtimeBackend === runtime.backend) {
      return convertSessionMessages(
        existing.session.messages,
        buildTurnUndoMapByTurn(existing.session, existing.workspaceId),
      );
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

  const [platformTools, globalAgentsFile] = await Promise.all([
    createRuntimeTools(runtime, sessionId),
    readGlobalAgentsMd(workspaceId),
  ]);
  const hostRuntimeOptions = runtime.backend === 'host'
    ? { workspacePath, platform: process.platform }
    : undefined;

  const skillVisibilityOverride = createSkillVisibilityOverride(infra.settingsManager);
  const loader = new DefaultResourceLoader({
    cwd: workspacePath,
    agentDir: SERO_AGENT_DIR,
    settingsManager: infra.settingsManager,
    extensionFactories: [
      createSeroExtensionFactory(workspaceManager, workspaceId, sessionId, undefined, {
        subagentManager,
        enableAgentManagementTools: true,
        hostRuntime: hostRuntimeOptions,
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
  return convertSessionMessages(session.messages, buildTurnUndoMapByTurn(session, workspaceId));
}
