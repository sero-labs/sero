/**
 * Skill installation helpers: preview repos, selective install, cleanup.
 * Extracted from skill-manager to keep files under 500 LOC.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { loadSkillsFromDir } from '@mariozechner/pi-coding-agent';

export interface PreviewSkill {
  name: string;
  description: string;
  /** Path relative to the repo root (e.g. "skills/browser-tools") */
  relativePath: string;
}

export interface PreviewResult {
  /** Unique preview session ID */
  previewId: string;
  /** Where the repo was cloned/copied to */
  tempDir: string;
  /** Human-friendly name derived from the source */
  repoName: string;
  /** Skills discovered in the repo */
  skills: PreviewSkill[];
}

/** Active preview sessions: previewId → PreviewResult */
const activePreviews = new Map<string, PreviewResult>();

/**
 * Clone/copy a skill source to a temp directory and scan for SKILL.md files.
 * Returns a preview with all discovered skills so the user can pick which to install.
 */
export async function previewSkillSource(source: string): Promise<PreviewResult> {
  const previewId = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempDir = path.join(os.tmpdir(), 'sero-skill-preview', previewId);

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    if (fs.existsSync(source) && fs.statSync(source).isDirectory()) {
      // Local directory — copy to temp
      copyDirSync(source, tempDir);
    } else if (source.startsWith('http') || source.startsWith('git@') || source.includes('github.com')) {
      // Git URL — clone to temp
      execSync(`git clone --depth 1 "${source}" "${tempDir}"`, { timeout: 60_000 });
    } else {
      throw new Error('Source must be a local directory path or git URL');
    }

    // Scan for skills in the cloned/copied repo
    const skills = discoverSkillsInDir(tempDir);
    const repoName = gitUrlToDirName(source);

    const result: PreviewResult = { previewId, tempDir, repoName, skills };
    activePreviews.set(previewId, result);
    return result;
  } catch (err: any) {
    // Clean up on failure
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
    throw err;
  }
}

/**
 * Install only the selected skills from a previously previewed source.
 */
export async function installSelectedSkills(
  previewId: string,
  selectedNames: string[],
  targetDir: string,
): Promise<{ installed: string[]; errors: Array<{ name: string; error: string }> }> {
  const preview = activePreviews.get(previewId);
  if (!preview) {
    throw new Error(`Preview session "${previewId}" not found or already cleaned up`);
  }

  const installed: string[] = [];
  const errors: Array<{ name: string; error: string }> = [];

  for (const name of selectedNames) {
    const skill = preview.skills.find(s => s.name === name);
    if (!skill) {
      errors.push({ name, error: 'Skill not found in preview' });
      continue;
    }

    const srcDir = path.join(preview.tempDir, skill.relativePath);
    const destDir = path.join(targetDir, name);

    if (fs.existsSync(destDir)) {
      errors.push({ name, error: `"${name}" already exists at ${destDir}` });
      continue;
    }

    try {
      copyDirSync(srcDir, destDir);
      installed.push(name);
    } catch (err: any) {
      errors.push({ name, error: err.message });
    }
  }

  // Clean up the temp dir now that we're done
  cleanupPreviewById(previewId);

  return { installed, errors };
}

/**
 * Clean up a preview session's temp directory.
 */
export function cleanupPreview(previewId: string): void {
  cleanupPreviewById(previewId);
}

/**
 * Clean up all active preview sessions (call on app quit).
 */
export function cleanupAllPreviews(): void {
  for (const [id] of activePreviews) {
    cleanupPreviewById(id);
  }
}

/* ── Exported helpers (shared with skill-manager) ───────────── */

export function cleanupPreviewById(previewId: string): void {
  const preview = activePreviews.get(previewId);
  if (!preview) return;
  try {
    fs.rmSync(preview.tempDir, { recursive: true, force: true });
  } catch { /* best effort */ }
  activePreviews.delete(previewId);
}

/**
 * Recursively scan a directory for SKILL.md files and return discovered skills.
 */
function discoverSkillsInDir(rootDir: string): PreviewSkill[] {
  const skills: PreviewSkill[] = [];
  const seen = new Set<string>();

  // First try loading via Pi SDK's loader at the root level
  try {
    const result = loadSkillsFromDir({ dir: rootDir, source: 'global' });
    for (const skill of result.skills) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        skills.push({
          name: skill.name,
          description: skill.description,
          relativePath: path.relative(rootDir, skill.baseDir),
        });
      }
    }
  } catch { /* fallback to manual scan */ }

  // If Pi SDK found skills, we're done
  if (skills.length > 0) return skills;

  // Fallback: manually walk directories looking for SKILL.md
  walkForSkillMd(rootDir, rootDir, skills, seen);
  return skills;
}

/**
 * Recursively walk looking for SKILL.md files (max depth 4).
 */
function walkForSkillMd(
  dir: string,
  rootDir: string,
  skills: PreviewSkill[],
  seen: Set<string>,
  depth = 0,
): void {
  if (depth > 4) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch { return; }

  // Check if this directory has a SKILL.md
  const hasSkillMd = entries.some(e => !e.isDirectory() && e.name === 'SKILL.md');
  if (hasSkillMd) {
    const name = path.basename(dir);
    if (!seen.has(name)) {
      seen.add(name);
      // Try to parse description from frontmatter
      const description = parseSkillDescription(path.join(dir, 'SKILL.md'));
      skills.push({
        name,
        description,
        relativePath: path.relative(rootDir, dir),
      });
    }
    return; // Don't recurse into skill directories
  }

  // Recurse into subdirectories (skip .git, node_modules)
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    walkForSkillMd(path.join(dir, entry.name), rootDir, skills, seen, depth + 1);
  }
}

/**
 * Extract description from SKILL.md frontmatter (--- yaml ---) or first paragraph.
 */
function parseSkillDescription(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Try frontmatter: description: ...
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const descMatch = fmMatch[1].match(/description:\s*(.+)/);
      if (descMatch) return descMatch[1].trim();
    }

    // Fallback: first non-heading, non-empty line
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) continue;
      return trimmed.slice(0, 200);
    }

    return 'No description available';
  } catch {
    return 'No description available';
  }
}

/**
 * Convert a git URL to a unique directory name using owner-repo format.
 */
export function gitUrlToDirName(url: string): string {
  if (fs.existsSync(url)) return path.basename(url);

  let cleaned = url.replace(/\.git$/, '').replace(/\/+$/, '');

  const httpsMatch = cleaned.match(/(?:github\.com|gitlab\.com|bitbucket\.org)[/:]([^/]+)\/([^/]+)$/);
  if (httpsMatch) return `${httpsMatch[1]}-${httpsMatch[2]}`;

  const sshMatch = cleaned.match(/:([^/]+)\/([^/]+)$/);
  if (sshMatch) return `${sshMatch[1]}-${sshMatch[2]}`;

  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}-${parts[parts.length - 1]}`;
  return parts[parts.length - 1] ?? 'skill';
}

export function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
