import { executeCliArgv } from '@electron/cli/core/batch-executor';
import type { CliRegistry } from '@electron/cli/core/registry';
import type { CliCommandContext } from '@electron/cli/core/types';

export interface RunCliResult {
  stdout: string;
  exit: number;
}

export async function runCli(
  registry: CliRegistry,
  args: string[],
  context: CliCommandContext,
): Promise<RunCliResult> {
  const result = await executeCliArgv(registry, args, context);
  return { stdout: result.output, exit: result.exitCode };
}
