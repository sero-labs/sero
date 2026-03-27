import type { ErrorLog, ErrorReport } from './types';
import { DEFAULT_ERROR_LOG } from './types';

export const ERROR_LOG_FILENAME = 'errors.json';
const KANBAN_STATE_SUFFIX = '/.sero/apps/kanban/state.json';

export type ErrorReportInput = Omit<ErrorReport, 'id' | 'timestamp'>;

export function resolveErrorLogPath(statePath: string): string {
  return replaceBasename(statePath, ERROR_LOG_FILENAME);
}

export function resolveWorkspacePathFromStatePath(statePath: string): string {
  const normalized = statePath.replace(/\\/g, '/');
  if (!normalized.endsWith(KANBAN_STATE_SUFFIX)) {
    return statePath;
  }

  const workspacePath = normalized.slice(0, -KANBAN_STATE_SUFFIX.length);
  return statePath.includes('\\') ? workspacePath.replace(/\//g, '\\') : workspacePath;
}

export function normalizeErrorLog(raw: unknown): ErrorLog {
  const data = raw as Partial<ErrorLog> | null | undefined;
  return {
    ...DEFAULT_ERROR_LOG,
    errors: Array.isArray(data?.errors) ? [...data.errors] : [],
    lastRetrospectiveAt:
      typeof data?.lastRetrospectiveAt === 'string' ? data.lastRetrospectiveAt : undefined,
  };
}

export function appendErrorReport(
  log: ErrorLog,
  report: ErrorReportInput,
): { log: ErrorLog; report: ErrorReport } {
  const normalized = normalizeErrorLog(log);
  const fullReport = createErrorReport(report);
  return {
    log: {
      ...normalized,
      errors: [...normalized.errors, fullReport],
    },
    report: fullReport,
  };
}

export function summarizeErrorLog(log: ErrorLog): { count: number; lastRetrospectiveAt?: string } {
  const normalized = normalizeErrorLog(log);
  return {
    count: normalized.errors.length,
    lastRetrospectiveAt: normalized.lastRetrospectiveAt,
  };
}

function createErrorReport(report: ErrorReportInput): ErrorReport {
  const timestamp = new Date().toISOString();
  return {
    ...report,
    id: generateErrorId(timestamp),
    timestamp,
  };
}

function generateErrorId(timestamp: string): string {
  const timePart = Date.parse(timestamp);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `err-${Number.isNaN(timePart) ? Date.now() : timePart}-${suffix}`;
}

function replaceBasename(filePath: string, nextBasename: string): string {
  const slashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (slashIndex === -1) {
    return nextBasename;
  }
  return `${filePath.slice(0, slashIndex + 1)}${nextBasename}`;
}
