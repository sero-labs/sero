import { useSyncExternalStore } from 'react';
import { getRuntimeWidgets, onWidgetRegistryChange } from '@sero-ai/app-runtime';
import type { RuntimeWidget } from '@sero-ai/app-runtime';

function getServerSnapshot(): RuntimeWidget[] {
  return [];
}

export function useRuntimeWidgets(): RuntimeWidget[] {
  return useSyncExternalStore(
    onWidgetRegistryChange,
    getRuntimeWidgets,
    getServerSnapshot,
  );
}
