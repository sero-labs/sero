import {
  ModelRegistry,
  SessionManager,
  type ExtensionCommandContext,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';

import { createSeroUIContext } from '@electron/features/apps/extensions/ui-context';
import { ensureAiInfra } from '@electron/shared/infra/ai-infra';
import type { CliCommandContext, CliSessionRuntime } from './types';
import type { CliSessionEntry } from '../bridges/session-bridge';
import { getCliSessionBridge } from '../bridges/session-bridge';

export type SeroBridgedToolContext = ExtensionContext & {
  sessionRuntime?: CliSessionRuntime;
};

export type SeroBridgedCommandContext = ExtensionCommandContext & {
  sessionRuntime?: CliSessionRuntime;
};

function resolveSessionEntry(
  context: Pick<CliCommandContext, 'workspaceId' | 'invocation'>,
): CliSessionEntry | undefined {
  try {
    const bridge = getCliSessionBridge();
    return context.invocation.sessionId
      ? bridge.getSessionEntry(context.invocation.sessionId) ?? bridge.getActiveSessionForWorkspace(context.workspaceId)
      : bridge.getActiveSessionForWorkspace(context.workspaceId);
  } catch {
    return undefined;
  }
}

async function createFallbackExtensionContext(cwd: string): Promise<ExtensionContext> {
  const { modelRegistry } = await ensureAiInfra();
  return {
    ui: createSeroUIContext(),
    mode: 'rpc',
    hasUI: true,
    cwd,
    sessionManager: SessionManager.inMemory(cwd),
    modelRegistry,
    model: undefined,
    scopedModels: [],
    isProjectTrusted: () => false,
    isIdle: () => true,
    signal: undefined,
    abort: () => {},
    hasPendingMessages: () => false,
    shutdown: () => {},
    getContextUsage: () => undefined,
    compact: () => {},
    getSystemPrompt: () => '',
  };
}

function createSessionBackedExtensionContext(
  entry: CliSessionEntry,
  cwd: string,
): ExtensionContext {
  const liveContext = entry.session.extensionRunner?.createContext();
  if (liveContext) {
    return {
      ...liveContext,
      cwd,
    };
  }

  return {
    ui: createSeroUIContext(),
    mode: 'rpc',
    hasUI: true,
    cwd,
    sessionManager: entry.session.sessionManager,
    modelRegistry: new ModelRegistry(entry.session.modelRuntime),
    model: entry.session.model,
    scopedModels: entry.session.scopedModels,
    isProjectTrusted: () => entry.session.settingsManager.isProjectTrusted(),
    isIdle: () => !entry.session.isStreaming,
    signal: entry.session.agent.signal,
    abort: () => {
      void entry.session.abort();
    },
    hasPendingMessages: () => entry.session.pendingMessageCount > 0,
    shutdown: () => {
      entry.session.extensionRunner?.shutdown();
    },
    getContextUsage: () => entry.session.getContextUsage(),
    compact: (options) => {
      void entry.session.compact(options?.customInstructions)
        .then((result) => {
          options?.onComplete?.(result);
        })
        .catch((error: unknown) => {
          options?.onError?.(error instanceof Error ? error : new Error(String(error)));
        });
    },
    getSystemPrompt: () => entry.session.systemPrompt,
  };
}

function createUnavailableCommandAction<TResult>(
  commandName: string,
  action: string,
): () => Promise<TResult> {
  return async () => {
    throw new Error(`/${commandName} cannot ${action} without a live session command context.`);
  };
}

export async function buildToolContext(ctx: CliCommandContext): Promise<SeroBridgedToolContext> {
  const entry = resolveSessionEntry(ctx);
  const baseContext = ctx.agentContext
    ? { ...ctx.agentContext, cwd: ctx.cwd }
    : entry
      ? createSessionBackedExtensionContext(entry, ctx.cwd)
      : await createFallbackExtensionContext(ctx.cwd);

  return {
    ...baseContext,
    sessionRuntime: ctx.sessionRuntime,
  };
}

export async function buildCommandContext(
  commandName: string,
  ctx: CliCommandContext,
): Promise<SeroBridgedCommandContext> {
  const liveCommandContext = resolveSessionEntry(ctx)?.session.extensionRunner?.createCommandContext();
  if (liveCommandContext) {
    return {
      ...liveCommandContext,
      cwd: ctx.cwd,
      sessionRuntime: ctx.sessionRuntime,
    };
  }

  const baseContext = await buildToolContext(ctx);
  return {
    ...baseContext,
    getSystemPromptOptions: () => {
      throw new Error(`/${commandName} cannot inspect system prompt options without a live session command context.`);
    },
    waitForIdle: createUnavailableCommandAction(commandName, 'wait for the agent to become idle'),
    newSession: createUnavailableCommandAction(commandName, 'start a new session'),
    fork: createUnavailableCommandAction(commandName, 'fork the current session'),
    navigateTree: createUnavailableCommandAction(commandName, 'navigate the session tree'),
    switchSession: createUnavailableCommandAction(commandName, 'switch sessions'),
    reload: createUnavailableCommandAction(commandName, 'reload extensions'),
  };
}
