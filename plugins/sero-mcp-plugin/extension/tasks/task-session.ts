import { isSpecType, type CallToolResult, type Client, type JSONRPCMessage, type Transport } from '@modelcontextprotocol/client';
import {
  createTaskSessionEndpointId,
  createTaskSessionFromClient,
  resultFromTaskOutcome,
  type ApplicationElicitResult,
  type ApplicationInputRequest,
  type ApplicationInputResult,
  type RawClientDispatch,
  type ResolvedInputExchangeContext,
  type TaskEnabledSession,
} from '@modelcontextprotocol/ext-tasks/client';
import { toJsonValue, type JsonValue } from '@modelcontextprotocol/ext-tasks/core';
import { answerElicitation } from '../elicitation/handler';
import { MCP_TASKS_EXTENSION } from '../manager/client-factory';

/** Sero polls a task at most once per second, whatever the server suggests. */
export const MIN_TASK_POLL_MS = 1_000;

export interface TaskSessionInput {
  client: Client;
  transport: Transport;
  serverName: string;
  configHash: string;
  principalId: string;
  clientName: string;
  clientCapabilities: Record<string, unknown>;
}

/**
 * A task session for a modern connection whose server declares the Tasks
 * extension. The endpoint ID ties stored task references to the server, its
 * config and the signed-in principal, so a reference never reaches another one.
 */
export async function createTaskSession(input: TaskSessionInput): Promise<TaskEnabledSession | undefined> {
  const { client } = input;
  if (client.getProtocolEra() !== 'modern') return undefined;
  if (!(MCP_TASKS_EXTENSION in (client.getServerCapabilities()?.extensions ?? {}))) return undefined;
  const endpointId = await createTaskSessionEndpointId('sero-mcp', {
    serverName: input.serverName,
    configHash: input.configHash,
    principalId: input.principalId,
  });
  return createTaskSessionFromClient(client, {
    endpointId,
    rawDispatch: createRawDispatch(input.transport),
    v2RequestFraming: {
      protocolVersion: client.getNegotiatedProtocolVersion() ?? '2026-07-28',
      clientInfo: { name: input.clientName, version: '0.1.0' },
      clientCapabilities: toJsonObject(input.clientCapabilities),
    },
    onInputRequest: (request, context) => answerTaskInput(input.serverName, request, context),
  });
}

async function answerTaskInput<TRequest extends ApplicationInputRequest>(
  serverName: string,
  request: TRequest,
  context: ResolvedInputExchangeContext,
): Promise<ApplicationInputResult<TRequest>> {
  if (request.kind !== 'elicitation' || !isSpecType.ElicitRequestParams(request.params)) {
    // Sero declares neither sampling nor roots.
    throw new Error(`Sero does not answer ${request.kind} requests.`);
  }
  const answer = await answerElicitation(serverName, request.params, context.signal ?? new AbortController().signal);
  const result: ApplicationElicitResult = {
    action: answer.action,
    ...(answer.content ? { content: pickElicitContent(answer.content) } : {}),
  };
  // TRequest is the elicitation kind here, so its result type is ApplicationElicitResult.
  return result as ApplicationInputResult<TRequest>;
}

function pickElicitContent(content: Record<string, unknown>): Record<string, string | number | boolean | string[]> {
  const picked: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of Object.entries(content)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') picked[key] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) picked[key] = value;
  }
  return picked;
}

/**
 * The SDK Client codecs reject 2026-07-28 task results, so ext-tasks sends
 * `tools/call` and `tasks/*` requests through this function. It sends each
 * request on the connected transport with its own ID and takes the reply
 * before the Client sees it. It also raises a suggested poll interval to
 * the one-second floor.
 */
export function createRawDispatch(transport: Transport): RawClientDispatch {
  const waiting = new Map<string, (message: JSONRPCMessage) => void>();
  let nextId = 0;
  const forward = transport.onmessage;
  transport.onmessage = (message, extra) => {
    if ('id' in message && typeof message.id === 'string' && !('method' in message)) {
      const resolve = waiting.get(message.id);
      if (resolve) {
        waiting.delete(message.id);
        resolve(message);
        return;
      }
    }
    forward?.(message, extra);
  };

  return async (request, options = {}) => {
    const id = `sero-task-${++nextId}`;
    const reply = new Promise<JSONRPCMessage>((resolve, reject) => {
      waiting.set(id, resolve);
      options.signal?.addEventListener('abort', () => {
        waiting.delete(id);
        reject(options.signal?.reason);
      }, { once: true });
    });
    try {
      // ext-tasks builds a JSON-RPC request without an ID; the ID here routes the reply back.
      await transport.send({ ...toJsonObject(request), jsonrpc: '2.0', id } as JSONRPCMessage);
    } catch (error) {
      waiting.delete(id);
      throw error;
    }
    const response = await reply;
    if ('error' in response) {
      return { kind: 'error', error: { code: response.error.code, message: response.error.message } };
    }
    if ('result' in response) {
      return { kind: 'result', result: withPollFloor(toJsonObject(response.result)) };
    }
    return { kind: 'error', error: { code: -32603, message: 'The server sent a reply without a result.' } };
  };
}

type JsonObject = { readonly [key: string]: JsonValue };

function withPollFloor(result: JsonObject): JsonObject {
  if (typeof result.taskId !== 'string') return result;
  const suggested = typeof result.pollIntervalMs === 'number' ? result.pollIntervalMs : 0;
  return { ...result, pollIntervalMs: Math.max(MIN_TASK_POLL_MS, suggested) };
}

function toJsonObject(value: unknown): JsonObject {
  const json = toJsonValue(value);
  return json !== null && typeof json === 'object' && !Array.isArray(json) ? json as JsonObject : {};
}

export type TaskToolExecution = Extract<
  Awaited<ReturnType<TaskEnabledSession['callTool']>>,
  { kind: 'task' }
>;

/** The start of a tool call on a Tasks server: a result now, or a task to follow. */
export type ToolCallStart =
  | { kind: 'result'; result: CallToolResult }
  | { kind: 'task'; execution: TaskToolExecution };

/**
 * Calls a tool through the task session. The server decides whether the call
 * becomes a task. An immediate call is settled here, so its caller gets the
 * result as from `client.callTool`.
 */
export async function startTaskSessionToolCall(
  session: TaskEnabledSession,
  toolName: string,
  toolArguments: Record<string, unknown> | undefined,
  signal?: AbortSignal,
): Promise<ToolCallStart> {
  const execution = await session.callTool(toolName, toJsonObject(toolArguments ?? {}), {
    task: { preference: 'allow' },
    ...(signal ? { signal } : {}),
  });
  if (execution.kind === 'task') return { kind: 'task', execution };
  const { outcome } = await execution.settle(signal ? { signal } : {});
  return { kind: 'result', result: toCallToolResult(resultFromTaskOutcome(outcome)) };
}

/** A task or tool result in the SDK's CallToolResult shape. */
export function toCallToolResult(value: unknown): CallToolResult {
  // The guard accepts a result without `content`, because the schema defaults it to [].
  if (isSpecType.CallToolResult(value)) return { ...value, content: value.content ?? [] };
  throw new Error('The server sent a tool result that is not valid.');
}
