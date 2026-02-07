/**
 * LspManager — orchestrates language servers across all projects.
 * One manager instance in the main process, manages multiple servers per project.
 */
import { EventEmitter } from 'events';
import { LspServerProcess } from './lsp-process';
import { findConfigByLanguageId, type LspServerConfig } from './types';
import type { ContainerManager } from '../container-manager';

export class LspManager extends EventEmitter {
  // projectId → language → LspServerProcess
  private servers = new Map<string, Map<string, LspServerProcess>>();

  constructor(private containerManager: ContainerManager) {
    super();
  }

  /**
   * Start a language server for a project.
   * Waits for the container to be ready, installs the server binary if needed,
   * then spawns it. Retries on transient container errors (not running / not found).
   */
  async startServer(
    projectId: string,
    languageId: string,
  ): Promise<{ capabilities: Record<string, unknown>; language: string }> {
    const config = findConfigByLanguageId(languageId);
    if (!config) throw new Error(`No LSP server configured for language: ${languageId}`);

    // Check if already running
    const existing = this.getServer(projectId, config.language);
    if (existing?.initialized) {
      return { capabilities: existing.serverCapabilities, language: config.language };
    }

    // Wait for the container to be ready, then install server binary
    await this.waitForContainerAndInstall(projectId, config);

    // Get env vars for the container
    const envVars = this.containerManager.getEnvVars();

    const server = new LspServerProcess(projectId, config, envVars);

    // Forward diagnostics and other notifications to the renderer
    server.on('notification', (notification: any) => {
      this.emit('notification', { projectId, language: config.language, notification });
    });

    server.on('exit', () => {
      const projectServers = this.servers.get(projectId);
      if (projectServers) {
        projectServers.delete(config.language);
        if (projectServers.size === 0) this.servers.delete(projectId);
      }
      this.emit('serverStopped', { projectId, language: config.language });
    });

    server.on('error', (err: Error) => {
      console.error(`[lsp-manager] Server error for ${projectId}/${config.language}:`, err.message);
    });

    // Register in the map
    let projectServers = this.servers.get(projectId);
    if (!projectServers) {
      projectServers = new Map();
      this.servers.set(projectId, projectServers);
    }
    projectServers.set(config.language, server);

    try {
      const capabilities = await server.start();
      console.log(`[lsp-manager] Server ready: ${projectId}/${config.language}`);
      return { capabilities, language: config.language };
    } catch (err) {
      // Clean up on failure
      projectServers.delete(config.language);
      if (projectServers.size === 0) this.servers.delete(projectId);
      throw err;
    }
  }

  /** Send an LSP request to the appropriate server. */
  async sendRequest(
    projectId: string,
    language: string,
    method: string,
    params?: unknown,
  ): Promise<unknown> {
    const server = this.getServer(projectId, language);
    if (!server?.initialized) {
      throw new Error(`No initialized LSP server for ${projectId}/${language}`);
    }
    return server.sendRequest(method, params);
  }

  /** Send an LSP notification to the appropriate server. */
  sendNotification(
    projectId: string,
    language: string,
    method: string,
    params?: unknown,
  ): void {
    const server = this.getServer(projectId, language);
    if (!server?.initialized) return; // Silently ignore if server not ready
    server.sendNotification(method, params);
  }

  /** Stop a specific language server for a project. */
  async stopServer(projectId: string, language: string): Promise<void> {
    const server = this.getServer(projectId, language);
    if (server) {
      await server.shutdown();
      const projectServers = this.servers.get(projectId);
      if (projectServers) {
        projectServers.delete(language);
        if (projectServers.size === 0) this.servers.delete(projectId);
      }
    }
  }

  /** Stop all language servers for a project. */
  async stopProjectServers(projectId: string): Promise<void> {
    const projectServers = this.servers.get(projectId);
    if (!projectServers) return;

    const shutdowns = Array.from(projectServers.values()).map(s => s.shutdown());
    await Promise.allSettled(shutdowns);
    this.servers.delete(projectId);
  }

  /** Stop all language servers (app shutdown). */
  async disposeAll(): Promise<void> {
    const allShutdowns: Promise<void>[] = [];
    for (const [projectId] of this.servers) {
      allShutdowns.push(this.stopProjectServers(projectId));
    }
    await Promise.allSettled(allShutdowns);
    this.servers.clear();
  }

  /** Check if a server is running for a project/language. */
  hasServer(projectId: string, language: string): boolean {
    return this.getServer(projectId, language)?.initialized ?? false;
  }

  private getServer(projectId: string, language: string): LspServerProcess | undefined {
    return this.servers.get(projectId)?.get(language);
  }

  /**
   * Wait for the container to be ready and then ensure the LSP binary is installed.
   * Retries up to 5 times with 2s delay for transient container errors
   * (container not running yet, not found during startup race).
   */
  private async waitForContainerAndInstall(
    projectId: string,
    config: LspServerConfig,
  ): Promise<void> {
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const checkResult = await this.containerManager.exec(projectId, config.checkCommand);
        if (checkResult.exitCode === 0) return; // Already installed

        console.log(`[lsp-manager] Installing ${config.language} server in ${projectId}...`);
        const installResult = await this.containerManager.exec(projectId, config.installCommand);
        if (installResult.exitCode !== 0) {
          throw new Error(
            `Failed to install ${config.language} server: ${installResult.stderr || installResult.stdout}`
          );
        }
        console.log(`[lsp-manager] Installed ${config.language} server in ${projectId}`);
        return;
      } catch (err: any) {
        const msg = err?.message ?? '';
        const isTransient = msg.includes('not running') || msg.includes('not found');

        if (isTransient && attempt < MAX_RETRIES) {
          console.log(`[lsp-manager] Container not ready for ${projectId}, retrying in ${RETRY_DELAY_MS}ms (${attempt}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        throw err;
      }
    }
  }
}
