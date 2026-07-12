import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';

interface IsolatedCompletionOptions {
  systemPrompt: string;
  thinkingLevel: ThinkingLevel;
  signal?: AbortSignal;
}

type IsolatedCompletionContext = Pick<
  ExtensionContext,
  'cwd' | 'model' | 'modelRegistry' | 'signal'
>;

export async function runIsolatedCompletion(
  ctx: IsolatedCompletionContext,
  prompt: string,
  options: IsolatedCompletionOptions,
): Promise<string> {
  if (!ctx.model) {
    throw new Error('An active model is required.');
  }
  if (options.signal?.aborted) {
    throw new Error('Aborted');
  }

  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd: ctx.cwd,
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
    cwd: ctx.cwd,
    agentDir,
    model: ctx.model,
    thinkingLevel: options.thinkingLevel,
    modelRegistry: ctx.modelRegistry,
    authStorage: ctx.modelRegistry.authStorage,
    noTools: 'all',
    resourceLoader,
    sessionManager: SessionManager.inMemory(ctx.cwd),
  });

  const abort = () => void session.abort();
  options.signal?.addEventListener('abort', abort, { once: true });

  try {
    await session.prompt(prompt);
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
