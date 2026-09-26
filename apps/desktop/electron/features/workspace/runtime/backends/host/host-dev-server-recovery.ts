import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { resolveHostArtifactsRoot } from '@electron/features/profile/roots';
import { createHostProcessAdapter } from './process/factory';
import type { HostProcessAdapter } from './process/types';

const execFileAsync = promisify(execFile);

interface ProcessIdentity {
  pid: number;
  identity: string;
}

interface OwnedServer {
  owner: ProcessIdentity;
  processes: ProcessIdentity[];
}

export class HostDevServerRecovery {
  private readonly directory: string;

  constructor(private readonly adapter: HostProcessAdapter, directory = path.join(resolveHostArtifactsRoot(), 'host-dev-servers')) {
    this.directory = directory;
  }

  async track(pids: number[]): Promise<string> {
    const owner = await this.identity(process.pid);
    if (!owner) throw new Error('Cannot identify the Sero process that owns this dev server.');
    const processes = await this.identities(pids);
    if (processes.length === 0) throw new Error('Cannot identify the spawned dev server process.');
    const id = randomUUID();
    await this.save(id, { owner, processes });
    return id;
  }

  async update(id: string, pids: number[]): Promise<void> {
    const record = await this.load(id);
    if (!record) throw new Error('Dev server recovery record is missing.');
    const discovered = await this.identities(pids);
    const processes = new Map(record.processes.map((entry) => [entry.pid, entry]));
    for (const entry of discovered) processes.set(entry.pid, entry);
    await this.save(id, { ...record, processes: [...processes.values()] });
  }

  async terminate(id: string): Promise<void> {
    const record = await this.load(id);
    if (!record) return;
    const live = await this.liveProcesses(record.processes);
    const descendants = (await Promise.all(live.map((entry) => this.adapter.descendantPids(entry.pid)))).flat();
    const targets = await this.liveProcesses([...live, ...await this.identities(descendants)]);
    if (targets.length > 0) {
      await this.adapter.killPids('TERM', targets.map((entry) => entry.pid));
      await new Promise((resolve) => setTimeout(resolve, 750));
      const remaining = await this.liveProcesses(targets);
      if (remaining.length > 0) await this.adapter.killPids('KILL', remaining.map((entry) => entry.pid));
    }
    if ((await this.liveProcesses(targets)).length === 0
      && (await this.liveProcesses(record.processes)).length === 0) await this.forget(id);
  }

  private async forget(id: string): Promise<void> {
    await unlink(this.file(id)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  async reapOrphans(): Promise<void> {
    const files = await readdir(this.directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const file of files.filter((name) => /^[a-f0-9-]+\.json$/.test(name))) {
      const id = file.slice(0, -5);
      const record = await this.load(id);
      if (!record) continue;
      // Another Sero process may still own this server (for example during a profile switch).
      const ownerIdentity = await this.adapter.processIdentity(record.owner.pid);
      if (ownerIdentity === record.owner.identity || (ownerIdentity === null && isProcessAlive(record.owner.pid))) continue;
      await this.terminate(id);
    }
  }

  private async identity(pid: number): Promise<ProcessIdentity | null> {
    const identity = await this.adapter.processIdentity(pid);
    return identity ? { pid, identity } : null;
  }

  private async identities(pids: number[]): Promise<ProcessIdentity[]> {
    const entries = await Promise.all([...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0)
      .map((pid) => this.identity(pid)));
    return entries.filter((entry): entry is ProcessIdentity => entry !== null);
  }

  private async matches(entry: ProcessIdentity): Promise<boolean> {
    return (await this.adapter.processIdentity(entry.pid)) === entry.identity;
  }

  private async liveProcesses(entries: ProcessIdentity[]): Promise<ProcessIdentity[]> {
    const matches = await Promise.all(entries.map(async (entry) => await this.matches(entry) ? entry : null));
    return matches.filter((entry): entry is ProcessIdentity => entry !== null);
  }

  private file(id: string): string {
    return path.join(this.directory, `${id}.json`);
  }

  private async load(id: string): Promise<OwnedServer | null> {
    const text = await readFile(this.file(id), 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!text) return null;
    try {
      const value: unknown = JSON.parse(text);
      if (!isOwnedServer(value)) throw new Error('Invalid recovery record');
      return value;
    } catch (error) {
      console.warn(`[host-dev-server] Could not read recovery record ${id}:`, error);
      return null;
    }
  }

  private async save(id: string, record: OwnedServer): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporary = path.join(this.directory, `${id}.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, this.file(id));
  }
}

export async function reapHostDevServers(): Promise<void> {
  const adapter = createHostProcessAdapter({
    execFile: async ({ program, args, timeoutMs }) => {
      try {
        const result = await execFileAsync(program, args, { timeout: timeoutMs });
        return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
      } catch (error) {
        const result = error as { stdout?: string; stderr?: string; code?: number };
        return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', exitCode: result.code ?? 1 };
      }
    },
  });
  await new HostDevServerRecovery(adapter).reapOrphans();
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function isProcessIdentity(value: unknown): value is ProcessIdentity {
  return typeof value === 'object' && value !== null
    && 'pid' in value && Number.isInteger(value.pid) && Number(value.pid) > 0
    && 'identity' in value && typeof value.identity === 'string' && value.identity.length > 0;
}

function isOwnedServer(value: unknown): value is OwnedServer {
  return typeof value === 'object' && value !== null
    && 'owner' in value && isProcessIdentity(value.owner)
    && 'processes' in value && Array.isArray(value.processes)
    && value.processes.every(isProcessIdentity);
}
