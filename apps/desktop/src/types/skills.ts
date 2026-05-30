/**
 * Skill IPC types — shared by Electron main process and renderer.
 *
 * Based on the Pi SDK's `Skill` and `SkillFrontmatter` types from
 * `@earendil-works/pi-coding-agent/core/skills`.
 */

/** Skill source — matches the SDK's source identifiers. */
export type SkillSource = 'user' | 'project' | 'path';

/** Summary of a discovered user skill (renderer-safe subset of SDK Skill). */
export interface SkillSummary {
  name: string;
  description: string;
  /** Absolute path to the SKILL.md file. */
  filePath: string;
  /** Where the skill was discovered from. */
  source: SkillSource;
}

/** Summary of every globally available skill loaded by Sero. */
export interface AvailableSkillSummary {
  name: string;
  description: string;
  /** Source identifier from the SDK (user, project, package path, etc.). */
  source: string;
  /** True when the skill itself disables automatic model invocation. */
  disableModelInvocation: boolean;
}

/**
 * Full skill data for editing (frontmatter + body from SKILL.md).
 *
 * `filePath` is set for existing skills (from readSkill) and absent
 * for brand-new skills (writeSkill creates at SKILLS_DIR/<name>/).
 */
export interface SkillFileData {
  name: string;
  description: string;
  /** Extra frontmatter fields (license, compatibility, allowed-tools, etc.) */
  extraFrontmatter: Record<string, unknown>;
  /** Absolute path to the SKILL.md file — set for existing, absent for new. */
  filePath?: string;
  /** Markdown body after the frontmatter. */
  body: string;
}
