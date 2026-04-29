// ── Agent types ──────────────────────────────────────────────

export interface StructuredAgentModel {
  prefer: string;
  fallbacks: string[];
}

export type AgentModelConfig = string | StructuredAgentModel;

/** Agent summary (from listAgents IPC). */
export interface AgentSummary {
  name: string;
  description: string;
  model?: AgentModelConfig;
  thinking?: string;
  timeoutMs?: number;
}

/** Full agent file data (from readAgent IPC). */
export interface AgentFileData {
  name: string;
  description: string;
  model?: AgentModelConfig;
  thinking?: string;
  timeoutMs?: number;
  tools?: string[];
  systemPrompt: string;
}

// ── Skill types ──────────────────────────────────────────────

/** Skill source — matches the SDK's source identifiers. */
export type SkillSource = 'user' | 'project' | 'path';

/** Skill summary (from listSkills IPC — mirrors SDK Skill). */
export interface SkillSummary {
  name: string;
  description: string;
  filePath: string;
  source: SkillSource;
}

/** Full skill file data (from readSkill IPC). */
export interface SkillFileData {
  name: string;
  description: string;
  extraFrontmatter: Record<string, unknown>;
  /** Absolute path — set for existing skills, absent for new. */
  filePath?: string;
  body: string;
}

// ── Prompt template types ────────────────────────────────────

/** Summary of a discovered prompt template (for list view). */
export interface PromptTemplateSummary {
  name: string;
  description: string;
  filePath: string;
  relativePath: string;
}

/** Full prompt template data for editing. */
export interface PromptTemplateFileData {
  name: string;
  description: string;
  filePath?: string;
  body: string;
}

