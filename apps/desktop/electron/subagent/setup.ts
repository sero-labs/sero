/**
 * First-launch agent template setup.
 *
 * Copies built-in agent templates to ~/.sero-ui/agent/agents/
 * if the directory is empty or doesn't exist. Preserves user edits
 * on subsequent launches.
 */

import { readdir, copyFile, mkdir } from 'fs/promises';
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
 * Copy default agent templates if the user's agents directory is empty.
 *
 * Call once from electron/main.ts at startup. Fast no-op if agents exist.
 */
export async function ensureDefaultAgents(): Promise<void> {
  try {
    // Ensure the directory exists
    await mkdir(AGENTS_DIR, { recursive: true });

    // Check if there are any existing .md files
    const existing = await readdir(AGENTS_DIR);
    const hasMdFiles = existing.some((f) => f.endsWith('.md'));

    if (hasMdFiles) {
      console.log('[subagent/setup] Agents directory already has .md files, skipping copy');
      return;
    }

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
    for (const file of mdFiles) {
      const src = path.join(templatesDir, file);
      const dest = path.join(AGENTS_DIR, file);
      await copyFile(src, dest);
      console.log(`[subagent/setup] Copied template: ${file}`);
    }

    console.log(`[subagent/setup] Copied ${mdFiles.length} agent templates to ${AGENTS_DIR}`);
  } catch (err) {
    console.warn('[subagent/setup] Failed to copy agent templates:', err);
  }
}
