import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * A JSON document in one file. Reads and writes are queued, and each write
 * replaces the file atomically. `parse` turns stored JSON into a valid value,
 * so a damaged file reads as the empty value.
 */
export function createJsonFile<T>(filePath: string, parse: (value: unknown) => T) {
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <R>(operation: () => Promise<R>): Promise<R> => {
    const next = queue.then(operation, operation);
    queue = next.catch(() => undefined);
    return next;
  };

  async function read(): Promise<T> {
    try {
      return parse(JSON.parse(await fs.readFile(filePath, 'utf8')));
    } catch {
      return parse(undefined);
    }
  }

  async function write(value: T): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
  }

  return {
    read: () => exclusive(read),
    /** Changes the document. Return undefined to leave the file as it is. */
    update: <R>(change: (value: T) => { value: T; result: R } | undefined): Promise<R | undefined> => exclusive(async () => {
      const next = change(await read());
      if (!next) return undefined;
      await write(next.value);
      return next.result;
    }),
  };
}
