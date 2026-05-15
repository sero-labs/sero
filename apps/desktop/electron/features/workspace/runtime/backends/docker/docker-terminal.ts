import type { IPty } from 'node-pty';
import { loadNodePty } from '@electron/shared/lib/native-pty';
import { TerminalOutputBuffer } from '@electron/features/container/terminal/terminal-buffer';
import type { RuntimeTerminalSession } from '../../types';
import { resolveDockerCommand } from './docker-cli';
import { dockerContainerName, runtimeEnvArgs } from './docker-lifecycle';

export class DockerTerminalRegistry {
  private readonly terminals = new Map<string, IPty>();
  private readonly buffers = new Map<string, TerminalOutputBuffer>();

  create(workspaceId: string, terminalId: string, cwd = '/workspace', cols = 80, rows = 24): RuntimeTerminalSession {
    const pty = loadNodePty();
    const command = resolveDockerCommand();
    const env = { ...command.env } as Record<string, string>;

    const proc = pty.spawn(command.executable, [
      'exec', '-it', '-w', cwd,
      ...runtimeEnvArgs().flatMap((arg, index, arr) => (arg === '--env' ? ['--env', arr[index + 1]] : [])).filter(Boolean),
      dockerContainerName(workspaceId), '/bin/bash', '--login',
    ], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME ?? '/tmp',
      env,
    });

    const buffer = new TerminalOutputBuffer();
    this.terminals.set(terminalId, proc);
    this.buffers.set(terminalId, buffer);
    proc.onData((chunk) => buffer.append(chunk));
    proc.onExit(() => {
      this.terminals.delete(terminalId);
      this.buffers.delete(terminalId);
    });

    return {
      terminalId,
      pid: proc.pid,
      write: (chunk) => proc.write(chunk),
      resize: (nextCols, nextRows) => proc.resize(nextCols, nextRows),
      signal: (signal) => { if (typeof signal === 'string') proc.kill(signal); else proc.kill(); },
      onData: (cb) => proc.onData(cb).dispose,
      onExit: (cb) => proc.onExit((event) => cb({
        exitCode: event.exitCode,
        signal: event.signal === undefined ? undefined : String(event.signal),
      })).dispose,
      replayBuffer: () => this.buffers.get(terminalId)?.read() ?? '',
    };
  }

  dispose(terminalId: string): void {
    this.terminals.get(terminalId)?.kill();
    this.terminals.delete(terminalId);
    this.buffers.delete(terminalId);
  }

  disposeAll(): void {
    for (const terminalId of this.terminals.keys()) this.dispose(terminalId);
  }
}
