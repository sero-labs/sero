import { analyzeCommand, type AnalyzedSegment, type CommandAnalysis } from '../command-analysis';
import { commandBasename, stripEnvAssignments } from '../shell';

/**
 * Recognise the categories the plugin compacts.
 *
 * Detection looks at the requested command, not the RTK-rewritten form, so a
 * rewrite does not hide a category.
 */

export type OutputCategory =
  | 'test'
  | 'build'
  | 'lint'
  | 'git'
  | 'packageManager'
  | 'search'
  | 'none';

const SEARCH_COMMANDS = new Set(['grep', 'rg', 'egrep', 'fgrep', 'ripgrep', 'find']);
const TEST_RUNNERS = new Set(['vitest', 'jest', 'mocha', 'ava', 'tap', 'pytest', 'ctest', 'rspec', 'phpunit', 'phpstan']);
const BUILD_TOOLS = new Set(['tsc', 'make', 'cmake', 'gradle', 'mvn']);
const LINTERS = new Set([
  'eslint',
  'prettier',
  'ruff',
  'pylint',
  'mypy',
  'flake8',
  'black',
  'golangci-lint',
  'rubocop',
  'biome',
]);
const JS_PACKAGE_MANAGERS = new Set(['pnpm', 'npm', 'yarn', 'bun']);
const PACKAGE_MANAGER_SUBCOMMANDS = new Set([
  'install',
  'i',
  'add',
  'remove',
  'rm',
  'uninstall',
  'update',
  'upgrade',
  'ci',
  'dedupe',
  'prune',
  'publish',
]);
const GIT_COMPACTED_SUBCOMMANDS = new Set(['status', 'log']);

/** Separators that run separate commands whose output is concatenated. */
const PIPE_SEPARATORS = new Set(['|', '|&']);

/**
 * Commands that read only their standard input and write a transformation of
 * it. A pipeline stage from this set cannot add content of its own.
 */
const STDIN_FILTERS = new Set([
  'head',
  'tail',
  'sort',
  'uniq',
  'wc',
  'cut',
  'tr',
  'column',
  'nl',
  'tac',
  'rev',
  'fold',
  'expand',
  'unexpand',
  'strings',
  'xxd',
  'od',
  'base64',
  'cat',
  'tee',
  'less',
  'more',
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'sed',
  'awk',
  'jq',
]);

/** Filters whose first positional argument is a pattern or expression, not a file. */
const PATTERN_FIRST = new Set(['grep', 'egrep', 'fgrep', 'rg', 'sed', 'awk', 'jq']);

/**
 * Commands under a sequence separator that print nothing.
 *
 * This list is deliberately tiny and excludes `source`, `.`, `eval`, `exec`
 * and `command`, which can run arbitrary code that prints. A command that
 * might print belongs on the rejected side: one unexpected line would be
 * compacted away.
 */
const SILENT_BUILTINS = new Set(['cd', 'export', 'unset', 'true', ':']);

interface FirstCommand {
  name: string;
  args: string[];
}

function commandOf(segment: AnalyzedSegment): FirstCommand | null {
  const tokens = stripEnvAssignments(segment.tokens);
  const executable = tokens[0];
  if (!executable) return null;
  return {
    name: commandBasename(executable.value),
    args: tokens.slice(1).map((token) => token.value.toLowerCase()),
  };
}

function firstNonOption(args: string[]): string | undefined {
  return args.find((argument) => !argument.startsWith('-'));
}

function anyArgIs(args: string[], runners: Set<string>): boolean {
  return args.some((argument) => runners.has(commandBasename(argument)));
}

function isTestCommand({ name, args }: FirstCommand): boolean {
  if (TEST_RUNNERS.has(name)) return true;
  if (name === 'cargo' || name === 'go' || name === 'dotnet' || name === 'playwright') return args[0] === 'test';
  if (JS_PACKAGE_MANAGERS.has(name) || name === 'npx' || name === 'bunx') {
    if (args[0] === 'test') return true;
    if (args[0] === 'run' && args[1] === 'test') return true;
    return anyArgIs(args, TEST_RUNNERS);
  }
  return false;
}

function isBuildCommand({ name, args }: FirstCommand): boolean {
  if (BUILD_TOOLS.has(name)) return true;
  if (name === 'cargo') return args[0] === 'build' || args[0] === 'check';
  if (name === 'go') return args[0] === 'build';
  if (name === 'next' || name === 'dotnet') return args[0] === 'build';
  if (JS_PACKAGE_MANAGERS.has(name) || name === 'npx' || name === 'bunx') {
    if (args[0] === 'build') return true;
    if (args[0] === 'run' && args[1] === 'build') return true;
    return anyArgIs(args, BUILD_TOOLS);
  }
  return false;
}

function isLintCommand({ name, args }: FirstCommand): boolean {
  if (LINTERS.has(name)) return true;
  if (name === 'cargo' && args[0] === 'clippy') return true;
  if (JS_PACKAGE_MANAGERS.has(name) || name === 'npx' || name === 'bunx') return anyArgIs(args, LINTERS);
  return false;
}

function isGitCommand({ name, args }: FirstCommand): boolean {
  if (name !== 'git') return false;
  const subcommand = firstNonOption(args);
  return subcommand !== undefined && GIT_COMPACTED_SUBCOMMANDS.has(subcommand);
}

function isPackageManagerCommand({ name, args }: FirstCommand): boolean {
  if (JS_PACKAGE_MANAGERS.has(name) || name === 'npx' || name === 'bunx') {
    return PACKAGE_MANAGER_SUBCOMMANDS.has(args[0] ?? '');
  }
  return name === 'pip' || name === 'uv' || name === 'poetry' || name === 'bundle' || name === 'composer';
}

function classify(first: FirstCommand): OutputCategory {
  if (SEARCH_COMMANDS.has(first.name)) return 'search';
  if (isTestCommand(first)) return 'test';
  if (isBuildCommand(first)) return 'build';
  if (isLintCommand(first)) return 'lint';
  if (isGitCommand(first)) return 'git';
  if (isPackageManagerCommand(first)) return 'packageManager';
  return 'none';
}

/**
 * True when a pipeline stage reads only standard input.
 *
 * A numeric positional argument is an option value, as in `head -n 5`, so it
 * does not name a file. For grep and its relatives the first positional is the
 * pattern, and any further positional names a file.
 */
function isStdinFilter({ name, args }: FirstCommand): boolean {
  if (!STDIN_FILTERS.has(name)) return false;
  const positional = args.filter((argument) => !argument.startsWith('-'));
  if (PATTERN_FIRST.has(name)) return positional.length <= 1;
  return positional.every((argument) => /^\d+$/.test(argument));
}

/** True when a sequenced command cannot print. */
function isSilentBuiltin({ name, args }: FirstCommand): boolean {
  if (!SILENT_BUILTINS.has(name)) return false;
  // `cd -` prints the new directory and `export -p` prints every variable.
  if (name === 'cd') return !args.includes('-');
  if (name === 'export') return !args.includes('-p');
  return true;
}

/**
 * One category for a command that joins several commands.
 *
 * A pipeline stage that resolves to a category produces the visible output, so
 * it replaces whatever the upstream command produced. Every other segment must
 * either agree with the chosen category or be provably unable to add content
 * outside it: a standard-input filter after a pipe, or a silent builtin after a
 * sequence separator. Anything else returns `none`.
 *
 * `pnpm test && cat package.json` and `pnpm test | cat package.json -` must
 * not use the test rule, because the JSON has no test line to protect it, and
 * `source ./setup.sh && pnpm test` must not either, because the sourced script
 * can print anything.
 */
function joinedCategory(analysis: CommandAnalysis): OutputCategory {
  let decided: OutputCategory = 'none';
  let sawCommand = false;

  for (let index = 0; index < analysis.segments.length; index += 1) {
    const segment = analysis.segments[index];
    if (!segment) continue;
    const first = commandOf(segment);
    if (!first) continue;
    sawCommand = true;

    const separator = index > 0 ? analysis.separators[index - 1] : undefined;
    const isPipeStage = separator !== undefined && PIPE_SEPARATORS.has(separator);
    const category = classify(first);

    if (category !== 'none') {
      if (isPipeStage) {
        decided = category;
        continue;
      }
      if (decided === 'none') decided = category;
      else if (decided !== category) return 'none';
      continue;
    }

    if (isPipeStage && isStdinFilter(first)) continue;
    if (!isPipeStage && isSilentBuiltin(first)) continue;
    return 'none';
  }

  return sawCommand ? decided : 'none';
}

export function detectCategory(command: string | undefined): OutputCategory {
  if (!command) return 'none';

  const analysis = analyzeCommand(command);

  // Any separator joins commands whose output is combined. Use one category
  // only when every segment is safe under it.
  if (analysis.separators.length > 0) return joinedCategory(analysis);

  const first = analysis.segments[0] ? commandOf(analysis.segments[0]) : null;
  return first ? classify(first) : 'none';
}
