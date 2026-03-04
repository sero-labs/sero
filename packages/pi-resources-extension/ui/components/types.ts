// ── Agent types ──────────────────────────────────────────────

/** Agent summary (from listAgents IPC). */
export interface AgentSummary {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
}

/** Full agent file data (from readAgent IPC). */
export interface AgentFileData {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  tools?: string[];
  systemPrompt: string;
}

// ── Skill types ──────────────────────────────────────────────

/** Skill summary (from listSkills IPC — mirrors SDK Skill). */
export interface SkillSummary {
  name: string;
  description: string;
  filePath: string;
  source: string;
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

// ── Shared types ─────────────────────────────────────────────

/** Which resource tab is active. */
export type ResourceTab = 'agents' | 'skills';
