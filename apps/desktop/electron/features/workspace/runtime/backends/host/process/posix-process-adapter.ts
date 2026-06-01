import type { HostProcessAdapter, HostProcessExecFile, HostProcessSignal } from './types';

export class PosixHostProcessAdapter implements HostProcessAdapter {
  constructor(private readonly execFile: HostProcessExecFile) {}

  async descendantPids(rootPid: number): Promise<number[]> {
    const seen = new Set<number>();
    const collectLevel = async (parents: number[]): Promise<void> => {
      const results = await Promise.all(parents.map((parent) => (
        this.execFile({ program: 'pgrep', args: ['-P', String(parent)], timeoutMs: 2_000 }).catch(() => null)
      )));
      const next = results.flatMap((result) => (
        result?.exitCode === 0 ? parsePidLines(result.stdout) : []
      )).filter((pid) => {
        if (seen.has(pid)) return false;
        seen.add(pid);
        return true;
      });
      if (next.length > 0) await collectLevel(next);
    };

    await collectLevel([rootPid]);
    return [...seen];
  }

  async listeningPort(pids: number[]): Promise<number | null> {
    if (pids.length === 0) return null;
    const lsof = await this.execFile({
      program: 'lsof',
      args: ['-nP', '-iTCP', '-sTCP:LISTEN', '-p', pids.join(',')],
      timeoutMs: 2_000,
    }).catch(() => null);
    const lsofPort = lsof?.exitCode === 0 ? parseLsofPort(lsof.stdout) : null;
    if (lsofPort) return lsofPort;

    const ss = await this.execFile({ program: 'ss', args: ['-tlnp'], timeoutMs: 2_000 }).catch(() => null);
    const ssPort = ss?.exitCode === 0 ? parseSocketTablePort(ss.stdout, pids) : null;
    if (ssPort) return ssPort;

    const netstat = await this.execFile({ program: 'netstat', args: ['-tlnp'], timeoutMs: 2_000 }).catch(() => null);
    return netstat?.exitCode === 0 ? parseSocketTablePort(netstat.stdout, pids) : null;
  }

  async listenerPids(port: number): Promise<number[]> {
    const result = await this.execFile({
      program: 'lsof',
      args: ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
      timeoutMs: 2_000,
    }).catch(() => null);
    if (result?.exitCode === 0) return parsePidLines(result.stdout);

    const ss = await this.execFile({ program: 'ss', args: ['-tlnp'], timeoutMs: 2_000 }).catch(() => null);
    if (ss?.exitCode === 0) return parseSocketTablePids(ss.stdout, port);

    const netstat = await this.execFile({ program: 'netstat', args: ['-tlnp'], timeoutMs: 2_000 }).catch(() => null);
    return netstat?.exitCode === 0 ? parseSocketTablePids(netstat.stdout, port) : [];
  }

  async killPids(signal: HostProcessSignal, pids: number[]): Promise<void> {
    const uniquePids = uniqueNumbers(pids);
    if (uniquePids.length === 0) return;
    await this.execFile({
      program: 'kill',
      args: [`-${signal}`, ...uniquePids.map(String)],
      timeoutMs: 2_000,
    }).catch(() => undefined);
  }
}

export function parseLsofPort(output: string): number | null {
  for (const line of output.split('\n')) {
    const match = line.match(/TCP\s+\S+:(\d+)\s+\(LISTEN\)/);
    if (!match) continue;
    const port = Number(match[1]);
    if (isValidPort(port)) return port;
  }
  return null;
}

export function parsePidLines(output: string): number[] {
  return uniqueNumbers(output.split('\n').map((line) => Number(line.trim())));
}

export function parseSocketTablePort(output: string, pids: number[]): number | null {
  const pidSet = new Set(uniqueNumbers(pids));
  for (const line of output.split('\n')) {
    if (!line.includes('LISTEN')) continue;
    if (!parseSocketLinePids(line).some((pid) => pidSet.has(pid))) continue;
    const port = parseSocketLinePort(line);
    if (port) return port;
  }
  return null;
}

export function parseSocketTablePids(output: string, port: number): number[] {
  const pids: number[] = [];
  for (const line of output.split('\n')) {
    if (!line.includes('LISTEN') || parseSocketLinePort(line) !== port) continue;
    pids.push(...parseSocketLinePids(line));
  }
  return uniqueNumbers(pids);
}

export function parseSocketLinePort(line: string): number | null {
  const addresses = line.matchAll(/(?:^|\s)\S+:(\d{1,5})(?=\s|$)/g);
  for (const match of addresses) {
    const port = Number(match[1]);
    if (isValidPort(port)) return port;
  }
  return null;
}

export function parseSocketLinePids(line: string): number[] {
  const pids = [...line.matchAll(/pid=(\d+)/g), ...line.matchAll(/\b(\d+)\//g)]
    .map((match) => Number(match[1]));
  return uniqueNumbers(pids);
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port < 65_536;
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}
