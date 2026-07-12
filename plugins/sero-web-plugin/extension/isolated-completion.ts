import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import type { Api, Model } from '@earendil-works/pi-ai';
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  type ModelRegistry,
} from '@earendil-works/pi-coding-agent';

interface IsolatedCompletionOptions {
  cwd: string;
  model: Model<Api>;
  modelRegistry: ModelRegistry;
  prompt: string;
  systemPrompt?: string;
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
}

export async function runIsolatedCompletion(options: IsolatedCompletionOptions): Promise<string> {
  if (options.signal?.aborted) throw new Error('Aborted');

  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: options.systemPrompt,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: options.cwd,
    agentDir,
    model: options.model,
    thinkingLevel: options.thinkingLevel ?? 'low',
    modelRegistry: options.modelRegistry,
    authStorage: options.modelRegistry.authStorage,
    noTools: 'all',
    resourceLoader,
    sessionManager: SessionManager.inMemory(options.cwd),
  });

  const abort = () => void session.abort();
  options.signal?.addEventListener('abort', abort, { once: true });

  try {
    await session.prompt(options.prompt);
    if (options.signal?.aborted) throw new Error('Aborted');
    const assistant = [...session.messages].reverse().find((message) => message.role === 'assistant');
    if (!assistant || assistant.role !== 'assistant') return '';
    return assistant.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();
  } finally {
    options.signal?.removeEventListener('abort', abort);
    session.dispose();
  }
}
