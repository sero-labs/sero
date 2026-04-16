/**
 * Shared language-routing metadata for Monaco + renderer LSP wiring.
 *
 * Keeps extension/language/server relationships in one place so editor,
 * diff/VCS, and LSP document-sync paths stay in lock-step.
 */

const DEFAULT_LANGUAGE_ID = 'plaintext';

export const LSP_SERVER_LANGUAGE_BY_MONACO_ID: Record<string, string> = {
  typescript: 'typescript',
  typescriptreact: 'typescript',
  javascript: 'typescript',
  javascriptreact: 'typescript',
};

export const LSP_LANGUAGE_ID_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  mts: 'typescript',
  cts: 'typescript',
  mjs: 'javascript',
  cjs: 'javascript',
};

const MONACO_LANGUAGE_ID_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  html: 'html',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  toml: 'toml',
  sql: 'sql',
  xml: 'xml',
  svg: 'xml',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  lua: 'lua',
  r: 'r',
};

export const LSP_PROVIDER_LANGUAGE_IDS = Object.keys(LSP_SERVER_LANGUAGE_BY_MONACO_ID);

function getPathExtension(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

export function getLspServerLanguage(monacoLanguageId: string): string | null {
  return LSP_SERVER_LANGUAGE_BY_MONACO_ID[monacoLanguageId] ?? null;
}

export function getLspLanguageIdFromPath(filePath: string): string {
  const ext = getPathExtension(filePath);
  return LSP_LANGUAGE_ID_BY_EXTENSION[ext] ?? DEFAULT_LANGUAGE_ID;
}

export function getMonacoLanguageIdFromPath(filePath: string): string {
  const ext = getPathExtension(filePath);
  return MONACO_LANGUAGE_ID_BY_EXTENSION[ext] ?? DEFAULT_LANGUAGE_ID;
}
