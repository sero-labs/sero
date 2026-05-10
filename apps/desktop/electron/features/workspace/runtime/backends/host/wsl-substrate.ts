import type { ChildProcess } from 'child_process';
import { execFile, execFileSync, spawn } from 'child_process';
import { dirname } from 'path/posix';
import { randomUUID } from 'crypto';
import { RUNTIME_WORKSPACE_PATH } from '../../runtime-paths';
import type {
  HostRuntimeSubstrate,
  HostSubstrateExecFileOptions,
  HostSubstrateFileEntry,
  HostSubstrateFileWatch,
  HostSubstrateFileWatchEvent,
  HostSubstrateRendered,
  HostSubstrateSpawnOptions,
  HostSubstrateStat,
} from './host-substrate';
import { extractWslDistro, isWslPathInsideRoot, toWslPath } from './wsl-paths';

let cachedSupportsCd: boolean | undefined;

function execFileAsync(program: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(program, args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

function singleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function signalName(signal: NodeJS.Signals | number): string {
  return typeof signal === 'number' ? String(signal) : signal.replace(/^SIG/, '');
}

function createWslEnv(env: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!env) return undefined;
  const keys = Object.keys(env);
  return { ...env, WSLENV: keys.map((key) => `${key}/u`).join(':') };
}

function detectSupportsCd(): boolean {
  if (cachedSupportsCd !== undefined) return cachedSupportsCd;
  try {
    const help = execFileSync('wsl.exe', ['--help'], { encoding: 'utf8' });
    cachedSupportsCd = help.includes('--cd');
  } catch {
    cachedSupportsCd = false;
  }
  return cachedSupportsCd;
}

function mapFindType(type: string): HostSubstrateFileEntry['type'] {
  if (type === 'd') return 'directory';
  if (type === 'l') return 'symlink';
  return 'file';
}

function mapStatType(type: string): HostSubstrateStat['type'] {
  if (type.includes('directory')) return 'directory';
  if (type.includes('symbolic link')) return 'symlink';
  return 'file';
}

function mapWatchKind(events: string): HostSubstrateFileWatchEvent['kind'] | null {
  if (events.includes('MODIFY')) return 'modify';
  if (events.includes('CREATE')) return 'create';
  if (events.includes('DELETE')) return 'delete';
  if (events.includes('MOVE') || events.includes('MOVED_')) return 'move';
  return null;
}

export class WslHostSubstrate implements HostRuntimeSubstrate {
  readonly platform = 'win32' as const;
  readonly kind = 'wsl' as const;
  readonly runtimeWorkspacePath = RUNTIME_WORKSPACE_PATH;

  private readonly distro: string;
  private readonly supportsCdOverride?: boolean;

  constructor(options: { workspacePath: string; distro?: string; supportsCd?: boolean }) {
    this.distro = options.distro ?? extractWslDistro(options.workspacePath) ?? '';
    this.supportsCdOverride = options.supportsCd;
  }

  toExecutionPath(nativePath: string): string {
    return toWslPath(nativePath);
  }

  toNativeHostPath(executionPath: string): string {
    const normalized = toWslPath(executionPath);
    return `\\\\wsl.localhost\\${this.distro}${normalized.replace(/\//g, '\\')}`;
  }

  isPathInsideRoot(nativePath: string, root: string): boolean {
    return isWslPathInsideRoot(nativePath, root);
  }

  shellCommand(opts: HostSubstrateSpawnOptions): HostSubstrateRendered {
    const pidfile = `/tmp/sero-pid-${randomUUID()}`;
    const shellArgs = opts.loginShell === true ? 'bash --login -c' : 'bash -c';
    const wrapped = `echo $$ > ${singleQuote(pidfile)}; exec ${shellArgs} ${singleQuote(opts.command)}`;
    return this.renderWithCwd(opts.cwd, ['bash', '-c', wrapped], createWslEnv(opts.env), pidfile);
  }

  execFileCommand(opts: HostSubstrateExecFileOptions): HostSubstrateRendered {
    return this.renderWithCwd(opts.cwd, [opts.program, ...opts.args], createWslEnv(opts.env));
  }

  terminalCommand(opts: { cwd: string; env?: Record<string, string> }): HostSubstrateRendered {
    return this.renderWithCwd(opts.cwd, ['bash', '--login'], createWslEnv(opts.env));
  }

  async readFile(filePath: string): Promise<Buffer> {
    const { stdout } = await execFileAsync('wsl.exe', this.wslCommandArgs(['base64', '-w0', this.toExecutionPath(filePath)]));
    return Buffer.from(this.normalizeExecOutput(stdout), 'base64');
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    await this.spawnAndWrite(
      this.wslCommandArgs(['bash', '-c', `mkdir -p ${singleQuote(dirname(this.toExecutionPath(filePath)))} && base64 -d > ${singleQuote(this.toExecutionPath(filePath))}`]),
      data.toString('base64'),
    );
  }

  async listFiles(directoryPath: string): Promise<HostSubstrateFileEntry[]> {
    const { stdout } = await execFileAsync('wsl.exe', this.wslCommandArgs([
      'find',
      this.toExecutionPath(directoryPath),
      '-mindepth',
      '1',
      '-maxdepth',
      '1',
      '-printf',
      '%y %f\\n',
    ]));
    return this.normalizeExecOutput(stdout).split('\n').filter(Boolean).map((line) => {
      const [type, ...nameParts] = line.split(' ');
      return { name: nameParts.join(' '), type: mapFindType(type) };
    });
  }

  async stat(filePath: string): Promise<HostSubstrateStat> {
    const { stdout } = await execFileAsync('wsl.exe', this.wslCommandArgs(['stat', '-c', '%s %Y %F', this.toExecutionPath(filePath)]));
    const [size, mtimeSeconds, ...typeParts] = this.normalizeExecOutput(stdout).trim().split(' ');
    return { size: Number(size), mtimeMs: Number(mtimeSeconds) * 1000, type: mapStatType(typeParts.join(' ')) };
  }

  async rename(from: string, to: string): Promise<void> {
    await execFileAsync('wsl.exe', this.wslCommandArgs(['mv', this.toExecutionPath(from), this.toExecutionPath(to)]));
  }

  async delete(filePath: string, opts: { recursive?: boolean } = {}): Promise<void> {
    await execFileAsync('wsl.exe', this.wslCommandArgs([opts.recursive === true ? 'rm' : 'unlink', ...(opts.recursive === true ? ['-rf'] : []), this.toExecutionPath(filePath)]));
  }

  async createDirectory(directoryPath: string, opts: { recursive?: boolean } = {}): Promise<void> {
    await execFileAsync('wsl.exe', this.wslCommandArgs(['mkdir', ...(opts.recursive === true ? ['-p'] : []), this.toExecutionPath(directoryPath)]));
  }

  async watchFiles(
    root: string,
    onEvent: (event: HostSubstrateFileWatchEvent) => void,
  ): Promise<HostSubstrateFileWatch> {
    const executionRoot = this.toExecutionPath(root);
    const child = spawn('wsl.exe', this.wslCommandArgs([
      'inotifywait',
      '-m',
      '-r',
      '-e',
      'modify,create,delete,move',
      '--format',
      '%w\t%e\t%f',
      executionRoot,
    ]));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      for (const line of chunk.split('\n').filter(Boolean)) {
        const [directory, events, name = ''] = line.split('\t');
        if (!directory || !events) continue;
        const kind = mapWatchKind(events);
        if (!kind) continue;
        onEvent({ kind, path: name ? `${directory}${name}` : directory });
      }
    });
    return { close: async () => { child.kill(); } };
  }

  async isSshAvailable(): Promise<boolean> {
    try {
      const result = await execFileAsync('wsl.exe', this.wslCommandArgs([
        'ssh',
        '-T',
        '-o',
        'StrictHostKeyChecking=accept-new',
        '-o',
        'ConnectTimeout=5',
        'git@github.com',
      ])).catch((error: unknown) => normalizeSshProbeFailure(error));
      return result.stderr.includes('successfully authenticated');
    } catch {
      return false;
    }
  }

  async signalChild(child: ChildProcess, rendered: HostSubstrateRendered, signal: NodeJS.Signals | number): Promise<void> {
    child.kill(signal);
    if (!rendered.innerPidFile) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const { stdout } = await execFileAsync('wsl.exe', this.wslCommandArgs(['cat', rendered.innerPidFile]));
    const innerPid = stdout.trim();
    if (innerPid) {
      await execFileAsync('wsl.exe', this.wslCommandArgs(['kill', `-${signalName(signal)}`, innerPid]));
    }
  }

  normalizeExecOutput(output: string): string {
    return output.replace(/\r\n/g, '\n');
  }

  private renderWithCwd(
    cwd: string,
    command: string[],
    env?: Record<string, string>,
    innerPidFile?: string,
  ): HostSubstrateRendered {
    const executionCwd = this.toExecutionPath(cwd);
    const args = this.supportsCd() ? this.wslArgs(['--cd', executionCwd, '--', ...command]) : this.wslArgs(['--', 'bash', '-c', `cd ${singleQuote(executionCwd)} && ${command.map(singleQuote).join(' ')}`]);
    return { program: 'wsl.exe', args, nativeCwd: process.cwd(), env, innerPidFile };
  }

  private wslArgs(args: string[]): string[] {
    return this.distro ? ['-d', this.distro, ...args] : args;
  }

  private wslCommandArgs(command: string[]): string[] {
    return this.wslArgs(['--', ...command]);
  }

  private supportsCd(): boolean {
    return this.supportsCdOverride ?? detectSupportsCd();
  }

  private spawnAndWrite(args: string[], input: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('wsl.exe', args);
      child.once('error', reject);
      child.once('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`wsl.exe exited with code ${code}`));
      });
      child.stdin.end(input);
    });
  }
}

function normalizeSshProbeFailure(error: unknown): { stdout: string; stderr: string } {
  if (typeof error !== 'object' || error === null) return { stdout: '', stderr: '' };
  const failure = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
  return {
    stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
    stderr: typeof failure.stderr === 'string'
      ? failure.stderr
      : typeof failure.message === 'string'
        ? failure.message
        : '',
  };
}

export function createWslHostSubstrate(options: { workspacePath: string; distro?: string; supportsCd?: boolean }): WslHostSubstrate {
  return new WslHostSubstrate(options);
}

export function resetWslSubstrateProbeCacheForTests(): void {
  cachedSupportsCd = undefined;
}
