/**
 * The single authority for how a user skill file is listed, read, written and
 * deleted.
 *
 * Both callers use it: the Admin skill IPC handlers
 * ([ipc/agent/handlers/skills.ts](../../ipc/agent/handlers/skills.ts)) and the
 * gated `appRuntime.skills` runtime capability. Anything that writes a SKILL.md
 * goes through `writeSkillFile`, so the name rules, the atomic write and the
 * session hot reload cannot drift apart.
 *
 * Listing uses the Pi SDK's `loadSkillsFromDir()`, which recursively discovers
 * SKILL.md files in nested subdirectories. Read/write/delete take the absolute
 * `filePath` discovery returned — not the skill name, since skills can be
 * arbitrarily nested (e.g. `tavily-ai-skills/skills/tavily/search/SKILL.md`).
 */

import { readFile, writeFile, mkdir, rm, rename } from 'fs/promises';
import path from 'path';
import {
  loadSkillsFromDir,
  parseFrontmatter,
  type SkillFrontmatter,
  type SourceInfo,
} from '@earendil-works/pi-coding-agent';

import { SERO_AGENT_DIR } from '@electron/platform/env';
import type { SkillSummary, SkillFileData, SkillSource } from '@/types/skills';

export const SKILLS_DIR = path.join(SERO_AGENT_DIR, 'skills');

/** Directory-name rules for a new skill. Also the host-side check on a runtime write. */
export const VALID_SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

export function toSkillSource(sourceInfo: SourceInfo): SkillSource {
  if (sourceInfo.scope === 'user' || sourceInfo.scope === 'project') {
    return sourceInfo.scope;
  }
  return 'path';
}

/** Guards against path traversal: a target must live under SKILLS_DIR. */
export function validateSkillPath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const root = path.resolve(SKILLS_DIR);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Skill path must be under ${SKILLS_DIR}`);
  }
}

/** The canonical SKILL.md path for a top-level skill name. */
export function skillFilePath(name: string): string {
  return path.join(SKILLS_DIR, name, 'SKILL.md');
}

// ── Frontmatter serialization (the SDK only provides parsing) ──

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

// ── Operations ────────────────────────────────────────────────

export function listUserSkills(): SkillSummary[] {
  const { skills } = loadSkillsFromDir({ dir: SKILLS_DIR, source: 'user' });

  return skills
    .map((s) => ({
      name: s.name,
      description: s.description,
      filePath: s.filePath,
      source: toSkillSource(s.sourceInfo),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function readSkillFile(filePath: string): Promise<SkillFileData> {
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
}

/**
 * Writes a skill. With `filePath` it overwrites that file; otherwise it creates
 * `SKILLS_DIR/<name>/SKILL.md`. Returns the absolute path written.
 *
 * The write is atomic (temp file + rename) so a reader never sees half a skill.
 */
export async function writeSkillFile(data: SkillFileData): Promise<string> {
  let targetPath: string;

  if (data.filePath) {
    validateSkillPath(data.filePath);
    targetPath = data.filePath;
  } else {
    if (!VALID_SKILL_NAME.test(data.name)) {
      throw new Error(
        `Invalid skill name '${data.name}'. Use only lowercase letters, numbers, and hyphens.`,
      );
    }
    await mkdir(path.join(SKILLS_DIR, data.name), { recursive: true });
    targetPath = skillFilePath(data.name);
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

  return targetPath;
}

/** Deletes the skill folder (SKILL.md plus its assets). */
export async function deleteSkillFile(filePath: string): Promise<void> {
  validateSkillPath(filePath);
  const skillDir = path.dirname(filePath);
  if (path.resolve(skillDir) === path.resolve(SKILLS_DIR)) {
    throw new Error('Cannot delete the skills root directory');
  }
  await rm(skillDir, { recursive: true });
}
