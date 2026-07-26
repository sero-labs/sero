/**
 * Typed access to the host's git bridge.
 *
 * AD-025 puts the renderer-side repo cache in this plugin and publishes no vcs
 * hook in `@sero-ai/app-runtime`, so the plugin declares the narrow slice of
 * `window.sero` it actually uses rather than importing a shared type.
 *
 * These reads deliberately do not swallow failures. An unreadable side is not
 * an empty file: treating it as one renders a whole file as deleted, which
 * looks like a real diff and is not.
 */

interface SeroVcsSlice {
  /** File contents at a revision. `''` is the index, so `''` reads the staged copy. */
  fileContent(workspaceId: string, rev: string, path: string): Promise<string>;
}

interface SeroEditorSlice {
  /** Paths resolve against the workspace root, and may not escape it. */
  readFile(workspaceId: string, filePath: string): Promise<string>;
  writeFile(workspaceId: string, filePath: string, content: string): Promise<void>;
}

interface SeroVcsWindow {
  vcs?: SeroVcsSlice;
  editor?: SeroEditorSlice;
}

function bridge(): SeroVcsWindow {
  return (window as unknown as { sero?: SeroVcsWindow }).sero ?? {};
}

/** The index — `git show :path`. Reading at this revision gives the staged copy. */
export const INDEX_REV = '';

/** Working-tree contents, read from disk rather than from git. */
export async function readWorkingTreeFile(workspaceId: string, path: string): Promise<string> {
  const editor = bridge().editor;
  if (!editor) throw new Error('The editor bridge is unavailable');
  return editor.readFile(workspaceId, path);
}

/**
 * Write a working-tree file. The conflict resolver persists this way because
 * the library's resolver only ever hands back new contents (§9.1).
 */
export async function writeWorkingTreeFile(
  workspaceId: string,
  path: string,
  contents: string,
): Promise<void> {
  const editor = bridge().editor;
  if (!editor) throw new Error('The editor bridge is unavailable');
  return editor.writeFile(workspaceId, path, contents);
}

/** File contents at a git revision. */
export async function readFileAtRev(
  workspaceId: string,
  rev: string,
  path: string,
): Promise<string> {
  const vcs = bridge().vcs;
  if (!vcs) throw new Error('The git bridge is unavailable');
  return vcs.fileContent(workspaceId, rev, path);
}
