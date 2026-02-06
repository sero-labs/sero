import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadSkillsFromDir, formatSkillsForPrompt, type Skill } from '@mariozechner/pi-coding-agent';

export interface SeroSkill extends Skill {
  /** 'global' = ~/.pi/agent/skills/, 'project' = .pi/skills/ in workspace, 'custom' = user-added path */
  scope: 'global' | 'project' | 'custom';
  /** Whether this skill is enabled (per-project overrides may change this) */
  enabled: boolean;
}

export interface SkillConfig {
  /** Skills explicitly enabled for this project (overrides global disabled) */
  enabled: string[];
  /** Skills explicitly disabled for this project (overrides global enabled) */
  disabled: string[];
}

const GLOBAL_SKILLS_DIR = path.join(os.homedir(), '.pi', 'agent', 'skills');
const SERO_DATA_DIR = path.join(
  process.env.HOME ?? os.homedir(),
  'Library', 'Application Support', 'sero', 'sero-data'
);

/**
 * Manages Pi skill discovery, loading, and per-project configuration.
 */
export class SkillManager {
  /** Master registry of all discovered skills */
  private registry = new Map<string, SeroSkill>();
  /** Per-project skill configs: projectId → SkillConfig */
  private projectConfigs = new Map<string, SkillConfig>();
  /** Additional skill paths from user settings */
  private customPaths: string[] = [];

  constructor() {
    this.ensureDirs();
  }

  private ensureDirs(): void {
    try {
      fs.mkdirSync(GLOBAL_SKILLS_DIR, { recursive: true });
    } catch { /* best effort */ }
  }

  /**
   * Scan all skill locations and rebuild the registry.
   */
  async discoverAll(): Promise<void> {
    this.registry.clear();

    // 1. Global skills: ~/.pi/agent/skills/
    this.loadFromDir(GLOBAL_SKILLS_DIR, 'global');

    // 2. Custom paths from settings
    for (const p of this.customPaths) {
      const resolved = p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
      if (fs.existsSync(resolved)) {
        this.loadFromDir(resolved, 'custom');
      }
    }
  }

  /**
   * Discover project-local skills from a workspace directory.
   */
  discoverProjectSkills(projectId: string, workspaceDir: string): void {
    const projectSkillsDir = path.join(workspaceDir, '.pi', 'skills');
    if (fs.existsSync(projectSkillsDir)) {
      this.loadFromDir(projectSkillsDir, 'project');
    }
  }

  private loadFromDir(dir: string, scope: SeroSkill['scope']): void {
    try {
      if (!fs.existsSync(dir)) return;
      const result = loadSkillsFromDir({ dir, source: scope });
      for (const skill of result.skills) {
        // Don't overwrite if already discovered (first wins, like Pi)
        if (!this.registry.has(skill.name)) {
          this.registry.set(skill.name, {
            ...skill,
            scope,
            enabled: true, // enabled by default
          });
        }
      }
      if (result.diagnostics.length > 0) {
        console.log(`[skills] Diagnostics from ${dir}:`, result.diagnostics);
      }
    } catch (err) {
      console.error(`[skills] Error loading from ${dir}:`, err);
    }
  }

  /**
   * Get all discovered skills, with per-project enabled/disabled state applied.
   */
  listAll(projectId?: string): SeroSkill[] {
    const skills = Array.from(this.registry.values());

    if (!projectId) return skills;

    const config = this.getProjectConfig(projectId);
    return skills.map((s) => ({
      ...s,
      enabled: this.isSkillEnabled(s.name, config),
    }));
  }

  /**
   * Get only enabled skills for a project (for system prompt injection).
   */
  getEnabledSkills(projectId: string): SeroSkill[] {
    return this.listAll(projectId).filter((s) => s.enabled);
  }

  /**
   * Get a single skill by name.
   */
  getSkill(name: string): SeroSkill | undefined {
    return this.registry.get(name);
  }

  /**
   * Read the full SKILL.md content for a skill.
   */
  readSkillContent(name: string): string | null {
    const skill = this.registry.get(name);
    if (!skill) return null;
    try {
      return fs.readFileSync(skill.filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * List files in a skill's directory.
   */
  listSkillFiles(name: string): string[] {
    const skill = this.registry.get(name);
    if (!skill) return [];
    try {
      return this.walkDir(skill.baseDir).map((f) =>
        path.relative(skill.baseDir, f)
      );
    } catch {
      return [];
    }
  }

  private walkDir(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.walkDir(full));
        } else {
          results.push(full);
        }
      }
    } catch { /* skip unreadable dirs */ }
    return results;
  }

  /**
   * Enable a skill for a specific project.
   */
  enableSkill(projectId: string, skillName: string): void {
    const config = this.getProjectConfig(projectId);
    config.disabled = config.disabled.filter((n) => n !== skillName);
    if (!config.enabled.includes(skillName)) {
      config.enabled.push(skillName);
    }
    this.saveProjectConfig(projectId, config);
  }

  /**
   * Disable a skill for a specific project.
   */
  disableSkill(projectId: string, skillName: string): void {
    const config = this.getProjectConfig(projectId);
    config.enabled = config.enabled.filter((n) => n !== skillName);
    if (!config.disabled.includes(skillName)) {
      config.disabled.push(skillName);
    }
    this.saveProjectConfig(projectId, config);
  }

  /**
   * Toggle a skill for a project. Returns new enabled state.
   */
  toggleSkill(projectId: string, skillName: string): boolean {
    const config = this.getProjectConfig(projectId);
    const currentlyEnabled = this.isSkillEnabled(skillName, config);
    if (currentlyEnabled) {
      this.disableSkill(projectId, skillName);
      return false;
    } else {
      this.enableSkill(projectId, skillName);
      return true;
    }
  }

  /**
   * Install a skill from a git URL or local path.
   */
  async installSkill(source: string, scope: 'global' | 'project' = 'global'): Promise<{ success: boolean; name?: string; error?: string }> {
    const targetDir = scope === 'global' ? GLOBAL_SKILLS_DIR : null;
    if (!targetDir) {
      return { success: false, error: 'Project-scope install requires a workspace directory' };
    }

    try {
      // If source is a local directory, copy it
      if (fs.existsSync(source) && fs.statSync(source).isDirectory()) {
        const skillMd = path.join(source, 'SKILL.md');
        if (!fs.existsSync(skillMd)) {
          return { success: false, error: 'Directory does not contain a SKILL.md file' };
        }

        const dirName = path.basename(source);
        const dest = path.join(targetDir, dirName);
        this.copyDirSync(source, dest);
        await this.discoverAll();

        return { success: true, name: dirName };
      }

      // If source looks like a git URL, clone it
      if (source.startsWith('http') || source.startsWith('git@') || source.includes('github.com')) {
        const { execSync } = await import('child_process');
        // Extract owner/repo for directory name to avoid clashes
        // e.g. https://github.com/anthropics/skills → anthropics-skills
        //      https://github.com/tavily-ai/skills → tavily-ai-skills
        const dirName = this.gitUrlToDirName(source);
        const dest = path.join(targetDir, dirName);

        if (fs.existsSync(dest)) {
          return { success: false, error: `Skill directory "${dirName}" already exists at ${dest}` };
        }

        execSync(`git clone "${source}" "${dest}"`, { timeout: 60000 });
        await this.discoverAll();

        return { success: true, name: dirName };
      }

      return { success: false, error: 'Source must be a local directory path or git URL' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Uninstall (delete) a skill by name.
   */
  async uninstallSkill(name: string): Promise<{ success: boolean; error?: string }> {
    const skill = this.registry.get(name);
    if (!skill) {
      return { success: false, error: `Skill "${name}" not found` };
    }

    try {
      fs.rmSync(skill.baseDir, { recursive: true, force: true });
      this.registry.delete(name);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Create a new skill from a template.
   */
  async createSkill(
    name: string,
    description: string,
    scope: 'global' | 'project' = 'global',
    workspaceDir?: string,
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    // Validate name
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name) || name.length > 64) {
      return { success: false, error: 'Name must be 1-64 chars, lowercase letters/numbers/hyphens, no leading/trailing/consecutive hyphens' };
    }
    if (name.includes('--')) {
      return { success: false, error: 'Name must not contain consecutive hyphens' };
    }

    const baseDir = scope === 'global'
      ? GLOBAL_SKILLS_DIR
      : workspaceDir
        ? path.join(workspaceDir, '.pi', 'skills')
        : null;

    if (!baseDir) {
      return { success: false, error: 'No target directory available' };
    }

    const skillDir = path.join(baseDir, name);
    if (fs.existsSync(skillDir)) {
      return { success: false, error: `Skill "${name}" already exists at ${skillDir}` };
    }

    try {
      fs.mkdirSync(skillDir, { recursive: true });
      fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });

      const skillMd = `---
name: ${name}
description: ${description}
---

# ${name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

## Setup

Run once before first use:
\`\`\`bash
# Add setup instructions here
\`\`\`

## Usage

\`\`\`bash
# Add usage instructions here
\`\`\`

## Notes

- Add any additional notes or references here
`;

      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await this.discoverAll();

      return { success: true, path: skillDir };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Format enabled skills for injection into the system prompt.
   */
  formatForSystemPrompt(projectId: string): string {
    const enabled = this.getEnabledSkills(projectId);
    if (enabled.length === 0) return '';
    return formatSkillsForPrompt(enabled);
  }

  /**
   * Set additional custom skill paths.
   */
  setCustomPaths(paths: string[]): void {
    this.customPaths = paths;
  }

  // ── Private helpers ───────────────────────────────────────

  private getProjectConfig(projectId: string): SkillConfig {
    if (this.projectConfigs.has(projectId)) {
      return this.projectConfigs.get(projectId)!;
    }
    // Load from disk
    const config = this.loadProjectConfig(projectId);
    this.projectConfigs.set(projectId, config);
    return config;
  }

  private isSkillEnabled(skillName: string, config: SkillConfig): boolean {
    // Explicit disable takes priority
    if (config.disabled.includes(skillName)) return false;
    // Explicit enable takes priority
    if (config.enabled.includes(skillName)) return true;
    // Default: enabled
    return true;
  }

  private getProjectConfigPath(projectId: string): string {
    const dir = path.join(SERO_DATA_DIR, 'projects', projectId);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'skills.json');
  }

  private loadProjectConfig(projectId: string): SkillConfig {
    try {
      const filePath = this.getProjectConfigPath(projectId);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return {
        enabled: Array.isArray(data.enabled) ? data.enabled : [],
        disabled: Array.isArray(data.disabled) ? data.disabled : [],
      };
    } catch {
      return { enabled: [], disabled: [] };
    }
  }

  private saveProjectConfig(projectId: string, config: SkillConfig): void {
    try {
      const filePath = this.getProjectConfigPath(projectId);
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
      this.projectConfigs.set(projectId, config);
    } catch (err) {
      console.error(`[skills] Failed to save config for ${projectId}:`, err);
    }
  }

  /**
   * Convert a git URL to a unique directory name using owner-repo format.
   * e.g. https://github.com/anthropics/skills → anthropics-skills
   *      https://github.com/tavily-ai/skills.git → tavily-ai-skills
   *      git@github.com:user/my-skill.git → user-my-skill
   */
  private gitUrlToDirName(url: string): string {
    // Normalize: strip .git suffix, trailing slashes
    let cleaned = url.replace(/\.git$/, '').replace(/\/+$/, '');

    // Try to extract owner/repo from common patterns
    // HTTPS: https://github.com/owner/repo
    const httpsMatch = cleaned.match(/(?:github\.com|gitlab\.com|bitbucket\.org)[/:]([^/]+)\/([^/]+)$/);
    if (httpsMatch) {
      return `${httpsMatch[1]}-${httpsMatch[2]}`;
    }

    // SSH: git@github.com:owner/repo
    const sshMatch = cleaned.match(/:([^/]+)\/([^/]+)$/);
    if (sshMatch) {
      return `${sshMatch[1]}-${sshMatch[2]}`;
    }

    // Fallback: last two path segments joined with hyphen, or just last segment
    const parts = cleaned.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}-${parts[parts.length - 1]}`;
    }
    return parts[parts.length - 1] ?? 'skill';
  }

  private copyDirSync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
