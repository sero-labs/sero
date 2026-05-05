import type { ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { spawnOpenShell } from './cli';

export interface OpenShellLogStream {
  stop(): void;
  onLine(listener: (line: string) => void): () => void;
  onError(listener: (message: string) => void): () => void;
}

export interface OpenShellLogStreamInput {
  gatewayName: string;
  sandboxName: string;
}

export function streamOpenShellLogs(input: OpenShellLogStreamInput): OpenShellLogStream {
  const child = spawnOpenShell([
    '--gateway', input.gatewayName,
    'logs', input.sandboxName, '--tail',
  ]);
  return createLogStream(child);
}

function createLogStream(child: ChildProcessWithoutNullStreams): OpenShellLogStream {
  const events = new EventEmitter();
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let stopped = false;

  const emitLine = (line: string): void => {
    events.emit('line', line);
  };
  const emitError = (message: string): void => {
    events.emit('error-message', message);
  };
  const onStdout = (chunk: Buffer | string): void => {
    stdoutBuffer = consumeLines(stdoutBuffer + chunk.toString(), emitLine);
  };
  const onStderr = (chunk: Buffer | string): void => {
    stderrBuffer = consumeLines(stderrBuffer + chunk.toString(), emitError);
  };
  const onError = (error: Error): void => {
    emitError(error.message);
  };
  const onClose = (): void => {
    flushBuffers();
    cleanupChildListeners();
  };

  const flushBuffers = (): void => {
    if (stdoutBuffer.length > 0) {
      emitLine(stdoutBuffer);
      stdoutBuffer = '';
    }
    if (stderrBuffer.length > 0) {
      emitError(stderrBuffer);
      stderrBuffer = '';
    }
  };

  const cleanupChildListeners = (): void => {
    child.stdout.off('data', onStdout);
    child.stderr.off('data', onStderr);
    child.off('error', onError);
    child.off('close', onClose);
    child.off('exit', onClose);
  };

  child.stdout.on('data', onStdout);
  child.stderr.on('data', onStderr);
  child.on('error', onError);
  child.on('close', onClose);
  child.on('exit', onClose);

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      flushBuffers();
      cleanupChildListeners();
      events.removeAllListeners();
      if (!child.killed) child.kill();
    },
    onLine(listener: (line: string) => void): () => void {
      events.on('line', listener);
      return () => events.off('line', listener);
    },
    onError(listener: (message: string) => void): () => void {
      events.on('error-message', listener);
      return () => events.off('error-message', listener);
    },
  };
}

function consumeLines(buffer: string, emit: (line: string) => void): string {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n');
  const remainder = parts.pop() ?? '';
  for (const line of parts) emit(line);
  return remainder;
}
