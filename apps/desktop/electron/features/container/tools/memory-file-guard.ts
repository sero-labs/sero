import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROTECTED_ROOT_FILES = new Set([
  'MEMORY.md',
  'IDENTITY.md',
  'USER.md',
]);

const PROTECTED_SUBDIRS = new Set([
  'daily',
  'sessions',
]);

const MANAGED_MEMORY_LABEL = [
  'MEMORY.md',
  'IDENTITY.md',
  'USER.md',
  'memory/daily/',
  'memory/sessions/',
].join(', ');

type ShellToken =
  | { type: 'word'; value: string }
  | { type: 'operator'; value: '&&' | '||' | '|' | ';' | '\n' };

function normalizePath(value: string): string {
  return path.resolve(value).replace(/\\/g, '/');
}

function normalizePathForComparison(value: string): string {
  return value.replace(/\\/g, '/');
}

function getSeroHome(): string {
  return normalizePath(process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui'));
}

export function getProtectedMemoryRoot(): string {
  return normalizePath(path.join(getSeroHome(), 'workspaces', 'global'));
}

function getProtectedMemoryRoots(): string[] {
  const roots = new Set<string>([getProtectedMemoryRoot()]);

  try {
    roots.add(normalizePath(path.join(realpathSync.native(getSeroHome()), 'workspaces', 'global')));
  } catch {
    // Best effort — the configured SERO_HOME may not exist yet.
  }

  return [...roots];
}

function isProtectedMemoryRoot(filePath: string): boolean {
  const normalizedPath = normalizePath(filePath);
  return getProtectedMemoryRoots().some((root) => root === normalizedPath);
}

function isProtectedMemoryCommandTarget(filePath: string): boolean {
  return isProtectedMemoryRoot(filePath) || isProtectedMemoryPath(filePath);
}

export function isProtectedMemoryPath(filePath: string): boolean {
  const normalizedPath = normalizePath(filePath);

  for (const root of getProtectedMemoryRoots()) {
    const relative = path.posix.relative(root, normalizedPath);

    if (!relative || relative === '.' || relative.startsWith('..')) {
      continue;
    }

    const segments = relative.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    if (segments.length === 1) {
      if (PROTECTED_ROOT_FILES.has(segments[0]!)) return true;
      continue;
    }

    if (segments[0] === 'memory' && PROTECTED_SUBDIRS.has(segments[1]!)) {
      return true;
    }
  }

  return false;
}

function getRootAliases(): string[] {
  const seroHome = getSeroHome();
  const aliases = new Set<string>([
    ...getProtectedMemoryRoots(),
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

function tokenizeShellCommand(command: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let current = '';
  let quote: 'single' | 'double' | null = null;
  let escaped = false;

  const pushWord = () => {
    if (!current) return;
    tokens.push({ type: 'word', value: current });
    current = '';
  };

  for (let index = 0; index < command.length; index++) {
    const char = command[index]!;

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (quote === 'single') {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }

    if (quote === 'double') {
      if (char === '"') {
        quote = null;
        continue;
      }
      if (char === '\\') {
        const next = command[index + 1];
        if (next !== undefined) {
          current += next;
          index++;
          continue;
        }
      }
      current += char;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === "'") {
      quote = 'single';
      continue;
    }

    if (char === '"') {
      quote = 'double';
      continue;
    }

    if (char === '&' && command[index + 1] === '&') {
      pushWord();
      tokens.push({ type: 'operator', value: '&&' });
      index++;
      continue;
    }

    if (char === '|' && command[index + 1] === '|') {
      pushWord();
      tokens.push({ type: 'operator', value: '||' });
      index++;
      continue;
    }

    if (char === ';' || char === '|' || char === '\n') {
      pushWord();
      tokens.push({ type: 'operator', value: char });
      continue;
    }

    if (/\s/.test(char)) {
      pushWord();
      continue;
    }

    current += char;
  }

  pushWord();
  return tokens;
}

function isEnvAssignmentToken(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

function expandCommandPathToken(token: string): string {
  const seroHome = getSeroHome();
  const home = normalizePath(os.homedir());

  if (token === '~') return home;
  if (token.startsWith('~/')) return path.join(home, token.slice(2));
  if (token.startsWith('$HOME/')) return path.join(home, token.slice(6));
  if (token.startsWith('${HOME}/')) return path.join(home, token.slice(8));
  if (token === '$SERO_HOME' || token === '${SERO_HOME}') return seroHome;
  if (token.startsWith('$SERO_HOME/')) return path.join(seroHome, token.slice(11));
  if (token.startsWith('${SERO_HOME}/')) return path.join(seroHome, token.slice(13));

  return token;
}

function resolveCommandCandidatePath(token: string, cwd: string): string | null {
  if (!token || token === '--') return null;
  if (token.startsWith('-')) return null;
  if (token === '>' || token === '>>' || token === '<' || token === '2>' || token === '2>>') {
    return null;
  }
  if (token.includes('$(') || token.includes('`')) return null;

  const expanded = expandCommandPathToken(token);
  if (path.isAbsolute(expanded)) return normalizePath(expanded);
  return normalizePath(path.join(cwd, expanded));
}

function isCommandBoundary(token: ShellToken): boolean {
  return token.type === 'operator';
}

export async function commandTouchesProtectedMemoryWithResolver(args: {
  command: string;
  basedir: string;
  resolvePath: (candidatePath: string) => Promise<string>;
}): Promise<boolean> {
  const tokens = tokenizeShellCommand(args.command);
  let currentDir = normalizePath(args.basedir);
  let expectingCommand = true;
  let awaitingCdTarget = false;

  for (const token of tokens) {
    if (isCommandBoundary(token)) {
      expectingCommand = true;
      awaitingCdTarget = false;
      continue;
    }

    const value = token.value.trim();
    if (!value) continue;

    if (expectingCommand) {
      if (isEnvAssignmentToken(value)) continue;
      expectingCommand = false;
      awaitingCdTarget = value === 'cd';
      continue;
    }

    const candidatePath = resolveCommandCandidatePath(value, currentDir);
    if (!candidatePath) {
      awaitingCdTarget = false;
      continue;
    }

    const resolvedPath = normalizePathForComparison(await args.resolvePath(candidatePath));
    if (isProtectedMemoryCommandTarget(resolvedPath)) {
      return true;
    }

    if (awaitingCdTarget) {
      currentDir = resolvedPath;
      awaitingCdTarget = false;
    }
  }

  return false;
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
    `Use the \`sero-cli\` tool with \`sero memory\` or \`sero memory_search\` instead of ${source}.`,
    `Protected locations: ${MANAGED_MEMORY_LABEL}.`,
    'If memory search is unavailable, report that limitation instead of bypassing the memory system with filesystem tools.',
  ].join(' ');
}
