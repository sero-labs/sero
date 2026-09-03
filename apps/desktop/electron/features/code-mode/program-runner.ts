import { createRunner, type RunLimits } from 'run';

import {
  createToolHostFunctions,
  type NestedToolCallHooks,
} from '@electron/features/code-mode/tool-adapter';
import { NestedCallTrace, type NestedCallTraceSummary } from '@electron/features/code-mode/trace';
import type { AgentTool } from '@earendil-works/pi-agent-core';

export const PROGRAM_LIMITS = {
  timeoutMs: 30_000,
  memoryLimitBytes: 64 * 1024 * 1024,
  maxStackSizeBytes: 2 * 1024 * 1024,
  maxSourceBytes: 256 * 1024,
  maxResultBytes: 1024 * 1024,
  maxConsoleOutputBytes: 64 * 1024,
  maxHostFunctionArgumentsBytes: 1024 * 1024,
  maxHostFunctionOutputBytes: 4 * 1024 * 1024,
  maxBridgeRequests: 256,
  maxInFlightBridgeRequests: 32,
  maxContinuationBytes: 32 * 1024 * 1024,
} satisfies RunLimits;

export interface ProgramExecutionResult {
  value: unknown;
  trace: NestedCallTraceSummary;
}

export class ProgramExecutionError extends Error {
  constructor(message: string, readonly trace: NestedCallTraceSummary) {
    super(message);
    this.name = 'ProgramExecutionError';
  }
}

const runner = createRunner({ limits: PROGRAM_LIMITS });

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const guestFrame = error.stack
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => /^at run\.js:\d+:\d+$/.test(line));
  return guestFrame ? `${error.message}\n${guestFrame}` : error.message;
}

export async function executeProgram(
  source: string,
  tools: ReadonlyMap<string, AgentTool>,
  abortSignal?: AbortSignal,
  hooks?: NestedToolCallHooks,
): Promise<ProgramExecutionResult> {
  const trace = new NestedCallTrace();
  try {
    const result = await runner.run({
      source,
      abortSignal,
      hostFunctions: { tools: createToolHostFunctions(tools, trace, hooks) },
    });
    if (result.status !== 'completed') {
      throw new Error('Program interruption is not supported.');
    }
    return { value: result.value, trace: trace.summary() };
  } catch (error) {
    throw new ProgramExecutionError(errorMessage(error), trace.summary());
  }
}
