import type { Page } from '@playwright/test';
import type {
  AgentStreamEvent,
  ContextOverrides,
  SeroSessionInfo,
  WorkspaceInfo,
} from '../../src/types/ipc';
import type { LlmConfig } from './llm';

const DEFAULT_AGENT_TIMEOUT_MS = 90_000;

export interface AgentSessionFixture {
  workspace: WorkspaceInfo;
  session: SeroSessionInfo;
}

export interface AgentTurnResult {
  events: AgentStreamEvent[];
}

export interface ConfigureAgentModelResult {
  configured: boolean;
  reason?: string;
  model?: { provider: string; modelId: string };
}

export async function createOpenAgentSession(
  page: Page,
  workspacePath: string,
  workspaceName = 'Agent Realism Workspace',
): Promise<AgentSessionFixture> {
  return page.evaluate(async ({ workspacePath: folderPath, workspaceName: name }) => {
    const workspace = await window.sero.workspace.addFolder(folderPath, name);
    const session = await window.sero.sessions.create(workspace.id);
    await window.sero.agent.open(session.id, session.path, workspace.id);
    return { workspace, session };
  }, { workspacePath, workspaceName });
}

export async function configureAgentModel(
  page: Page,
  sessionId: string,
  config: LlmConfig,
): Promise<ConfigureAgentModelResult> {
  return page.evaluate(async ({ sessionId: id, provider, modelId }) => {
    const state = await window.sero.agent.getModelState(id);
    const available = state?.availableModels.flatMap((group) => group.models) ?? [];
    const target = available.find((model) => model.provider === provider && model.modelId === modelId);
    if (!target) {
      return {
        configured: false,
        reason: `Model ${provider}/${modelId} is not available to the test app.`,
      };
    }

    const next = await window.sero.agent.setModel(id, provider, modelId);
    const thinkingLevel = next.availableThinkingLevels.includes('low') ? 'low' : next.thinkingLevel;
    if (thinkingLevel !== next.thinkingLevel) {
      await window.sero.agent.setThinkingLevel(id, thinkingLevel);
    }
    return { configured: true, model: { provider, modelId } };
  }, { sessionId, provider: config.provider, modelId: config.modelId });
}

export async function promptAndCollectEvents(
  page: Page,
  sessionId: string,
  prompt: string,
  timeoutMs = DEFAULT_AGENT_TIMEOUT_MS,
): Promise<AgentTurnResult> {
  return page.evaluate(({ sessionId: id, prompt: text, timeoutMs: timeout }) => new Promise<AgentTurnResult>((resolve, reject) => {
    const events: AgentStreamEvent[] = [];
    let sawAgentStart = false;
    let unsubscribe: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      unsubscribe?.();
      reject(new Error(`Timed out waiting for agent_end. Events: ${events.map((event) => event.type).join(', ')}`));
    }, timeout);

    const cleanup = () => {
      window.clearTimeout(timer);
      unsubscribe?.();
    };

    unsubscribe = window.sero.agent.onEvent((event) => {
      if (event.sessionId !== id) return;
      events.push(event);
      if (event.type === 'agent_start') sawAgentStart = true;
      if (event.type === 'error') {
        cleanup();
        reject(new Error(event.error));
      }
      if (event.type === 'agent_end' && sawAgentStart) {
        cleanup();
        resolve({ events });
      }
    });

    window.sero.agent.prompt(id, text, undefined, `e2e-${Date.now()}`).catch((error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  }), { sessionId, prompt, timeoutMs });
}

export async function disableAllToolsExcept(
  page: Page,
  sessionId: string,
  allowedToolNames: string[],
  systemPrompt?: string,
): Promise<string[]> {
  return page.evaluate(async ({ sessionId: id, allowed, systemPrompt: prompt }) => {
    const context = await window.sero.agent.getContext(id);
    const toolNames = context?.tools.map((tool) => tool.name) ?? [];
    const allowedSet = new Set(allowed);
    const overrides: ContextOverrides = {
      disabledTools: toolNames.filter((name) => !allowedSet.has(name)),
    };
    if (prompt) overrides.systemPrompt = prompt;
    await window.sero.agent.setContextOverrides(id, overrides);
    return toolNames;
  }, { sessionId, allowed: allowedToolNames, systemPrompt });
}

export async function chooseAlternateAvailableModel(
  page: Page,
  sessionId: string,
  provider: string,
  currentModelId: string,
  alternateModelId: string,
): Promise<{ provider: string; modelId: string } | null> {
  if (alternateModelId === currentModelId) return null;
  return page.evaluate(async ({ sessionId: id, provider, alternateModelId: targetModelId }) => {
    const state = await window.sero.agent.getModelState(id);
    const group = state?.availableModels.find((candidate) => candidate.provider === provider);
    const model = group?.models.find((candidate) => candidate.modelId === targetModelId);
    return model ? { provider, modelId: model.modelId } : null;
  }, { sessionId, provider, alternateModelId });
}

export function assistantTextFromEvents(events: AgentStreamEvent[]): string {
  return events
    .filter((event): event is Extract<AgentStreamEvent, { type: 'message_end' }> => event.type === 'message_end')
    .map((event) => event.text)
    .join('\n');
}

export function toolStarts(events: AgentStreamEvent[], toolName?: string) {
  return events.filter((event): event is Extract<AgentStreamEvent, { type: 'tool_start' }> => {
    return event.type === 'tool_start' && (!toolName || event.tool.toolName === toolName);
  });
}

export function toolEnds(events: AgentStreamEvent[], toolName?: string) {
  return events.filter((event): event is Extract<AgentStreamEvent, { type: 'tool_end' }> => {
    if (event.type !== 'tool_end') return false;
    if (!toolName) return true;
    const started = toolStarts(events, toolName).some((start) => start.tool.toolCallId === event.toolCallId);
    return started;
  });
}
