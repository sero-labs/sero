import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentToolResult, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { inspect } from 'node:util';
import { Type } from 'typebox';
import { Value } from 'typebox/value';

import { executeProgram, ProgramExecutionError } from '@electron/features/code-mode/program-runner';
import { RUN_CODE_TOOL_NAME, snapshotActiveTools } from '@electron/features/code-mode/tool-adapter';
import type { NestedCallTraceSummary } from '@electron/features/code-mode/trace';

const RunCodeParams = Type.Object({
  code: Type.String({
    description: 'JavaScript or type-stripped TypeScript function-body source. Top-level await and return are supported.',
  }),
});

export interface RunCodeDetails {
  value?: unknown;
  calls: NestedCallTraceSummary;
}

export interface RunCodeController {
  tool: ToolDefinition;
  bind(getActiveTools: () => readonly AgentTool[]): void;
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  return inspect(value, { depth: 10, maxArrayLength: 100, maxStringLength: 100_000 });
}

function formatTrace(trace: NestedCallTraceSummary): string {
  const completed = trace.calls.filter((call) => call.status === 'completed').length;
  const failed = trace.calls.filter((call) => call.status === 'failed').length;
  const omitted = trace.omitted.reduce((total, item) => total + item.count, 0);
  return `${completed} completed, ${failed} failed${omitted === 0 ? '' : `, ${omitted} omitted`}`;
}

export function createRunCodeController(): RunCodeController {
  let activeTools: (() => readonly AgentTool[]) | undefined;
  const tool: ToolDefinition = {
    name: RUN_CODE_TOOL_NAME,
    label: 'run code',
    description:
      'Use this as the primary tool for multi-step work that can use available tools and JavaScript. Prefer it over bash, Python, jq, or several direct tool calls when reading multiple files, querying multiple tools, parsing structured data, filtering, grouping, sorting, joining, aggregating, looping, branching, or running calls concurrently. ' +
      'Complete the whole workflow in one run_code program: make every required tool call, process the results, and return the final requested value. Do not use run_code only for discovery and then switch to direct tools or shell commands. ' +
      'Relative paths already resolve from the active workspace, so call tools.read directly for known workspace files without first querying access roots. ' +
      'Available session tools are async functions on the global tools object and take the same single object argument as direct calls. ' +
      "For a tool name that is not a JavaScript identifier, call tools.call({ name: 'sero-cli', args: { ... } }). " +
      'Tool results expose text directly as result.text. For example, read known files with Promise.all, parse each result.text, compute the answer, and return it. Use direct tools only for one simple operation. ' +
      'No imports, Node.js, filesystem, environment, or network APIs are available except through tools.',
    parameters: RunCodeParams,
    async execute(
      _toolCallId,
      params,
      signal,
    ): Promise<AgentToolResult<RunCodeDetails>> {
      if (!activeTools) throw new Error('run_code is not bound to an agent session.');
      Value.Assert(RunCodeParams, params);
      const tools = snapshotActiveTools(activeTools());
      try {
        const result = await executeProgram(params.code, tools, signal);
        return {
          content: [{
            type: 'text',
            text: `${formatValue(result.value)}\n\nNested calls: ${formatTrace(result.trace)}`,
          }],
          details: { value: result.value, calls: result.trace },
        };
      } catch (error) {
        if (error instanceof ProgramExecutionError) {
          throw new Error(`Code execution failed: ${error.message}\nNested calls: ${formatTrace(error.trace)}`);
        }
        throw error;
      }
    },
  };

  return {
    tool,
    bind(getActiveTools): void {
      activeTools = getActiveTools;
    },
  };
}
