/**
 * Profile bootstrapping — first-launch template setup.
 *
 * 1. Copies built-in agent templates to <SERO_AGENT_DIR>/agents/
 * 2. Copies profile templates to the global workspace root
 *    (with placeholder substitution for dynamic paths)
 *
 * Both operations only copy files whose filename is missing from the
 * target directory, so user edits are never overwritten.
 */

import { readdir, copyFile, readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { SERO_AGENT_DIR, SERO_HOME } from '../env';
import { resolveBuiltinTemplatesDir } from '../builtin-resources';

const AGENTS_DIR = path.join(SERO_AGENT_DIR, 'agents');
const GLOBAL_WORKSPACE_DIR = path.join(SERO_HOME, 'workspaces', 'global');

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
  return {
    SERO_HOME,
    SERO_AGENT_DIR,
    SERO_MONOREPO: getMonorepoRoot(),
  };
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
  let copied = 0;

  for (const file of matchingFiles) {
    if (existing.has(file)) continue;

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
    copied++;
  }

  return copied;
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
 * MEMORY.md is excluded because its absence is the trigger for
 * the memory extension's bootstrap questionnaire flow.
 */
const SKIP_PROFILE_FILES = new Set(['MEMORY.md']);

/**
 * Copy profile templates (AGENTS.md, USER.md, etc.) to the global workspace.
 * Only copies files that don't already exist. Skips MEMORY.md so the memory
 * extension's bootstrap flow is preserved.
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
