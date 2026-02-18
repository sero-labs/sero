/**
 * Shared parameter schemas and helpers for container tools.
 */

import { Type } from '@sinclair/typebox';

export const WORKSPACE_DIR = '/workspace';

// ── Image detection by magic bytes (matches Pi SDK behaviour) ──

/** Supported image MIME types. */
const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

/**
 * Detect image MIME type from the first bytes of a file (hex string).
 *
 * Pi SDK uses `file-type` which sniffs magic bytes — we replicate
 * that by reading the first 12 bytes via `od` inside the container.
 *
 * Returns a MIME type string or null if not a recognised image.
 */
export function detectMimeFromMagicHex(hex: string): string | null {
  if (!hex || hex.length < 6) return null;

  // PNG: 89 50 4e 47
  if (hex.startsWith('89504e47')) return 'image/png';

  // JPEG: ff d8 ff
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';

  // GIF: 47 49 46 38 (GIF8)
  if (hex.startsWith('47494638')) return 'image/gif';

  // WebP: RIFF....WEBP — bytes 0-3 = 52494646, bytes 8-11 = 57454250
  if (hex.startsWith('52494646') && hex.length >= 24 && hex.substring(16, 24) === '57454250') {
    return 'image/webp';
  }

  return null;
}

/** Check whether a MIME type is in our supported set. */
export function isSupportedImageMime(mime: string): boolean {
  return SUPPORTED_IMAGE_MIMES.has(mime);
}

// ── Parameter schemas ───────────────────────────────────────

export const BashParams = Type.Object({
  command: Type.String({ description: 'Bash command to execute' }),
  timeout: Type.Optional(
    Type.Number({ description: 'Timeout in seconds (optional, no default timeout)' }),
  ),
});

export const ReadParams = Type.Object({
  path: Type.String({ description: 'Path to the file to read (relative or absolute)' }),
  offset: Type.Optional(
    Type.Number({ description: 'Line number to start reading from (1-indexed)' }),
  ),
  limit: Type.Optional(Type.Number({ description: 'Maximum number of lines to read' })),
});

export const WriteParams = Type.Object({
  path: Type.String({ description: 'Path to the file to write (relative or absolute)' }),
  content: Type.String({ description: 'Content to write to the file' }),
});

export const EditParams = Type.Object({
  path: Type.String({ description: 'Path to the file to edit (relative or absolute)' }),
  oldText: Type.String({
    description: 'Exact text to find and replace (must match exactly)',
  }),
  newText: Type.String({ description: 'New text to replace the old text with' }),
});

export const LsParams = Type.Object({
  path: Type.Optional(
    Type.String({ description: 'Directory path (default: current directory)' }),
  ),
});

export const ReadTerminalParams = Type.Object({
  lines: Type.Optional(
    Type.Number({ description: 'Number of recent lines to read (default: 80)' }),
  ),
});

export const RegisterDevServerParams = Type.Object({
  name: Type.String({ description: 'Human-readable name (e.g. "Vite Dev Server")' }),
  port: Type.Number({ description: 'Port the server is listening on' }),
  command: Type.String({
    description:
      'The full command used to start the server (for restart capability). ' +
      'E.g. "npx vite --host 0.0.0.0 --port 3000"',
  }),
  framework: Type.Optional(
    Type.String({ description: 'Framework hint (e.g. "vite", "next", "express")' }),
  ),
});

// ── Shared helpers ──────────────────────────────────────────

/** Resolve a potentially relative path against the workspace root. */
export function resolveContainerPath(p: string): string {
  return p.startsWith('/') ? p : `${WORKSPACE_DIR}/${p}`;
}

/** Shell-escape single quotes in a path. */
export function shellEscape(p: string): string {
  return p.replace(/'/g, "'\\''");
}
