import { execFile as execFileCb } from 'child_process';
import path from 'path';

const PORT_RELEASE_TIMEOUT_MS = 5_000;
const PORT_RELEASE_POLL_MS = 500;

function normalizeSourcePath(sourcePath: string): string {
  return path.resolve(sourcePath);
}

function execFileAsync(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileCb(command, args, { encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function readListeningProcessIds(port: number): Promise<number[]> {
  try {
    const stdout = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
    return [...new Set(
      stdout
        .split(/\s+/)
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0),
    )];
  } catch {
    return [];
  }
}

async function readProcessCwd(pid: number): Promise<string | null> {
  try {
    const stdout = await execFileAsync('lsof', ['-nP', '-a', '-p', `${pid}`, '-d', 'cwd', '-Fn']);
    const cwdLine = stdout
      .split('\n')
      .find((line) => line.startsWith('n') && line.length > 1);
    return cwdLine ? cwdLine.slice(1) : null;
  } catch {
    return null;
  }
}

async function readProcessGroupId(pid: number): Promise<number | null> {
  try {
    const stdout = await execFileAsync('ps', ['-p', `${pid}`, '-o', 'pgid=']);
    const pgid = Number.parseInt(stdout.trim(), 10);
    return Number.isInteger(pgid) && pgid > 0 ? pgid : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPortRelease(port: number): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < PORT_RELEASE_TIMEOUT_MS) {
    if ((await readListeningProcessIds(port)).length === 0) {
      return true;
    }

    await sleep(PORT_RELEASE_POLL_MS);
  }

  return false;
}

export async function stopStalePortListenersForSourcePath(
  port: number,
  sourcePath: string,
): Promise<boolean> {
  const normalizedSourcePath = normalizeSourcePath(sourcePath);
  const pids = await readListeningProcessIds(port);
  if (pids.length === 0) {
    return false;
  }

  const listeners = await Promise.all(
    pids.map(async (pid) => ({
      pid,
      cwd: await readProcessCwd(pid),
      pgid: await readProcessGroupId(pid),
    })),
  );
  const killableListeners = listeners.filter((listener) => (
    listener.cwd
    && normalizeSourcePath(listener.cwd) === normalizedSourcePath
    && listener.pgid
  ));

  if (killableListeners.length === 0 || killableListeners.length !== listeners.length) {
    return false;
  }

  for (const pgid of new Set(killableListeners.map((listener) => listener.pgid!))) {
    try {
      process.kill(-pgid, 'SIGTERM');
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code !== 'ESRCH') {
        throw error;
      }
    }
  }

  return waitForPortRelease(port);
}
