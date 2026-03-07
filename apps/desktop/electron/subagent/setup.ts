/**
 * First-launch agent template setup.
 *
 * Copies built-in agent templates to ~/.sero-ui/agent/agents/
 * if they don't already exist. Preserves user edits — only copies
 * templates whose filename is missing from the target directory.
 */

import { readdir, copyFile, mkdir, access } from 'fs/promises';
import path from 'path';
import { SERO_AGENT_DIR } from '../env';

const AGENTS_DIR = path.join(SERO_AGENT_DIR, 'agents');

/**
 * Resolve the path to the built-in agent templates.
 *
 * In development, templates are at <monorepo>/packages/templates/agents/.
 * In production, they're bundled alongside the app.
 */
function getTemplatesDir(): string {
  // Try the monorepo path first (development)
  const devPath = path.resolve(__dirname, '../../../../packages/templates/agents');
  return devPath;
}

/**
 * Copy default agent templates, adding any missing ones.
 *
 * Call once from electron/main.ts at startup. Only copies templates
 * whose filename doesn't already exist in the user's agents directory,
 * so user edits are never overwritten.
 */
export async function ensureDefaultAgents(): Promise<void> {
  try {
    // Ensure the directory exists
    await mkdir(AGENTS_DIR, { recursive: true });

    // Get existing files
    const existing = new Set(await readdir(AGENTS_DIR));

    // Copy templates
    const templatesDir = getTemplatesDir();
    let templateFiles: string[];
    try {
      templateFiles = await readdir(templatesDir);
    } catch {
      console.warn('[subagent/setup] Templates directory not found:', templatesDir);
      return;
    }

    const mdFiles = templateFiles.filter((f) => f.endsWith('.md'));
    let copied = 0;

    for (const file of mdFiles) {
      if (existing.has(file)) continue; // Don't overwrite user edits

      const src = path.join(templatesDir, file);
      const dest = path.join(AGENTS_DIR, file);
      await copyFile(src, dest);
      console.log(`[subagent/setup] Copied template: ${file}`);
      copied++;
    }

    if (copied > 0) {
      console.log(`[subagent/setup] Copied ${copied} new agent template(s) to ${AGENTS_DIR}`);
    }
  } catch (err) {
    console.warn('[subagent/setup] Failed to copy agent templates:', err);
  }
}
