import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import {
  FIXTURE_MODEL_ID,
  FIXTURE_PROVIDER_ID,
  type AttemptStep,
  type ProviderAttempt,
  type ProviderScenario,
} from './provider-scenarios';

export interface FixtureSettings {
  baseUrl: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export interface ProviderFixture {
  url: string;
  requests: Array<Record<string, unknown>>;
  close(): Promise<void>;
}

interface FetchDispatcher {
  dispatch(options: Record<string, unknown>, handler: unknown): boolean;
  constructor: new(input: Record<string, unknown> | FetchDispatcher) => FetchDispatcher;
}

export async function installShortBodyTimeout(timeoutMs: number): Promise<() => void> {
  await fetch('data:,');
  const target = globalThis as unknown as Record<symbol, unknown>;
  const v1Symbol = Symbol.for('undici.globalDispatcher.1');
  const v2Symbol = Symbol.for('undici.globalDispatcher.2');
  const previousV1 = target[v1Symbol] as FetchDispatcher | undefined;
  const previousV2 = target[v2Symbol] as FetchDispatcher | undefined;
  if (!previousV1 || typeof previousV1.dispatch !== 'function') {
    throw new Error('Node fetch dispatcher is unavailable');
  }
  const options = {
    bodyTimeout: timeoutMs,
    headersTimeout: timeoutMs,
  };
  if (previousV2 && typeof previousV2.dispatch === 'function') {
    const configured = new previousV2.constructor(options);
    target[v2Symbol] = configured;
    target[v1Symbol] = new previousV1.constructor(configured);
  } else {
    target[v1Symbol] = new previousV1.constructor(options);
  }
  return () => {
    target[v1Symbol] = previousV1;
    if (previousV2) target[v2Symbol] = previousV2;
  };
}

export async function seedFixtureAgentDir(root: string, options: FixtureSettings): Promise<void> {
  await mkdir(root, { recursive: true });
  const models = {
    providers: {
      [FIXTURE_PROVIDER_ID]: {
        baseUrl: options.baseUrl,
        api: 'openai-completions',
        apiKey: 'none',
        models: [{
          id: FIXTURE_MODEL_ID,
          name: FIXTURE_MODEL_ID,
          reasoning: false,
          input: ['text'],
          contextWindow: 200000,
          maxTokens: 32000,
        }],
      },
    },
  };
  const settings = {
    defaultProvider: FIXTURE_PROVIDER_ID,
    defaultModel: FIXTURE_MODEL_ID,
    retry: {
      enabled: true,
      maxRetries: options.maxRetries ?? 3,
      baseDelayMs: options.retryBaseDelayMs ?? 25,
    },
  };
  await Promise.all([
    writeFile(join(root, 'models.json'), `${JSON.stringify(models, null, 2)}\n`, 'utf8'),
    writeFile(join(root, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`, 'utf8'),
  ]);
}

function sseChunk(model: string, delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-sero-test',
    object: 'chat.completion.chunk',
    created: 0,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function playStep(response: ServerResponse, step: AttemptStep, model: string): void {
  if (step.kind === 'text') {
    for (const chunk of step.chunks) response.write(sseChunk(model, { content: chunk }));
    return;
  }
  step.calls.forEach((call, index) => {
    call.argChunks.forEach((fragment, fragmentIndex) => {
      const first = fragmentIndex === 0;
      response.write(sseChunk(model, {
        tool_calls: [{
          index,
          ...(first ? { id: call.id, type: 'function' } : {}),
          function: { ...(first ? { name: call.toolName } : {}), arguments: fragment },
        }],
      }));
    });
  });
}

function playAttempt(response: ServerResponse, attempt: ProviderAttempt, model: string): void {
  response.write(sseChunk(model, { role: 'assistant' }));
  for (const step of attempt.steps) playStep(response, step, model);
  if (attempt.end.kind === 'finish') {
    response.write(sseChunk(model, {}, attempt.end.reason));
    response.end('data: [DONE]\n\n');
  } else if (attempt.end.kind === 'close') {
    response.destroy();
  }
}

export async function startProviderFixture(scenario: ProviderScenario): Promise<ProviderFixture> {
  const requests: Array<Record<string, unknown>> = [];
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
        response.writeHead(404).end();
        return;
      }
      const body = await readBody(request);
      const attempt = scenario.attempts[Math.min(requests.length, scenario.attempts.length - 1)];
      requests.push(body);
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      playAttempt(response, attempt, typeof body.model === 'string' ? body.model : FIXTURE_MODEL_ID);
    })();
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Provider fixture did not bind');
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
