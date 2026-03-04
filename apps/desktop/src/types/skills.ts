/**
 * Skill IPC types — shared by Electron main process and renderer.
 *
 * Based on the Pi SDK's `Skill` and `SkillFrontmatter` types from
 * `@mariozechner/pi-coding-agent/core/skills`.
 */

/** Summary of a discovered skill (renderer-safe subset of SDK Skill). */
export interface SkillSummary {
  name: string;
  description: string;
  /** Absolute path to the SKILL.md file. */
  filePath: string;
  /** Source: 'user' | 'project' | 'path'. */
  source: string;
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
