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

export const BrowserParams = Type.Object({
  action: Type.Union(
    [
      Type.Literal('launch'),
      Type.Literal('navigate'),
      Type.Literal('click'),
      Type.Literal('type'),
      Type.Literal('press_key'),
      Type.Literal('screenshot'),
      Type.Literal('scroll'),
      Type.Literal('evaluate'),
      Type.Literal('get_text'),
      Type.Literal('wait'),
      Type.Literal('snapshot'),
      Type.Literal('close'),
      Type.Literal('start_recording'),
      Type.Literal('stop_recording'),
    ],
    {
      description:
        'The browser action to perform for Playwright-style UI automation on known pages. ' +
        'Do not use browser for general web search, page fetching, bookmark management, or file downloads — ' +
        'use web_search, fetch_content, get_search_content, or web_bookmark instead. ' +
        'launch: start browser (optionally navigate to url). ' +
        'navigate: go to a URL. ' +
        'click: click a CSS selector or x,y coordinates. ' +
        'type: type text into selector or focused element. ' +
        'press_key: press a key (Enter, Tab, Escape, etc). ' +
        'screenshot: capture the page as an image. ' +
        'scroll: scroll up/down. ' +
        'evaluate: run JavaScript in the page. ' +
        'get_text: extract text content from the page or an element. ' +
        'wait: wait for a selector or timeout. ' +
        'snapshot: capture an accessibility snapshot for LLM-friendly element refs. ' +
        'close: close the browser. ' +
        'start_recording: begin MP4 video recording of the browser (periodic screenshots encoded to video). ' +
        'stop_recording: stop recording and save MP4 video to the specified path.',
    },
  ),
  url: Type.Optional(Type.String({ description: 'URL for launch/navigate actions' })),
  selector: Type.Optional(
    Type.String({ description: 'CSS selector for click/type/screenshot/scroll/get_text/wait' }),
  ),
  x: Type.Optional(Type.Number({ description: 'X coordinate for click (use with y)' })),
  y: Type.Optional(Type.Number({ description: 'Y coordinate for click (use with x)' })),
  text: Type.Optional(Type.String({ description: 'Text to type (for type action)' })),
  clear: Type.Optional(
    Type.Boolean({ description: 'Clear the field before typing (default: false)' }),
  ),
  key: Type.Optional(
    Type.String({ description: 'Key to press for press_key action (e.g. "Enter", "Tab", "Escape")' }),
  ),
  expression: Type.Optional(
    Type.String({ description: 'JavaScript expression to evaluate in the page' }),
  ),
  direction: Type.Optional(
    Type.Union([Type.Literal('up'), Type.Literal('down')], {
      description: 'Scroll direction (default: "down")',
    }),
  ),
  amount: Type.Optional(
    Type.Number({ description: 'Scroll amount in pixels (default: 500)' }),
  ),
  full_page: Type.Optional(
    Type.Boolean({ description: 'Capture full page screenshot (default: false)' }),
  ),
  timeout: Type.Optional(
    Type.Number({ description: 'Timeout in ms for wait action (default: 10000)' }),
  ),
  wait_until: Type.Optional(
    Type.String({
      description: 'Navigation wait strategy: "domcontentloaded", "load", "networkidle" (default: "domcontentloaded")',
    }),
  ),
  viewport: Type.Optional(
    Type.Object(
      {
        width: Type.Optional(Type.Number({ description: 'Viewport width (default: 1280)' })),
        height: Type.Optional(Type.Number({ description: 'Viewport height (default: 720)' })),
      },
      { description: 'Viewport size for launch action' },
    ),
  ),
  save_path: Type.Optional(
    Type.String({ description: 'File path to save the recording to (for stop_recording action, default: /tmp/sero-browser-recording.mp4)' }),
  ),
  fps: Type.Optional(
    Type.Number({ description: 'Frames per second for recording (default: 2)' }),
  ),
});

// ── Shared helpers ──────────────────────────────────────────

/** Resolve a potentially relative path against the workspace root (or a custom basedir). */
export function resolveContainerPath(p: string, basedir: string = WORKSPACE_DIR): string {
  return p.startsWith('/') ? p : `${basedir}/${p}`;
}

/** Shell-escape single quotes in a path. */
export function shellEscape(p: string): string {
  return p.replace(/'/g, "'\\''");
}
