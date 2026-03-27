/**
 * LSP types, language server configurations, and shared constants.
 */

export interface LspServerConfig {
  /** Unique language key (e.g. 'typescript'). */
  language: string;
  /** Command to run inside the container. */
  command: string;
  /** Shell command to check if the server binary is installed. */
  checkCommand: string;
  /** Shell command to install the server binary. */
  installCommand: string;
  /** File extensions this server handles. */
  extensions: string[];
  /** Monaco language IDs this server handles. */
  monacoLanguageIds: string[];
  /** Extension → LSP language ID map. */
  languageIdMap: Record<string, string>;
  /** Initialization options passed to the server. */
  initOptions?: Record<string, unknown>;
}

/** Supported language server configurations. */
export const LANGUAGE_SERVERS: LspServerConfig[] = [
  {
    language: 'typescript',
    command: 'typescript-language-server --stdio',
    checkCommand: 'which typescript-language-server',
    installCommand: 'npm install -g typescript-language-server typescript',
    extensions: ['ts', 'tsx', 'js', 'jsx', 'mts', 'cts', 'mjs', 'cjs'],
    monacoLanguageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    languageIdMap: {
      ts: 'typescript', tsx: 'typescriptreact',
      js: 'javascript', jsx: 'javascriptreact',
      mts: 'typescript', cts: 'typescript',
      mjs: 'javascript', cjs: 'javascript',
    },
    initOptions: {
      preferences: {
        includeCompletionsForModuleExports: true,
        includeCompletionsWithInsertText: true,
      },
    },
  },
];

/** Find a server config by Monaco language ID. */
export function findConfigByLanguageId(languageId: string): LspServerConfig | undefined {
  return LANGUAGE_SERVERS.find((s) => s.monacoLanguageIds.includes(languageId));
}

/** Convert a container file path to a file:// URI. */
export function fileUri(containerPath: string): string {
  return `file://${containerPath}`;
}

// ── JSON-RPC message types ─────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

/** Type guards. */
export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'id' in msg && !('method' in msg);
}

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'id' in msg && 'method' in msg;
}

export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return !('id' in msg) && 'method' in msg;
}
