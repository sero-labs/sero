import { getSeroApi } from '@sero/app-runtime';

import type { Card } from '../../shared/types';
import {
  appendErrorReport,
  normalizeErrorLog,
  resolveErrorLogPath,
  summarizeErrorLog,
  type ErrorReportInput,
} from '../../shared/error-log';

export interface ErrorLogSummary {
  count: number;
  lastRetrospectiveAt?: string;
}

const writeQueues = new Map<string, Promise<void>>();
const EMPTY_SUMMARY: ErrorLogSummary = { count: 0 };

export async function appendReviewActionError(
  stateFilePath: string,
  report: ErrorReportInput,
): Promise<void> {
  const { appState } = getSeroApi();
  const errorLogPath = resolveErrorLogPath(stateFilePath);

  await withWriteQueue(stateFilePath, async () => {
    const current = normalizeErrorLog(await appState.read(errorLogPath));
    const appended = appendErrorReport(current, report);
    await appState.write(errorLogPath, appended.log);
  });
}

export async function readErrorLogSummary(stateFilePath: string): Promise<ErrorLogSummary> {
  if (!stateFilePath) {
    return EMPTY_SUMMARY;
  }

  const { appState } = getSeroApi();
  const current = await appState.read(resolveErrorLogPath(stateFilePath));
  return summarizeErrorLog(normalizeErrorLog(current));
}

export function buildRevisionRequestError(card: Pick<Card, 'id' | 'title'>, feedback: string): ErrorReportInput {
  return {
    cardId: card.id,
    cardTitle: card.title,
    phase: 'review',
    agentName: 'user',
    severity: 'warning',
    message: `Revision requested: ${feedback}`,
  };
}

export function buildCancelPrError(card: Pick<Card, 'id' | 'title'>): ErrorReportInput {
  return {
    cardId: card.id,
    cardTitle: card.title,
    phase: 'review',
    agentName: 'user',
    severity: 'warning',
    message: 'PR cancelled by user — card returned to backlog',
  };
}

async function withWriteQueue<T>(stateFilePath: string, task: () => Promise<T>): Promise<T> {
  const key = resolveErrorLogPath(stateFilePath);
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
