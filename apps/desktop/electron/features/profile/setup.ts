/**
 * Profile bootstrapping — first-launch template setup.
 *
 * 1. Copies built-in agent templates to <SERO_AGENT_DIR>/agents/
 * 2. Copies built-in skill templates to <SERO_AGENT_DIR>/skills/
 * 3. Copies profile templates to the global workspace root
 *    (with placeholder substitution for dynamic paths)
 *
 * All operations only copy entries whose name is missing from the
 * target directory, so user edits are never overwritten.
 */

import { readdir, copyFile, readFile, writeFile, mkdir, cp } from 'fs/promises';
import path from 'path';
import { SERO_AGENT_DIR, SERO_HOME } from '@electron/platform/env';
import { resolveBuiltinTemplatesDir } from '@electron/platform/protocols/builtin-resources';
import { ensureSharedPiDocs } from '@electron/features/pi-docs/shared-pi-docs';

const AGENTS_DIR = path.join(SERO_AGENT_DIR, 'agents');
const SKILLS_DIR = path.join(SERO_AGENT_DIR, 'skills');
const WORKSPACES_DIR = path.join(SERO_HOME, 'workspaces');
const GLOBAL_WORKSPACE_DIR = path.join(WORKSPACES_DIR, 'global');

/**
 * Resolve the path to built-in templates.
 * In development this points at the monorepo templates directory.
 * In packaged builds it resolves to the copies staged into dist/electron/.
 */
function getTemplatesDir(subdir: string): string | null {
  const templatesRoot = resolveBuiltinTemplatesDir();
  return templatesRoot ? path.join(templatesRoot, subdir) : null;
}

/** Resolve the monorepo root (4 levels up from dist/electron/). */
function getMonorepoRoot(): string {
  return path.resolve(__dirname, '../../../..');
}

/**
 * Build the placeholder map for template substitution.
 * Templates use `{{KEY}}` syntax — keys are replaced with runtime values.
 */
function getTemplatePlaceholders(): Record<string, string> {
  const templatePlaceholders = {
    SERO_MONOREPO: getMonorepoRoot(),
    SERO_HOME,
    SERO_AGENT_DIR,
    WORKSPACES_DIR,
    GLOBAL_WORKSPACE_DIR
  };
  console.info(`[setup] Found template placeholders: ${templatePlaceholders}`);
  return templatePlaceholders;
}

/** Replace `{{KEY}}` placeholders in content with runtime values. */
function substituteTemplate(
  content: string,
  placeholders: Record<string, string>,
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return placeholders[key] ?? _match;
  });
}

/**
 * Copy files matching `ext` from a source directory to a target directory.
 * Only copies files that don't already exist in the target.
 * Optionally skip specific filenames.
 * If `placeholders` is provided, performs template substitution.
 * Returns the number of files copied.
 */
async function copyMissingFiles(
  srcDir: string,
  destDir: string,
  ext: string,
  opts?: {
    skip?: Set<string>;
    placeholders?: Record<string, string>;
  },
): Promise<number> {
  await mkdir(destDir, { recursive: true });

  const existing = new Set(await readdir(destDir));

  let templateFiles: string[];
  try {
    templateFiles = await readdir(srcDir);
  } catch {
    console.warn('[setup] Templates directory not found:', srcDir);
    return 0;
  }

  const matchingFiles = templateFiles.filter(
    (f) => f.endsWith(ext) && !(opts?.skip?.has(f)),
  );
  const copiedFlags = await Promise.all(matchingFiles.map(async (file) => {
    if (existing.has(file)) {
      console.log(`[setup] Skipped (already exists): ${file} in ${destDir}`);
      return 0;
    }

    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);

    if (opts?.placeholders) {
      const raw = await readFile(src, 'utf8');
      const processed = substituteTemplate(raw, opts.placeholders);
      await writeFile(dest, processed, 'utf8');
    } else {
      await copyFile(src, dest);
    }

    console.log(`[setup] Copied template: ${file} → ${destDir}`);
    return 1;
  }));

  return copiedFlags.reduce<number>((total, copied) => total + copied, 0);
}

/**
 * Copy default agent templates, adding any missing ones.
 * Call once from electron/main.ts at startup.
 */
export async function ensureDefaultAgents(): Promise<void> {
  try {
    const templatesDir = getTemplatesDir('agents');
    if (!templatesDir) return;
    const copied = await copyMissingFiles(templatesDir, AGENTS_DIR, '.md');
    if (copied > 0) {
      console.log(`[setup] Copied ${copied} agent template(s) to ${AGENTS_DIR}`);
    }
  } catch (err) {
    console.warn('[setup] Failed to copy agent templates:', err);
  }
}

/**
 * Copy default skill templates (directories) to SERO_AGENT_DIR/skills/.
 * Each skill is a directory containing SKILL.md + optional references/.
 * Only copies skill directories whose name is missing from the target.
 *
 * Call once from electron/main.ts at startup.
 */
export async function ensureDefaultSkills(): Promise<void> {
  try {
    const templatesDir = getTemplatesDir('skills');
    if (!templatesDir) return;
    const copied = await copyMissingDirs(templatesDir, SKILLS_DIR);
    if (copied > 0) {
      console.log(`[setup] Copied ${copied} skill template(s) to ${SKILLS_DIR}`);
    }
  } catch (err) {
    console.warn('[setup] Failed to copy skill templates:', err);
  }
}

/**
 * Ensure bundled Pi docs are available from one machine-level shared location.
 *
 * This deliberately does not write under SERO_HOME/SERO_AGENT_DIR because those
 * are profile-scoped. Container and host prompt fallbacks both point at this
 * shared copy so every profile can read the same documentation without
 * duplicating it.
 */
export async function ensureBundledPiDocs(): Promise<void> {
  try {
    await ensureSharedPiDocs();
  } catch (err) {
    console.warn('[setup] Failed to prepare shared Pi documentation:', err);
  }
}

/**
 * Copy subdirectories from `srcDir` to `destDir` that don't already exist
 * in the target. Uses recursive copy for the entire directory tree.
 * Returns the number of directories copied.
 */
async function copyMissingDirs(
  srcDir: string,
  destDir: string,
): Promise<number> {
  await mkdir(destDir, { recursive: true });

  const existing = new Set(await readdir(destDir));

  let entries: string[];
  try {
    entries = await readdir(srcDir);
  } catch {
    console.warn('[setup] Templates directory not found:', srcDir);
    return 0;
  }

  const copiedFlags = await Promise.all(entries.map(async (entry) => {
    if (existing.has(entry)) {
      console.log(`[setup] Skipped (already exists): ${entry} in ${destDir}`);
      return 0;
    }

    const src = path.join(srcDir, entry);
    const dest = path.join(destDir, entry);
    await cp(src, dest, { recursive: true });
    console.log(`[setup] Copied template: ${entry} → ${destDir}`);
    return 1;
  }));

  return copiedFlags.reduce<number>((total, copied) => total + copied, 0);
}

const THEMES_DIR = path.join(SERO_HOME, 'themes');

/**
 * Copy default theme presets from packages/templates/themes/ into
 * ~/.sero-ui/themes/. Only copies files that don't already exist,
 * so user edits to their copies are never overwritten.
 *
 * Call once at startup.
 */
export async function ensureDefaultThemes(): Promise<void> {
  try {
    const templatesDir = getTemplatesDir('themes');
    if (!templatesDir) return;
    const copied = await copyMissingFiles(
      templatesDir,
      THEMES_DIR,
      '.json',
    );
    if (copied > 0) {
      console.log(`[setup] Copied ${copied} theme template(s) to ${THEMES_DIR}`);
    }
  } catch (err) {
    console.warn('[setup] Failed to copy theme templates:', err);
  }
}

/**
 * Files to skip when copying profile templates.
 *
 * The memory system owns the lifecycle of all managed memory files:
 * - MEMORY.md absence triggers the bootstrap questionnaire flow
 * - IDENTITY.md and USER.md are written from the bootstrap answers so the
 *   user can define the agent's personality/identity and their own profile
 *
 * Only non-managed workspace guidance files (for example AGENTS.md) should
 * be copied from the built-in profile template set.
 */
const SKIP_PROFILE_FILES = new Set([
  'MEMORY.md',
  'IDENTITY.md',
  'USER.md',
]);

/**
 * Copy profile templates (AGENTS.md, etc.) to the global workspace.
 * Only copies files that don't already exist. Managed memory files are skipped
 * so the memory extension can create and populate them through the v2
 * bootstrap and memory tools.
 *
 * Templates with `{{PLACEHOLDER}}` syntax are substituted with runtime
 * values (SERO_HOME, SERO_AGENT_DIR, SERO_MONOREPO).
 *
 * Call once at startup.
 */
export async function ensureProfileTemplates(): Promise<void> {
  try {
    const templatesDir = getTemplatesDir('profile');
    if (!templatesDir) return;
    const copied = await copyMissingFiles(
      templatesDir,
      GLOBAL_WORKSPACE_DIR,
      '.md',
      {
        skip: SKIP_PROFILE_FILES,
        placeholders: getTemplatePlaceholders(),
      },
    );
    if (copied > 0) {
      console.log(`[setup] Copied ${copied} profile template(s) to ${GLOBAL_WORKSPACE_DIR}`);
    }
  } catch (err) {
    console.warn('[setup] Failed to copy profile templates:', err);
  }
}
