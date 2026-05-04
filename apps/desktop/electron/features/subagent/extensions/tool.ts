/**
 * `subagent` and `create_agent` tool definitions.
 *
 * Registered as standalone tools via pi.registerTool() — deliberate
 * exception to AD-020 for structured nested params.
 *
 * Uses TypeBox schemas (required by pi.registerTool) and the SDK's
 * execute(toolCallId, params, signal, onUpdate, ctx) signature.
 */

import { writeFile, readdir, mkdir } from 'fs/promises';
import path from 'path';
import { Type } from 'typebox';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@mariozechner/pi-agent-core';
import type { SubagentManager } from '..';
import { SERO_AGENT_DIR } from '@electron/platform/env';

const AGENTS_DIR = path.join(SERO_AGENT_DIR, 'agents');

// ── Subagent Tool Schema ─────────────────────────────────────

const TaskItemSchema = Type.Object({
  agent: Type.String({ description: 'Agent name' }),
  task: Type.String({ description: 'Task prompt' }),
  model: Type.Optional(Type.String({ description: 'Model override' })),
  thinking: Type.Optional(Type.String({ description: 'Thinking level override' })),
  timeoutMs: Type.Optional(Type.Number({ description: 'Timeout in ms' })),
});

const SubagentParams = Type.Object({
  agent: Type.Optional(Type.String({
    description: 'Agent name (from ~/.sero-ui/agent/agents/*.md) for single mode',
  })),
  task: Type.Optional(Type.String({
    description: 'Task prompt for single mode',
  })),
  tasks: Type.Optional(Type.Array(TaskItemSchema, {
    description: 'Array of independent tasks for parallel execution',
  })),
  chain: Type.Optional(Type.Array(TaskItemSchema, {
    description: 'Sequential pipeline. Use {previous} for prior step output.',
  })),
  model: Type.Optional(Type.String({ description: 'Model override for all subagents' })),
  thinking: Type.Optional(Type.String({ description: 'Thinking level override' })),
  timeoutMs: Type.Optional(Type.Number({ description: 'Timeout override in ms' })),
  systemPrompt: Type.Optional(Type.String({
    description: 'Inline system prompt for ad-hoc tasks (no .md lookup needed)',
  })),
});

/**
 * Register the `subagent` tool on the given extension API.
 */
export function registerSubagentTool(
  pi: ExtensionAPI,
  manager: SubagentManager,
  parentSessionId: string,
  workspaceId: string,
): void {
  pi.registerTool({
    name: 'subagent',
    label: 'Subagent',
    description:
      'Delegate tasks to specialist subagents. Modes: single (agent + task), ' +
      'parallel (tasks array), chain (sequential with {previous} placeholder).',
    parameters: SubagentParams,

    async execute(_toolCallId, params, _signal, onUpdate: AgentToolUpdateCallback | undefined, _ctx): Promise<AgentToolResult<undefined>> {
      // Wrap the SDK's onUpdate callback into a simple text callback for our helpers
      const textUpdate: OnUpdate = onUpdate
        ? (text: string) => onUpdate({ content: [{ type: 'text' as const, text }], details: undefined })
        : undefined;
      // Mode detection
      if (params.tasks && Array.isArray(params.tasks)) {
        return executeParallel(manager, params, parentSessionId, workspaceId, textUpdate);
      }
      if (params.chain && Array.isArray(params.chain)) {
        return executeChain(manager, params, parentSessionId, workspaceId, textUpdate);
      }
      return executeSingle(manager, params, parentSessionId, workspaceId, textUpdate);
    },
  });
}

type ToolResult = AgentToolResult<undefined>;
type OnUpdate = ((text: string) => void) | undefined;

async function executeSingle(
  manager: SubagentManager,
  p: Record<string, unknown>,
  parentSessionId: string,
  workspaceId: string,
  onUpdate: OnUpdate,
): Promise<ToolResult> {
  const task = p.task as string | undefined;
  const agent = p.agent as string | undefined;
  const systemPrompt = p.systemPrompt as string | undefined;

  if (!task) {
    return { content: [{ type: 'text', text: 'Error: "task" is required for single mode' }], details: undefined };
  }
  if (!agent && !systemPrompt) {
    return { content: [{ type: 'text', text: 'Error: either "agent" or "systemPrompt" is required' }], details: undefined };
  }

  const response = await manager.runSingle({
    agent,
    task,
    model: p.model as string | undefined,
    thinking: p.thinking as string | undefined,
    timeoutMs: p.timeoutMs as number | undefined,
    systemPrompt,
    parentSessionId,
    workspaceId,
    onUpdate,
  });

  return { content: [{ type: 'text', text: response }], details: undefined };
}

async function executeParallel(
  manager: SubagentManager,
  p: Record<string, unknown>,
  parentSessionId: string,
  workspaceId: string,
  onUpdate: OnUpdate,
): Promise<ToolResult> {
  const tasks = p.tasks as Array<{ agent: string; task: string; model?: string; thinking?: string; timeoutMs?: number }>;

  const response = await manager.runParallel({
    tasks,
    model: p.model as string | undefined,
    thinking: p.thinking as string | undefined,
    timeoutMs: p.timeoutMs as number | undefined,
    parentSessionId,
    workspaceId,
    onUpdate,
  });

  return { content: [{ type: 'text', text: response }], details: undefined };
}

async function executeChain(
  manager: SubagentManager,
  p: Record<string, unknown>,
  parentSessionId: string,
  workspaceId: string,
  onUpdate: OnUpdate,
): Promise<ToolResult> {
  const chain = p.chain as Array<{ agent: string; task: string; model?: string; thinking?: string; timeoutMs?: number }>;

  const response = await manager.runChain({
    chain,
    model: p.model as string | undefined,
    thinking: p.thinking as string | undefined,
    timeoutMs: p.timeoutMs as number | undefined,
    parentSessionId,
    workspaceId,
    onUpdate,
  });

  return { content: [{ type: 'text', text: response }], details: undefined };
}

// ── create_agent Tool ────────────────────────────────────────

const VALID_NAME_RE = /^[a-z0-9-]+$/;

const CreateAgentParams = Type.Object({
  name: Type.String({ description: 'Agent name (lowercase alphanumeric + hyphens)' }),
  description: Type.String({ description: 'What this agent does' }),
  systemPrompt: Type.String({ description: 'System prompt body' }),
  model: Type.Optional(Type.String({ description: 'Default model' })),
  thinking: Type.Optional(Type.String({ description: 'Thinking level' })),
  timeoutMs: Type.Optional(Type.Number({ description: 'Default timeout in ms' })),
});

/**
 * Register the `create_agent` tool on the given extension API.
 */
export function registerCreateAgentTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'create_agent',
    label: 'Create Agent',
    description: 'Create a new named agent definition (.md file with JSON frontmatter).',
    parameters: CreateAgentParams,

    async execute(_toolCallId, params, _signal, _onUpdate: AgentToolUpdateCallback | undefined, _ctx): Promise<AgentToolResult<undefined>> {
      const { name, description, systemPrompt, model, thinking, timeoutMs } = params;

      // Validate name format
      if (!VALID_NAME_RE.test(name)) {
        return {
          content: [{ type: 'text', text: `Error: Invalid agent name '${name}'. Use only lowercase letters, numbers, and hyphens.` }],
          details: undefined,
        };
      }

      // Check for collision
      try {
        await mkdir(AGENTS_DIR, { recursive: true });
        const existing = await readdir(AGENTS_DIR);
        if (existing.includes(`${name}.md`)) {
          return {
            content: [{ type: 'text', text: `Error: Agent '${name}' already exists at ${path.join(AGENTS_DIR, name + '.md')}` }],
            details: undefined,
          };
        }
      } catch { /* directory will be created below */ }

      // Build frontmatter
      const fm: Record<string, unknown> = { name, description };
      if (model) fm.model = model;
      if (thinking) fm.thinking = thinking;
      if (timeoutMs) fm.timeoutMs = timeoutMs;

      const content = [
        '```json',
        JSON.stringify(fm, null, 2),
        '```',
        '',
        systemPrompt,
      ].join('\n');

      const filePath = path.join(AGENTS_DIR, `${name}.md`);
      await mkdir(AGENTS_DIR, { recursive: true });
      await writeFile(filePath, content, 'utf-8');

      return {
        content: [{ type: 'text', text: `Agent '${name}' created at ${filePath}` }],
        details: undefined,
      };
    },
  });
}
