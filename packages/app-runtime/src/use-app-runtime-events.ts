/**
 * useAppRuntimeEvents — subscribe to events this app's own runtime emits.
 *
 * The host scopes delivery to this app in this workspace, so an event from
 * another app's runtime never reaches this callback. Nothing is persisted.
 *
 * A listener is purely additive: outside the Sero shell, or outside an
 * `<AppProvider>`, it simply never receives an event rather than failing the
 * view that rendered it. A preview or a test renders these components directly.
 */

import { use, useEffect, useRef } from 'react';
import { AppContext } from './context';
import { getSeroApi } from './sero-bridge';

export function useAppRuntimeEvents<T = unknown>(
  topic: string,
  handler: (payload: T) => void,
): void {
  const context = use(AppContext);
  const appId = context?.appId;
  const workspaceId = context?.workspaceId;
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!appId || !workspaceId) return;

    let bridge: ReturnType<typeof getSeroApi>['appRuntime'];
    try {
      bridge = getSeroApi().appRuntime;
    } catch {
      return;
    }
    // An older host has no runtime-to-UI events; the view simply stays quiet.
    if (!bridge) return;

    const unsubscribe = bridge.onEvent((event) => {
      if (event.appId !== appId || event.workspaceId !== workspaceId || event.topic !== topic) return;
      handlerRef.current(event.payload as T);
    });
    void bridge.subscribe(appId, workspaceId, topic);

    return () => {
      unsubscribe();
      void bridge.unsubscribe(appId, workspaceId, topic);
    };
  }, [appId, workspaceId, topic]);
}
