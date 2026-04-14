import os from 'node:os';
import path from 'node:path';

export function resolveSeroHome(): string {
  const envValue = process.env.SERO_HOME?.trim();
  if (envValue && envValue !== 'undefined' && envValue !== 'null') {
    return envValue;
  }
  return path.join(os.homedir(), '.sero-ui');
}

export function resolveMemoryStatePath(fileName: string): string {
  return path.join(resolveSeroHome(), 'state', 'memory', fileName);
}

export function resolveMemoryDebugPath(fileName: string): string {
  return path.join(resolveSeroHome(), 'debug', fileName);
}

export function getTranscriptExportDirPath(): string {
  return path.join(resolveSeroHome(), 'workspaces', 'global', 'memory', 'sessions');
}
