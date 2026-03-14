/**
 * File browsing API — types and helpers for gateway file operations.
 */

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
}

export interface FileContent {
  content: string;
  encoding: 'utf8' | 'base64';
  mimeType: string;
  size: number;
}

/** Get a language identifier from a file extension for syntax highlighting. */
export function getLanguageFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    dockerfile: 'dockerfile',
    toml: 'toml',
    ini: 'ini',
    lua: 'lua',
    r: 'r',
    php: 'php',
  };
  return ext ? map[ext] : undefined;
}

/** Check if a file is an image by MIME type or extension. */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/** Check if a file is a text/code file by MIME type. */
export function isTextFile(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/javascript' ||
    mimeType === 'application/typescript' ||
    mimeType === 'application/xml'
  );
}
