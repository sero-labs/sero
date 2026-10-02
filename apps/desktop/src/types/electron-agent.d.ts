/**
 * Agent-specific `window.sero` interfaces: subagents, skills and prompts.
 *
 * Split from electron.d.ts to keep declaration files under 500 LOC.
 */

import type {
  SubagentEvent,
  SubagentAgentSummary,
  SubagentEntry,
  SubagentAgentFile,
  SkillCatalogue,
  SkillFileData,
  SkillSummary,
  AvailableSkillSummary,
  PromptTemplateSummary,
  PromptTemplateFileData,
} from './ipc';

interface SeroSubagentAPI {
  /** Subscribe to live subagent events. Returns unsubscribe function. */
  onEvent(callback: (event: SubagentEvent) => void): () => void;
  /**
   * Show this window a run's live text and tool activity.
   * Call one per visible live block, and unwatch when it closes.
   */
  watch(runId: string): Promise<void>;
  /** Release one watch for a run. */
  unwatch(runId: string): Promise<void>;
  /** List all discovered agents. */
  listAgents(): Promise<SubagentAgentSummary[]>;
  /** Get snapshot of all subagent entries for a workspace. */
  snapshot(workspaceId: string): Promise<SubagentEntry[]>;
  /** Abort a specific subagent run. */
  abort(subagentId: string): Promise<void>;
  /** Remove all completed/failed/aborted entries for a workspace from the main process. */
  clearCompleted(workspaceId: string): Promise<void>;
  /** Read full agent file data (including system prompt). */
  readAgent(name: string): Promise<SubagentAgentFile>;
  /** Create or update an agent .md file. */
  writeAgent(data: SubagentAgentFile): Promise<void>;
  /** Delete an agent .md file. */
  deleteAgent(name: string): Promise<void>;
}

interface SeroSkillsAPI {
  /** List editable user skills from ~/.sero-ui/agent/skills. */
  listSkills(): Promise<SkillSummary[]>;
  /** List all globally available skills loaded by Sero. */
  listAvailableSkills(): Promise<AvailableSkillSummary[]>;
  listCatalogue(): Promise<SkillCatalogue>;
  /** Persist the set of skills hidden from automatic model invocation. */
  setDisabledModelSkills(skillNames: string[]): Promise<void>;
  /** Read full skill data by absolute filePath (from listSkills). */
  readSkill(filePath: string): Promise<SkillFileData>;
  /** Create or update a skill's SKILL.md. Returns the written filePath. */
  writeSkill(data: SkillFileData): Promise<string>;
  /** Delete a skill directory by the absolute filePath of its SKILL.md. */
  deleteSkill(filePath: string): Promise<void>;
}

interface SeroPromptsAPI {
  /** List all discovered prompt templates (recursive under prompts/). */
  listPrompts(): Promise<PromptTemplateSummary[]>;
  /** Read full prompt template data by absolute filePath. */
  readPrompt(filePath: string): Promise<PromptTemplateFileData>;
  /** Create or update a prompt template. Returns the written filePath. */
  writePrompt(data: PromptTemplateFileData): Promise<string>;
  /** Delete a prompt template by its absolute filePath. */
  deletePrompt(filePath: string): Promise<void>;
}

export {};
