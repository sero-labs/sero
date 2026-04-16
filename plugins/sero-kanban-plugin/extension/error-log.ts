/**
 * Error log file I/O — reads/writes `.sero/apps/kanban/errors.json`.
 *
 * Subagents call `appendError()` to report failures during planning,
 * implementation, or review phases. The retrospective action reads
 * the full log to analyse patterns and suggest process improvements.
 */

import { promises as fs } from 'node:fs';

import type { ErrorLog, ErrorReport, ErrorSeverity } from '../shared/types';
import {
  appendErrorReport,
  normalizeErrorLog,
  resolveErrorLogPath,
  type ErrorReportInput,
} from '../shared/error-log';

const writeQueues = new Map<string, Promise<void>>();

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function createErrorLogReadError(logPath: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Kanban error log at ${logPath} is unreadable. Repair or remove the malformed file before retrying. Original error: ${detail}`,
  );
}

/** Read the error log (returns empty log if file doesn't exist) */
export async function readErrorLog(statePath: string): Promise<ErrorLog> {
  const logPath = resolveErrorLogPath(statePath);
  try {
    const raw = await fs.readFile(logPath, 'utf8');
    return normalizeErrorLog(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) {
      return normalizeErrorLog(null);
    }
    throw createErrorLogReadError(logPath, error);
  }
}

/** Write the error log atomically */
export async function writeErrorLog(statePath: string, log: ErrorLog): Promise<void> {
  const logPath = resolveErrorLogPath(statePath);
  const dirIndex = Math.max(logPath.lastIndexOf('/'), logPath.lastIndexOf('\\'));
  const dir = dirIndex === -1 ? '.' : logPath.slice(0, dirIndex);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${logPath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(log, null, 2), 'utf8');
  await fs.rename(tmpPath, logPath);
}

/** Append a single error report to the log */
export async function appendError(
  statePath: string,
  report: ErrorReportInput,
): Promise<ErrorReport> {
  return withWriteQueue(statePath, async () => {
    const { log, report: fullReport } = appendErrorReport(await readErrorLog(statePath), report);
    await writeErrorLog(statePath, log);
    return fullReport;
  });
}

/** Append multiple errors at once (batch) */
export async function appendErrors(
  statePath: string,
  reports: ErrorReportInput[],
): Promise<ErrorReport[]> {
  if (reports.length === 0) return [];
  return withWriteQueue(statePath, async () => {
    let nextLog = await readErrorLog(statePath);
    const fullReports: ErrorReport[] = [];
    for (const report of reports) {
      const appended = appendErrorReport(nextLog, report);
      nextLog = appended.log;
      fullReports.push(appended.report);
    }
    await writeErrorLog(statePath, nextLog);
    return fullReports;
  });
}

/** Get errors for a specific card */
export function getCardErrors(log: ErrorLog, cardId: string): ErrorReport[] {
  return log.errors.filter((e) => e.cardId === cardId);
}

/** Get errors by severity */
export function getErrorsBySeverity(log: ErrorLog, severity: ErrorSeverity): ErrorReport[] {
  return log.errors.filter((e) => e.severity === severity);
}

/** Format the error log for display */
export function formatErrorLog(log: ErrorLog): string {
  if (log.errors.length === 0) return 'No errors recorded.';

  const lines: string[] = [`## Error Log (${log.errors.length} total)`];

  if (log.lastRetrospectiveAt) {
    lines.push(`Last retrospective: ${log.lastRetrospectiveAt}\n`);
  }

  // Group by card
  const byCard = new Map<string, ErrorReport[]>();
  for (const err of log.errors) {
    const key = `#${err.cardId} ${err.cardTitle}`;
    if (!byCard.has(key)) byCard.set(key, []);
    byCard.get(key)!.push(err);
  }

  for (const [cardKey, errors] of byCard) {
    lines.push(`\n### ${cardKey} (${errors.length} errors)`);
    for (const err of errors) {
      const severity = err.severity === 'test-failure' ? 'TEST' : err.severity.toUpperCase();
      lines.push(`  [${severity}] ${err.phase} / ${err.agentName}: ${err.message}`);
      if (err.details) {
        // Show first 3 lines of details
        const detailLines = err.details.split('\n').slice(0, 3);
        for (const line of detailLines) {
          lines.push(`    ${line}`);
        }
        if (err.details.split('\n').length > 3) {
          lines.push('    ...');
        }
      }
    }
  }

  return lines.join('\n');
}

async function withWriteQueue<T>(statePath: string, task: () => Promise<T>): Promise<T> {
  const key = resolveErrorLogPath(statePath);
  const previous = writeQueues.get(key) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  writeQueues.set(key, tail);

  await previous.catch(() => undefined);

  try {
    return await task();
  } finally {
    releaseCurrent();
    if (writeQueues.get(key) === tail) {
      writeQueues.delete(key);
    }
  }
}

/** Generate a retrospective summary for the agent to analyze */
export function generateRetrospectiveSummary(log: ErrorLog): string {
  if (log.errors.length === 0) {
    return 'No errors recorded — nothing to retrospect on.';
  }

  const lines: string[] = [
    '# Kanban Board Retrospective Data',
    '',
    `Total errors: ${log.errors.length}`,
  ];

  // Count by severity
  const bySeverity = new Map<string, number>();
  for (const err of log.errors) {
    bySeverity.set(err.severity, (bySeverity.get(err.severity) ?? 0) + 1);
  }
  lines.push('\n## Error Breakdown by Severity');
  for (const [sev, count] of bySeverity) {
    lines.push(`- ${sev}: ${count}`);
  }

  // Count by phase
  const byPhase = new Map<string, number>();
  for (const err of log.errors) {
    byPhase.set(err.phase, (byPhase.get(err.phase) ?? 0) + 1);
  }
  lines.push('\n## Error Breakdown by Phase');
  for (const [phase, count] of byPhase) {
    lines.push(`- ${phase}: ${count}`);
  }

  // Count by agent
  const byAgent = new Map<string, number>();
  for (const err of log.errors) {
    byAgent.set(err.agentName, (byAgent.get(err.agentName) ?? 0) + 1);
  }
  lines.push('\n## Error Breakdown by Agent');
  for (const [agent, count] of byAgent) {
    lines.push(`- ${agent}: ${count}`);
  }

  // Common error patterns (group by message prefix)
  const byMessagePrefix = new Map<string, number>();
  for (const err of log.errors) {
    const prefix = err.message.slice(0, 80);
    byMessagePrefix.set(prefix, (byMessagePrefix.get(prefix) ?? 0) + 1);
  }
  const repeating = [...byMessagePrefix.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  if (repeating.length > 0) {
    lines.push('\n## Recurring Error Patterns');
    for (const [msg, count] of repeating.slice(0, 10)) {
      lines.push(`- (${count}x) ${msg}`);
    }
  }

  // Full error list
  lines.push('\n## Full Error Details');
  for (const err of log.errors) {
    lines.push(`\n### [${err.severity.toUpperCase()}] Card #${err.cardId}: ${err.cardTitle}`);
    lines.push(`- Phase: ${err.phase}`);
    lines.push(`- Agent: ${err.agentName}`);
    lines.push(`- Time: ${err.timestamp}`);
    lines.push(`- Message: ${err.message}`);
    if (err.filePaths?.length) {
      lines.push(`- Files: ${err.filePaths.join(', ')}`);
    }
    if (err.details) {
      lines.push(`- Details:\n\`\`\`\n${err.details}\n\`\`\``);
    }
  }

  return lines.join('\n');
}
