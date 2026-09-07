/**
 * Two views: the projects list and one project page. The host keeps the
 * sub-view in its history, so back and forward work, and a launch from the
 * widget or a deep link lands on the right page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { consumeAppLaunchParams, onAppLaunchParams, useAppNavigation } from '@sero-ai/app-runtime';

export type ArchitectView = { mode: 'list'; intake?: boolean } | { mode: 'project'; projectId: string };

interface ArchitectLaunchParams extends Record<string, unknown> {
  projectId?: string;
  intake?: boolean;
}

export function viewId(view: ArchitectView): string {
  if (view.mode === 'project') return `projects/${view.projectId}`;
  return view.intake ? 'projects/new' : 'projects';
}

export function parseViewId(id: string | undefined): ArchitectView | null {
  if (!id) return null;
  const [section, rest] = id.split('/');
  if (section !== 'projects') return null;
  if (!rest) return { mode: 'list' };
  if (rest === 'new') return { mode: 'list', intake: true };
  return { mode: 'project', projectId: rest };
}

function launchView(params: ArchitectLaunchParams | undefined): ArchitectView | null {
  if (!params) return null;
  if (typeof params.projectId === 'string' && params.projectId) return { mode: 'project', projectId: params.projectId };
  if (params.intake === true) return { mode: 'list', intake: true };
  return null;
}

export function useArchitectView(): readonly [ArchitectView, (view: ArchitectView) => void] {
  const host = useAppNavigation();
  const [launch] = useState(() => launchView(consumeAppLaunchParams<ArchitectLaunchParams>('architect')));
  const [view, setView] = useState<ArchitectView>(launch ?? parseViewId(host.viewId) ?? { mode: 'list' });
  const viewRef = useRef(view);

  const navigate = useCallback((next: ArchitectView) => {
    viewRef.current = next;
    setView(next);
    host.navigate(viewId(next));
  }, [host]);

  // Host back/forward is an external source: apply it without a new history entry.
  useEffect(() => {
    const next = parseViewId(host.viewId);
    if (!next || viewId(next) === viewId(viewRef.current)) return;
    viewRef.current = next;
    setView(next);
  }, [host.viewId]);

  // A first mount gives the shell a location; a mount-time launch becomes the current entry.
  useEffect(() => {
    if (!host.viewId || launch) host.navigate(viewId(viewRef.current), { replace: true });
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A deep link can arrive while the app is already mounted.
  useEffect(() => onAppLaunchParams<ArchitectLaunchParams>('architect', (params) => {
    const next = launchView(params);
    if (next) navigate(next);
  }), [navigate]);

  return [view, navigate] as const;
}
