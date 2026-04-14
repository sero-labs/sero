import { parseFlags, requireFlagString } from '@electron/cli/lib/utils';

/** Extract --account flag from args, returning the cleaned args and account. */
export function extractAccount(args: string[]): { cleaned: string[]; account?: string } {
  const { positionals, flags } = parseFlags(args);
  const account = requireFlagString(flags, 'account') ?? undefined;

  const cleaned: string[] = [...positionals];
  for (const [key, value] of flags) {
    if (key === 'account') continue;
    if (value === true) {
      cleaned.push(`--${key}`);
    } else {
      cleaned.push(`--${key}`, value);
    }
  }
  return { cleaned, account };
}
