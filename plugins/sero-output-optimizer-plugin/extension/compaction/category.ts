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

/**
 * Separators that run separate commands whose output is concatenated.
 *
 * A pipeline is not one of these: its data still comes from the segments that
 * feed it, so the existing first-command rule stays valid.
 */
const SEQUENCE_SEPARATORS = new Set(['&&', '||', ';', '&', '\n']);

/**
 * Commands that change nothing about later output.
 *
 * This is deliberately small. A command that might print belongs on the
 * rejected side, because one unrecognised line would be compacted away.
 */
const NO_OUTPUT_COMMANDS = new Set(['cd', 'export', 'unset', 'source', '.', 'true', ':', 'umask']);

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

function isSearchCommand({ name }: FirstCommand): boolean {
  return SEARCH_COMMANDS.has(name);
}

function classify(first: FirstCommand): OutputCategory {
  if (isSearchCommand(first)) return 'search';
  if (isTestCommand(first)) return 'test';
  if (isBuildCommand(first)) return 'build';
  if (isLintCommand(first)) return 'lint';
  if (isGitCommand(first)) return 'git';
  if (isPackageManagerCommand(first)) return 'packageManager';
  return 'none';
}

/**
 * One category for a command that runs several commands in sequence.
 *
 * Every segment must either resolve to the same category or be a control
 * command that prints nothing. Anything else returns `none`: the combined
 * output mixes streams that one rule cannot compact without losing content.
 * For example `pnpm test && cat package.json` must not use the test rule,
 * because the JSON has no test line to protect it.
 */
function sequenceCategory(analysis: CommandAnalysis): OutputCategory {
  let decided: OutputCategory = 'none';
  let sawCommand = false;

  for (const segment of analysis.segments) {
    const first = commandOf(segment);
    if (!first) continue;
    sawCommand = true;
    const category = classify(first);

    if (category === 'none') {
      if (NO_OUTPUT_COMMANDS.has(first.name)) continue;
      return 'none';
    }
    if (decided === 'none') {
      decided = category;
      continue;
    }
    if (decided !== category) return 'none';
  }

  return sawCommand ? decided : 'none';
}

export function detectCategory(command: string | undefined): OutputCategory {
  if (!command) return 'none';

  const analysis = analyzeCommand(command);

  // A sequence of commands concatenates their output. Use one category only
  // when every segment agrees and no other segment can print.
  if (analysis.separators.some((separator) => SEQUENCE_SEPARATORS.has(separator))) {
    return sequenceCategory(analysis);
  }

  if (analysis.segments.some(
    (segment) => segment.command !== undefined && SEARCH_COMMANDS.has(segment.command),
  )) {
    return 'search';
  }

  const first = analysis.segments[0] ? commandOf(analysis.segments[0]) : null;
  if (!first) return 'none';
  return classify(first);
}
