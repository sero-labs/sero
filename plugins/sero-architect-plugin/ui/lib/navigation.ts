/**
 * Two views: the projects list and one project page. The host keeps the
 * sub-view in its history, so back and forward work, and a launch from the
 * widget or a deep link lands on the right page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { consumeAppLaunchParams, onAppLaunchParams, useAppNavigation } from '@sero-ai/app-runtime';

export const WORK_TABS = ['plan', 'research', 'evidence'] as const;
export type WorkTab = (typeof WORK_TABS)[number];

export type ArchitectView =
  | { mode: 'list'; intake?: boolean }
  | { mode: 'project'; projectId: string }
  /** The work behind the overview, optionally on one milestone's evidence. */
  | { mode: 'work'; projectId: string; tab: WorkTab; focusMilestoneId?: string }
  /** The project's History, opened from the project controls menu. */
  | { mode: 'history'; projectId: string }
  /** Project model defaults, opened from the project controls menu. */
  | { mode: 'models'; projectId: string }
  /** The run inspector, opened from the project controls menu. */
  | { mode: 'inspector'; projectId: string };

interface ArchitectLaunchParams extends Record<string, unknown> {
  projectId?: string;
  intake?: boolean;
}

export function viewId(view: ArchitectView): string {
  if (view.mode === 'project') return `projects/${view.projectId}`;
  if (view.mode === 'work') return `projects/${view.projectId}/work/${view.tab}${view.focusMilestoneId ? `/${view.focusMilestoneId}` : ''}`;
  if (view.mode === 'history') return `projects/${view.projectId}/history`;
  if (view.mode === 'models') return `projects/${view.projectId}/models`;
  if (view.mode === 'inspector') return `projects/${view.projectId}/inspector`;
  return view.intake ? 'projects/new' : 'projects';
}

export function parseViewId(id: string | undefined): ArchitectView | null {
  if (!id) return null;
  const [section, rest, sub, focus, extra] = id.split('/');
  if (section !== 'projects') return null;
  if (!rest) return { mode: 'list' };
  if (rest === 'new') return { mode: 'list', intake: true };
  if (sub === 'history') return { mode: 'history', projectId: rest };
  if (sub === 'models') return { mode: 'models', projectId: rest };
  if (sub === 'inspector') return { mode: 'inspector', projectId: rest };
  if (sub === 'work') {
    // Live work is on the project board now, so an old link to it opens the board.
    if (focus === 'live') return { mode: 'project', projectId: rest };
    const tab = WORK_TABS.find((item) => item === focus) ?? 'plan';
    return { mode: 'work', projectId: rest, tab, ...(tab === 'evidence' && extra ? { focusMilestoneId: extra } : {}) };
  }
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
  // A launch param outranks the view the host remembers, until the mount effect below publishes it.
  const initialLaunch = useRef<ArchitectView | null>(launch);

  const navigate = useCallback((next: ArchitectView) => {
    viewRef.current = next;
    setView(next);
    host.navigate(viewId(next));
  }, [host]);

  // Host back/forward is an external source: apply it without a new history entry.
  useEffect(() => {
    if (initialLaunch.current) return;
    const next = parseViewId(host.viewId);
    if (!next || viewId(next) === viewId(viewRef.current)) return;
    viewRef.current = next;
    setView(next);
  }, [host.viewId]);

  // A first mount gives the shell a location; a mount-time launch becomes the current entry.
  useEffect(() => {
    if (initialLaunch.current) {
      host.navigate(viewId(initialLaunch.current), { replace: true });
      initialLaunch.current = null;
      return;
    }
    if (!host.viewId) host.navigate(viewId(viewRef.current), { replace: true });
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
