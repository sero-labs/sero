/**
 * Prompt template IPC types — shared by Electron main process and renderer.
 *
 * Prompt templates are markdown files with optional YAML frontmatter
 * (description field). They live at ~/.sero-ui/agent/prompts/ and can
 * be in subdirectories. The filename (minus .md) becomes the slash
 * command name (e.g. `review.md` → `/review`).
 */

/** Summary of a discovered prompt template (for the list view). */
export interface PromptTemplateSummary {
  /** Command name derived from file — e.g. "review". */
  name: string;
  /** From frontmatter `description`, or first non-empty line of body. */
  description: string;
  /** Absolute path to the .md file. */
  filePath: string;
  /**
   * Relative path from the prompts root, for display purposes.
   * e.g. "review.md" or "dan-test/PROMPT.md"
   */
  relativePath: string;
}

/**
 * Full prompt template data for editing.
 *
 * `filePath` is set for existing templates and absent for new ones.
 * On save, new templates are created at PROMPTS_DIR/<name>.md.
 */
export interface PromptTemplateFileData {
  /** Command name — becomes the /slash command. */
  name: string;
  /** Frontmatter description. */
  description: string;
  /** Absolute path — set for existing, absent for new. */
  filePath?: string;
  /** Markdown body after the frontmatter. */
  body: string;
}
