import { useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useRef, useState } from 'react';

import { importFile, type ImportSourceKind } from '../lib/import';

/**
 * Import progress, shared by all three entry points.
 *
 * Files are imported one at a time rather than in parallel: each one is a
 * sequence of chunked tool calls, and running several at once would multiply
 * the calls in flight without making the disk any faster.
 */

export interface ImportState {
  active: boolean;
  fileName: string;
  /** 0–1 for the file currently uploading. */
  progress: number;
  done: number;
  total: number;
  errors: string[];
}

const IDLE: ImportState = { active: false, fileName: '', progress: 0, done: 0, total: 0, errors: [] };

export function useImport(): {
  state: ImportState;
  importFiles(files: File[], sourceKind: ImportSourceKind): Promise<void>;
  dismissErrors(): void;
} {
  const tools = useAppTools();
  const [state, setState] = useState<ImportState>(IDLE);
  const running = useRef(false);

  const importFiles = useCallback(
    async (files: File[], sourceKind: ImportSourceKind) => {
      if (files.length === 0 || running.current) return;
      running.current = true;
      setState({ ...IDLE, active: true, total: files.length });

      const errors: string[] = [];
      for (const [index, file] of files.entries()) {
        // One file at a time on purpose: the progress line counts files as they
        // land, and twenty uploads racing each other would report nonsense.
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const result = await importFile(tools, file, sourceKind, (progress) =>
          setState((current) => ({ ...current, fileName: progress.fileName, progress: progress.progress })),
        );
        if (!result.ok) errors.push(`${result.fileName}: ${result.error ?? 'import failed'}`);
        setState((current) => ({ ...current, done: index + 1, errors }));
      }

      running.current = false;
      setState((current) => ({ ...IDLE, errors: current.errors }));
    },
    [tools],
  );

  const dismissErrors = useCallback(() => setState((current) => ({ ...current, errors: [] })), []);

  return { state, importFiles, dismissErrors };
}
