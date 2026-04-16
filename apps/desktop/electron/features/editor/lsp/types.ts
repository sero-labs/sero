/**
 * LSP types, language server configurations, and shared constants.
 */

import {
  LSP_LANGUAGE_ID_BY_EXTENSION,
  LSP_SERVER_LANGUAGE_BY_MONACO_ID,
} from '@/lsp/language-routing';

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

function buildLanguageIdMapForServer(serverLanguage: string): Record<string, string> {
  const entries = Object.entries(LSP_LANGUAGE_ID_BY_EXTENSION).filter(
    ([, languageId]) => LSP_SERVER_LANGUAGE_BY_MONACO_ID[languageId] === serverLanguage,
  );
  return Object.fromEntries(entries);
}

const TYPESCRIPT_LANGUAGE_SERVER_VERSION = '4.4.0';
const TYPESCRIPT_VERSION = '5.9.3';
const TYPESCRIPT_INSTALL_COMMAND = [
  `typescript-language-server@${TYPESCRIPT_LANGUAGE_SERVER_VERSION}`,
  `typescript@${TYPESCRIPT_VERSION}`,
].join(' ');

const TYPESCRIPT_LANGUAGE_ID_MAP = buildLanguageIdMapForServer('typescript');
const TYPESCRIPT_MONACO_LANGUAGE_IDS = Array.from(new Set(Object.values(TYPESCRIPT_LANGUAGE_ID_MAP)));
const TYPESCRIPT_EXTENSIONS = Object.keys(TYPESCRIPT_LANGUAGE_ID_MAP);

/** Supported language server configurations. */
const LANGUAGE_SERVERS: LspServerConfig[] = [
  {
    language: 'typescript',
    command: 'typescript-language-server --stdio',
    checkCommand: 'which typescript-language-server',
    // Runtime install remains container-side for now; pin versions for reproducible startup.
    installCommand: `npm install -g ${TYPESCRIPT_INSTALL_COMMAND}`,
    extensions: TYPESCRIPT_EXTENSIONS,
    monacoLanguageIds: TYPESCRIPT_MONACO_LANGUAGE_IDS,
    languageIdMap: TYPESCRIPT_LANGUAGE_ID_MAP,
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
