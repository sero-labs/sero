/**
 * ClickableFilePath, renders a file path as a ctrl+clickable link.
 *
 * When ctrl+clicked (or cmd+clicked on macOS), opens the file in the
 * code editor via the editor-bridge store.
 */


// ── Utility: detect file paths in tool call inputs/outputs ─────

/**
 * Regex to match file paths in text.
 * Matches:
 * - Absolute paths: /foo/bar/baz.ts
 * - Relative paths: src/foo/bar.ts, ./foo/bar.ts
 * - Paths with common extensions
 */
const FILE_PATH_RE =
  /(?:^|[\s"'`([\]{,;:])((\.{0,2}\/)?(?:[\w.@-]+\/)*[\w.-]+\.[\w]+)/g;

/**
 * Check if a string looks like a file path.
 */
export function looksLikeFilePath(text: string): boolean {
  // Must contain a dot (extension) or slash (directory separator)
  if (!text.includes('/') && !text.includes('.')) return false;
  // Must not be a URL
  if (/^https?:\/\//.test(text)) return false;
  // Must not be an email
  if (text.includes('@') && !text.includes('/')) return false;
  // Basic path pattern
  return /^\.{0,2}\/|[\w.-]+\/[\w.-]+|[\w.-]+\.\w{1,10}$/.test(text);
}

export function extractFilePaths(text: string): string[] {
  const matches = [...text.matchAll(FILE_PATH_RE)]
    .map((match) => match[1])
    .filter((value): value is string => !!value && looksLikeFilePath(value));
  return [...new Set(matches)];
}

/**
 * Convert a chat/tool-rendered path into the editor's virtual path format.
 *
 * The editor treats the first segment of an absolute virtual path as a root id
 * (`/workspace/foo`, `/sero-source/bar`). Tool summaries commonly emit project
 * relative paths like `docs/foo.md`; opening those as `/docs/foo.md` makes
 * `docs` look like an unknown root. Bare and `./` paths belong to the primary
 * workspace root.
 */
export function toEditorVirtualPath(text: string): string {
  const filePath = text.trim();
  if (filePath.startsWith('/')) return filePath;
  if (filePath.startsWith('./')) return `/workspace/${filePath.slice(2)}`;
  return `/workspace/${filePath}`;
}

/**
 * Installs a delegated click handler on a container element that
 * intercepts ctrl+clicks on file paths and opens them in the editor.
 *
 * Designed to be used with `useEffect` on a wrapper div around
 * tool call or message content.
 */
export function createFilePathClickHandler(
  workspaceId: string,
  requestOpenFile: (workspaceId: string, filePath: string) => void,
) {
  return (e: React.MouseEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;

    const target = e.target as HTMLElement;
    // Check if we clicked on text content that looks like a file path
    const text = target.textContent?.trim() ?? '';

    if (looksLikeFilePath(text)) {
      e.preventDefault();
      e.stopPropagation();
      requestOpenFile(workspaceId, toEditorVirtualPath(text));
    }
  };
}
