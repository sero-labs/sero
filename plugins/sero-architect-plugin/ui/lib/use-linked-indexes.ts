import { useEffect, useState } from 'react';
import { getSeroApi } from '@sero-ai/app-runtime';
import { ORCHESTRATOR_INDEX_FILE, ORCHESTRATOR_ROOM_INDEX_FILE, type OrchestratorBoardIndexView, type OrchestratorBoardRoomIndexView } from '@sero-ai/common';

/** The exact indexes used by profile attention, watched only while this board is open. */
export function useLinkedIndexes(folder: string) {
  const [view, setView] = useState<{ folder: string; loops: OrchestratorBoardIndexView['loops']; rooms: OrchestratorBoardRoomIndexView['rooms'] }>({ folder, loops: [], rooms: [] });
  useEffect(() => {
    const paths = [`${folder}/${ORCHESTRATOR_INDEX_FILE}`, `${folder}/${ORCHESTRATOR_ROOM_INDEX_FILE}`];
    let active = true;
    let api;
    try { api = getSeroApi().appState; } catch { return; }
    if (!api?.watch) return;
    const revisions = new Map<string, number>();
    const apply = (file: string, data: unknown) => {
      if (!active || !data || typeof data !== 'object') return;
      if (file === paths[0] && 'loops' in data && Array.isArray(data.loops)) setView((current) => ({ folder, rooms: current.folder === folder ? current.rooms : [], loops: (data as OrchestratorBoardIndexView).loops }));
      if (file === paths[1] && 'rooms' in data && Array.isArray(data.rooms)) setView((current) => ({ folder, loops: current.folder === folder ? current.loops : [], rooms: (data as OrchestratorBoardRoomIndexView).rooms }));
    };
    const off = api.onChange((file, data) => { if (paths.includes(file)) { revisions.set(file, (revisions.get(file) ?? 0) + 1); apply(file, data); } });
    for (const file of paths) void api.watch(file).then(({ data }) => { if (!revisions.has(file)) apply(file, data); }).catch(() => undefined);
    return () => { active = false; off(); for (const file of paths) void api.unwatch(file); };
  }, [folder]);
  return view.folder === folder ? view : { folder, loops: [], rooms: [] };
}
