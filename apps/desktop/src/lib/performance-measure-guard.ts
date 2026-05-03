const PATCH_FLAG = '__seroPerformanceDiagnosticsInstalled';
const REPORT_INTERVAL_MS = 60_000;
const MAX_REPORTS = 3;
const LARGE_DETAIL_CHARS = 100_000;
const STACK_PREVIEW_LINES = 8;

type PerformanceWithDiagnosticsFlag = Performance & {
  [PATCH_FLAG]?: boolean;
};

type EntryKind = 'mark' | 'measure';

type EntryStats = {
  count: number;
  detailCount: number;
  largeDetailCount: number;
  maxDetailChars: number;
  sampleStack?: string;
};

type ReportRow = EntryStats & { name: string };

const stats = new Map<string, EntryStats>();
let totalEntries = 0;
let totalDetailEntries = 0;
let totalLargeDetails = 0;
let lastReportAt = 0;
let reportsWritten = 0;

function estimateDetailSize(detail: unknown): number {
  if (detail === undefined || detail === null) return 0;
  if (typeof detail === 'string') return detail.length;
  try {
    return JSON.stringify(detail)?.length ?? 0;
  } catch {
    return LARGE_DETAIL_CHARS + 1;
  }
}

function sampleStack(): string {
  const stack = new Error().stack ?? '';
  return stack
    .split('\n')
    .slice(3, 3 + STACK_PREVIEW_LINES)
    .map((line) => line.trim())
    .join(' | ');
}

function recordEntry(kind: EntryKind, name: string, detail?: unknown): void {
  totalEntries += 1;
  const detailChars = estimateDetailSize(detail);
  const hasDetail = detail !== undefined;
  const isLargeDetail = detailChars >= LARGE_DETAIL_CHARS;

  if (hasDetail) totalDetailEntries += 1;
  if (isLargeDetail) totalLargeDetails += 1;

  const key = `${kind}:${name}`;
  const entry = stats.get(key) ?? {
    count: 0,
    detailCount: 0,
    largeDetailCount: 0,
    maxDetailChars: 0,
  };

  entry.count += 1;
  if (hasDetail) entry.detailCount += 1;
  if (isLargeDetail) entry.largeDetailCount += 1;
  entry.maxDetailChars = Math.max(entry.maxDetailChars, detailChars);
  if (!entry.sampleStack && hasDetail) entry.sampleStack = sampleStack();
  stats.set(key, entry);

  reportIfDue();
}

function formatRow(row: ReportRow): string {
  const stack = row.sampleStack ? ` stack=${row.sampleStack}` : '';
  return `${row.name} count=${row.count} detail=${row.detailCount} large=${row.largeDetailCount} maxDetail=${row.maxDetailChars}${stack}`;
}

function reportIfDue(): void {
  if (reportsWritten >= MAX_REPORTS) return;

  const now = Date.now();
  if (now - lastReportAt < REPORT_INTERVAL_MS) return;
  lastReportAt = now;
  reportsWritten += 1;

  const top = [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([name, value]) => ({ name, ...value }));

  if (top.length === 0) return;

  const lines = [
    `[sero:perf-diagnostics] totals entries=${totalEntries} detail=${totalDetailEntries} large=${totalLargeDetails}`,
    ...top.map((row, index) => `  ${index + 1}. ${formatRow(row)}`),
  ];
  console.warn(lines.join('\n'));
}

function getMeasureDetail(startOrOptions?: string | PerformanceMeasureOptions): unknown {
  if (typeof startOrOptions !== 'object' || startOrOptions === null) return undefined;
  if (!('detail' in startOrOptions)) return undefined;
  return startOrOptions.detail;
}

function getMarkDetail(markOptions?: PerformanceMarkOptions): unknown {
  if (typeof markOptions !== 'object' || markOptions === null) return undefined;
  if (!('detail' in markOptions)) return undefined;
  return markOptions.detail;
}

function callMeasure(
  measure: typeof performance.measure,
  measureName: string,
  startOrOptions?: string | PerformanceMeasureOptions,
  endMark?: string,
): PerformanceMeasure {
  recordEntry('measure', measureName, getMeasureDetail(startOrOptions));
  if (typeof startOrOptions === 'string' || endMark !== undefined) {
    return measure(measureName, startOrOptions, endMark);
  }
  return measure(measureName, startOrOptions);
}

function callMark(
  mark: typeof performance.mark,
  markName: string,
  markOptions?: PerformanceMarkOptions,
): PerformanceMark {
  recordEntry('mark', markName, getMarkDetail(markOptions));
  return mark(markName, markOptions);
}

export function installPerformanceMeasureGuard(): void {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') {
    return;
  }

  const guardedPerformance = performance as PerformanceWithDiagnosticsFlag;
  if (guardedPerformance[PATCH_FLAG]) return;

  const originalMeasure = performance.measure.bind(performance) as typeof performance.measure;
  const originalMark = typeof performance.mark === 'function'
    ? performance.mark.bind(performance) as typeof performance.mark
    : null;

  const diagnosticMeasure: typeof performance.measure = (
    measureName: string,
    startOrOptions?: string | PerformanceMeasureOptions,
    endMark?: string,
  ) => callMeasure(originalMeasure, measureName, startOrOptions, endMark);

  performance.measure = diagnosticMeasure;

  if (originalMark) {
    const diagnosticMark: typeof performance.mark = (
      markName: string,
      markOptions?: PerformanceMarkOptions,
    ) => callMark(originalMark, markName, markOptions);
    performance.mark = diagnosticMark;
  }

  guardedPerformance[PATCH_FLAG] = true;
}

installPerformanceMeasureGuard();
