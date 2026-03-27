/**
 * State for the Resources app — minimal UI metadata only.
 * Agent content lives in ~/.sero-ui/agent/agents/*.md files,
 * skill content lives in ~/.sero-ui/agent/skills/<name>/SKILL.md,
 * both read/written via IPC.
 */

export interface ResourcesAppState {
  /** Active tab. */
  activeTab: 'agents' | 'skills';
  /** Currently selected agent name (null = none). */
  selectedAgent: string | null;
  /** Currently selected skill name (null = none). */
  selectedSkill: string | null;
}

export const DEFAULT_STATE: ResourcesAppState = {
  activeTab: 'agents',
  selectedAgent: null,
  selectedSkill: null,
};
