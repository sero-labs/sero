/**
 * useWorkFeedback — follow the bounded metadata a runtime keeps about its work.
 *
 * A list, a widget or an overview reads who is working and what call it holds
 * open, with no output text and no transcript watch. The hook subscribes to the
 * pushed updates first and reads the current snapshot second, so nothing falls
 * between the two, and it keeps the newer snapshot of each producer, so a
 * reply that lands late cannot put older work back on the screen.
 *
 * Outside the Sero shell, or on a host without runtime events, it stays empty.
 */

import { useEffect, useState } from 'react';
import { applyFeedback, type FeedbackSnapshotReply, type WorkFeedback } from '@sero-ai/common';
import { getSeroApi } from './sero-bridge';

/** One runtime's feedback topic. Another app's topic is named here in full. */
export interface WorkFeedbackSource {
  appId: string;
  workspaceId: string;
  topic: string;
}

export interface WorkFeedbackView {
  /** The session of the runtime that reported. Null until something arrives. */
  epoch: string | null;
  snapshots: ReadonlyMap<string, WorkFeedback>;
}

const EMPTY: WorkFeedbackView = { epoch: null, snapshots: new Map() };

/**
 * Folds snapshots into a view. A later epoch is a runtime that started again:
 * what the earlier one reported proves nothing now, so it is dropped.
 */
export function foldWorkFeedback(view: WorkFeedbackView, epoch: string, incoming: readonly WorkFeedback[]): WorkFeedbackView {
  if (!epoch || (view.epoch !== null && epoch < view.epoch)) return view;
  const base = view.epoch === epoch ? view.snapshots : new Map<string, WorkFeedback>();
  const snapshots = applyFeedback(base, incoming, epoch);
  return view.epoch === epoch && snapshots === view.snapshots ? view : { epoch, snapshots };
}

/**
 * `read` fetches the current snapshot. It runs again whenever `signal` changes,
 * which a caller ties to the record it already watches, so no timer is needed.
 */
export function useWorkFeedback(
  sources: readonly WorkFeedbackSource[],
  read: (() => Promise<FeedbackSnapshotReply | null>) | null,
  signal = '',
): WorkFeedbackView {
  const [view, setView] = useState<WorkFeedbackView>(EMPTY);
  const key = sources.map((source) => `${source.appId}\u0000${source.workspaceId}\u0000${source.topic}`).join('\u0001');

  useEffect(() => {
    if (!key) return;
    let bridge: ReturnType<typeof getSeroApi>['appRuntime'];
    try {
      bridge = getSeroApi().appRuntime;
    } catch {
      return;
    }
    if (!bridge) return;
    const wanted = key.split('\u0001').map((entry) => {
      const [appId, workspaceId, topic] = entry.split('\u0000');
      return { appId, workspaceId, topic };
    });
    const unsubscribe = bridge.onEvent((event) => {
      if (!wanted.some((source) => source.appId === event.appId && source.workspaceId === event.workspaceId && source.topic === event.topic)) return;
      const snapshot = event.payload as WorkFeedback | null;
      if (!snapshot?.key || !snapshot.epoch) return;
      setView((current) => foldWorkFeedback(current, snapshot.epoch, [snapshot]));
    });
    for (const source of wanted) void bridge.subscribe(source.appId, source.workspaceId, source.topic);
    return () => {
      unsubscribe();
      for (const source of wanted) void bridge.unsubscribe(source.appId, source.workspaceId, source.topic);
      setView(EMPTY);
    };
  }, [key]);

  useEffect(() => {
    if (!key || !read) return;
    let current = true;
    void read().then((reply) => {
      if (current && reply) setView((held) => foldWorkFeedback(held, reply.epoch, reply.snapshots));
    }).catch(() => undefined);
    return () => { current = false; };
  }, [key, read, signal]);

  return view;
}
