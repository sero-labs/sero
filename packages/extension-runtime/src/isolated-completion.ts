import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import type { Api, Model } from '@earendil-works/pi-ai';
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type EventBus,
  type ModelRuntime,
} from '@earendil-works/pi-coding-agent';

const ISOLATED_COMPLETION_CHANNEL = 'sero:isolated-completion';

export interface IsolatedCompletionRequest {
  cwd: string;
  model: Model<Api>;
  prompt: string;
  systemPrompt?: string;
  /** Defaults to 'low' — background jobs should stay cheap. */
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
}

export type IsolatedCompletionService = (
  request: IsolatedCompletionRequest,
) => Promise<string>;

interface IsolatedCompletionEnvelope {
  request: IsolatedCompletionRequest;
  accept: () => void;
  resolve: (result: string) => void;
  reject: (error: unknown) => void;
}

export interface IsolatedCompletionHostOptions {
  agentDir: string;
  modelRuntime: ModelRuntime;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Aborted');
}

/**
 * Create the host-owned service. The shared ModelRuntime stays in the host;
 * callers receive only the narrow completion function.
 */
export function createIsolatedCompletionService(
  options: IsolatedCompletionHostOptions,
): IsolatedCompletionService {
  return async (request) => {
    throwIfAborted(request.signal);

    const resourceLoader = new DefaultResourceLoader({
      cwd: request.cwd,
      agentDir: options.agentDir,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: request.systemPrompt,
      appendSystemPrompt: [],
    });
    await resourceLoader.reload();
    throwIfAborted(request.signal);

    const { session } = await createAgentSession({
      cwd: request.cwd,
      agentDir: options.agentDir,
      model: request.model,
      thinkingLevel: request.thinkingLevel ?? 'low',
      modelRuntime: options.modelRuntime,
      noTools: 'all',
      resourceLoader,
      sessionManager: SessionManager.inMemory(request.cwd),
    });

    const abort = () => void session.abort();
    request.signal?.addEventListener('abort', abort, { once: true });

    try {
      throwIfAborted(request.signal);
      await session.prompt(request.prompt);
      throwIfAborted(request.signal);
      const assistant = [...session.messages]
        .reverse()
        .find((message) => message.role === 'assistant');
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
  };
}

/** Register the host side of the extension event-bus boundary. */
export function registerIsolatedCompletionHost(
  events: EventBus,
  service: IsolatedCompletionService,
): () => void {
  return events.on(ISOLATED_COMPLETION_CHANNEL, (data) => {
    const envelope = data as IsolatedCompletionEnvelope;
    envelope.accept();
    void service(envelope.request).then(envelope.resolve, envelope.reject);
  });
}

/** Request a completion from plugin code without exposing the host runtime. */
export function requestIsolatedCompletion(
  events: EventBus,
  request: IsolatedCompletionRequest,
): Promise<string> {
  throwIfAborted(request.signal);
  return new Promise<string>((resolve, reject) => {
    let accepted = false;
    events.emit(ISOLATED_COMPLETION_CHANNEL, {
      request,
      accept: () => { accepted = true; },
      resolve,
      reject,
    } satisfies IsolatedCompletionEnvelope);
    queueMicrotask(() => {
      if (!accepted) reject(new Error('Isolated completion service is unavailable'));
    });
  });
}
