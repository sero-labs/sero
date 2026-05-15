import { describe, expect, it, vi } from 'vitest';

import { PortScanner } from '@electron/features/container/network/port-forward';

function listeningOnLocalhost(port: number): string {
  return `LISTEN 0 128 127.0.0.1:${port} 0.0.0.0:* users:(("node",pid=12,fd=3))`;
}

async function flushScanner(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('PortScanner', () => {
  it('keeps detected container-host URLs and clears them when a scan fails', async () => {
    const exec = vi.fn<(cmd: string) => Promise<{ stdout: string; exitCode: number }>>()
      .mockResolvedValueOnce({ stdout: listeningOnLocalhost(3000), exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 1 });

    const scanner = new PortScanner();
    scanner.startScanning('ws-1', '192.168.64.6', exec);
    await flushScanner();

    expect(scanner.getPorts('ws-1')).toEqual([
      { port: 3000, url: 'http://192.168.64.6:3000', bridged: false },
    ]);

    scanner.triggerScan('ws-1');
    await flushScanner();

    expect(scanner.getPorts('ws-1')).toEqual([]);
    await scanner.disposeAll();
  });

  it('waits for an in-flight scan to finish before stopScanning resolves', async () => {
    const control: { resolveScan?: (value: { stdout: string; exitCode: number }) => void } = {};
    const exec = vi.fn((cmd: string) => {
      if (cmd === 'ss -tlnp 2>/dev/null') {
        return new Promise<{ stdout: string; exitCode: number }>((resolve) => { control.resolveScan = resolve; });
      }
      return Promise.resolve({ stdout: '', exitCode: 0 });
    });

    const scanner = new PortScanner();
    scanner.startScanning('ws-2', '192.168.64.7', exec);

    const stopPromise = scanner.stopScanning('ws-2');
    let settled = false;
    void stopPromise.then(() => { settled = true; });

    await Promise.resolve();
    expect(settled).toBe(false);

    if (!control.resolveScan) throw new Error('expected in-flight scan resolver');
    control.resolveScan({ stdout: listeningOnLocalhost(4173), exitCode: 0 });
    await stopPromise;

    expect(settled).toBe(true);
    expect(scanner.getPorts('ws-2')).toEqual([]);
  });
});
