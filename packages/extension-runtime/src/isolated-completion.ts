import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import type { Api, Model } from '@earendil-works/pi-ai';
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  type ModelRegistry,
} from '@earendil-works/pi-coding-agent';

export interface IsolatedCompletionRequest {
  cwd: string;
  model: Model<Api>;
  modelRegistry: ModelRegistry;
  prompt: string;
  systemPrompt?: string;
  /** Defaults to 'low' — background jobs should stay cheap. */
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
}

/**
 * Run a single, tool-free completion in a short-lived isolated AgentSession.
 *
 * Dispatch goes through the caller's real ModelRegistry (and its AuthStorage),
 * so it works for every provider — built-in, models.json custom, and
 * extension-registered. The session loads no extensions/skills/themes/context,
 * which keeps background jobs from re-triggering session-lifecycle hooks and
 * recursing. The session is always disposed, on success, failure, and abort.
 */
export async function runIsolatedCompletion(request: IsolatedCompletionRequest): Promise<string> {
  if (request.signal?.aborted) throw new Error('Aborted');

  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd: request.cwd,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: request.systemPrompt,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: request.cwd,
    agentDir,
    model: request.model,
    thinkingLevel: request.thinkingLevel ?? 'low',
    modelRegistry: request.modelRegistry,
    authStorage: request.modelRegistry.authStorage,
    noTools: 'all',
    resourceLoader,
    sessionManager: SessionManager.inMemory(request.cwd),
  });

  const abort = () => void session.abort();
  request.signal?.addEventListener('abort', abort, { once: true });

  try {
    await session.prompt(request.prompt);
    if (request.signal?.aborted) throw new Error('Aborted');
    const assistant = [...session.messages].reverse().find((message) => message.role === 'assistant');
    if (!assistant || assistant.role !== 'assistant') return '';
    return assistant.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();
  } finally {
    request.signal?.removeEventListener('abort', abort);
    session.dispose();
  }
}
