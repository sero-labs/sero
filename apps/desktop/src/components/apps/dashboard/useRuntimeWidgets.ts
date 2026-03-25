import { useSyncExternalStore } from 'react';
import { getRuntimeWidgets, onWidgetRegistryChange } from '@sero-ai/app-runtime';
import type { RuntimeWidget } from '@sero-ai/app-runtime';

const EMPTY_RUNTIME_WIDGETS: RuntimeWidget[] = [];

function getServerSnapshot(): RuntimeWidget[] {
  return EMPTY_RUNTIME_WIDGETS;
}

export function useRuntimeWidgets(): RuntimeWidget[] {
  return useSyncExternalStore(
    onWidgetRegistryChange,
    getRuntimeWidgets,
    getServerSnapshot,
  );
}
