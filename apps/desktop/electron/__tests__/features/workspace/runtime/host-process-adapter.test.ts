import { describe, expect, it, vi } from 'vitest';

import { createHostProcessAdapter } from '@electron/features/workspace/runtime/backends/host/process/factory';
import {
  parseLsofPort,
  parsePidLines,
  parseSocketLinePids,
  parseSocketLinePort,
  parseSocketTablePids,
  parseSocketTablePort,
  PosixHostProcessAdapter,
} from '@electron/features/workspace/runtime/backends/host/process/posix-process-adapter';
import type { HostProcessExecFile } from '@electron/features/workspace/runtime/backends/host/process/types';
import {
  findDescendantPids,
  parseWindowsAddressPort,
  parseWindowsNetstat,
  parseWindowsProcessCsv,
  WindowsHostProcessAdapter,
} from '@electron/features/workspace/runtime/backends/host/process/windows-process-adapter';
import type { RuntimeExecFileInput, RuntimeExecResult } from '@electron/features/workspace/runtime/types';

function ok(stdout = ''): RuntimeExecResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function fail(): RuntimeExecResult {
  return { stdout: '', stderr: '', exitCode: 1 };
}

describe('host process adapter factory', () => {
  it('selects Windows adapter for win32 and POSIX otherwise', () => {
    const execFile = vi.fn<HostProcessExecFile>();

    expect(createHostProcessAdapter({ platform: 'win32', execFile })).toBeInstanceOf(WindowsHostProcessAdapter);
    expect(createHostProcessAdapter({ platform: 'darwin', execFile })).toBeInstanceOf(PosixHostProcessAdapter);
    expect(createHostProcessAdapter({ platform: 'linux', execFile })).toBeInstanceOf(PosixHostProcessAdapter);
  });
});

describe('POSIX host process adapter parsers', () => {
  it('parses lsof listening ports and pid lines', () => {
    expect(parseLsofPort('node 123 user 22u IPv4 TCP 127.0.0.1:5173 (LISTEN)')).toBe(5173);
    expect(parseLsofPort('COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME')).toBeNull();
    expect(parsePidLines('123\nnot-a-pid\n456\n123\n')).toEqual([123, 456]);
  });

  it('parses ss and netstat socket table ports and pids', () => {
    const ssOutput = [
      'State Recv-Q Send-Q Local Address:Port Peer Address:Port Process',
      'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=1234,fd=22))',
      'LISTEN 0 511 [::1]:6000 [::]:* users:(("node",pid=9999,fd=22))',
    ].join('\n');
    const netstatOutput = 'tcp 0 0 127.0.0.1:4321 0.0.0.0:* LISTEN 2000/node';

    expect(parseSocketLinePort('LISTEN 0 511 [::1]:6000 [::]:* users:(("node",pid=9999,fd=22))')).toBe(6000);
    expect(parseSocketLinePids('users:(("node",pid=1234,fd=22)) 2000/node')).toEqual([1234, 2000]);
    expect(parseSocketTablePort(ssOutput, [1234])).toBe(5173);
    expect(parseSocketTablePort(netstatOutput, [2000])).toBe(4321);
    expect(parseSocketTablePids(ssOutput, 5173)).toEqual([1234]);
  });
});

describe('POSIX host process adapter', () => {
  it('discovers descendants recursively with pgrep', async () => {
    const execFile = vi.fn<HostProcessExecFile>().mockImplementation(async (input) => {
      if (input.args[1] === '100') return ok('200\n201\n');
      if (input.args[1] === '200') return ok('300\n');
      return fail();
    });
    const adapter = new PosixHostProcessAdapter(execFile);

    await expect(adapter.descendantPids(100)).resolves.toEqual([200, 201, 300]);
    expect(execFile).toHaveBeenCalledWith(expect.objectContaining({ program: 'pgrep', args: ['-P', '100'] }));
  });

  it('falls back from lsof to ss for listening port and listener pids', async () => {
    const execFile = vi.fn<HostProcessExecFile>().mockImplementation(async (input) => {
      if (input.program === 'lsof') return fail();
      if (input.program === 'ss') return ok('LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=1234,fd=22))');
      return fail();
    });
    const adapter = new PosixHostProcessAdapter(execFile);

    await expect(adapter.listeningPort([1234])).resolves.toBe(5173);
    await expect(adapter.listenerPids(5173)).resolves.toEqual([1234]);
  });

  it('uses kill with signal names without lifecycle policy decisions', async () => {
    const execFile = vi.fn<HostProcessExecFile>().mockResolvedValue(ok());
    const adapter = new PosixHostProcessAdapter(execFile);

    await adapter.killPids('TERM', [1234, 1234, 2000]);
    await adapter.killPids('KILL', [2000]);

    expect(execFile).toHaveBeenNthCalledWith(1, expect.objectContaining({
      program: 'kill',
      args: ['-TERM', '1234', '2000'],
    }));
    expect(execFile).toHaveBeenNthCalledWith(2, expect.objectContaining({
      program: 'kill',
      args: ['-KILL', '2000'],
    }));
  });
});

describe('Windows host process adapter parsers', () => {
  it('parses process CSV and descendants', () => {
    const rows = parseWindowsProcessCsv([
      '"ProcessId","ParentProcessId"',
      '"100","4"',
      '"200","100"',
      '"201","100"',
      '"300","200"',
    ].join('\n'));

    expect(rows).toEqual([
      { pid: 100, parentPid: 4 },
      { pid: 200, parentPid: 100 },
      { pid: 201, parentPid: 100 },
      { pid: 300, parentPid: 200 },
    ]);
    expect(findDescendantPids(100, rows)).toEqual([200, 201, 300]);
  });

  it('parses netstat listener rows and IPv4/IPv6 ports', () => {
    const rows = parseWindowsNetstat([
      '  Proto  Local Address          Foreign Address        State           PID',
      '  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       1234',
      '  TCP    [::1]:6000             [::]:0                 LISTENING       2000',
    ].join('\n'));

    expect(rows).toEqual([
      { protocol: 'TCP', localAddress: '127.0.0.1:5173', state: 'LISTENING', pid: 1234 },
      { protocol: 'TCP', localAddress: '[::1]:6000', state: 'LISTENING', pid: 2000 },
    ]);
    expect(parseWindowsAddressPort('127.0.0.1:5173')).toBe(5173);
    expect(parseWindowsAddressPort('[::1]:6000')).toBe(6000);
  });
});

describe('Windows host process adapter', () => {
  it('uses PowerShell CIM for descendants and netstat for listeners without Unix tools', async () => {
    const execFile = vi.fn<HostProcessExecFile>().mockImplementation(async (input) => {
      if (input.program === 'powershell.exe') return ok('"ProcessId","ParentProcessId"\n"200","100"\n"300","200"');
      if (input.program === 'netstat.exe') return ok('TCP 127.0.0.1:5173 0.0.0.0:0 LISTENING 300');
      return fail();
    });
    const adapter = new WindowsHostProcessAdapter(execFile);

    await expect(adapter.descendantPids(100)).resolves.toEqual([200, 300]);
    await expect(adapter.listeningPort([300])).resolves.toBe(5173);
    await expect(adapter.listenerPids(5173)).resolves.toEqual([300]);

    const programs = execFile.mock.calls.map((call: [RuntimeExecFileInput]) => call[0].program);
    expect(programs).toContain('powershell.exe');
    expect(programs).toContain('netstat.exe');
    expect(programs).not.toEqual(expect.arrayContaining(['pgrep', 'lsof', 'ss', 'kill']));
  });

  it('uses taskkill for graceful and force termination', async () => {
    const execFile = vi.fn<HostProcessExecFile>().mockResolvedValue(ok());
    const adapter = new WindowsHostProcessAdapter(execFile);

    await adapter.killPids('TERM', [1234]);
    await adapter.killPids('KILL', [2000]);

    expect(execFile).toHaveBeenNthCalledWith(1, expect.objectContaining({
      program: 'taskkill.exe',
      args: ['/PID', '1234', '/T'],
    }));
    expect(execFile).toHaveBeenNthCalledWith(2, expect.objectContaining({
      program: 'taskkill.exe',
      args: ['/PID', '2000', '/T', '/F'],
    }));
  });
});
