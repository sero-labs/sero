import type { RewriteClass } from '../shared/types';
import { commandBasename, stripEnvAssignments, tokenizeShellSegment } from './shell';
import type { AnalyzedSegment } from './command-analysis';

/**
 * Map an RTK invocation to its kill-switch class.
 *
 * RTK owns the command catalogue; this only groups the subcommand it returned
 * so a user can turn one class off without a release.
 */

const CLASS_BY_SUBCOMMAND: Record<string, RewriteClass> = {
  ls: 'fileReads',
  tree: 'fileReads',
  read: 'fileReads',
  smart: 'fileReads',
  wc: 'fileReads',
  env: 'fileReads',

  git: 'git',

  gh: 'github',
  glab: 'github',

  docker: 'containers',
  kubectl: 'containers',
  oc: 'containers',

  test: 'tests',
  jest: 'tests',
  vitest: 'tests',
  ctest: 'tests',
  playwright: 'tests',
  pytest: 'tests',
  phpunit: 'tests',
  pest: 'tests',
  paratest: 'tests',
  phpt: 'tests',
  rake: 'tests',
  rspec: 'tests',

  tsc: 'builds',
  next: 'builds',
  mypy: 'builds',
  phpstan: 'builds',
  lint: 'builds',
  prettier: 'builds',
  format: 'builds',
  ruff: 'builds',
  rubocop: 'builds',
  sqlfluff: 'builds',
  ecs: 'builds',
  pint: 'builds',

  pnpm: 'packageManagers',
  npm: 'packageManagers',
  npx: 'packageManagers',
  bun: 'packageManagers',
  bunx: 'packageManagers',
  pip: 'packageManagers',
  uv: 'packageManagers',
  deps: 'packageManagers',
  prisma: 'packageManagers',
};

const BUILD_SUBCOMMANDS = new Set(['build', 'check', 'clippy', 'fmt', 'format', 'publish', 'package']);

function classifyCargo(args: string[]): RewriteClass {
  const subcommand = args[0];
  if (subcommand === 'test') return 'tests';
  if (subcommand && BUILD_SUBCOMMANDS.has(subcommand)) return 'builds';
  return 'packageManagers';
}

function classifyDotnet(args: string[]): RewriteClass {
  return args[0] === 'test' ? 'tests' : 'builds';
}

/** Classify the tokens that follow the `rtk` executable. */
export function classifyRtkInvocation(args: string[]): RewriteClass {
  const subcommand = args.find((argument) => !argument.startsWith('-'));
  if (!subcommand) return 'other';

  if (subcommand === 'cargo') return classifyCargo(args.slice(args.indexOf(subcommand) + 1));
  if (subcommand === 'dotnet') return classifyDotnet(args.slice(args.indexOf(subcommand) + 1));

  return CLASS_BY_SUBCOMMAND[subcommand] ?? 'other';
}

export interface RtkInvocation {
  segmentIndex: number;
  /** Offset of the `rtk` token within the segment text. */
  rtkStart: number;
  /** Offset just past the `rtk` token within the segment text. */
  rtkEnd: number;
  args: string[];
  rewriteClass: RewriteClass;
}

/**
 * Find every command-position `rtk` invocation in a command.
 *
 * Returns null when a segment contains `rtk` somewhere other than the command
 * position, because that token cannot be bound to the runtime executable
 * safely and the whole rewrite must be discarded.
 */
export function collectRtkInvocations(segments: AnalyzedSegment[]): RtkInvocation[] | null {
  const invocations: RtkInvocation[] = [];

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    if (!segment) continue;
    const tokens = stripEnvAssignments(tokenizeShellSegment(segment.text));
    const first = tokens[0];
    if (!first) continue;

    if (commandBasename(first.value) !== 'rtk') {
      if (tokens.some((token) => commandBasename(token.value) === 'rtk')) return null;
      continue;
    }

    const args = tokens.slice(1).map((token) => token.value);
    invocations.push({
      segmentIndex,
      rtkStart: first.start,
      rtkEnd: first.end,
      args,
      rewriteClass: classifyRtkInvocation(args),
    });
  }

  return invocations;
}
