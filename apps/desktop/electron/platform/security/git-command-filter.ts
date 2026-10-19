/**
 * Git command classification — determines whether a bash command contains
 * mutating git operations that should be blocked (routed through sero-cli VCS instead).
 *
 * Read-only git commands (status, log, diff, show, blame, etc.) pass through.
 * Context-dependent commands (remote, branch, config) are inspected argument-by-argument.
 *
 * A git invocation may be written with a path (`/usr/bin/git`) and with global
 * options before the subcommand (`git --no-pager diff`). Both forms are parsed
 * so the subcommand, not an option, decides the classification.
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

/**
 * Global options that only change how git reads or presents a command, so the
 * subcommand keeps deciding whether the invocation mutates anything.
 */
const HARMLESS_GLOBAL_FLAGS = new Set([
  '-P', '--no-pager', '-p', '--paginate',
  '--no-replace-objects', '--no-optional-locks', '--bare',
  '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs',
  '--version', '--help',
]);

/** Harmless global options that consume the next token as their value. */
const HARMLESS_GLOBAL_VALUE_FLAGS = new Set(['-C', '--git-dir', '--work-tree']);

/** Harmless global options in glued (`-C/path`) or `--x=y` form. */
const HARMLESS_GLOBAL_PREFIXES = [
  /^-C\S+$/,
  /^--git-dir=/,
  /^--work-tree=/,
  /^--namespace=/,
  /^--super-prefix=/,
];

/** Strip shell redirections (2>&1, >/dev/null, etc.) so they don't pollute arg matching. */
function stripRedirections(s: string): string {
  return s.replace(/\d*>\s*&?\d+/g, '').replace(/\d*>+\s*\S+/g, '').replace(/\s+/g, ' ').trim();
}

/** A shell word after quote removal. `quoted` is true when any part of it was quoted. */
interface ShellWord {
  text: string;
  quoted: boolean;
}

/** Split a segment into words, keeping quoted arguments together. */
function tokenize(input: string): ShellWord[] {
  const words: ShellWord[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let started = false;
  let quoted = false;
  const finish = () => {
    if (started) words.push({ text: current, quoted });
    current = '';
    started = false;
    quoted = false;
  };
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      started = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      quoted = true;
      continue;
    }
    if (/\s/.test(ch)) {
      finish();
      continue;
    }
    current += ch;
    started = true;
  }
  finish();
  return words;
}

function basename(token: string): string {
  const slash = token.lastIndexOf('/');
  return slash === -1 ? token : token.slice(slash + 1);
}

/** Words that run the command after them, so a command name may follow them. */
const COMMAND_WRAPPERS = new Set([
  'sudo', 'env', 'xargs', 'command', 'exec', 'nohup', 'time',
  'builtin', '!', 'if', 'then', 'do', 'else',
]);
const ENV_ASSIGNMENT = /^[A-Za-z_]\w*=/;

/** True when a command name can stand at `words[index]`: only env assignments, options and wrappers come before it. */
function atCommandPosition(words: ShellWord[], index: number): boolean {
  for (let j = index - 1; j >= 0; j -= 1) {
    const text = words[j]!.text;
    if (ENV_ASSIGNMENT.test(text) || text.startsWith('-') || COMMAND_WRAPPERS.has(text)) continue;
    return false;
  }
  return true;
}

type ParsedGitInvocation =
  | { kind: 'classified'; subcommand: string | null; args: string[] }
  | { kind: 'behaviour-changing' };

/**
 * Read the global options after the `git` word at `words[start]` and return
 * the subcommand with its arguments.
 */
function parseGitInvocation(words: ShellWord[], start: number): ParsedGitInvocation {
  let i = start + 1;
  while (i < words.length) {
    const token = words[i]!.text;
    if (HARMLESS_GLOBAL_FLAGS.has(token)) {
      i += 1;
      continue;
    }
    if (HARMLESS_GLOBAL_VALUE_FLAGS.has(token)) {
      i += 2;
      continue;
    }
    if (!token.startsWith('-')) break;
    if (HARMLESS_GLOBAL_PREFIXES.some((pattern) => pattern.test(token))) {
      i += 1;
      continue;
    }
    // `-c`, `--config-env`, `--exec-path` and anything unrecognised.
    return { kind: 'behaviour-changing' };
  }
  return {
    kind: 'classified',
    subcommand: words[i]?.text ?? null,
    args: words.slice(i + 1).map((word) => word.text),
  };
}

const BRANCH_MUTATING_FLAGS = /(?:^|\s)-[dDmMCuf]\b|--delete|--move|--copy|--force|--set-upstream|--unset-upstream|--edit-description/;
const BRANCH_LISTING_FLAGS = new Set([
  '-a', '-r', '-v', '-vv', '--all', '--remotes', '--verbose',
  '--list', '--no-color', '--color', '--column', '--no-column',
]);
const BRANCH_FILTER_FLAGS = new Set(['--contains', '--no-contains', '--merged', '--no-merged', '--points-at']);

/** Flags that make `git config` mutating regardless of positional count. */
const CONFIG_MUTATING_FLAGS = /--unset\b|--unset-all\b|--remove-section\b|--rename-section\b|--replace-all\b|--edit\b/;

/**
 * Commands that are read-only in some forms and mutating in others.
 * Returns true if the invocation with these arguments is safe (read-only).
 */
function isContextuallyReadOnly(subcommand: string, args: string[]): boolean {
  // git remote — read-only: (no args), -v, show, get-url
  if (subcommand === 'remote') {
    const [first, ...rest] = args;
    if (!first) return true;
    if (first === '-v' || first === '--verbose') return rest.length === 0;
    return first === 'show' || first === 'get-url';
  }

  // git branch — read-only if only listing/filter flags, no positional branch names
  if (subcommand === 'branch') {
    if (args.length === 0) return true;
    if (BRANCH_MUTATING_FLAGS.test(args.join(' '))) return false;
    let expectValue = false;
    for (const t of args) {
      if (expectValue) { expectValue = false; continue; }
      if (BRANCH_LISTING_FLAGS.has(t)) continue;
      if (t.startsWith('--sort=') || t.startsWith('--format=')) continue;
      if (BRANCH_FILTER_FLAGS.has(t)) { expectValue = true; continue; }
      return false; // unrecognised token (likely a branch name)
    }
    return true;
  }

  // git config — read if ≤1 non-flag positional (reading a key), write if 2+ (setting value).
  // Certain flags are inherently mutating regardless of positional count.
  if (subcommand === 'config') {
    if (args.length === 0) return true;
    if (CONFIG_MUTATING_FLAGS.test(args.join(' '))) return false;
    const positionals = args.filter((t) => !t.startsWith('-'));
    return positionals.length <= 1;
  }

  return false;
}

function isMutatingGitSubcommand(subcommand: string, args: string[]): boolean {
  if (MUTATING_GIT_SUBCOMMANDS.has(subcommand)) return true;
  if (READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)) return false;
  return !isContextuallyReadOnly(subcommand, args);
}

/**
 * Patterns that could embed arbitrary git commands in ways the segment
 * splitter can't parse: subshells, eval, and explicit bash/sh -c wrappers.
 * If the raw command string mentions `git` AND uses one of these patterns,
 * we treat the entire command as potentially mutating.
 */
const SUBSHELL_BYPASS_PATTERN = /\$\(|`|(?:^|\s)(?:eval|bash|sh)\s/;

/** Check whether a bash command string contains mutating git operations. */
export function hasMutatingGit(command: string): boolean {
  // If the command uses subshells, eval, or bash -c AND mentions git,
  // treat it as mutating — we can't reliably parse the nested command.
  if (SUBSHELL_BYPASS_PATTERN.test(command) && /\bgit\b/.test(command)) {
    return true;
  }

  const segments = command
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const words = tokenize(stripRedirections(segment));

    for (let i = 0; i < words.length; i += 1) {
      const word = words[i]!;
      // Strip shell syntax that can cling to the command name: `(git`, `{git`, `!git`, `\git`.
      const name = word.text.replace(/^[\\({!]+/, '');
      if (basename(name) !== 'git') continue;
      // A bare `git` counts anywhere unless it is quoted (`grep "git" src` searches for text). A path
      // such as `apps/git` is a command only where a command name can stand (`sudo /usr/bin/git`).
      const isCommand = name === 'git' ? !word.quoted || atCommandPosition(words, i) : atCommandPosition(words, i);
      if (!isCommand) continue;
      const invocation = parseGitInvocation(words, i);
      if (invocation.kind === 'behaviour-changing') return true;
      if (invocation.subcommand === null) continue;
      if (isMutatingGitSubcommand(invocation.subcommand, invocation.args)) return true;
    }
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
  const cmd = basename(tokens[0] ?? '');
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
