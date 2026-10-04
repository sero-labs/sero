/**
 * The child agents a session started.
 *
 * An agent that runs `subagent` calls has no live view of its own children: its
 * row shows its own text and nothing about the agents it delegated to. Children
 * are matched by `parentSessionId`, which is the parent's own session, so a row
 * lists exactly the runs that agent started and never joins one by its name.
 *
 * A run is watched only while this hook is mounted — the host sends live text
 * to windows that ask for it and to no others.
 */

import { useEffect, useState } from 'react';
import { getSeroApi, type SeroSubagentBridge, type SubagentLiveEntry, type SubagentLiveEvent } from './sero-bridge';

/** The shell's subagent bridge, or null when this host has none. */
function subagentBridge(): SeroSubagentBridge | null {
  try {
    return getSeroApi().subagent ?? null;
  } catch {
    return null;
  }
}

/**
 * Every running child of the given sessions, newest start last, keyed by the
 * parent session id.
 */
export function useChildRuns(
  workspaceId: string | null,
  parentSessionIds: readonly string[],
): Map<string, SubagentLiveEntry[]> {
  const [entries, setEntries] = useState<SubagentLiveEntry[]>([]);
  const parentKey = parentSessionIds.join('\u0000');

  // The cleanup below ends the listener and every run watch; the rule does not
  // follow the unwatch calls inside the loop over `watched`.
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    if (!workspaceId || parentKey.length === 0) return;
    const bridge = subagentBridge();
    if (!bridge) return;

    // The joined key, not the array, is what this effect reads: a caller
    // rebuilds the array every render, while the key is the same string for as
    // long as the same sessions are watched.
    const mine = new Set(parentKey.split('\u0000'));
    const watched = new Set<string>();
    let current = true;

    const keep = (entry: SubagentLiveEntry): boolean =>
      mine.has(entry.parentSessionId) && entry.status === 'running';

    const watchRun = (id: string) => {
      if (watched.has(id)) return;
      watched.add(id);
      void bridge.watch(id);
    };

    const onEvent = (event: SubagentLiveEvent) => {
      if (event.type === 'subagent_start' && event.entry) {
        const entry = event.entry;
        if (!keep(entry)) return;
        watchRun(entry.id);
        setEntries((previous) => [...previous.filter((item) => item.id !== entry.id), entry]);
        return;
      }
      if (event.type === 'subagent_end' && event.id) {
        const id = event.id;
        if (watched.delete(id)) void bridge.unwatch(id);
        setEntries((previous) => previous.filter((item) => item.id !== id));
        return;
      }
      // Live text and tool activity for one run.
      if (!event.id) return;
      setEntries((previous) => previous.map((item) => {
        if (item.id !== event.id) return item;
        return {
          ...item,
          ...(event.text === undefined ? {} : { liveOutput: event.text }),
          ...(event.activity === undefined ? {} : { toolActivity: event.activity }),
        };
      }));
    };

    const unsubscribe = bridge.onEvent(onEvent);
    // Runs that started before this view opened are still live, so the snapshot
    // is read once; everything after that arrives as an event.
    void bridge.snapshot(workspaceId).then((all) => {
      if (!current) return;
      const running = all.filter(keep);
      for (const entry of running) watchRun(entry.id);
      setEntries(running);
    });

    return () => {
      current = false;
      unsubscribe();
      for (const id of watched) void bridge.unwatch(id);
    };
  }, [workspaceId, parentKey]);

  const grouped = new Map<string, SubagentLiveEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.parentSessionId);
    if (list) list.push(entry);
    else grouped.set(entry.parentSessionId, [entry]);
  }
  return grouped;
}
