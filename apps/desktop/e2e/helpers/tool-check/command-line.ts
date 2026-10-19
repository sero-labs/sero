/**
 * Turns a probe step into a `sero-cli` command line, so the same step runs
 * as a direct tool call or through the Sero CLI.
 */
import type { StepParams } from './types';

/**
 * One argument, quoted for the `sero-cli` tokenizer. The tokenizer reads a
 * backslash escape inside single quotes too, so backslashes and single quotes
 * are escaped and every other character, line breaks included, is kept.
 */
export function quoteArg(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function flagValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** True for a core CLI entry (`sero <command>`), whose step params are `{ argv }`. */
export function isCoreCommand(tool: string): boolean {
  return tool.startsWith('sero ');
}

/**
 * The command line for one step. A core command passes its `argv` tokens. A
 * plugin tool passes each parameter as `--name=value`, with objects and arrays
 * as JSON. The `=` form keeps a value that starts with `--` a value.
 */
export function cliCommandFor(tool: string, params: StepParams): string {
  if (isCoreCommand(tool)) {
    const argv = params.argv;
    if (!Array.isArray(argv) || argv.some((token) => typeof token !== 'string')) {
      throw new Error(`${tool}: a core command step needs params.argv as a list of strings`);
    }
    return [tool.slice('sero '.length), ...(argv as string[]).map(quoteArg)].join(' ');
  }
  const flags = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `--${name}=${quoteArg(flagValue(value))}`);
  return [tool, ...flags].join(' ');
}
