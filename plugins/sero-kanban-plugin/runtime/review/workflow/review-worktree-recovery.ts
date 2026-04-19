import path from 'path';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function recoverWorkspaceRootChanges(
  worktreePath: string,
  opts?: { expectedPaths?: string[]; allowAllDirty?: boolean },
): Promise<boolean> {
  const workspaceRoot = path.resolve(worktreePath, '..', '..', '..');

  try {
    await fs.access(path.join(workspaceRoot, '.git'));
  } catch {
    return false;
  }

  let statusRaw: string;
  try {
    const result = await execFileAsync(
      'git',
      ['status', '--porcelain', '--untracked-files=all'],
      { cwd: workspaceRoot, timeout: 15_000 },
    );
    statusRaw = result.stdout.trim();
  } catch {
    return false;
  }

  if (!statusRaw) return false;

  const expectedPathSet = new Set(opts?.expectedPaths ?? []);
  const dirtyFiles = statusRaw
    .split('\n')
    .map(parseStatusPath)
    .filter((filePath): filePath is string => !!filePath)
    .filter((filePath) => !filePath.startsWith('.sero/'))
    .filter((filePath) => (
      opts?.allowAllDirty
      || expectedPathSet.size === 0
      || expectedPathSet.has(filePath)
    ));

  if (dirtyFiles.length === 0) return false;

  console.log(`[review-executor] Recovering ${dirtyFiles.length} workspace file(s) into worktree`);

  for (const relFile of dirtyFiles) {
    const src = path.join(workspaceRoot, relFile);
    const dest = path.join(worktreePath, relFile);
    try {
      const sourceStat = await fs.stat(src).catch(() => null);
      if (!sourceStat) {
        await fs.rm(dest, { force: true });
        continue;
      }
      if (!sourceStat.isFile()) continue;
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    } catch (error: unknown) {
      console.warn(`[review-executor] Failed to copy ${relFile}:`, (error as Error)?.message);
    }
  }

  return true;
}

function parseStatusPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const pathPart = line.slice(3).trim();
  if (!pathPart) return null;
  if (pathPart.includes(' -> ')) {
    const [, dest] = pathPart.split(' -> ');
    return dest?.trim() || null;
  }
  return pathPart;
}
