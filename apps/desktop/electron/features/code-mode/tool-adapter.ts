import type {
  AfterToolCallContext,
  AfterToolCallResult,
  AgentContext,
  AgentTool,
  AgentToolCall,
  AgentToolResult,
  BeforeToolCallContext,
  BeforeToolCallResult,
} from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { validateToolArguments } from '@earendil-works/pi-ai';
import { getHostFunctionContext } from 'run';

import { NestedCallTrace } from '@electron/features/code-mode/trace';

export const RUN_CODE_TOOL_NAME = 'run_code';

export interface NormalizedToolImage {
  data: string;
  mimeType: string;
}

export interface NormalizedToolResult {
  text: string;
  details?: unknown;
  images?: NormalizedToolImage[];
}

type ToolHostFunction = (input: unknown) => Promise<NormalizedToolResult>;

export interface NestedToolCallHooks {
  assistantMessage: AssistantMessage;
  context: AgentContext;
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>;
  afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallResult | undefined>;
}

const HOST_FUNCTION_IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;
const RESERVED_HOST_FUNCTION_NAMES = new Set(['__proto__', 'constructor', 'prototype', 'then', 'call']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nestedArguments(tool: AgentTool, input: unknown, callId: string): Record<string, unknown> {
  const prepared = tool.prepareArguments ? tool.prepareArguments(input) : input;
  if (!isRecord(prepared)) {
    throw new Error(`Tool '${tool.name}' expects one object argument.`);
  }

  return validateToolArguments(tool, {
    type: 'toolCall',
    id: callId,
    name: tool.name,
    arguments: prepared,
  });
}

type SerializableDetails = object | string | number | boolean | bigint | null;

function serializableDetails(details: unknown): SerializableDetails | undefined {
  if (details === undefined) return undefined;
  try {
    if (details === null || typeof details === 'object') return structuredClone(details);
    if (typeof details === 'string' || typeof details === 'number' || typeof details === 'boolean' || typeof details === 'bigint') {
      return details;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function normalizeToolResult(result: AgentToolResult<unknown>): NormalizedToolResult {
  const textParts: string[] = [];
  const images: NormalizedToolImage[] = [];
  for (const item of result.content) {
    if (item.type === 'text') textParts.push(item.text);
    else images.push({ data: item.data, mimeType: item.mimeType });
  }
  const details = serializableDetails(result.details);
  const normalized: NormalizedToolResult = { text: textParts.join('\n') };
  if (details !== undefined) normalized.details = details;
  if (images.length > 0) normalized.images = images;
  return normalized;
}

export function snapshotActiveTools(tools: readonly AgentTool[]): Map<string, AgentTool> {
  const snapshot = new Map<string, AgentTool>();
  for (const tool of tools) {
    if (tool.name !== RUN_CODE_TOOL_NAME) snapshot.set(tool.name, tool);
  }
  return snapshot;
}

function canExposeDirectly(name: string): boolean {
  return HOST_FUNCTION_IDENTIFIER.test(name)
    && !name.startsWith('__run')
    && !RESERVED_HOST_FUNCTION_NAMES.has(name);
}

function errorResult(error: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
    details: {},
  };
}

function applyAfterToolCall(
  result: AgentToolResult<unknown>,
  override: AfterToolCallResult | undefined,
): { result: AgentToolResult<unknown>; isError?: boolean } {
  if (!override) return { result };
  return {
    result: {
      ...result,
      content: override.content ?? result.content,
      details: override.details ?? result.details,
      usage: override.usage ?? result.usage,
      terminate: override.terminate ?? result.terminate,
    },
    isError: override.isError,
  };
}

function toolErrorMessage(result: AgentToolResult<unknown>): string {
  const text = result.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
  return text || 'Nested tool call failed.';
}

async function invokeTool(
  tool: AgentTool,
  input: unknown,
  trace: NestedCallTrace,
  hooks?: NestedToolCallHooks,
): Promise<NormalizedToolResult> {
  const context = getHostFunctionContext();
  const callId = `run_code_${context.requestId}`;
  const startedAt = performance.now();
  try {
    const params = nestedArguments(tool, input, callId);
    const toolCall = {
      type: 'toolCall',
      id: callId,
      name: tool.name,
      arguments: params,
    } satisfies AgentToolCall;
    const beforeResult = await hooks?.beforeToolCall?.({
      assistantMessage: hooks.assistantMessage,
      toolCall,
      args: params,
      context: hooks.context,
    }, context.abortSignal);
    context.abortSignal.throwIfAborted();
    if (beforeResult?.block) {
      throw new Error(beforeResult.reason || 'Tool execution was blocked');
    }

    let result: AgentToolResult<unknown>;
    let isError = false;
    try {
      result = await tool.execute(callId, params, context.abortSignal);
    } catch (error) {
      result = errorResult(error);
      isError = true;
    }

    const afterResult = await hooks?.afterToolCall?.({
      assistantMessage: hooks.assistantMessage,
      toolCall,
      args: params,
      result,
      isError,
      context: hooks.context,
    }, context.abortSignal);
    const finalized = applyAfterToolCall(result, afterResult);
    isError = finalized.isError ?? isError;
    if (isError) throw new Error(toolErrorMessage(finalized.result));

    trace.record({
      tool: tool.name,
      status: 'completed',
      durationMs: Math.round(performance.now() - startedAt),
    });
    return normalizeToolResult(finalized.result);
  } catch (error) {
    trace.record({
      tool: tool.name,
      status: 'failed',
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  }
}

function dispatcherArguments(input: unknown): { name: string; args: unknown } {
  if (!isRecord(input) || typeof input.name !== 'string' || !Object.hasOwn(input, 'args')) {
    throw new Error("tools.call expects { name: 'tool-name', args: { ... } }.");
  }
  return { name: input.name, args: input.args };
}

export function createToolHostFunctions(
  tools: ReadonlyMap<string, AgentTool>,
  trace: NestedCallTrace,
  hooks?: NestedToolCallHooks,
): Record<string, ToolHostFunction> {
  const hostFunctions: Record<string, ToolHostFunction> = {
    call: async (input) => {
      const { name, args } = dispatcherArguments(input);
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool '${name}' is not active in this session.`);
      return invokeTool(tool, args, trace, hooks);
    },
  };

  for (const [name, tool] of tools) {
    if (canExposeDirectly(name)) {
      hostFunctions[name] = async (input) => invokeTool(tool, input, trace, hooks);
    }
  }
  return hostFunctions;
}
