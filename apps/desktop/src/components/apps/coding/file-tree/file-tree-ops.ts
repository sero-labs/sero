/**
 * File tree operations — uses first-class IPC handlers (dual-mode: container or host).
 *
 * The main process handles path validation and chooses the right backend
 * (native fs for host workspaces, `container exec` for container workspaces).
 */

/** Move a file/directory. Returns true on success. */
export async function moveItem(
  workspaceId: string,
  sourcePath: string,
  destPath: string,
): Promise<boolean> {
  try {
    return await window.sero.editor.rename(workspaceId, sourcePath, destPath);
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
    const ok = await window.sero.editor.rename(workspaceId, oldPath, newPath);
    if (ok) return newPath;
    console.warn(`[FileTree] Rename failed: ${oldPath} → ${newName}`);
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
    return await window.sero.editor.delete(workspaceId, itemPath);
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
    return await window.sero.editor.createFile(workspaceId, filePath);
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
    return await window.sero.editor.createDir(workspaceId, dirPath);
  } catch (err) {
    console.error(`[FileTree] Create folder failed ${dirPath}:`, err);
    return false;
  }
}
