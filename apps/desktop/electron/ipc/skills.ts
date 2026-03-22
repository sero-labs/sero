/**
 * IPC handlers for skill CRUD.
 *
 * Listing uses the Pi SDK's `loadSkillsFromDir()` which recursively
 * discovers SKILL.md files in nested subdirectories. Read/write/delete
 * use the absolute `filePath` returned by discovery — not the skill
 * name, since skills can be arbitrarily nested (e.g.
 * `tavily-ai-skills/skills/tavily/search/SKILL.md`).
 */

import { ipcMain } from 'electron';
import { readFile, writeFile, mkdir, rm, rename } from 'fs/promises';
import path from 'path';
import {
  DefaultResourceLoader,
  loadSkillsFromDir,
  parseFrontmatter,
  type SkillFrontmatter,
} from '@mariozechner/pi-coding-agent';
import { IpcChannels } from '../../src/types/ipc';
import { SERO_AGENT_DIR, SERO_HOME } from '../env';
import { reloadAllSessionResources } from './agent';
import { ensureInfra } from './shared-infra';
import type { SkillSummary, AvailableSkillSummary, SkillFileData } from '../../src/types/skills';

const SKILLS_DIR = path.join(SERO_AGENT_DIR, 'skills');

/**
 * Validate that a filePath is under SKILLS_DIR to prevent path traversal.
 */
function validateSkillPath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const root = path.resolve(SKILLS_DIR);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Skill path must be under ${SKILLS_DIR}`);
  }
}

/** Validate skill name for new skill creation. */
const VALID_SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

// ── Frontmatter serialization (SDK only provides parsing) ────

function serializeValue(val: unknown): string {
  if (Array.isArray(val)) {
    return `[${val.map((v) => String(v)).join(', ')}]`;
  }
  if (typeof val === 'object' && val !== null) {
    return JSON.stringify(val);
  }
  return String(val);
}

function serializeFrontmatter(fields: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined || val === null || val === '') continue;
    lines.push(`${key}: ${serializeValue(val)}`);
  }
  return lines.length > 0 ? `---\n${lines.join('\n')}\n---\n` : '';
}

// ── Handlers ─────────────────────────────────────────────────

export function registerSkillHandlers(): void {
  ipcMain.handle(
    IpcChannels.skills.listSkills,
    async (): Promise<SkillSummary[]> => {
      const { skills } = loadSkillsFromDir({ dir: SKILLS_DIR, source: 'user' });

      return skills
        .map((s) => ({
          name: s.name,
          description: s.description,
          filePath: s.filePath,
          source: s.source as SkillSummary['source'],
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  );

  ipcMain.handle(
    IpcChannels.skills.listAvailableSkills,
    async (): Promise<AvailableSkillSummary[]> => {
      const infra = await ensureInfra();
      infra.settingsManager.reload();

      const loader = new DefaultResourceLoader({
        cwd: SERO_HOME,
        agentDir: SERO_AGENT_DIR,
        settingsManager: infra.settingsManager,
        noExtensions: true,
        noPromptTemplates: true,
        noThemes: true,
      });
      await loader.reload();

      const { skills } = loader.getSkills();
      return skills
        .map((skill) => ({
          name: skill.name,
          description: skill.description,
          source: skill.source,
          disableModelInvocation: skill.disableModelInvocation,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  );

  /**
   * Read a skill by its absolute filePath (returned by listSkills).
   */
  ipcMain.handle(
    IpcChannels.skills.readSkill,
    async (_e, filePath: string): Promise<SkillFileData> => {
      validateSkillPath(filePath);
      const raw = await readFile(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter<SkillFrontmatter>(raw);

      const parentDir = path.basename(path.dirname(filePath));
      const { name: fmName, description, ...extra } = frontmatter;

      return {
        name: fmName || parentDir,
        description: description || '',
        extraFrontmatter: extra,
        filePath,
        body,
      };
    },
  );

  /**
   * Write a skill. If `filePath` is provided, overwrites that file.
   * Otherwise creates a new skill at SKILLS_DIR/<name>/SKILL.md.
   * Returns the absolute filePath of the written file.
   */
  ipcMain.handle(
    IpcChannels.skills.writeSkill,
    async (_e, data: SkillFileData): Promise<string> => {
      let targetPath: string;

      if (data.filePath) {
        validateSkillPath(data.filePath);
        targetPath = data.filePath;
      } else {
        // New skill — validate name and create directory
        if (!VALID_SKILL_NAME.test(data.name)) {
          throw new Error(
            `Invalid skill name '${data.name}'. Use only lowercase letters, numbers, and hyphens.`,
          );
        }
        const skillDir = path.join(SKILLS_DIR, data.name);
        await mkdir(skillDir, { recursive: true });
        targetPath = path.join(skillDir, 'SKILL.md');
      }

      const fmFields: Record<string, unknown> = {
        name: data.name,
        description: data.description,
        ...data.extraFrontmatter,
      };

      const content = serializeFrontmatter(fmFields) + data.body;
      const tmpPath = `${targetPath}.tmp.${Date.now()}`;
      await writeFile(tmpPath, content, 'utf-8');
      await rename(tmpPath, targetPath);

      // Hot-reload all active sessions so the updated skill is
      // available immediately without restarting Sero.
      reloadAllSessionResources().catch((err) =>
        console.error('[skills] reloadAllSessionResources failed:', err),
      );

      return targetPath;
    },
  );

  /**
   * Delete a skill by its absolute filePath. Removes the parent
   * directory (the skill folder containing SKILL.md + assets).
   */
  ipcMain.handle(
    IpcChannels.skills.deleteSkill,
    async (_e, filePath: string): Promise<void> => {
      validateSkillPath(filePath);
      const skillDir = path.dirname(filePath);
      // Safety: don't delete the skills root itself
      if (path.resolve(skillDir) === path.resolve(SKILLS_DIR)) {
        throw new Error('Cannot delete the skills root directory');
      }
      await rm(skillDir, { recursive: true });

      // Hot-reload so deleted skill disappears from active sessions.
      reloadAllSessionResources().catch((err) =>
        console.error('[skills] reloadAllSessionResources failed:', err),
      );
    },
  );
}
