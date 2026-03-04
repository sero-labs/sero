/** Minimal window.sero type declaration for the Resources app. */

// ── Agent types ──────────────────────────────────────────────

interface AgentSummaryIPC {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
}

interface AgentFileDataIPC {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  tools?: string[];
  systemPrompt: string;
}

interface SeroSubagentBridge {
  listAgents(): Promise<AgentSummaryIPC[]>;
  readAgent(name: string): Promise<AgentFileDataIPC>;
  writeAgent(data: AgentFileDataIPC): Promise<void>;
  deleteAgent(name: string): Promise<void>;
}

// ── Skill types (mirrors SDK Skill / SkillFrontmatter) ───────

interface SkillSummaryIPC {
  name: string;
  description: string;
  filePath: string;
  source: string;
}

interface SkillFileDataIPC {
  name: string;
  description: string;
  extraFrontmatter: Record<string, unknown>;
  filePath?: string;
  body: string;
}

interface SeroSkillsBridge {
  listSkills(): Promise<SkillSummaryIPC[]>;
  readSkill(filePath: string): Promise<SkillFileDataIPC>;
  writeSkill(data: SkillFileDataIPC): Promise<void>;
  deleteSkill(filePath: string): Promise<void>;
}

// ── Window declaration ───────────────────────────────────────

interface Window {
  sero: {
    subagent: SeroSubagentBridge;
    skills: SeroSkillsBridge;
  };
}
