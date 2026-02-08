/**
 * File tree operations that execute inside the project container.
 * Used by FileTree for drag-and-drop, rename, delete, create.
 */

/** Escape a path for safe use in a shell command */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Move a file/directory to a new location inside the container.
 * @returns true on success, false on failure
 */
export async function moveItem(
  projectId: string,
  sourcePath: string,
  destPath: string,
): Promise<boolean> {
  try {
    const result = await window.sero.container.exec(
      projectId,
      `mv ${shellEscape(sourcePath)} ${shellEscape(destPath)}`,
    );
    return result.exitCode === 0;
  } catch (err) {
    console.error(`[FileTree] Failed to move ${sourcePath} → ${destPath}:`, err);
    return false;
  }
}

/**
 * Rename a file/directory inside the container.
 * @returns the new full path on success, null on failure
 */
export async function renameItem(
  projectId: string,
  oldPath: string,
  newName: string,
): Promise<string | null> {
  const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
  const newPath = `${parentDir}/${newName}`;

  if (newPath === oldPath) return oldPath;

  try {
    const result = await window.sero.container.exec(
      projectId,
      `mv ${shellEscape(oldPath)} ${shellEscape(newPath)}`,
    );
    if (result.exitCode === 0) return newPath;
    console.warn(`[FileTree] Rename failed: ${result.stderr}`);
    return null;
  } catch (err) {
    console.error(`[FileTree] Failed to rename ${oldPath} → ${newName}:`, err);
    return null;
  }
}

/**
 * Delete a file or directory (recursively) inside the container.
 * @returns true on success, false on failure
 */
export async function deleteItem(
  projectId: string,
  itemPath: string,
): Promise<boolean> {
  try {
    const result = await window.sero.container.exec(
      projectId,
      `rm -rf ${shellEscape(itemPath)}`,
    );
    return result.exitCode === 0;
  } catch (err) {
    console.error(`[FileTree] Failed to delete ${itemPath}:`, err);
    return false;
  }
}

/**
 * Create a new empty file inside the container.
 * @returns true on success, false on failure
 */
export async function createFile(
  projectId: string,
  filePath: string,
): Promise<boolean> {
  try {
    const result = await window.sero.container.exec(
      projectId,
      `touch ${shellEscape(filePath)}`,
    );
    return result.exitCode === 0;
  } catch (err) {
    console.error(`[FileTree] Failed to create file ${filePath}:`, err);
    return false;
  }
}

/**
 * Create a new directory inside the container.
 * @returns true on success, false on failure
 */
export async function createFolder(
  projectId: string,
  dirPath: string,
): Promise<boolean> {
  try {
    const result = await window.sero.container.exec(
      projectId,
      `mkdir -p ${shellEscape(dirPath)}`,
    );
    return result.exitCode === 0;
  } catch (err) {
    console.error(`[FileTree] Failed to create folder ${dirPath}:`, err);
    return false;
  }
}
