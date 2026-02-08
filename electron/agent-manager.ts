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

  constructor(
    private containerManager: ContainerManager,
    private skillManager: SkillManager,
  ) {
    this.authStorage = new AuthStorage();
    this.modelRegistry = new ModelRegistry(this.authStorage);
  }

  /**
   * Create a new agent session for a project.
   * Tools are wired to execute inside the project's container.
   */
  async createSession(projectId: string): Promise<void> {
    if (this.sessions.has(projectId)) return;

    const tools = createContainerTools(this.containerManager, this.skillManager, projectId);
    const sm = this.skillManager;

    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 3 },
    });

    const loader = new DefaultResourceLoader({
      cwd: WORKSPACE_DIR,
      settingsManager,
      systemPromptOverride: () => buildSystemPrompt(sm, projectId),
    });
    await loader.reload();

    const { session } = await createAgentSession({
      cwd: WORKSPACE_DIR,
      sessionManager: SessionManager.inMemory(),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      customTools: tools,
      resourceLoader: loader,
      settingsManager,
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
