import type { HostProcessAdapter, HostProcessExecFile, HostProcessSignal } from './types';

interface WindowsProcessRow {
  pid: number;
  parentPid: number;
}

interface WindowsNetstatRow {
  protocol: string;
  localAddress: string;
  state: string;
  pid: number;
}

export class WindowsHostProcessAdapter implements HostProcessAdapter {
  constructor(private readonly execFile: HostProcessExecFile) {}

  async descendantPids(rootPid: number): Promise<number[]> {
    const result = await this.execFile({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Csv -NoTypeInformation',
      ],
      timeoutMs: 5_000,
    }).catch(() => null);
    if (result?.exitCode !== 0) return [];
    return findDescendantPids(rootPid, parseWindowsProcessCsv(result.stdout));
  }

  async listeningPort(pids: number[]): Promise<number | null> {
    const pidSet = new Set(uniqueNumbers(pids));
    if (pidSet.size === 0) return null;
    const rows = await this.netstatRows();
    for (const row of rows) {
      if (row.state === 'LISTENING' && pidSet.has(row.pid)) return parseWindowsAddressPort(row.localAddress);
    }
    return null;
  }

  async listenerPids(port: number): Promise<number[]> {
    const rows = await this.netstatRows();
    return uniqueNumbers(rows
      .filter((row) => row.state === 'LISTENING' && parseWindowsAddressPort(row.localAddress) === port)
      .map((row) => row.pid));
  }

  async killPids(signal: HostProcessSignal, pids: number[]): Promise<void> {
    const uniquePids = uniqueNumbers(pids);
    if (uniquePids.length === 0) return;
    await Promise.all(uniquePids.map((pid) => {
      const args = ['/PID', String(pid), '/T'];
      if (signal === 'KILL') args.push('/F');
      return this.execFile({ program: 'taskkill.exe', args, timeoutMs: 5_000 }).catch(() => undefined);
    }));
  }

  private async netstatRows(): Promise<WindowsNetstatRow[]> {
    const result = await this.execFile({
      program: 'netstat.exe',
      args: ['-ano', '-p', 'TCP'],
      timeoutMs: 5_000,
    }).catch(() => null);
    return result?.exitCode === 0 ? parseWindowsNetstat(result.stdout) : [];
  }
}

export function parseWindowsProcessCsv(output: string): WindowsProcessRow[] {
  const rows: WindowsProcessRow[] = [];
  for (const line of output.split('\n')) {
    const columns = parseCsvLine(line.trim());
    if (columns.length < 2 || columns[0] === 'ProcessId') continue;
    const pid = Number(columns[0]);
    const parentPid = Number(columns[1]);
    if (Number.isInteger(pid) && pid > 0 && Number.isInteger(parentPid) && parentPid >= 0) rows.push({ pid, parentPid });
  }
  return rows;
}

export function findDescendantPids(rootPid: number, rows: WindowsProcessRow[]): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const row of rows) {
    const children = childrenByParent.get(row.parentPid) ?? [];
    children.push(row.pid);
    childrenByParent.set(row.parentPid, children);
  }
  const descendants: number[] = [];
  const seen = new Set<number>();
  const queue = childrenByParent.get(rootPid) ?? [];
  while (queue.length > 0) {
    const pid = queue.shift();
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    descendants.push(pid);
    queue.push(...(childrenByParent.get(pid) ?? []));
  }
  return descendants;
}

export function parseWindowsNetstat(output: string): WindowsNetstatRow[] {
  const rows: WindowsNetstatRow[] = [];
  for (const line of output.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || parts[0].toUpperCase() !== 'TCP') continue;
    const pid = Number(parts[4]);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    rows.push({
      protocol: parts[0].toUpperCase(),
      localAddress: parts[1],
      state: parts[3].toUpperCase(),
      pid,
    });
  }
  return rows;
}

export function parseWindowsAddressPort(address: string): number | null {
  const bracketed = address.match(/^\[[^\]]+\]:(\d{1,5})$/);
  const portText = bracketed?.[1] ?? address.match(/:(\d{1,5})$/)?.[1];
  if (!portText) return null;
  const port = Number(portText);
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : null;
}

function parseCsvLine(line: string): string[] {
  if (!line) return [];
  const columns: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      columns.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  columns.push(current);
  return columns;
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}
