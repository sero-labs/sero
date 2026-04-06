/**
 * Subagent IPC types — shared by Electron main process and renderer.
 *
 * Extracted from ipc.ts to keep it under 500 LOC.
 */

/** Summary of a discovered agent (renderer-safe). */
export interface SubagentAgentSummary {
  name: string;
  description: string;
  model?: SubagentModelConfig;
  thinking?: string;
  timeoutMs?: number;
}

/** Structured model field supported in subagent frontmatter. */
export interface StructuredSubagentModelField {
  prefer: string;
  fallbacks: string[];
}

/** Plain string model ID/tier alias, or structured prefer+fallbacks config. */
export type SubagentModelConfig = string | StructuredSubagentModelField;

/** Full agent data for editing (includes system prompt body). */
export interface SubagentAgentFile {
  name: string;
  description: string;
  model?: SubagentModelConfig;
  thinking?: string;
  timeoutMs?: number;
  tools?: string[];
  systemPrompt: string;
}

/** Subagent status union. */
export type SubagentStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'timed_out';

/** Subagent execution mode. */
export type SubagentMode = 'single' | 'parallel' | 'chain';

/** Token and cost usage for a subagent run. */
export interface SubagentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
}

/** Tool activity item for live tool feed. */
export interface SubagentToolActivity {
  toolName: string;
  argsSummary: string;
  running: boolean;
}

/** Renderer-safe subagent entry. */
export interface SubagentEntry {
  id: string;
  agentName: string;
  taskPreview: string;
  status: SubagentStatus;
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  parentSessionId: string;
  workspaceId: string;
  mode: SubagentMode;
  chainStep?: number;
  usage: SubagentUsage;
  model: string | null;
  toolActivity: SubagentToolActivity[];
  liveOutput: string;
  responsePreview?: string;
  fullResponse?: string;
  error?: string;
}

/** Events pushed from main → renderer for subagent lifecycle. */
export type SubagentEvent =
  | { type: 'subagent_start'; entry: SubagentEntry }
  | { type: 'subagent_progress'; id: string; usage: Partial<SubagentUsage> }
  | { type: 'subagent_tool_activity'; id: string; activity: SubagentToolActivity[] }
  | { type: 'subagent_live_output'; id: string; text: string }
  | {
      type: 'subagent_end';
      id: string;
      status: SubagentStatus;
      response?: string;
      error?: string;
      usage: SubagentUsage;
      durationMs: number;
    }
  | { type: 'subagent_clear'; parentSessionId: string };
