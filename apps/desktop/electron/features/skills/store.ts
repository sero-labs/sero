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

import { realpathSync } from 'fs';
import { readFile, writeFile, mkdir, rm, rename } from 'fs/promises';
import path from 'path';
import { stringify } from 'yaml';
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

/** The real path of `target`, or of its nearest existing parent with the rest appended. */
function realPathOrNearest(target: string): string {
  const missing: string[] = [];
  let current = path.resolve(target);
  for (;;) {
    try {
      return path.join(realpathSync(current), ...missing.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target);
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

const isInside = (target: string, root: string): boolean =>
  target === root || target.startsWith(root + path.sep);

/**
 * Guards against path traversal: a target must live under one of the allowed
 * roots. The profile's SKILLS_DIR is the default. The Skills page also passes
 * the `.agents/skills` folder of each project, so a project skill can be edited.
 *
 * A project folder belongs to a repo that may have come from anyone, so those
 * roots are also `strict`: a symlink inside them must not lead outside. The
 * profile's own folder is the user's, and people do link skills into it.
 */
export function validateSkillPath(
  filePath: string,
  roots: readonly string[] = [SKILLS_DIR],
  strictRoots: readonly string[] = [],
): void {
  const resolved = path.resolve(filePath);
  const root = roots.map((dir) => path.resolve(dir)).find((dir) => isInside(resolved, dir));
  if (!root) {
    throw new Error(`Skill path must be under ${roots.join(' or ')}`);
  }
  if (strictRoots.some((dir) => path.resolve(dir) === root)
    && !isInside(realPathOrNearest(resolved), realPathOrNearest(root))) {
    throw new Error(`Skill path must not leave ${root}`);
  }
}

/** The canonical SKILL.md path for a top-level skill name. */
export function skillFilePath(name: string): string {
  return path.join(SKILLS_DIR, name, 'SKILL.md');
}

// ── Frontmatter serialization (the SDK only provides parsing) ──

/**
 * Serialized with the SAME library the SDK parses with, so what is written
 * round-trips by construction.
 *
 * Hand-rolled `key: value` lines were not safe here: a natural description such
 * as "Build recovery: use when installs fail", a leading "#", a quote, or the
 * newline a textarea puts in produces frontmatter that is invalid or parses to
 * something else — and a skill that saves fine but never loads.
 */
function serializeFrontmatter(fields: Record<string, unknown>): string {
  const present = Object.entries(fields)
    .filter(([, val]) => val !== undefined && val !== null && val !== '');
  if (present.length === 0) return '';
  // lineWidth 0 disables folding: a folded long description would round-trip to
  // the same string, but the file is meant to be read and edited by hand too.
  const yaml = stringify(Object.fromEntries(present), { lineWidth: 0 });
  return `---\n${yaml}---\n`;
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

export async function readSkillFile(
  filePath: string,
  roots?: readonly string[],
  strictRoots?: readonly string[],
): Promise<SkillFileData> {
  validateSkillPath(filePath, roots, strictRoots);
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
export async function writeSkillFile(
  data: SkillFileData,
  roots?: readonly string[],
  strictRoots?: readonly string[],
): Promise<string> {
  let targetPath: string;

  if (data.filePath) {
    validateSkillPath(data.filePath, roots, strictRoots);
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
