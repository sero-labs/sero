/**
 * Promptfoo assertion helper — file-edit batching metrics.
 *
 * Reads the arguments and results of every recorded tool call and reports:
 * replacements per call, consecutive same-file edit runs, calls by tool name,
 * result tokens, latency, and failure count.
 *
 * Usage in a scenario YAML:
 *   - type: javascript
 *     value: file://./eval/assertions/editBatching.ts
 *     config:
 *       minReplacementsPerCall: 2
 *
 * For file-based JS assertions, promptfoo calls the default export as:
 *   (output: string, context: { vars, test, providerResponse, ... })
 * Metadata lives at context.providerResponse.metadata.
 */

interface RecordedToolCall {
  name: string;
  args: Record<string, unknown>;
  durationMs?: number;
  isError?: boolean;
  resultText?: string;
  resultTokensEstimate?: number;
}

interface AssertionConfig {
  /** Minimum average replacement count per edit call for a pass. Default 1. */
  minReplacementsPerCall?: number;
  /** Maximum share of edit calls that sit in same-file runs of three or more. */
  maxLongRunShare?: number;
}

interface PromptfooContext {
  config?: AssertionConfig;
  test?: { options?: { config?: AssertionConfig } };
  providerResponse?: {
    metadata?: {
      toolCalls?: RecordedToolCall[];
      latencyMs?: number;
    };
  };
}

interface AssertionResult {
  pass: boolean;
  score: number;
  reason: string;
}

function getConfig(context: PromptfooContext): AssertionConfig {
  return context.config ?? context.test?.options?.config ?? {};
}

function readPath(args: Record<string, unknown>): string {
  return typeof args.path === 'string' ? args.path : '<unknown>';
}

function replacementCount(args: Record<string, unknown>): number {
  if (Array.isArray(args.edits)) {
    return args.edits.filter((entry) => entry && typeof entry === 'object').length;
  }
  if (typeof args.oldText === 'string' && typeof args.newText === 'string') return 1;
  return 0;
}

function addCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export default function editBatchingAssert(
  output: string,
  context: PromptfooContext,
): AssertionResult {
  void output;
  const meta = context.providerResponse?.metadata ?? {};
  const calls = meta.toolCalls ?? [];
  const config = getConfig(context);

  const callsByTool: Record<string, number> = {};
  let editCalls = 0;
  let editReplacements = 0;
  let failureCount = 0;
  let resultTokens = 0;

  for (const call of calls) {
    addCount(callsByTool, call.name);
    resultTokens += call.resultTokensEstimate ?? 0;
    if (call.isError) failureCount += 1;
    if (call.name === 'edit') {
      editCalls += 1;
      editReplacements += replacementCount(call.args ?? {});
    }
  }

  // Consecutive same-file edit runs.
  let editCallsInLongRuns = 0;
  let index = 0;
  while (index < calls.length) {
    if (calls[index].name !== 'edit') {
      index += 1;
      continue;
    }
    const path = readPath(calls[index].args ?? {});
    let end = index;
    while (
      end + 1 < calls.length
      && calls[end + 1].name === 'edit'
      && readPath(calls[end + 1].args ?? {}) === path
    ) {
      end += 1;
    }
    const runLength = end - index + 1;
    if (runLength >= 3) editCallsInLongRuns += runLength;
    index = end + 1;
  }

  const replacementsPerCall = editCalls === 0 ? 0 : editReplacements / editCalls;
  const longRunShare = editCalls === 0 ? 0 : editCallsInLongRuns / editCalls;
  const minReplacements = config.minReplacementsPerCall ?? 1;
  const maxLongRunShare = config.maxLongRunShare ?? 1;

  const failures: string[] = [];
  if (replacementsPerCall < minReplacements) {
    failures.push(
      `replacements per edit call ${replacementsPerCall.toFixed(2)} is below ${minReplacements}`,
    );
  }
  if (longRunShare > maxLongRunShare) {
    failures.push(
      `long-run edit share ${longRunShare.toFixed(2)} is above ${maxLongRunShare}`,
    );
  }

  const latencyMs = meta.latencyMs ?? 0;
  const reason = [
    `replacementsPerCall=${replacementsPerCall.toFixed(2)}`,
    `editCalls=${editCalls}`,
    `editCallsInRunsOfThreeOrMore=${editCallsInLongRuns}`,
    `longRunShare=${longRunShare.toFixed(2)}`,
    `totalToolCalls=${calls.length}`,
    `callsByTool=${JSON.stringify(callsByTool)}`,
    `resultTokens=${resultTokens}`,
    `latencyMs=${latencyMs}`,
    `failureCount=${failureCount}`,
    ...(failures.length > 0 ? [`failures=${failures.join('; ')}`] : []),
  ].join(' ');

  const pass = failures.length === 0;
  return { pass, score: pass ? 1 : 0, reason };
}
