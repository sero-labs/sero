import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getMcpEraVerdictPath } from '../state/paths';

/**
 * Remembers which servers answered only the 2025 handshake, so that the next
 * connect skips the server/discover probe. A verdict holds only for the config
 * hash that produced it.
 */
export interface EraVerdictStore {
  isLegacy(serverName: string, configHash: string): Promise<boolean>;
  setLegacy(serverName: string, configHash: string): Promise<void>;
  clear(serverName: string): Promise<void>;
}

type VerdictFile = Record<string, { configHash: string }>;

export function createFileEraVerdictStore(filePath = getMcpEraVerdictPath()): EraVerdictStore {
  async function read(): Promise<VerdictFile> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const verdicts: VerdictFile = {};
      for (const [serverName, entry] of Object.entries(parsed)) {
        const configHash: unknown = entry && typeof entry === 'object' ? Reflect.get(entry, 'configHash') : undefined;
        if (typeof configHash === 'string') verdicts[serverName] = { configHash };
      }
      return verdicts;
    } catch {
      return {};
    }
  }

  async function write(verdicts: VerdictFile): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(verdicts, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
  }

  return {
    async isLegacy(serverName, configHash) {
      return (await read())[serverName]?.configHash === configHash;
    },
    async setLegacy(serverName, configHash) {
      const verdicts = await read();
      if (verdicts[serverName]?.configHash === configHash) return;
      await write({ ...verdicts, [serverName]: { configHash } });
    },
    async clear(serverName) {
      const verdicts = await read();
      if (!(serverName in verdicts)) return;
      delete verdicts[serverName];
      await write(verdicts);
    },
  };
}

/** Keeps verdicts for the life of the process only. The runtime uses the file store. */
export function createMemoryEraVerdictStore(): EraVerdictStore {
  const verdicts = new Map<string, string>();
  return {
    async isLegacy(serverName, configHash) {
      return verdicts.get(serverName) === configHash;
    },
    async setLegacy(serverName, configHash) {
      verdicts.set(serverName, configHash);
    },
    async clear(serverName) {
      verdicts.delete(serverName);
    },
  };
}
