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
  /** Command to run inside the selected workspace runtime. */
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

const LSP_NPM_PREFIX = '${HOME:-/tmp/sero-home}/.sero/lsp/npm';
const LSP_NPM_PREFIX_SCRIPT = `LSP_NPM_PREFIX="${LSP_NPM_PREFIX}"`;
const LSP_PATH_SCRIPT = `${LSP_NPM_PREFIX_SCRIPT}; PATH="$LSP_NPM_PREFIX/bin:$LSP_NPM_PREFIX:$LSP_NPM_PREFIX/node_modules/.bin:$PATH"`;
const TYPESCRIPT_LANGUAGE_SERVER_VERSION = '4.4.0';
const TYPESCRIPT_VERSION = '5.9.3';
const TYPESCRIPT_INSTALL_COMMAND = [
  `typescript-language-server@${TYPESCRIPT_LANGUAGE_SERVER_VERSION}`,
  `typescript@${TYPESCRIPT_VERSION}`,
].join(' ');
const TYPESCRIPT_CLI_CANDIDATES = [
  '$LSP_NPM_PREFIX/lib/node_modules/typescript-language-server/lib/cli.mjs',
  '$LSP_NPM_PREFIX/node_modules/typescript-language-server/lib/cli.mjs',
];
const TYPESCRIPT_FIND_CLI = `for cli in ${TYPESCRIPT_CLI_CANDIDATES.map((candidate) => `"${candidate}"`).join(' ')}; do test -f "$cli" && break; cli=""; done`;
const TYPESCRIPT_RESOLVE_SERVER = 'server="$(command -v typescript-language-server 2>/dev/null || command -v typescript-language-server.cmd 2>/dev/null)"';

const TYPESCRIPT_LANGUAGE_ID_MAP = buildLanguageIdMapForServer('typescript');
const TYPESCRIPT_MONACO_LANGUAGE_IDS = Array.from(new Set(Object.values(TYPESCRIPT_LANGUAGE_ID_MAP)));
const TYPESCRIPT_EXTENSIONS = Object.keys(TYPESCRIPT_LANGUAGE_ID_MAP);

/** Supported language server configurations. */
const LANGUAGE_SERVERS: LspServerConfig[] = [
  {
    language: 'typescript',
    command: `${LSP_PATH_SCRIPT}; ${TYPESCRIPT_FIND_CLI}; test -n "$cli" && exec node "$cli" --stdio; ${TYPESCRIPT_RESOLVE_SERVER} && exec "$server" --stdio; echo "typescript-language-server not found under $LSP_NPM_PREFIX" >&2; exit 127`,
    checkCommand: `${LSP_PATH_SCRIPT}; ${TYPESCRIPT_FIND_CLI}; test -n "$cli" || command -v typescript-language-server >/dev/null 2>&1 || command -v typescript-language-server.cmd >/dev/null 2>&1`,
    // Install into HOME so non-root Docker/Apple runtime users do not need /usr/local write access.
    // Include the prefix root in PATH because npm global shims live there on Windows.
    installCommand: `${LSP_NPM_PREFIX_SCRIPT}; mkdir -p "$LSP_NPM_PREFIX" && npm install -g --prefix "$LSP_NPM_PREFIX" ${TYPESCRIPT_INSTALL_COMMAND}`,
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

/** Convert an absolute POSIX or Windows file path to an encoded file:// URI. */
export function fileUri(filePath: string): string {
  const normalizedPath = filePath.replaceAll('\\', '/');
  const driveMatch = normalizedPath.match(/^([A-Za-z]:)(\/.*)?$/);
  if (driveMatch) return `file:///${driveMatch[1]}${encodeFileUriPath(driveMatch[2] ?? '/')}`;
  if (normalizedPath.startsWith('//')) {
    const [host = '', ...segments] = normalizedPath.slice(2).split('/');
    return `file://${encodeURIComponent(host)}/${segments.map(encodeURIComponent).join('/')}`;
  }
  return `file://${encodeFileUriPath(normalizedPath)}`;
}

export function filePathFromUri(uri: string, platform: NodeJS.Platform = process.platform): string {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'file:') throw new Error(`Unsupported LSP URI protocol: ${parsed.protocol}`);
  const pathname = decodeURIComponent(parsed.pathname);
  if (platform === 'win32') {
    const withoutDriveSlash = pathname.replace(/^\/([A-Za-z]:\/)/, '$1');
    return withoutDriveSlash.replaceAll('/', '\\');
  }
  return pathname;
}

function encodeFileUriPath(filePath: string): string {
  return filePath.split('/').map(encodeURIComponent).join('/');
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
