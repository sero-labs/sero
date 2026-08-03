import { AppContext, getSeroApi } from '@sero-ai/app-runtime';
import { use, useEffect, useMemo, useState } from 'react';

/** Read and watch one plugin-owned JSON index through the generic file bridge. */
export function useJsonIndex<T>(
  relativePath: string,
  normalize: (value: unknown) => T[],
): T[] {
  const context = use(AppContext);
  if (!context) throw new Error('useJsonIndex must be used inside an <AppProvider>');

  const filePath = useMemo(() => {
    const separator = context.stateFilePath.includes('\\') ? '\\' : '/';
    const parent = context.stateFilePath.slice(0, context.stateFilePath.lastIndexOf(separator));
    return `${parent}${separator}${relativePath.split('/').join(separator)}`;
  }, [context.stateFilePath, relativePath]);
  const [entries, setEntries] = useState<T[]>([]);

  useEffect(() => {
    const api = getSeroApi().appState;
    let active = true;
    let changedWhileWatching = false;
    setEntries([]);
    const unsubscribe = api.onChange<unknown>((changedPath, value) => {
      if (active && changedPath === filePath) {
        changedWhileWatching = true;
        setEntries(normalize(value));
      }
    });
    void api.watch<unknown>(filePath).then((value) => {
      if (active && !changedWhileWatching) setEntries(normalize(value));
    });
    return () => {
      active = false;
      unsubscribe();
      void api.unwatch(filePath);
    };
  }, [filePath, normalize]);

  return entries;
}
