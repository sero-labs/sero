import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectRecord } from '../../shared/record';
import type { ArchitectActions } from './actions';
import { appendTracePage, type LifetimeView, type TracePage } from './trace';

/** The Scope value for project-lifetime totals. Never a run id. */
export const LIFETIME = 'lifetime';

/** The page currently held, tagged with the view it was read for. A read for
 * a different journal or detail level replaces it; a read for the same one
 * merges onto it, so history already loaded by Load more survives a re-read. */
interface PageState {
  journalId: string;
  detail: boolean;
  page: TracePage;
}

/**
 * Reads the selected run: its summary, its activity tree and the first page of
 * charges, all on open. `knownSpendUsd` is what a live view reacts to: the
 * project record is pushed when spend changes, and a new value re-reads the
 * run. A paused view passes the value it paused at, so nothing is re-read
 * until it resumes.
 */
export function useInspectorTrace(record: ProjectRecord, actions: ArchitectActions, selected: string, knownSpendUsd: number) {
  const [pageState, setPageState] = useState<PageState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // A read that has been superseded, or one that arrives after this view is
  // gone, must never commit: it would show a page nobody asked to see any
  // more. The generation counter marks each read's place in line, and the
  // mounted flag survives past unmount without needing a render.
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // A preference write recreates `actions` (it flows through the app context),
  // and `load` reading it directly would recreate itself on every such write
  // and re-fire its effect. The ref always holds the latest actions without
  // making `load` depend on them.
  const actionsRef = useRef(actions);
  useEffect(() => { actionsRef.current = actions; }, [actions]);

  const load = useCallback(async (journalId: string, detail: boolean, afterSeq?: number) => {
    const gen = ++generation.current;
    setLoading(true);
    setNotice(null);
    try {
      const outcome = await actionsRef.current.trace(record.id, {
        runId: journalId,
        detail,
        knownSpendUsd,
        ...(afterSeq === undefined ? {} : { afterSeq }),
      });
      // A later load already started while this one was in flight, or the
      // view is gone: either way, this answer is not for the page shown now.
      if (gen !== generation.current || !mounted.current) return;
      if (!outcome.ok) {
        setNotice(outcome.text);
        return;
      }
      const fresh = outcome.page;
      if (!fresh) {
        setPageState(null);
        return;
      }
      setPageState((current) => {
        // The same view as what is already held: merge onto it, whether this
        // is a Load more continuation or a plain re-read of page one, so
        // history already loaded survives. Its summary, timing and tokens
        // still come from this fresh answer. A different journal or detail
        // level is a different view, and replaces rather than merges.
        const sameView = current !== null && current.journalId === journalId && current.detail === detail;
        return { journalId, detail, page: sameView ? appendTracePage(current.page, fresh) : fresh };
      });
    } finally {
      if (gen === generation.current && mounted.current) setLoading(false);
    }
  }, [record.id, knownSpendUsd]);

  // Reading a trace is an IPC call, so it is an external effect rather than
  // derived state: the source of truth is the runtime, not this component.
  useEffect(() => {
    if (selected === LIFETIME) return;
    void load(selected, true);
  }, [load, selected]);

  return { pageState, notice, loading, load, clear: () => setPageState(null) };
}

/** Reads project-lifetime totals while that scope is selected. */
export function useLifetime(record: ProjectRecord, actions: ArchitectActions, selected: string, knownSpendUsd: number): LifetimeView | null {
  const [lifetime, setLifetime] = useState<{ key: string; view: LifetimeView | null } | null>(null);
  const actionsRef = useRef(actions);
  useEffect(() => { actionsRef.current = actions; }, [actions]);
  const key = `${record.id}:${knownSpendUsd}`;
  // An IPC read, like the run read above; the latest answer for this key wins.
  useEffect(() => {
    if (selected !== LIFETIME) return;
    let current = true;
    void actionsRef.current.lifetime(record.id, knownSpendUsd).then((outcome) => {
      if (current) setLifetime({ key, view: outcome.lifetime });
    });
    return () => { current = false; };
  }, [record.id, knownSpendUsd, selected, key]);
  return selected === LIFETIME ? lifetime?.view ?? null : null;
}
