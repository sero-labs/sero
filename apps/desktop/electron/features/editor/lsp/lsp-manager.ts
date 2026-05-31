/**
 * LspManager — orchestrates language servers across all workspaces.
 * One manager instance in the main process, manages multiple servers per workspace.
 */

import { EventEmitter } from 'events';
import { LspServerProcess } from './lsp-process';
import {
  findConfigByLanguageId,
  type JsonRpcNotification,
  type LspServerConfig,
} from './types';
import type { RuntimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import {
  classifyNativeBuildFailure,
  createNativeBuildToolsRequiredMetadata,
} from '@electron/features/workspace/runtime/native-build/classifier';
import { NativeBuildToolsRequiredError } from '@electron/features/workspace/runtime/native-build/types';
import { ensureCoreTools } from '@electron/features/workspace/runtime/install-actions';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';

class HostCoreToolsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostCoreToolsUnavailableError';
  }
}

const HOST_NODE_NPM_PROBE = [
  'node -e "process.exit(Number(process.versions.node.split(\'.\')[0]) >= 22 ? 0 : 1)"',
  'npm --version',
].map((command) => `${command} >/dev/null 2>&1`).join(' && ');

export class LspManager extends EventEmitter {
  /** workspaceId → language → LspServerProcess */
  private servers = new Map<string, Map<string, LspServerProcess>>();
  /** workspaceId/language → in-flight startup promise */
  private startupPromises = new Map<string, Promise<{ capabilities: Record<string, unknown>; language: string }>>();

  constructor(private runtimeManager: RuntimeManager) {
    super();
  }

  /**
   * Start a language server for a workspace.
   * Waits for the container, installs the server if needed, then spawns it.
   */
  async startServer(
    workspaceId: string,
    languageId: string,
  ): Promise<{ capabilities: Record<string, unknown>; language: string }> {
    const runtime = await this.runtimeManager.getRuntime(workspaceId);
    if (!runtime.capabilities.languageServers) {
      throw new Error(`Language servers are not available for ${runtime.backend} runtime.`);
    }

    const config = findConfigByLanguageId(languageId);
    if (!config) throw new Error(`No LSP server configured for language: ${languageId}`);

    const existing = this.getServer(workspaceId, config.language);
    if (existing?.initialized) {
      return { capabilities: existing.serverCapabilities, language: config.language };
    }

    const startupKey = this.getStartupKey(workspaceId, config.language);
    const inFlight = this.startupPromises.get(startupKey);
    if (inFlight) {
      return inFlight;
    }

    const startupPromise = this.createAndStartServer(workspaceId, config);
    this.startupPromises.set(startupKey, startupPromise);

    try {
      return await startupPromise;
    } finally {
      this.startupPromises.delete(startupKey);
    }
  }

  /** Send an LSP request to the appropriate server. */
  async sendRequest(workspaceId: string, language: string, method: string, params?: unknown): Promise<unknown> {
    const server = this.getServer(workspaceId, language);
    if (!server?.initialized) throw new Error(`No initialized LSP server for ${workspaceId}/${language}`);
    return server.sendRequest(method, params);
  }

  /** Send an LSP notification to the appropriate server. */
  sendNotification(workspaceId: string, language: string, method: string, params?: unknown): void {
    const server = this.getServer(workspaceId, language);
    if (!server?.initialized) return;
    server.sendNotification(method, params);
  }

  /** Stop a specific language server. */
  async stopServer(workspaceId: string, language: string): Promise<void> {
    const server = this.getServer(workspaceId, language);
    if (server) {
      await server.shutdown();
      const wsServers = this.servers.get(workspaceId);
      if (wsServers) {
        wsServers.delete(language);
        if (wsServers.size === 0) this.servers.delete(workspaceId);
      }
    }
  }

  /** Stop all language servers for a workspace. */
  async stopWorkspaceServers(workspaceId: string): Promise<void> {
    const wsServers = this.servers.get(workspaceId);
    if (!wsServers) return;
    const shutdowns = Array.from(wsServers.values()).map((s) => s.shutdown());
    await Promise.allSettled(shutdowns);
    this.servers.delete(workspaceId);
  }

  /** Stop all language servers (app shutdown). */
  async disposeAll(): Promise<void> {
    const all: Promise<void>[] = [];
    for (const [wsId] of this.servers) {
      all.push(this.stopWorkspaceServers(wsId));
    }
    await Promise.allSettled(all);
    this.servers.clear();
  }

  /** Check if a server is running for a workspace/language. */
  hasServer(workspaceId: string, language: string): boolean {
    return this.getServer(workspaceId, language)?.initialized ?? false;
  }

  private getServer(workspaceId: string, language: string): LspServerProcess | undefined {
    return this.servers.get(workspaceId)?.get(language);
  }

  private getStartupKey(workspaceId: string, language: string): string {
    return `${workspaceId}:${language}`;
  }

  private async createAndStartServer(
    workspaceId: string,
    config: LspServerConfig,
  ): Promise<{ capabilities: Record<string, unknown>; language: string }> {
    const runtime = await this.runtimeManager.getRuntime(workspaceId);
    if (!runtime.capabilities.languageServers) {
      throw new Error(`Language servers are not available for ${runtime.backend} runtime.`);
    }
    await this.waitForRuntimeAndInstall(runtime, config);

    const server = new LspServerProcess(workspaceId, config, runtime, {});

    server.on('notification', (notification: JsonRpcNotification) => {
      this.emit('notification', { workspaceId, language: config.language, notification });
    });

    server.on('exit', () => {
      const wsServers = this.servers.get(workspaceId);
      if (wsServers) {
        wsServers.delete(config.language);
        if (wsServers.size === 0) this.servers.delete(workspaceId);
      }
      this.startupPromises.delete(this.getStartupKey(workspaceId, config.language));
      this.emit('serverStopped', { workspaceId, language: config.language });
    });

    server.on('error', (err: Error) => {
      console.error(`[lsp-manager] Error for ${workspaceId}/${config.language}:`, err.message);
    });

    let wsServers = this.servers.get(workspaceId);
    if (!wsServers) {
      wsServers = new Map();
      this.servers.set(workspaceId, wsServers);
    }
    wsServers.set(config.language, server);

    try {
      const capabilities = await server.start();
      console.log(`[lsp-manager] Server ready: ${workspaceId}/${config.language}`);
      return { capabilities, language: config.language };
    } catch (err) {
      wsServers.delete(config.language);
      if (wsServers.size === 0) this.servers.delete(workspaceId);
      throw err;
    }
  }

  /**
   * Wait for the runtime and ensure the LSP binary is installed.
   * Retries up to 5 times for transient runtime errors.
   */
  private async waitForRuntimeAndInstall(
    runtime: Awaited<ReturnType<RuntimeManager['getRuntime']>>,
    config: LspServerConfig,
  ): Promise<void> {
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.ensureHostCoreTools(runtime, config.language);

        const checkResult = await runtime.exec({ command: config.checkCommand });
        if (checkResult.exitCode === 0) return;

        console.log(`[lsp-manager] Installing ${config.language} server in ${runtime.workspaceId}...`);
        const installResult = await runtime.exec({ command: config.installCommand });
        if (installResult.exitCode !== 0) {
          const failure = classifyNativeBuildFailure({
            command: config.installCommand,
            exitCode: installResult.exitCode,
            stdout: installResult.stdout,
            stderr: installResult.stderr,
            platform: process.platform,
          });
          if (failure) {
            throw new NativeBuildToolsRequiredError(createNativeBuildToolsRequiredMetadata(failure));
          }
          throw new Error(`Failed to install ${config.language} server: ${installResult.stderr || installResult.stdout}`);
        }
        const verifyResult = await runtime.exec({ command: config.checkCommand });
        if (verifyResult.exitCode !== 0) {
          throw new Error(`Installed ${config.language} server but command was not found: ${verifyResult.stderr || verifyResult.stdout}`);
        }
        console.log(`[lsp-manager] Installed ${config.language} server in ${runtime.workspaceId}`);
        return;
      } catch (err: unknown) {
        if (err instanceof HostCoreToolsUnavailableError) throw err;

        const msg = err instanceof Error ? err.message : '';
        const isTransient = msg.includes('not running') || msg.includes('not found');
        if (isTransient && attempt < MAX_RETRIES) {
          console.log(`[lsp-manager] Runtime not ready for ${runtime.workspaceId}, retrying (${attempt}/${MAX_RETRIES})...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        throw err;
      }
    }
  }

  private async ensureHostCoreTools(runtime: RuntimeBackend, language: string): Promise<void> {
    if (runtime.backend !== 'host') return;
    if (await hostRuntimeHasNodeAndNpm(runtime)) return;

    const status = await ensureCoreTools(`language server: ${language}`);
    if (status.state === 'ready') return;

    const tool = status.tools.find((candidate) => candidate.state !== 'ready');
    const detail = tool ? `${tool.tool} is ${tool.state}` : `core tools are ${status.state}`;
    const errorDetail = status.error ? ` ${status.error.message}.` : '';
    throw new HostCoreToolsUnavailableError(
      `Host language servers require Sero managed core tools. ${detail}.${errorDetail} Repair core tools in Runtime settings and try again.`,
    );
  }
}

async function hostRuntimeHasNodeAndNpm(runtime: RuntimeBackend): Promise<boolean> {
  const result = await runtime.exec({ command: HOST_NODE_NPM_PROBE, timeoutMs: 15_000 });
  return result.exitCode === 0;
}
