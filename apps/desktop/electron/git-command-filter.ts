/**
 * Git command classification — determines whether a bash command contains
 * mutating git operations that should be blocked (routed through sero-cli VCS instead).
 *
 * Read-only git commands (status, log, diff, show, blame, etc.) pass through.
 * Context-dependent commands (remote, branch, config) are inspected argument-by-argument.
 */

/** Mutating git commands that the agent should not run directly. */
const MUTATING_GIT_SUBCOMMANDS = new Set([
  'add', 'commit', 'push', 'pull', 'checkout', 'switch',
  'merge', 'rebase', 'reset', 'stash', 'clone', 'init',
  'tag', 'rm', 'mv', 'restore', 'clean', 'cherry-pick',
  'revert', 'bisect', 'submodule', 'worktree',
]);

/** Read-only git commands — always safe. */
const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  'status', 'log', 'diff', 'show', 'blame', 'grep',
  'shortlog', 'describe', 'rev-parse', 'ls-files', 'ls-tree',
  'cat-file', 'reflog', 'fetch',
]);

/** Strip shell redirections (2>&1, >/dev/null, etc.) so they don't pollute arg matching. */
function stripRedirections(s: string): string {
  return s.replace(/\d*>\s*&?\d+/g, '').replace(/\d*>+\s*\S+/g, '').replace(/\s+/g, ' ').trim();
}

const BRANCH_MUTATING_FLAGS = /(?:^|\s)-[dDmMCuf]\b|--delete|--move|--copy|--force|--set-upstream|--unset-upstream|--edit-description/;
const BRANCH_LISTING_FLAGS = new Set([
  '-a', '-r', '-v', '-vv', '--all', '--remotes', '--verbose',
  '--list', '--no-color', '--color', '--column', '--no-column',
]);
const BRANCH_FILTER_FLAGS = new Set(['--contains', '--no-contains', '--merged', '--no-merged', '--points-at']);

/**
 * Commands that are read-only in some forms and mutating in others.
 * Returns true if the git invocation is safe (read-only).
 */
function isContextuallyReadOnly(rawSegment: string): boolean {
  const segment = stripRedirections(rawSegment);

  // git remote — read-only: (no args), -v, show, get-url
  const remoteMatch = segment.match(/git\s+remote(?:\s+(.*))?$/s);
  if (remoteMatch) {
    const rest = (remoteMatch[1] ?? '').trim();
    return !rest || rest === '-v' || rest === '--verbose' || rest.startsWith('show') || rest.startsWith('get-url');
  }

  // git branch — read-only if only listing/filter flags, no positional branch names
  const branchMatch = segment.match(/git\s+branch(?:\s+(.*))?$/s);
  if (branchMatch) {
    const rest = (branchMatch[1] ?? '').trim();
    if (!rest) return true;
    if (BRANCH_MUTATING_FLAGS.test(rest)) return false;
    const tokens = rest.split(/\s+/).filter(Boolean);
    let expectValue = false;
    for (const t of tokens) {
      if (expectValue) { expectValue = false; continue; }
      if (BRANCH_LISTING_FLAGS.has(t)) continue;
      if (t.startsWith('--sort=') || t.startsWith('--format=')) continue;
      if (BRANCH_FILTER_FLAGS.has(t)) { expectValue = true; continue; }
      return false; // unrecognised token (likely a branch name)
    }
    return true;
  }

  // git config — read if ≤1 non-flag positional (reading a key), write if 2+ (setting value)
  const configMatch = segment.match(/git\s+config(?:\s+(.*))?$/s);
  if (configMatch) {
    const rest = (configMatch[1] ?? '').trim();
    if (!rest || rest === '--list' || rest === '-l' || rest === '--global --list' || rest === '--global -l') {
      return true;
    }
    const tokens = rest.split(/\s+/).filter((t) => !t.startsWith('-'));
    return tokens.length <= 1;
  }

  return false;
}

/** Check whether a bash command string contains mutating git operations. */
export function hasMutatingGit(command: string): boolean {
  const segments = command
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const match = segment.match(/(?:^|\s)git\s+([a-zA-Z-]+)/);
    if (!match?.[1]) continue;
    const sub = match[1];

    if (MUTATING_GIT_SUBCOMMANDS.has(sub)) return true;
    if (READ_ONLY_GIT_SUBCOMMANDS.has(sub)) continue;
    if (isContextuallyReadOnly(segment)) continue;
    return true; // unknown subcommand → treat as mutating
  }
  return false;
}

/** Shell commands that are inherently read-only. */
const READ_ONLY_SHELL_COMMANDS = new Set([
  'ls', 'pwd', 'cat', 'head', 'tail', 'wc', 'stat', 'which', 'whereis',
  'echo', 'printf', 'find', 'rg', 'grep', 'cut', 'tr', 'sort', 'uniq',
  'jq', 'diff', 'tree', 'realpath', 'basename', 'dirname', 'awk',
]);

function isLikelyReadOnlySegment(segment: string): boolean {
  if (!segment) return true;
  if (/[><]{1,2}/.test(segment)) return false;

  const trimmed = segment.trim();
  const withoutEnv = trimmed.replace(/^(\w+=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*/, '').trim();
  if (!withoutEnv) return true;

  const tokens = withoutEnv.split(/\s+/);
  const cmd = tokens[0] ?? '';
  if (!cmd) return true;
  if (cmd === 'git') return !hasMutatingGit(withoutEnv);
  if (cmd === 'sed') {
    const args = tokens.slice(1);
    return args.includes('-n') && !args.includes('-i');
  }
  return READ_ONLY_SHELL_COMMANDS.has(cmd);
}

/**
 * Heuristic: is the entire bash command likely read-only?
 * Used for checkpoint tracking — if true, the command doesn't count as a mutating tool call.
 */
export function isLikelyReadOnlyBash(command: string): boolean {
  const segments = command
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every(isLikelyReadOnlySegment);
}
