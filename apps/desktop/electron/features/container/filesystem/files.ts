/**
 * File I/O operations inside containers: read, write, list files.
 */

import { spawn } from 'child_process';
import { CONTAINER_BIN, containerId, type ExecResult } from '../core/types';

/** Read a file from inside the container. */
export async function readContainerFile(
  workspaceId: string,
  filePath: string,
  execFn: (wsId: string, cmd: string) => Promise<ExecResult>,
): Promise<string> {
  const escaped = filePath.replace(/'/g, "'\\''");
  const result = await execFn(workspaceId, `cat '${escaped}'`);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to read ${filePath}: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Write a file inside the container.
 * Uses stdin piping — no shell argument limits, handles any content.
 */
export async function writeContainerFile(
  workspaceId: string,
  filePath: string,
  content: string,
  containerMap: Map<string, string>,
  execFn: (wsId: string, cmd: string) => Promise<ExecResult>,
): Promise<void> {
  const cid = containerMap.get(workspaceId) ?? containerId(workspaceId);
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  const escapedPath = filePath.replace(/'/g, "'\\''");

  // Ensure parent directory exists
  await execFn(workspaceId, `mkdir -p '${dir}'`);

  // Pipe content via stdin — avoids all shell escaping and argument length issues
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    const timeout = setTimeout(() => {
      proc.kill();
      settle(() => reject(new Error(`Timed out writing ${filePath}`)));
    }, 30_000);

    const proc = spawn(CONTAINER_BIN, [
      'exec',
      '-i',
      cid,
      'sh',
      '-c',
      `cat > '${escapedPath}'`,
    ]);

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.stdin.on('error', (err) => {
      clearTimeout(timeout);
      settle(() => reject(new Error(`Failed to write ${filePath}: ${err.message}`)));
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      settle(() => reject(new Error(`Failed to write ${filePath}: ${err.message}`)));
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        settle(() => resolve());
      } else {
        settle(() => reject(new Error(`Failed to write ${filePath} (exit ${code}): ${stderr}`)));
      }
    });

    proc.stdin.write(content, (err) => {
      if (err) {
        clearTimeout(timeout);
        settle(() => reject(new Error(`Failed to write ${filePath}: ${err.message}`)));
        return;
      }
      proc.stdin.end();
    });
  });
}

/**
 * List files in a directory inside the container.
 * Returns array of { name, type, size } objects.
 */
export async function listContainerFiles(
  workspaceId: string,
  dirPath: string,
  execFn: (wsId: string, cmd: string) => Promise<ExecResult>,
): Promise<Array<{ name: string; type: 'file' | 'directory'; size: number }>> {
  const escaped = dirPath.replace(/'/g, "'\\''");
  const result = await execFn(
    workspaceId,
    `find '${escaped}' -maxdepth 1 -printf '%y\\t%s\\t%f\\n' 2>/dev/null | tail -n +2`,
  );
  if (result.exitCode !== 0) return [];

  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [typeChar, sizeStr, ...nameParts] = line.split('\t');
      const name = nameParts.join('\t');
      return {
        name,
        type: (typeChar === 'd' ? 'directory' : 'file') as 'file' | 'directory',
        size: parseInt(sizeStr, 10) || 0,
      };
    });
}
