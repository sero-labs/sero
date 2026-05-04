/**
 * CLI entry — invoked from `main.ts` when `--doctor` is present.
 *
 * Parses CLI flags strictly (missing values, unknown categories, and
 * `--report` without a path are usage errors, not silently ignored),
 * runs the safe-mode doctor, prints either a JSON report on stdout
 * (with logs on stderr) or a plaintext summary, and resolves with the
 * exit code the host process should use.
 */

import { writeFileSync } from 'fs';
import { computeExitCode, renderPlaintext } from './engine/report';
import type { DoctorCategory, DoctorReport } from './engine/types';
import { runSafeModeDoctor } from './modes/safe-mode';

export interface CliFlags {
  json: boolean;
  quick: boolean;
  profileFilter?: string;
  allProfiles: boolean;
  category?: DoctorCategory;
  reportPath?: string;
}

export type ParseResult =
  | { ok: true; flags: CliFlags }
  | { ok: false; error: string };

const VALID_CATEGORIES: DoctorCategory[] = [
  'system',
  'runtime',
  'node',
  'profile',
  'workspace',
  'providers',
  'plugins',
  'environment',
];

const FLAGS_WITH_VALUES = new Set(['--profile', '--category', '--report']);

const USAGE = [
  'Usage: sero-doctor [--quick] [--json] [--all-profiles]',
  '                    [--profile <id|path>] [--category <name>]',
  '                    [--report <path>]',
  '',
  'Flags:',
  '  --quick              Run in quick mode (≤ 2s budget; skips slow checks).',
  '  --json               Emit a DoctorReport JSON document on stdout.',
  '  --all-profiles       Scan every registered profile and orphan dirs.',
  '  --profile <id|path>  Target a specific profile.',
  '  --category <name>    Run a single category (system, runtime, node,',
  '                       profile, workspace, providers, plugins, environment).',
  '  --report <path>      Write JSON to <path> instead of stdout. Implies --json.',
].join('\n');

function takeValue(argv: string[], i: number, flag: string): string | undefined {
  const value = argv[i + 1];
  if (value === undefined) return undefined;
  // `--profile --json` is a missing value, not "the next flag is the value".
  if (value.startsWith('-')) return undefined;
  return value;
}

export function parseDoctorArgs(argv: string[]): ParseResult {
  const flags: CliFlags = {
    json: false,
    quick: false,
    allProfiles: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--doctor') continue;
    if (arg === '--json') flags.json = true;
    else if (arg === '--quick') flags.quick = true;
    else if (arg === '--all-profiles') flags.allProfiles = true;
    else if (arg === '--profile') {
      const value = takeValue(argv, i, arg);
      if (!value) return { ok: false, error: '--profile requires a value' };
      flags.profileFilter = value;
      i += 1;
    } else if (arg === '--category') {
      const value = takeValue(argv, i, arg);
      if (!value) return { ok: false, error: '--category requires a value' };
      if (!(VALID_CATEGORIES as string[]).includes(value)) {
        return {
          ok: false,
          error: `Unknown --category "${value}". Valid: ${VALID_CATEGORIES.join(', ')}.`,
        };
      }
      flags.category = value as DoctorCategory;
      i += 1;
    } else if (arg === '--report') {
      const value = takeValue(argv, i, arg);
      if (!value) return { ok: false, error: '--report requires a path' };
      flags.reportPath = value;
      flags.json = true;
      i += 1;
    } else if (arg.startsWith('--')) {
      return { ok: false, error: `Unknown flag ${arg}` };
    } else if (FLAGS_WITH_VALUES.has(arg)) {
      // Defensive: we shouldn't reach here, but guard anyway.
      return { ok: false, error: `${arg} requires a value` };
    } else {
      return { ok: false, error: `Unexpected positional argument "${arg}"` };
    }
  }
  return { ok: true, flags };
}

export interface CliRunResult {
  exitCode: number;
  report?: DoctorReport;
  /** Set when parsing failed. */
  parseError?: string;
}

export async function runDoctorSafeMode(args: {
  argv: string[];
  seroVersion: string;
  log?: (message: string) => void;
}): Promise<CliRunResult> {
  const log = args.log ?? ((m: string) => process.stderr.write(`${m}\n`));
  const parsed = parseDoctorArgs(args.argv);
  if (!parsed.ok) {
    log(`[doctor] ${parsed.error}`);
    log(USAGE);
    return { exitCode: 2, parseError: parsed.error };
  }
  const { flags } = parsed;
  log(`[doctor] starting (mode=${flags.quick ? 'quick' : 'full'})`);

  const report = await runSafeModeDoctor({
    mode: flags.quick ? 'quick' : 'full',
    category: flags.category,
    profileFilter: flags.profileFilter,
    allProfiles: flags.allProfiles,
    seroVersion: args.seroVersion,
  });

  const exitCode = computeExitCode(report);
  log(`[doctor] done (exitCode=${exitCode})`);

  if (flags.reportPath) {
    writeFileSync(flags.reportPath, JSON.stringify(report, null, 2));
    log(`[doctor] report written to ${flags.reportPath}`);
  } else if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2));
    process.stdout.write('\n');
  } else {
    process.stdout.write(renderPlaintext(report));
  }

  return { exitCode, report };
}

export function isDoctorInvocation(argv: string[]): boolean {
  return argv.includes('--doctor');
}

export const DOCTOR_USAGE = USAGE;
