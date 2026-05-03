/**
 * CLI entry — invoked from `main.ts` when `--doctor` is present.
 *
 * Parses CLI flags, runs the safe-mode doctor, prints either a JSON
 * report on stdout (with logs on stderr) or a plaintext summary, and
 * resolves with the exit code the host process should use.
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
  noWindow: boolean;
}

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

function nextValue(argv: string[], i: number): string | undefined {
  return argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[i + 1] : undefined;
}

export function parseDoctorArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    json: false,
    quick: false,
    allProfiles: false,
    noWindow: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') flags.json = true;
    else if (arg === '--quick') flags.quick = true;
    else if (arg === '--all-profiles') flags.allProfiles = true;
    else if (arg === '--no-window') flags.noWindow = true;
    else if (arg === '--profile') flags.profileFilter = nextValue(argv, i);
    else if (arg === '--category') {
      const value = nextValue(argv, i);
      if (value && (VALID_CATEGORIES as string[]).includes(value)) {
        flags.category = value as DoctorCategory;
      }
    } else if (arg === '--report') {
      flags.reportPath = nextValue(argv, i);
      flags.json = true;
    }
  }
  if (flags.json) flags.noWindow = true;
  return flags;
}

export interface CliRunResult {
  exitCode: number;
  report: DoctorReport;
}

export async function runDoctorSafeMode(args: {
  argv: string[];
  seroVersion: string;
  log?: (message: string) => void;
}): Promise<CliRunResult> {
  const flags = parseDoctorArgs(args.argv);
  const log = args.log ?? ((m: string) => process.stderr.write(`${m}\n`));
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
