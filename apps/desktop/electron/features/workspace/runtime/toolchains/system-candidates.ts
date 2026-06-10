import path from 'path';

import type { ToolName } from './types';

const winPath = path.win32;

export function systemToolCandidates(
  tool: ToolName,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (platform !== 'win32') return [...new Set([tool, ...posixSystemToolCandidates(tool, platform)])];
  return [...new Set([...windowsSystemToolCandidates(tool, env), tool])];
}

function posixSystemToolCandidates(tool: ToolName, platform: NodeJS.Platform): string[] {
  const roots = posixSearchRoots(platform);
  const home = process.env.HOME;
  if (tool === 'uv' && home) {
    roots.unshift(path.posix.join(home, '.local', 'bin'), path.posix.join(home, '.cargo', 'bin'));
  }
  return roots.map((root) => path.posix.join(root, tool));
}

function posixSearchRoots(platform: NodeJS.Platform): string[] {
  const homebrewRoots = platform === 'darwin'
    ? ['/opt/homebrew/bin', '/usr/local/bin']
    : ['/usr/local/bin'];
  return [...homebrewRoots, '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
}

function windowsSystemToolCandidates(tool: ToolName, env: NodeJS.ProcessEnv): string[] {
  const programFiles = [env.ProgramFiles, env['ProgramFiles(x86)']].filter((value): value is string => Boolean(value));
  const gitRoots = programFiles.map((root) => winPath.join(root, 'Git'));
  const pathCandidates = windowsPathToolCandidates(tool, env);

  if (tool === 'git') {
    return [
      ...pathCandidates,
      ...gitRoots.flatMap((root) => [
        winPath.join(root, 'cmd', 'git.exe'),
        winPath.join(root, 'bin', 'git.exe'),
        winPath.join(root, 'mingw64', 'bin', 'git.exe'),
      ]),
    ];
  }
  if (tool === 'bash') {
    return [
      ...pathCandidates,
      ...gitRoots.flatMap((root) => [
        winPath.join(root, 'bin', 'bash.exe'),
        winPath.join(root, 'usr', 'bin', 'bash.exe'),
      ]),
    ];
  }
  if (tool === 'ssh') {
    const systemRoot = env.SystemRoot || 'C:\\Windows';
    return [
      ...pathCandidates,
      winPath.join(systemRoot, 'System32', 'OpenSSH', 'ssh.exe'),
      ...gitRoots.map((root) => winPath.join(root, 'usr', 'bin', 'ssh.exe')),
    ];
  }
  if (tool === 'uv' && env.USERPROFILE) {
    return [
      winPath.join(env.USERPROFILE, '.local', 'bin', 'uv.exe'),
      winPath.join(env.USERPROFILE, '.cargo', 'bin', 'uv.exe'),
      ...pathCandidates,
    ];
  }
  return pathCandidates;
}

function windowsPathToolCandidates(tool: ToolName, env: NodeJS.ProcessEnv): string[] {
  return windowsPathEntries(env).flatMap((entry) => windowsExecutableNames(tool).map((name) => winPath.join(entry, name)));
}

function windowsExecutableNames(tool: ToolName): string[] {
  if (tool === 'node') return ['node.exe', 'node.cmd'];
  if (tool === 'npm' || tool === 'pnpm') return [`${tool}.cmd`, `${tool}.exe`];
  if (tool === 'git' || tool === 'ssh' || tool === 'bash') return [`${tool}.exe`];
  return [`${tool}.exe`, `${tool}.cmd`];
}

function windowsPathEntries(env: NodeJS.ProcessEnv): string[] {
  const values = Object.entries(env)
    .filter(([key, value]) => key.toLowerCase() === 'path' && Boolean(value))
    .map(([, value]) => value as string);
  if (env.PNPM_HOME) values.push(env.PNPM_HOME);

  return [...new Set(values.flatMap(splitPathList).map((entry) => normalizeWindowsPathEntry(entry, env)).filter(isNonEmpty))];
}

function splitPathList(value: string): string[] {
  if (value.includes(';')) return value.split(';');
  return splitMsysPathList(value);
}

function splitMsysPathList(value: string): string[] {
  const entries: string[] = [];
  let current = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === ':' && !isWindowsDriveColon(value, index)) {
      entries.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  entries.push(current);
  return entries;
}

function isWindowsDriveColon(value: string, index: number): boolean {
  return index === 1 && /^[A-Za-z]$/.test(value[0] ?? '') && ['\\', '/'].includes(value[2] ?? '');
}

function normalizeWindowsPathEntry(entry: string, env: NodeJS.ProcessEnv): string | null {
  const trimmed = entry.trim().replace(/^"|"$/g, '');
  if (!trimmed) return null;
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return winPath.normalize(trimmed);

  const drivePath = trimmed.match(/^\/([A-Za-z])\/(.*)$/);
  if (drivePath) return winPath.join(`${drivePath[1].toUpperCase()}:\\`, drivePath[2].replace(/\//g, '\\'));

  const gitRoot = env.ProgramFiles ? winPath.join(env.ProgramFiles, 'Git') : null;
  if (!gitRoot) return null;
  if (trimmed === '/mingw64' || trimmed.startsWith('/mingw64/')) return winPath.join(gitRoot, trimmed.slice(1).replace(/\//g, '\\'));
  if (trimmed === '/usr' || trimmed.startsWith('/usr/')) return winPath.join(gitRoot, trimmed.slice(1).replace(/\//g, '\\'));
  if (trimmed === '/cmd' || trimmed.startsWith('/cmd/')) return winPath.join(gitRoot, trimmed.slice(1).replace(/\//g, '\\'));
  return null;
}

function isNonEmpty(value: string | null): value is string {
  return Boolean(value);
}
