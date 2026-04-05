/**
 * SubagentList — scrollable list of subagent run cards.
 *
 * Running entries appear at top, completed/failed below.
 */

import type { SubagentEntry } from '@/types/ipc';
import { SubagentCard } from './SubagentCard';

interface SubagentListProps {
  entries: SubagentEntry[];
}

export function SubagentList({ entries }: SubagentListProps) {
  return (
    <div className="flex flex-col gap-1 p-2">
      {entries.map((entry) => (
        <SubagentCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
