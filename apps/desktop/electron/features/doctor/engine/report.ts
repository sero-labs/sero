/**
 * Build, sort, redact, and render `DoctorReport` documents.
 *
 * Determinism: results are sorted by id; profile entries are sorted by
 * pathHash. Two runs in the same environment produce reports that are
 * byte-equal apart from `timestamp` and `durationMs`.
 */

import os from 'os';
import { hashPath, scrub } from './redaction';
import type {
  DoctorMode,
  DoctorReport,
  DoctorResult,
  DoctorStatus,
  EnvAudit,
} from './types';
import type { ProfileSnapshot } from '../profile-state/types';

interface BuildReportArgs {
  results: DoctorResult[];
  profiles: ProfileSnapshot[];
  mode: DoctorMode;
  seroVersion: string;
  durationMs: number;
  timestamp: string;
  envAudit?: EnvAudit;
}

function emptyEnvAudit(): EnvAudit {
  return { present: [], missing: [], recommended: [] };
}

export function buildReport(args: BuildReportArgs): DoctorReport {
  const sortedResults = [...args.results].sort((a, b) => a.id.localeCompare(b.id));

  const profilesScanned = args.profiles
    .map((p) => ({ id: p.id, pathHash: hashPath(p.path) }))
    .sort((a, b) => a.pathHash.localeCompare(b.pathHash));

  // The environment.audit check (if it ran) attaches the EnvAudit
  // payload to its result.details. Pull it out for the top-level summary.
  const envAuditFromResult = sortedResults.find(
    (r) => r.id === 'environment.audit' && r.details && typeof r.details === 'object',
  )?.details as { audit?: EnvAudit } | undefined;

  const envAudit = args.envAudit ?? envAuditFromResult?.audit ?? emptyEnvAudit();

  const raw: DoctorReport = {
    schemaVersion: 1,
    timestamp: args.timestamp,
    mode: args.mode,
    system: {
      os: os.platform(),
      version: os.release(),
      arch: process.arch,
    },
    seroVersion: args.seroVersion,
    profilesScanned,
    results: sortedResults,
    envAudit,
    durationMs: args.durationMs,
  };

  return scrub(raw);
}

const STATUS_GLYPH: Record<DoctorStatus, string> = {
  pass: '✓',
  warn: '⚠',
  fail: '✗',
};

const CATEGORY_LABELS: Record<string, string> = {
  system: 'System',
  runtime: 'Runtime',
  node: 'Node',
  profile: 'Profile',
  workspace: 'Workspace',
  providers: 'Providers',
  plugins: 'Plugins',
  environment: 'Environment',
};

export function renderPlaintext(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`Environment Doctor — ${report.timestamp}`);
  lines.push(
    `Sero ${report.seroVersion} · ${report.system.os} ${report.system.version} (${report.system.arch})`,
  );
  lines.push(`Mode: ${report.mode}  ·  Duration: ${report.durationMs}ms`);
  lines.push('');

  const grouped = new Map<string, DoctorResult[]>();
  for (const result of report.results) {
    const list = grouped.get(result.category) ?? [];
    list.push(result);
    grouped.set(result.category, list);
  }

  const orderedCategories = [
    'system',
    'runtime',
    'node',
    'profile',
    'workspace',
    'providers',
    'plugins',
    'environment',
  ];
  for (const category of orderedCategories) {
    const items = grouped.get(category);
    if (!items || items.length === 0) continue;
    lines.push(CATEGORY_LABELS[category] ?? category);
    for (const item of items) {
      lines.push(`  ${STATUS_GLYPH[item.status]} ${item.message}`);
      if (item.fix?.kind === 'command') {
        lines.push(`     → Run: ${item.fix.command} ${item.fix.args.join(' ')}`.trimEnd());
      } else if (item.fix?.kind === 'manual') {
        lines.push(`     → ${item.fix.instructions}`);
      } else if (item.fix?.kind === 'repair') {
        lines.push(`     → ${item.fix.description} (auto-repair coming soon)`);
      }
    }
    lines.push('');
  }

  if (report.envAudit.missing.length > 0) {
    lines.push('Missing required env vars:');
    for (const name of report.envAudit.missing) lines.push(`  - ${name}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function computeExitCode(report: DoctorReport): number {
  return report.results.some((r) => r.status === 'fail') ? 1 : 0;
}
