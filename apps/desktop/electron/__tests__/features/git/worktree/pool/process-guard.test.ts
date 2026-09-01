import { describe, expect, it, vi } from 'vitest';

import { SeroOwnedProcessRegistry } from '@electron/features/git/worktree/pool/owned-processes';
import {
  parseLsofFields,
  LsofProcessDetector,
  WorktreeProcessGuard,
  type SlotProcessDetector,
} from '@electron/features/git/worktree/pool/process-guard';

function detector(
  detect: SlotProcessDetector['detect'],
  platform: NodeJS.Platform = 'linux',
): SlotProcessDetector {
  return { platform, detect };
}

describe('worktree process guard', () => {
  it('confirms Sero-owned shutdown before platform detection starts', async () => {
    const events: string[] = [];
    const owned = new SeroOwnedProcessRegistry();
    owned.register({
      id: 'terminal-1',
      kind: 'terminal',
      cwd: '/repo/slot-1/subdir',
      stop: async () => { events.push('owned-stopped'); },
    });
    const guard = new WorktreeProcessGuard({
      owned,
      detector: detector(async () => {
        events.push('detected');
        return { status: 'clear' };
      }),
    });

    await expect(guard.prepare('/repo/slot-1')).resolves.toEqual({ status: 'safe', stoppedOwned: 1 });
    expect(events).toEqual(['owned-stopped', 'detected']);
  });

  it('blocks on a foreign process without terminating it', async () => {
    const owned = new SeroOwnedProcessRegistry();
    const stop = vi.fn(async () => undefined);
    owned.register({ id: 'outside', kind: 'command', cwd: '/elsewhere', stop });
    const guard = new WorktreeProcessGuard({
      owned,
      detector: detector(async () => ({
        status: 'in-use',
        processes: [{ pid: 41, command: 'node' }],
      })),
    });

    const result = await guard.prepare('/repo/slot-1');
    expect(result.status).toBe('in-use');
    if (result.status !== 'in-use') throw new Error('expected in-use');
    expect(result.reason).toContain('Foreign processes were not terminated');
    expect(stop).not.toHaveBeenCalled();
  });

  it('fails closed when detection or owned shutdown cannot be confirmed', async () => {
    const owned = new SeroOwnedProcessRegistry();
    owned.register({
      id: 'session-1',
      kind: 'agent-session',
      cwd: '/repo/slot-1',
      stop: async () => { throw new Error('abort timed out'); },
    });
    const detect = vi.fn(async () => ({ status: 'clear' as const }));
    const shutdownFailure = await new WorktreeProcessGuard({ owned, detector: detector(detect) })
      .prepare('/repo/slot-1');
    expect(shutdownFailure).toMatchObject({ status: 'unverifiable' });
    expect(detect).not.toHaveBeenCalled();

    const detectionFailure = await new WorktreeProcessGuard({
      owned: new SeroOwnedProcessRegistry(),
      detector: detector(async () => ({ status: 'unverifiable', reason: 'permission denied' })),
    }).prepare('/repo/slot-1');
    expect(detectionFailure).toEqual({ status: 'unverifiable', reason: 'permission denied' });
  });

  it('turns an unconfirmed owned shutdown into bounded unverifiable backpressure', async () => {
    const owned = new SeroOwnedProcessRegistry();
    owned.register({
      id: 'server-1',
      kind: 'managed-dev-server',
      cwd: '/repo/slot-1',
      stop: () => new Promise<void>(() => undefined),
    });
    const result = await new WorktreeProcessGuard({
      owned,
      detector: detector(async () => ({ status: 'clear' })),
      ownedShutdownTimeoutMs: 1,
    }).prepare('/repo/slot-1');
    expect(result).toMatchObject({ status: 'unverifiable' });
  });

  it('fails closed on unsupported platforms and parses adapter records deterministically', async () => {
    const unsupported = await new LsofProcessDetector('win32').detect('/repo/slot-1');
    expect(unsupported.status).toBe('unverifiable');
    expect(parseLsofFields('p12\ncnode\np19\ncbash\n')).toEqual([
      { pid: 12, command: 'node' },
      { pid: 19, command: 'bash' },
    ]);
  });
});
