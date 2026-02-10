/**
 * PI Package installation and management.
 *
 * Wraps the SDK's DefaultPackageManager so that `pi install`, `pi remove`, etc.
 * semantics are reproduced exactly — including the npm global-install path,
 * git-clone conventions, and settings.json persistence.
 *
 * Uses SettingsManager.create() (file-backed) so installs are compatible with
 * the PI CLI — packages installed here appear in `pi list` and vice-versa.
 */
import {
  DefaultPackageManager,
  SettingsManager,
  getAgentDir,
  type PackageManager,
  type ProgressCallback,
  type ProgressEvent,
  type ResolvedPaths,
  type ResolvedResource,
} from '@mariozechner/pi-coding-agent';

export interface InstalledPackageInfo {
  /** Original source string, e.g. "npm:@foo/bar@1.0.0" or "git:github.com/user/repo" */
  source: string;
  /** Resolved filesystem path (undefined if not yet installed) */
  installPath?: string;
  /** Resources discovered inside the package */
  resources: {
    extensions: string[];
    skills: string[];
    prompts: string[];
    themes: string[];
  };
}

export interface PackageInstallResult {
  success: boolean;
  error?: string;
}

export interface PackageListItem {
  source: string;
  scope: 'global' | 'project';
}

/**
 * Manages PI package installation, removal, and resolution.
 *
 * All operations delegate to DefaultPackageManager from the PI SDK,
 * ensuring identical behaviour to the `pi` CLI.
 */
export class PackageInstaller {
  private packageManager: PackageManager;
  private settingsManager: SettingsManager;
  private agentDir: string;
  private lastResolvedPaths: ResolvedPaths | null = null;

  constructor(private cwd: string = process.cwd()) {
    this.agentDir = getAgentDir();
    // File-backed settings so packages persist to ~/.pi/agent/settings.json
    this.settingsManager = SettingsManager.create(this.cwd, this.agentDir);
    this.packageManager = new DefaultPackageManager({
      cwd: this.cwd,
      agentDir: this.agentDir,
      settingsManager: this.settingsManager,
    });
  }

  /**
   * Install a package from any supported source.
   * Sources: "npm:@scope/pkg@version", "git:github.com/user/repo@ref",
   *          "https://github.com/user/repo", "/absolute/path"
   */
  async install(source: string, options?: { local?: boolean }): Promise<PackageInstallResult> {
    try {
      await this.packageManager.install(source, options);
      // Register in settings.json so the package persists across restarts
      // and is visible to `pi list` / resolve(). The SDK separates physical
      // installation from settings persistence.
      this.packageManager.addSourceToSettings(source, options);
      this.lastResolvedPaths = null; // invalidate cache
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Remove a previously installed package.
   */
  async remove(source: string, options?: { local?: boolean }): Promise<PackageInstallResult> {
    try {
      await this.packageManager.remove(source, options);
      // Remove from settings.json so it doesn't reappear on next resolve()
      this.packageManager.removeSourceFromSettings(source, options);
      this.lastResolvedPaths = null;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Update all (or a specific) installed packages.
   */
  async update(source?: string): Promise<PackageInstallResult> {
    try {
      await this.packageManager.update(source);
      this.lastResolvedPaths = null;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * List all configured package sources from settings.
   */
  list(): PackageListItem[] {
    // Reload settings to pick up any external changes (e.g. pi CLI installs)
    this.settingsManager.reload();

    const globalPkgs = this.settingsManager.getGlobalSettings().packages ?? [];
    const projectPkgs = this.settingsManager.getProjectSettings().packages ?? [];

    const items: PackageListItem[] = [];
    for (const pkg of globalPkgs) {
      const source = typeof pkg === 'string' ? pkg : pkg.source;
      items.push({ source, scope: 'global' });
    }
    for (const pkg of projectPkgs) {
      const source = typeof pkg === 'string' ? pkg : pkg.source;
      items.push({ source, scope: 'project' });
    }
    return items;
  }

  /**
   * Resolve all packages and return the discovered resource paths.
   * This installs any missing packages (auto-install on first resolve).
   */
  async resolve(): Promise<ResolvedPaths> {
    if (this.lastResolvedPaths) return this.lastResolvedPaths;

    // Reload settings to pick up external changes
    this.settingsManager.reload();

    this.lastResolvedPaths = await this.packageManager.resolve(
      // On missing source, auto-install it
      async (_source: string) => 'install' as const,
    );
    return this.lastResolvedPaths;
  }

  /**
   * Get resolved skill paths from all installed packages.
   */
  async getResolvedSkillPaths(): Promise<string[]> {
    const resolved = await this.resolve();
    return resolved.skills
      .filter((r: ResolvedResource) => r.enabled)
      .map((r: ResolvedResource) => r.path);
  }

  /**
   * Get resolved extension paths from all installed packages.
   */
  async getResolvedExtensionPaths(): Promise<string[]> {
    const resolved = await this.resolve();
    return resolved.extensions
      .filter((r: ResolvedResource) => r.enabled)
      .map((r: ResolvedResource) => r.path);
  }

  /**
   * Get resolved prompt paths from all installed packages.
   */
  async getResolvedPromptPaths(): Promise<string[]> {
    const resolved = await this.resolve();
    return resolved.prompts
      .filter((r: ResolvedResource) => r.enabled)
      .map((r: ResolvedResource) => r.path);
  }

  /**
   * Get resolved theme paths from all installed packages.
   */
  async getResolvedThemePaths(): Promise<string[]> {
    const resolved = await this.resolve();
    return resolved.themes
      .filter((r: ResolvedResource) => r.enabled)
      .map((r: ResolvedResource) => r.path);
  }

  /**
   * Get the full resolved paths object (all resource types).
   */
  async getResolvedPaths(): Promise<ResolvedPaths> {
    return this.resolve();
  }

  /**
   * Register a progress callback for install/remove/update operations.
   */
  onProgress(callback: ProgressCallback): void {
    this.packageManager.setProgressCallback(callback);
  }

  /**
   * Invalidate the resolved paths cache (call after external changes).
   */
  invalidateCache(): void {
    this.lastResolvedPaths = null;
  }

  /**
   * Get the agent directory path.
   */
  getAgentDir(): string {
    return this.agentDir;
  }

  /**
   * Get the underlying settings manager (for agent session integration).
   */
  getSettingsManager(): SettingsManager {
    return this.settingsManager;
  }
}
