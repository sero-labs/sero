import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import { ContainerManager } from './container-manager';
import { SkillManager } from './skill-manager';
import { createContainerTools } from './agent-tools';
import { buildSystemPrompt } from './agent-system-prompt';
import type { PackageInstaller } from './package-installer';

const WORKSPACE_DIR = '/workspace';

/**
 * Manages Pi agent sessions — one (or more, in future) per project.
 * Each agent's tools execute inside the project's container.
 */
export class AgentManager {
  private sessions = new Map<string, AgentSession>();
  private listeners = new Map<string, (() => void)[]>();
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;
  private packageInstaller: PackageInstaller | null = null;

  constructor(
    private containerManager: ContainerManager,
    private skillManager: SkillManager,
  ) {
    this.authStorage = new AuthStorage();
    this.modelRegistry = new ModelRegistry(this.authStorage);
  }

  /**
   * Set the package installer for resolving extension/skill/prompt/theme
   * paths from installed PI packages into agent sessions.
   */
  setPackageInstaller(installer: PackageInstaller): void {
    this.packageInstaller = installer;
  }

  /**
   * Create a new agent session for a project.
   * Tools are wired to execute inside the project's container.
   */
  async createSession(projectId: string): Promise<void> {
    if (this.sessions.has(projectId)) return;

    console.log(`[agent] Creating session for ${projectId}...`);

    const tools = createContainerTools(this.containerManager, this.skillManager, projectId);
    const sm = this.skillManager;

    // Session-level settings (compaction, retry) — in-memory, no file persistence
    const sessionSettings = SettingsManager.inMemory({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 3 },
    });

    // For the resource loader, use the PackageInstaller's file-backed settings
    // so it resolves packages naturally from ~/.pi/agent/settings.json — the same
    // way PI CLI does. This avoids the fragile additionalExtensionPaths workaround
    // where pre-resolved paths are re-resolved by the loader's internal PM.
    const resourceSettings = this.packageInstaller?.getSettingsManager() ?? sessionSettings;

    const loader = new DefaultResourceLoader({
      cwd: WORKSPACE_DIR,
      settingsManager: resourceSettings,
      systemPromptOverride: () => buildSystemPrompt(sm, projectId),
    });
    await loader.reload();

    // Diagnostic: check what extensions/resources were actually loaded
    try {
      const extResult = loader.getExtensions();
      const loadedTools = extResult.extensions.flatMap(
        (ext: any) => Array.from(ext.tools?.keys?.() ?? [])
      );
      console.log(`[agent] Loaded ${extResult.extensions.length} extension(s),`,
        `${extResult.errors.length} error(s),`,
        `tools: [${loadedTools.join(', ')}]`);
      if (extResult.errors.length > 0) {
        for (const err of extResult.errors) {
          console.error(`[agent] Extension error at ${err.path}: ${err.error}`);
        }
      }
    } catch (diagErr) {
      console.warn('[agent] Could not inspect loaded extensions:', diagErr);
    }

    const { session } = await createAgentSession({
      cwd: WORKSPACE_DIR,
      sessionManager: SessionManager.inMemory(),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      customTools: tools,
      resourceLoader: loader,
      settingsManager: sessionSettings,
    });

    this.sessions.set(projectId, session);
  }

  /**
   * Subscribe to agent events for a project.
   * Returns unsubscribe function.
   */
  subscribe(projectId: string, listener: (event: AgentSessionEvent) => void): () => void {
    const session = this.sessions.get(projectId);
    if (!session) throw new Error(`No agent session for project ${projectId}`);

    const unsub = session.subscribe(listener);
    const existing = this.listeners.get(projectId) ?? [];
    existing.push(unsub);
    this.listeners.set(projectId, existing);
    return unsub;
  }

  /**
   * Send a prompt to the project's agent.
   * If the session is disposed or in a bad state, recreate it.
   */
  async prompt(projectId: string, message: string): Promise<void> {
    let session = this.sessions.get(projectId);
    if (!session) throw new Error(`No agent session for project ${projectId}`);

    try {
      if (session.isStreaming) {
        await session.followUp(message);
      } else {
        await session.prompt(message);
      }
    } catch (err: any) {
      console.error(`Agent prompt failed for ${projectId}:`, err?.message);
      try {
        this.dispose(projectId);
        await this.createSession(projectId);
        session = this.sessions.get(projectId);
        if (session) {
          await session.prompt(message);
        } else {
          throw err;
        }
      } catch (retryErr) {
        console.error(`Agent session recreation failed for ${projectId}:`, retryErr);
        throw err;
      }
    }
  }

  /** Abort the current agent operation. */
  async abort(projectId: string): Promise<void> {
    const session = this.sessions.get(projectId);
    if (session) await session.abort();
  }

  /** Remove all event subscriptions for a project (without disposing the session). */
  unsubscribeAll(projectId: string): void {
    const unsubs = this.listeners.get(projectId);
    if (unsubs) {
      unsubs.forEach(fn => fn());
      this.listeners.delete(projectId);
    }
  }

  /** Dispose a single project's agent session. */
  dispose(projectId: string): void {
    this.unsubscribeAll(projectId);
    const session = this.sessions.get(projectId);
    if (session) {
      session.dispose();
      this.sessions.delete(projectId);
    }
  }

  /** Dispose all sessions (app shutdown). */
  disposeAll(): void {
    for (const projectId of this.sessions.keys()) {
      this.dispose(projectId);
    }
  }

  /** Check if a project has an active agent session. */
  hasSession(projectId: string): boolean {
    return this.sessions.has(projectId);
  }
}
