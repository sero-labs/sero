/**
 * IPC handlers for prompt template CRUD.
 *
 * Prompt templates are markdown files with optional YAML frontmatter
 * (`description` field). They live at SERO_AGENT_DIR/prompts/ and can
 * be in subdirectories (e.g. `dan-test/PROMPT.md`).
 *
 * Discovery is recursive — any .md file under the prompts root is a
 * valid template. The filename (minus extension) becomes the command
 * name unless the file is named PROMPT.md, in which case the parent
 * directory name is used (mirroring the skill convention).
 */

import { ipcMain } from 'electron';
import { readFile, writeFile, mkdir, rm, rename, stat } from 'fs/promises';
import { readdirSync, statSync } from 'fs';
import path from 'path';
import { parseFrontmatter } from '@mariozechner/pi-coding-agent';
import { IpcChannels } from '../../src/types/ipc';
import { SERO_AGENT_DIR } from '../env';
import { reloadAllSessionResources } from './agent';
import type { PromptTemplateSummary, PromptTemplateFileData } from '../../src/types/prompts';

const PROMPTS_DIR = path.join(SERO_AGENT_DIR, 'prompts');

// ── Helpers ──────────────────────────────────────────────────

/** Validate that a filePath is under PROMPTS_DIR to prevent path traversal. */
function validatePromptPath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const root = path.resolve(PROMPTS_DIR);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Prompt path must be under ${PROMPTS_DIR}`);
  }
}

/** Valid prompt template name: lowercase, numbers, hyphens. */
const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Derive the command name from a file path:
 * - `review.md` → "review"
 * - `dan-test/PROMPT.md` → "dan-test"
 */
function nameFromPath(filePath: string): string {
  const basename = path.basename(filePath, '.md');
  if (basename.toUpperCase() === 'PROMPT') {
    return path.basename(path.dirname(filePath));
  }
  return basename;
}

/**
 * Recursively collect all .md files under a directory.
 * Returns absolute paths. Silently skips dirs it can't read.
 */
function collectMdFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    try {
      const s = statSync(full);
      if (s.isDirectory()) {
        results.push(...collectMdFiles(full));
      } else if (s.isFile() && entry.endsWith('.md')) {
        results.push(full);
      }
    } catch {
      // skip unreadable entries
    }
  }
  return results;
}

/**
 * Build a summary from a .md file path. Reads frontmatter for description.
 */
async function buildSummary(filePath: string): Promise<PromptTemplateSummary> {
  const raw = await readFile(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter<{ description?: string }>(raw);
  const name = nameFromPath(filePath);
  const description =
    frontmatter.description ||
    body
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ||
    '';
  const relativePath = path.relative(PROMPTS_DIR, filePath);
  return { name, description, filePath, relativePath };
}

// ── Frontmatter serialization ────────────────────────────────

function serializeFrontmatter(description: string): string {
  if (!description) return '';
  return `---\ndescription: ${description}\n---\n`;
}

// ── Handlers ─────────────────────────────────────────────────

export function registerPromptHandlers(): void {
  /**
   * List all prompt templates under PROMPTS_DIR (recursive).
   */
  ipcMain.handle(
    IpcChannels.prompts.listPrompts,
    async (): Promise<PromptTemplateSummary[]> => {
      // Ensure the directory exists
      await mkdir(PROMPTS_DIR, { recursive: true });

      const files = collectMdFiles(PROMPTS_DIR);
      const summaries = await Promise.all(files.map(buildSummary));
      return summaries.sort((a, b) => a.name.localeCompare(b.name));
    },
  );

  /**
   * Read a prompt template by its absolute filePath.
   */
  ipcMain.handle(
    IpcChannels.prompts.readPrompt,
    async (_e, filePath: string): Promise<PromptTemplateFileData> => {
      validatePromptPath(filePath);
      const raw = await readFile(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter<{ description?: string }>(raw);
      const name = nameFromPath(filePath);
      return {
        name,
        description: frontmatter.description || '',
        filePath,
        body,
      };
    },
  );

  /**
   * Write a prompt template. If `filePath` is provided, overwrites it.
   * Otherwise creates a new file at PROMPTS_DIR/<name>.md.
   * Returns the absolute filePath of the written file.
   */
  ipcMain.handle(
    IpcChannels.prompts.writePrompt,
    async (_e, data: PromptTemplateFileData): Promise<string> => {
      let targetPath: string;

      if (data.filePath) {
        validatePromptPath(data.filePath);
        targetPath = data.filePath;
      } else {
        // New template — validate name
        if (!VALID_NAME.test(data.name)) {
          throw new Error(
            `Invalid prompt name '${data.name}'. Use only lowercase letters, numbers, and hyphens.`,
          );
        }
        await mkdir(PROMPTS_DIR, { recursive: true });
        targetPath = path.join(PROMPTS_DIR, `${data.name}.md`);

        // Don't overwrite existing files when creating new
        try {
          await stat(targetPath);
          throw new Error(`Prompt template '${data.name}' already exists`);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
      }

      const content = serializeFrontmatter(data.description) + data.body;
      const tmpPath = `${targetPath}.tmp.${Date.now()}`;
      await writeFile(tmpPath, content, 'utf-8');
      await rename(tmpPath, targetPath);

      // Hot-reload all active sessions so the updated template is
      // available immediately without restarting Sero.
      reloadAllSessionResources().catch((err) =>
        console.error('[prompts] reloadAllSessionResources failed:', err),
      );

      return targetPath;
    },
  );

  /**
   * Delete a prompt template by its absolute filePath.
   * If it's a PROMPT.md inside a subdirectory, removes the directory.
   * Otherwise removes just the file.
   */
  ipcMain.handle(
    IpcChannels.prompts.deletePrompt,
    async (_e, filePath: string): Promise<void> => {
      validatePromptPath(filePath);
      const basename = path.basename(filePath, '.md');
      const parentDir = path.dirname(filePath);
      const resolvedParent = path.resolve(parentDir);
      const resolvedRoot = path.resolve(PROMPTS_DIR);

      if (basename.toUpperCase() === 'PROMPT' && resolvedParent !== resolvedRoot) {
        // PROMPT.md inside a subdirectory — remove the whole directory
        await rm(parentDir, { recursive: true });
      } else {
        // Regular .md file — just remove the file
        await rm(filePath);
      }

      // Hot-reload so deleted template disappears from active sessions.
      reloadAllSessionResources().catch((err) =>
        console.error('[prompts] reloadAllSessionResources failed:', err),
      );
    },
  );
}
