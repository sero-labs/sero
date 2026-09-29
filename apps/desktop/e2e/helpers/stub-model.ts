/**
 * A local OpenAI-compatible model server for tests that need a session to run
 * a turn without a real model or an API key.
 *
 * The server records every request, including the system prompt and the tool
 * list the session sent, and answers with whatever the test scripts: text, or
 * one tool call per entry. A profile reaches it through a custom provider id
 * seeded into `models.json`, the same route a user's own provider takes.
 */

import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

export const STUB_PROVIDER_ID = 'stub-alibaba';
export const STUB_MODEL_ID = 'stub-model';

export interface StubTool {
  name: string;
  description: string;
  parameters: unknown;
}

export interface StubMessage {
  role: string;
  text: string;
  toolCallId?: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
}

export interface StubRequest {
  system: string;
  tools: StubTool[];
  messages: StubMessage[];
}

export type StubReply =
  | { text: string }
  | { toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> };

export interface StubModelServer {
  /** Ends in `/v1`, which is what a provider's `baseUrl` takes. */
  baseUrl: string;
  requests: StubRequest[];
  close(): Promise<void>;
}

interface ChatCompletionsBody {
  stream?: boolean;
  tools?: Array<{ function: StubTool }>;
  messages?: Array<{
    role: string;
    content?: string | Array<{ type: string; text?: string }> | null;
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  }>;
}

function textOf(content: NonNullable<ChatCompletionsBody['messages']>[number]['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => part.text ?? '').join('');
}

function parseRequest(body: ChatCompletionsBody): StubRequest {
  const messages = (body.messages ?? []).map((message): StubMessage => ({
    role: message.role,
    text: textOf(message.content),
    toolCallId: message.tool_call_id,
    toolCalls: (message.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    })),
  }));
  const system = messages.filter((message) => message.role === 'system' || message.role === 'developer')
    .map((message) => message.text)
    .join('\n');
  return {
    system,
    tools: (body.tools ?? []).map((tool) => tool.function),
    messages: messages.filter((message) => message.role !== 'system' && message.role !== 'developer'),
  };
}

function chunk(delta: Record<string, unknown>, finishReason: string | null): string {
  return `data: ${JSON.stringify({
    id: 'stub-completion',
    object: 'chat.completion.chunk',
    created: 0,
    model: STUB_MODEL_ID,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

const USAGE = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };

function streamReply(reply: StubReply): string {
  const parts = [chunk({ role: 'assistant' }, null)];
  if ('text' in reply) {
    parts.push(chunk({ content: reply.text }, null), chunk({}, 'stop'));
  } else {
    reply.toolCalls.forEach((call, index) => {
      parts.push(chunk({
        tool_calls: [{
          index,
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        }],
      }, null));
    });
    parts.push(chunk({}, 'tool_calls'));
  }
  parts.push(`data: ${JSON.stringify({
    id: 'stub-completion',
    object: 'chat.completion.chunk',
    created: 0,
    model: STUB_MODEL_ID,
    choices: [],
    usage: USAGE,
  })}\n\n`, 'data: [DONE]\n\n');
  return parts.join('');
}

function wholeReply(reply: StubReply): string {
  const message = 'text' in reply
    ? { role: 'assistant', content: reply.text }
    : {
        role: 'assistant',
        content: null,
        tool_calls: reply.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
  return JSON.stringify({
    id: 'stub-completion',
    object: 'chat.completion',
    created: 0,
    model: STUB_MODEL_ID,
    choices: [{ index: 0, message, finish_reason: 'text' in reply ? 'stop' : 'tool_calls' }],
    usage: USAGE,
  });
}

/** `respond` gets each request and its position in the run, and returns the scripted reply. */
export async function startStubModel(
  respond: (request: StubRequest, index: number) => StubReply,
): Promise<StubModelServer> {
  const requests: StubRequest[] = [];
  const server = http.createServer((req, res) => {
    const bodyChunks: Buffer[] = [];
    req.on('data', (piece: Buffer) => bodyChunks.push(piece));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
        res.writeHead(404).end();
        return;
      }
      const body = JSON.parse(Buffer.concat(bodyChunks).toString('utf8')) as ChatCompletionsBody;
      const request = parseRequest(body);
      requests.push(request);
      const reply = respond(request, requests.length - 1);
      if (body.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        res.end(streamReply(reply));
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(wholeReply(reply));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

/**
 * Adds the stub as a custom provider in the profile's `models.json`. Call it
 * from a launch `seed` callback, before Sero starts. The provider id is not a
 * built-in one, so it exercises the route a user's own provider takes.
 */
export function seedStubProvider(seroHome: string, baseUrl: string): void {
  const agentDir = path.join(seroHome, 'agent');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'models.json'), JSON.stringify({
    providers: {
      [STUB_PROVIDER_ID]: {
        baseUrl,
        api: 'openai-completions',
        apiKey: 'stub-key',
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
        models: [{ id: STUB_MODEL_ID, name: 'Stub model', contextWindow: 128_000, maxTokens: 4_096 }],
      },
    },
  }, null, 2));
}
