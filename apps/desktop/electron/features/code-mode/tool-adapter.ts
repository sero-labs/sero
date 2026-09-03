import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
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

async function invokeTool(
  tool: AgentTool,
  input: unknown,
  trace: NestedCallTrace,
): Promise<NormalizedToolResult> {
  const context = getHostFunctionContext();
  const callId = `run_code_${context.requestId}`;
  const startedAt = performance.now();
  try {
    const params = nestedArguments(tool, input, callId);
    const result = await tool.execute(callId, params, context.abortSignal);
    trace.record({
      tool: tool.name,
      status: 'completed',
      durationMs: Math.round(performance.now() - startedAt),
    });
    return normalizeToolResult(result);
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
): Record<string, ToolHostFunction> {
  const hostFunctions: Record<string, ToolHostFunction> = {
    call: async (input) => {
      const { name, args } = dispatcherArguments(input);
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool '${name}' is not active in this session.`);
      return invokeTool(tool, args, trace);
    },
  };

  for (const [name, tool] of tools) {
    if (canExposeDirectly(name)) {
      hostFunctions[name] = async (input) => invokeTool(tool, input, trace);
    }
  }
  return hostFunctions;
}
