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

async function rotateIfNeeded(filePath: string, maxBytes: number): Promise<void> {
  try {
    const { size } = await fs.stat(filePath);
    if (size >= maxBytes) {
      await fs.rename(filePath, `${filePath}.1`);
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
  warningKey: string;
  warningMessage: string;
}): void {
  const previous = writeQueues.get(options.filePath) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(path.dirname(options.filePath), { recursive: true });
      await rotateIfNeeded(options.filePath, options.maxBytes);
      await fs.appendFile(options.filePath, options.line, 'utf8');
    })
    .catch((error) => {
      warnOnce(options.warningKey, options.warningMessage, error);
    });

  writeQueues.set(options.filePath, next);
}
