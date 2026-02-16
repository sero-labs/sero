/**
 * File tree operations — dual-mode (container or host).
 * Uses window.sero.editor.exec for shell commands.
 */

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** Move a file/directory. Returns true on success. */
export async function moveItem(
  workspaceId: string,
  sourcePath: string,
  destPath: string,
): Promise<boolean> {
  try {
    const result = await window.sero.editor.exec(
      workspaceId,
      `mv ${shellEscape(sourcePath)} ${shellEscape(destPath)}`,
    );
    return result.exitCode === 0;
  } catch (err) {
    console.error(`[FileTree] Move failed ${sourcePath} → ${destPath}:`, err);
    return false;
  }
}

/** Rename a file/directory. Returns the new path on success, null on failure. */
export async function renameItem(
  workspaceId: string,
  oldPath: string,
  newName: string,
): Promise<string | null> {
  const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
  const newPath = `${parentDir}/${newName}`;
  if (newPath === oldPath) return oldPath;

  try {
    const result = await window.sero.editor.exec(
      workspaceId,
      `mv ${shellEscape(oldPath)} ${shellEscape(newPath)}`,
    );
    if (result.exitCode === 0) return newPath;
    console.warn(`[FileTree] Rename failed: ${result.stderr}`);
    return null;
  } catch (err) {
    console.error(`[FileTree] Rename failed ${oldPath} → ${newName}:`, err);
    return null;
  }
}

/** Delete a file or directory recursively. Returns true on success. */
export async function deleteItem(
  workspaceId: string,
  itemPath: string,
): Promise<boolean> {
  try {
    const result = await window.sero.editor.exec(
      workspaceId,
      `rm -rf ${shellEscape(itemPath)}`,
    );
    return result.exitCode === 0;
  } catch (err) {
    console.error(`[FileTree] Delete failed ${itemPath}:`, err);
    return false;
  }
}

/** Create a new empty file. Returns true on success. */
export async function createFile(
  workspaceId: string,
  filePath: string,
): Promise<boolean> {
  try {
    const result = await window.sero.editor.exec(
      workspaceId,
      `touch ${shellEscape(filePath)}`,
    );
    return result.exitCode === 0;
  } catch (err) {
    console.error(`[FileTree] Create file failed ${filePath}:`, err);
    return false;
  }
}

/** Create a new directory. Returns true on success. */
export async function createFolder(
  workspaceId: string,
  dirPath: string,
): Promise<boolean> {
  try {
    const result = await window.sero.editor.exec(
      workspaceId,
      `mkdir -p ${shellEscape(dirPath)}`,
    );
    return result.exitCode === 0;
  } catch (err) {
    console.error(`[FileTree] Create folder failed ${dirPath}:`, err);
    return false;
  }
}
