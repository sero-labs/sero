/** Renderer-safe subagent surface for background app runtimes. */

import type { ContextAgentInfo, ContextSkillInfo, ContextToolInfo } from './context-editor';

export interface AppRuntimeSubagentRepair {
  maxAttempts: number;
  validate: (reply: string) => string | null;
}

export interface AppRuntimeSubagentRunParams {
  agent?: string;
  task: string;
  model?: string;
  thinking?: string;
  repair?: AppRuntimeSubagentRepair;
  timeoutMs?: number;
  systemPrompt?: string;
  systemPromptOverride?: string;
  appendSystemPrompt?: string[];
  parentSessionId: string;
  workspaceId: string;
  cwd?: string;
  isolated?: boolean;
  customTools?: unknown[];
  tools?: string[];
  disabledTools?: string[];
  disabledSkills?: string[];
  onUpdate?: (text: string) => void;
  platformTools?: 'all' | 'readOnly' | 'none';
  signal?: AbortSignal;
}

export interface AppRuntimeSubagentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface AppRuntimeSubagentResult {
  response: string;
  error?: string;
  modelId?: string;
  providerId?: string;
  durationMs?: number;
  usage?: AppRuntimeSubagentUsage;
}

export interface AppRuntimeSubagentsApi {
  runStructured(params: AppRuntimeSubagentRunParams): Promise<AppRuntimeSubagentResult>;
  onLiveOutput(
    workspaceId: string,
    parentSessionId: string,
    cb: (agentName: string, text: string) => void,
  ): () => void;
  listToolCatalog(workspaceId: string): Promise<ContextToolInfo[]>;
  listSkillCatalog(workspaceId: string): Promise<ContextSkillInfo[]>;
  listAgentCatalog(workspaceId: string): Promise<ContextAgentInfo[]>;
}
