import {
  commandBasename,
  splitTopLevelSegments,
  stripEnvAssignments,
  tokenizeShellSegment,
  type ShellToken,
} from './shell';

/**
 * Command-shape analysis for the rewrite stage.
 *
 * Every predicate here is a measured-loss or safety exclusion. A conservative
 * match skips a rewrite, which is always safe.
 */

export interface AnalyzedSegment {
  text: string;
  /** Offset of the segment within the whole command. */
  start: number;
  tokens: ShellToken[];
  /** The executable name of the segment's first command word. */
  command?: string;
  commandIndex: number;
}

export interface CommandAnalysis {
  hasTopLevelPipe: boolean;
  /** Top-level separators between segments, such as `&&`, `||`, `;` and `|`. */
  separators: string[];
  segments: AnalyzedSegment[];
  tokens: ShellToken[];
}

const SEARCH_COMMANDS = new Set(['grep', 'rg', 'egrep', 'fgrep', 'ripgrep', 'find']);
const LOSSY_GIT_SUBCOMMANDS = new Set(['log', 'diff', 'show']);

const STRUCTURED_EXACT = new Set([
  '--json',
  '--ndjson',
  '--xml',
  '--csv',
  '--yaml',
  '--toml',
  '--porcelain',
  '--machine-readable',
  '--null',
  '--json-report',
  '--junit',
  '--tap',
]);

const STRUCTURED_PREFIXES = [
  '--json=',
  '--porcelain=',
  '--format=',
  '--pretty=',
  '--output=json',
  '--output=ndjson',
  '--output-format=',
  '--reporter=',
  '--message-format=',
  '--logger=',
  '--test-reporter=',
];

const STRUCTURED_PAIR_FLAGS = new Set([
  '--format',
  '--output',
  '--output-format',
  '--reporter',
  '--message-format',
  '--logger',
  '--test-reporter',
]);

const BYPASS_MARKER = /#\s*no-opt\b/;

export function analyzeCommand(command: string): CommandAnalysis {
  const split = splitTopLevelSegments(command);
  const segments = split.segments.map((segment): AnalyzedSegment => {
    const tokens = tokenizeShellSegment(segment.text);
    const commandTokens = stripEnvAssignments(tokens);
    return {
      text: segment.text,
      start: segment.start,
      tokens,
      command: commandTokens[0] ? commandBasename(commandTokens[0].value) : undefined,
      commandIndex: commandTokens[0]?.start ?? -1,
    };
  });

  return {
    hasTopLevelPipe: split.hasTopLevelPipe,
    separators: split.separators,
    segments,
    tokens: segments.flatMap((segment) => segment.tokens),
  };
}

/** True when any top-level segment runs a file-content search command. */
export function containsSearchCommand(analysis: CommandAnalysis): boolean {
  return analysis.segments.some(
    (segment) => segment.command !== undefined && SEARCH_COMMANDS.has(segment.command),
  );
}

/** True when any segment runs a lossy Git history or diff form. */
export function containsLossyGitForm(analysis: CommandAnalysis): boolean {
  return analysis.segments.some((segment) => {
    if (segment.command !== 'git') return false;
    const commandTokens = stripEnvAssignments(segment.tokens);
    const args = commandTokens.slice(1).map((token) => token.value);
    return args.some((argument) => LOSSY_GIT_SUBCOMMANDS.has(argument));
  });
}

/** True when the command asks for machine-readable output. */
export function requestsStructuredOutput(analysis: CommandAnalysis): boolean {
  const values = analysis.tokens.map((token) => token.value);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? '';
    if (STRUCTURED_EXACT.has(value)) return true;
    if (STRUCTURED_PREFIXES.some((prefix) => value.startsWith(prefix))) return true;
    if (STRUCTURED_PAIR_FLAGS.has(value) && index + 1 < values.length) return true;
  }
  return false;
}

/**
 * The single-command bypass marker.
 *
 * Detection is intentionally loose: a marker inside a quoted argument also
 * bypasses optimisation for that command, because a false bypass costs one
 * command's optimisation while a missed bypass breaks the escape hatch.
 */
export function hasBypassMarker(command: string): boolean {
  return BYPASS_MARKER.test(command);
}

/** On Windows a top-level pipe needs a pipeline fixup that this plugin does not carry. */
export function isWindowsPipeBlocked(analysis: CommandAnalysis, platform: string): boolean {
  return platform === 'win32' && analysis.hasTopLevelPipe;
}

export type RewriteBlockReason =
  | 'search'
  | 'lossy-git'
  | 'windows-pipe'
  | 'structured'
  | 'bypass'
  | 'already-rtk';

/** The measured-loss and bypass exclusions, or null when the command is eligible. */
export function rewriteBlockReason(
  command: string,
  analysis: CommandAnalysis,
  platform: string,
): RewriteBlockReason | null {
  if (hasBypassMarker(command)) return 'bypass';
  if (containsSearchCommand(analysis)) return 'search';
  if (containsLossyGitForm(analysis)) return 'lossy-git';
  if (isWindowsPipeBlocked(analysis, platform)) return 'windows-pipe';
  if (requestsStructuredOutput(analysis)) return 'structured';
  return null;
}
