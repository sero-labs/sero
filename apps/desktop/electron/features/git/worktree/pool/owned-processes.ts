import path from 'node:path';

export type SeroOwnedProcessKind =
  | 'terminal'
  | 'agent-session'
  | 'command'
  | 'managed-dev-server';

export interface SeroOwnedProcess {
  id: string;
  kind: SeroOwnedProcessKind;
  cwd: string;
  /** Resolves only after the owner has confirmed shutdown. */
  stop(): Promise<void>;
}

export interface OwnedShutdownFailure {
  id: string;
  kind: SeroOwnedProcessKind;
  reason: string;
}

function isRootedIn(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * In-process ownership index. It contains only processes Sero created and may
 * ask to stop. Remaining OS processes are detection evidence, never entries
 * that this registry may terminate.
 */
export class SeroOwnedProcessRegistry {
  private readonly entries = new Map<string, SeroOwnedProcess>();

  register(entry: SeroOwnedProcess): () => void {
    this.entries.set(entry.id, entry);
    return () => {
      if (this.entries.get(entry.id) === entry) this.entries.delete(entry.id);
    };
  }

  listRootedIn(root: string): SeroOwnedProcess[] {
    return [...this.entries.values()].filter((entry) => isRootedIn(entry.cwd, root));
  }

  async stopRootedIn(root: string): Promise<OwnedShutdownFailure[]> {
    const entries = this.listRootedIn(root);
    const outcomes = await Promise.all(entries.map(async (entry): Promise<OwnedShutdownFailure | null> => {
      try {
        await entry.stop();
        if (this.entries.get(entry.id) === entry) this.entries.delete(entry.id);
        return null;
      } catch (error) {
        return {
          id: entry.id,
          kind: entry.kind,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }));
    return outcomes.filter((outcome): outcome is OwnedShutdownFailure => outcome !== null);
  }
}

export const seroOwnedProcesses = new SeroOwnedProcessRegistry();
