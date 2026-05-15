/**
 * Manages a single language server process running inside a workspace runtime.
 * Handles spawning, JSON-RPC communication, initialization, and shutdown.
 */

import { EventEmitter } from 'events';
import { JsonRpcParser, encodeMessage } from './json-rpc';
import type { RuntimeBackend, RuntimeProcess } from '@electron/features/workspace/runtime/types';
import type {
  LspServerConfig, JsonRpcMessage, JsonRpcRequest,
  JsonRpcResponse, JsonRpcNotification,
} from './types';
import { isResponse, isRequest, isNotification, fileUri } from './types';
import { resolveServerRequest } from './server-request-handlers';
import {
  RUNTIME_WORKSPACE_PATH,
  toHostWorkspacePath,
  toRuntimeWorkspacePath,
} from '@electron/features/workspace/runtime/runtime-paths';

const REQUEST_TIMEOUT_MS = 30_000;

interface InitializeResult {
  capabilities?: Record<string, unknown>;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getInitializeResult(value: unknown): InitializeResult | null {
  if (!isRecord(value)) return null;
  const capabilities = value.capabilities;
  if (capabilities === undefined) return {};
  return isRecord(capabilities) ? { capabilities } : null;
}

function getNodeErrorCode(err: unknown): string | number | undefined {
  if (!isRecord(err)) return undefined;
  const code = err.code;
  return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}

function getNodeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (!isRecord(err)) return '';
  return typeof err.message === 'string' ? err.message : '';
}

function translateValue(value: unknown, mapUri: (uri: string) => string): unknown {
  if (typeof value === 'string') return mapUri(value);
  if (Array.isArray(value)) return value.map((entry) => translateValue(entry, mapUri));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, translateValue(entry, mapUri)]),
  );
}

export class LspServerProcess extends EventEmitter {
  private process: RuntimeProcess | null = null;
  private parser = new JsonRpcParser();
  private nextId = 1;
  private pendingRequests = new Map<number, {
    resolve: (result: unknown) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private _initialized = false;
  private _disposed = false;
  private capabilities: Record<string, unknown> = {};
  private unhandledServerRequestMethods = new Set<string>();

  constructor(
    private workspaceId: string,
    private config: LspServerConfig,
    private runtime: RuntimeBackend,
    private envVars: Record<string, string>,
  ) {
    super();
    this.parser.on('message', (msg: JsonRpcMessage) => this.handleMessage(msg));
    this.parser.on('error', (err: Error) => {
      console.warn(`[lsp:${this.config.language}] Parse error:`, err.message);
    });
  }

  get initialized(): boolean { return this._initialized; }
  get disposed(): boolean { return this._disposed; }
  get serverCapabilities(): Record<string, unknown> { return this.capabilities; }

  /** Spawn the language server process inside the selected workspace runtime. */
  async start(): Promise<Record<string, unknown>> {
    if (this._disposed) throw new Error('Server is disposed');
    if (this.process) throw new Error('Server already started');

    this.process = await this.runtime.spawn({
      command: this.config.command,
      cwd: RUNTIME_WORKSPACE_PATH,
      env: this.envVars,
      stdio: 'pipe',
    });

    this.process.onData((data) => this.parser.feed(Buffer.from(data)));

    this.process.onExit(({ exitCode, signal }) => {
      console.log(`[lsp:${this.config.language}] Exited (code=${exitCode}, signal=${signal})`);
      this.emit('exit', exitCode, signal);
      this.cleanup();
    });

    return this.initialize();
  }

  /** Send a JSON-RPC request and wait for a response. */
  sendRequest(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process || this._disposed) {
        reject(new Error('Server not running'));
        return;
      }
      const id = this.nextId++;
      const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params: this.toServerValue(params) };
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request '${method}' timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      this.pendingRequests.set(id, { resolve, reject, timer });
      this.write(msg);
    });
  }

  /** Send a JSON-RPC notification (no response expected). */
  sendNotification(method: string, params?: unknown): void {
    if (!this.process || this._disposed) return;
    const msg: JsonRpcNotification = { jsonrpc: '2.0', method, params: this.toServerValue(params) };
    this.write(msg);
  }

  /** Gracefully shut down the server. */
  async shutdown(): Promise<void> {
    if (this._disposed || !this.process) return;

    try {
      await Promise.race([
        this.sendRequest('shutdown'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('shutdown timeout')), 5000)),
      ]);
      this.sendNotification('exit');
    } catch {
      this.process?.signal('SIGTERM');
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.process?.signal('SIGKILL');
        resolve();
      }, 2000);
      if (this.process) {
        this.process.onExit(() => { clearTimeout(timer); resolve(); });
      } else {
        clearTimeout(timer);
        resolve();
      }
    });

    this.cleanup();
  }

  // ── Private ───────────────────────────────────────────────

  private async initialize(): Promise<Record<string, unknown>> {
    const rootPath = this.serverRootPath();
    const rootUri = fileUri(rootPath);

    const result = await this.sendRequest('initialize', {
      processId: null,
      rootUri,
      rootPath,
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, willSave: false, didSave: true, willSaveWaitUntil: false },
          completion: {
            dynamicRegistration: false,
            completionItem: {
              snippetSupport: true, commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true, preselectSupport: true,
              resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
            },
            contextSupport: true,
          },
          hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          publishDiagnostics: { relatedInformation: true, tagSupport: { valueSet: [1, 2] } },
          signatureHelp: {
            dynamicRegistration: false,
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: { labelOffsetSupport: true },
            },
          },
        },
        workspace: { workspaceFolders: true, configuration: true },
      },
      workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
      initializationOptions: this.config.initOptions ?? {},
    });

    const initializeResult = getInitializeResult(result);
    if (!initializeResult) {
      throw new Error('LSP initialize response did not include a valid capabilities object');
    }

    this.capabilities = initializeResult.capabilities ?? {};
    this._initialized = true;
    this.sendNotification('initialized', {});
    console.log(`[lsp:${this.config.language}] Initialized for ${this.workspaceId}`);
    return this.capabilities;
  }

  private handleMessage(msg: JsonRpcMessage): void {
    msg = this.fromServerMessage(msg);
    if (isResponse(msg)) {
      const pending = this.pendingRequests.get(msg.id!);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id!);
        if (msg.error) {
          pending.reject(new Error(`LSP error ${msg.error.code}: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }
    if (isRequest(msg)) {
      this.handleServerRequest(msg as JsonRpcRequest);
      return;
    }
    if (isNotification(msg)) {
      this.emit('notification', msg);
    }
  }

  private handleServerRequest(req: JsonRpcRequest): void {
    const { handled, result } = resolveServerRequest(req);
    if (!handled && !this.unhandledServerRequestMethods.has(req.method)) {
      this.unhandledServerRequestMethods.add(req.method);
      console.log(`[lsp:${this.config.language}] Unhandled server request: ${req.method}`);
    }

    const response: JsonRpcResponse = { jsonrpc: '2.0', id: req.id, result };
    this.write(response);
  }

  private serverRootPath(): string {
    return this.runtime.workspaceAccess === 'host'
      ? this.runtime.hostWorkspacePath
      : this.runtime.runtimeWorkspacePath;
  }

  private toServerValue(value: unknown): unknown {
    if (this.runtime.workspaceAccess !== 'host') return value;
    return translateValue(value, (uri) => this.runtimeUriToHostUri(uri));
  }

  private fromServerMessage(message: JsonRpcMessage): JsonRpcMessage {
    if (this.runtime.workspaceAccess !== 'host') return message;
    return translateValue(message, (uri) => this.hostUriToRuntimeUri(uri)) as JsonRpcMessage;
  }

  private runtimeUriToHostUri(uri: string): string {
    const runtimePrefix = fileUri(RUNTIME_WORKSPACE_PATH);
    if (uri !== runtimePrefix && !uri.startsWith(`${runtimePrefix}/`)) return uri;
    return fileUri(toHostWorkspacePath(this.runtime.hostWorkspacePath, uri.slice('file://'.length)));
  }

  private hostUriToRuntimeUri(uri: string): string {
    if (!uri.startsWith('file://')) return uri;
    const hostPath = uri.slice('file://'.length);
    const runtimePath = toRuntimeWorkspacePath(this.runtime.hostWorkspacePath, hostPath);
    return runtimePath ? fileUri(runtimePath) : uri;
  }

  private write(msg: JsonRpcMessage): void {
    if (!this.process) return;
    try {
      this.process.write(encodeMessage(msg).toString('utf8'));
    } catch (err: unknown) {
      if (getNodeErrorCode(err) !== 'EPIPE') {
        console.warn(`[lsp:${this.config.language}] Write error:`, getNodeErrorMessage(err));
      }
    }
  }

  private cleanup(): void {
    this._disposed = true;
    this._initialized = false;
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Server disposed'));
    }
    this.pendingRequests.clear();
    this.parser.reset();
    this.process = null;
  }
}
