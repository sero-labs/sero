import { promises as fs } from 'node:fs';
import path from 'node:path';

const writeQueues = new Map<string, Promise<void>>();
const warnedKeys = new Set<string>();

function warnOnce(key: string, message: string, error: unknown): void {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`${message}: ${detail}`);
}

async function rotateFiles(filePath: string, maxFiles: number): Promise<void> {
  if (maxFiles <= 0) {
    await fs.rm(filePath, { force: true });
    return;
  }

  await fs.rm(`${filePath}.${maxFiles}`, { force: true });
  for (let index = maxFiles - 1; index >= 1; index -= 1) {
    const source = `${filePath}.${index}`;
    const target = `${filePath}.${index + 1}`;
    try {
      await fs.rename(source, target);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  await fs.rename(filePath, `${filePath}.1`);
}

async function rotateIfNeeded(filePath: string, maxBytes: number, maxFiles: number): Promise<void> {
  try {
    const { size } = await fs.stat(filePath);
    if (size >= maxBytes) {
      await rotateFiles(filePath, maxFiles);
    }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

export function appendRotatingLogLine(options: {
  filePath: string;
  line: string;
  maxBytes: number;
  maxFiles?: number;
  warningKey: string;
  warningMessage: string;
  beforeAppend?: () => Promise<void>;
}): void {
  const previous = writeQueues.get(options.filePath) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(path.dirname(options.filePath), { recursive: true });
      await options.beforeAppend?.();
      await rotateIfNeeded(options.filePath, options.maxBytes, options.maxFiles ?? 1);
      await fs.appendFile(options.filePath, options.line, 'utf8');
    })
    .catch((error) => {
      warnOnce(options.warningKey, options.warningMessage, error);
    });

  writeQueues.set(options.filePath, next);
}
