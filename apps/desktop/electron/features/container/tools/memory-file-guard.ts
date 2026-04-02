import os from 'node:os';
import path from 'node:path';

const PROTECTED_ROOT_FILES = new Set([
  'MEMORY.md',
  'IDENTITY.md',
  'USER.md',
  'SCRATCHPAD.md',
]);

const PROTECTED_SUBDIRS = new Set([
  'daily',
  'sessions',
]);

const MANAGED_MEMORY_LABEL = [
  'MEMORY.md',
  'IDENTITY.md',
  'USER.md',
  'SCRATCHPAD.md',
  'memory/daily/',
  'memory/sessions/',
].join(', ');

function normalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

function getSeroHome(): string {
  return normalizePath(process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui'));
}

export function getProtectedMemoryRoot(): string {
  return normalizePath(path.join(getSeroHome(), 'workspaces', 'global'));
}

export function isProtectedMemoryPath(filePath: string): boolean {
  const normalizedPath = normalizePath(filePath);
  const root = getProtectedMemoryRoot();
  const relative = path.posix.relative(root, normalizedPath);

  if (!relative || relative === '.' || relative.startsWith('..')) {
    return false;
  }

  const segments = relative.split('/').filter(Boolean);
  if (segments.length === 0) return false;

  if (segments.length === 1) {
    return PROTECTED_ROOT_FILES.has(segments[0]!);
  }

  return segments[0] === 'memory' && PROTECTED_SUBDIRS.has(segments[1]!);
}

function getRootAliases(): string[] {
  const seroHome = getSeroHome();
  const globalRoot = `${seroHome}/workspaces/global`;
  const aliases = new Set<string>([
    globalRoot,
    '$SERO_HOME/workspaces/global',
    '${SERO_HOME}/workspaces/global',
  ]);

  const home = normalizePath(os.homedir());
  const relativeToHome = path.posix.relative(home, seroHome);
  if (relativeToHome && relativeToHome !== '.' && !relativeToHome.startsWith('..')) {
    aliases.add(`~/${relativeToHome}/workspaces/global`);
    aliases.add(`$HOME/${relativeToHome}/workspaces/global`);
    aliases.add('${HOME}/' + `${relativeToHome}/workspaces/global`);
    aliases.add(`${relativeToHome}/workspaces/global`);
  }

  return [...aliases].sort((a, b) => b.length - a.length);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function commandMentionsPath(command: string, value: string): boolean {
  const escaped = escapeRegex(value);
  const tokenPattern = new RegExp(`(^|[\\s\"'=:(])${escaped}(?=$|[\\s\"'/:;&|)])`);
  return tokenPattern.test(command);
}

function getSpecificCommandAliases(rootAlias: string): string[] {
  return [
    `${rootAlias}/MEMORY.md`,
    `${rootAlias}/IDENTITY.md`,
    `${rootAlias}/USER.md`,
    `${rootAlias}/SCRATCHPAD.md`,
    `${rootAlias}/memory/daily`,
    `${rootAlias}/memory/sessions`,
  ];
}

export function commandTouchesProtectedMemory(command: string): boolean {
  const normalized = command.replace(/\\/g, '/');
  const rootAliases = getRootAliases();
  const specificAliases = rootAliases.flatMap((alias) => getSpecificCommandAliases(alias));

  return specificAliases.some((alias) => normalized.includes(alias))
    || rootAliases.some((alias) => commandMentionsPath(normalized, alias));
}

export function getProtectedMemoryAccessError(source: 'bash' | 'read' | 'write' | 'edit'): string {
  const action = source === 'bash'
    ? 'Search or inspect'
    : source === 'read'
      ? 'Read'
      : source === 'write'
        ? 'Write'
        : 'Edit';

  return [
    `${action} access to managed Sero memory files is blocked.`,
    `Use the \`sero-cli\` tool with \`sero memory\`, \`sero memory_search\`, or \`sero scratchpad\` instead of ${source}.`,
    `Protected locations: ${MANAGED_MEMORY_LABEL}.`,
    'If memory search is unavailable, report that limitation instead of bypassing the memory system with filesystem tools.',
  ].join(' ');
}
