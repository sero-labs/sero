import type {
  CliCommandContext,
  CliCommandUpdate,
  CliResult,
  CliSubcommandHandler,
} from './types';

export type CliSubcommands = Record<string, CliSubcommandHandler>;

export interface SubcommandDispatchOptions {
  /** Subcommand to run when no subcommand is given. */
  fallback?: string;
  /** Result for a missing (`undefined`) or unhandled subcommand name. */
  unknown: (action: string | undefined) => CliResult;
}

/** Run the subcommand named by `args[0]` with the remaining tokens. */
export async function runSubcommand(
  subcommands: CliSubcommands,
  args: string[],
  context: CliCommandContext,
  onUpdate: ((update: CliCommandUpdate) => void) | undefined,
  options: SubcommandDispatchOptions,
): Promise<CliResult> {
  const [given, ...rest] = args;
  const action = given ?? options.fallback;
  const handler = action !== undefined && Object.hasOwn(subcommands, action)
    ? subcommands[action]
    : undefined;
  if (!handler) return options.unknown(action);
  return handler(rest, context, onUpdate);
}
