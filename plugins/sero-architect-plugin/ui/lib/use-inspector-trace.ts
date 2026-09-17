import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectRecord } from '../../shared/record';
import type { ArchitectActions } from './actions';
import { appendTracePage, type TracePage } from './trace';

/** The page currently held, tagged with the view it was read for. A read for
 * a different journal or detail level replaces it; a read for the same one
 * merges onto it, so history already loaded by Load more survives a re-read. */
interface PageState {
  journalId: string;
  detail: boolean;
  page: TracePage;
}

export function useInspectorTrace(record: ProjectRecord, actions: ArchitectActions, selected: string, withDetail: boolean) {
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
        knownSpendUsd: record.budget.spentUsd,
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
  }, [record.id, record.budget.spentUsd]);

  // Reading a trace is an IPC call, so it is an external effect rather than
  // derived state: the source of truth is the runtime, not this component.
  useEffect(() => {
    void load(selected, withDetail);
  }, [load, selected, withDetail]);

  return { pageState, notice, loading, load, clear: () => setPageState(null) };
}
