import { useEffect, useState } from 'react';
import { getSeroApi } from '@sero/app-runtime';

import { normalizeErrorLog, resolveErrorLogPath, summarizeErrorLog } from '../../shared/error-log';
import type { ErrorLogSummary } from '../lib/error-log-client';

const EMPTY_SUMMARY: ErrorLogSummary = { count: 0 };

export function useErrorLogSummary(stateFilePath: string): ErrorLogSummary {
  const [summary, setSummary] = useState<ErrorLogSummary>(EMPTY_SUMMARY);

  useEffect(() => {
    if (!stateFilePath) {
      setSummary(EMPTY_SUMMARY);
      return undefined;
    }

    const { appState } = getSeroApi();
    const errorLogPath = resolveErrorLogPath(stateFilePath);
    let cancelled = false;

    const handleData = (data: unknown) => {
      if (!cancelled) {
        setSummary(summarizeErrorLog(normalizeErrorLog(data)));
      }
    };

    const unsubscribe = appState.onChange((filePath, data) => {
      if (filePath === errorLogPath) {
        handleData(data);
      }
    });

    appState.watch(errorLogPath)
      .then((data) => handleData(data))
      .catch(() => handleData(null));

    return () => {
      cancelled = true;
      unsubscribe();
      void appState.unwatch(errorLogPath);
    };
  }, [stateFilePath]);

  return summary;
}
