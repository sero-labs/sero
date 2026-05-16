/**
 * ScratchpadBadge — StatusBar chip + popover listing open scratchpad items.
 *
 * Lives in the memory plugin so the host shell stays decoupled from the
 * memory schema. The host wires `window.sero.memory.scratchpad.{list,onChanged}`
 * via the preload bridge; this component renders the data.
 *
 * Behaviour:
 *  - Hidden when there are zero open items (no badge clutter on empty).
 *  - Refreshes on mount and on every `scratchpadChanged` event pushed
 *    from the main process (filesystem watch on SCRATCHPAD.md).
 *  - Read-only: mutations go through the agent's `scratchpad` tool.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { Pin } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';

interface ScratchpadItem {
  text: string;
}

interface ScratchpadSnapshot {
  path: string;
  openCount: number;
  openItems: ScratchpadItem[];
}

interface MemoryBridge {
  scratchpad: {
    list: () => Promise<ScratchpadSnapshot>;
    onChanged: (cb: () => void) => () => void;
  };
}

const EMPTY: ScratchpadSnapshot = { path: '', openCount: 0, openItems: [] };

/** Access the host's memory bridge without augmenting its global Window type. */
function getMemoryBridge(): MemoryBridge | undefined {
  return (globalThis as { sero?: { memory?: MemoryBridge } }).sero?.memory
    ?? (typeof window !== 'undefined'
      ? (window as unknown as { sero?: { memory?: MemoryBridge } }).sero?.memory
      : undefined);
}

export const ScratchpadBadge = memo(function ScratchpadBadge() {
  const [snapshot, setSnapshot] = useState<ScratchpadSnapshot>(EMPTY);

  const refresh = useCallback(async () => {
    const bridge = getMemoryBridge();
    if (!bridge) return;
    try {
      setSnapshot(await bridge.scratchpad.list());
    } catch {
      setSnapshot(EMPTY);
    }
  }, []);

  useEffect(() => {
    const bridge = getMemoryBridge();
    if (!bridge) return;
    refresh();
    return bridge.scratchpad.onChanged(refresh);
  }, [refresh]);

  if (snapshot.openCount === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          title={`${snapshot.openCount} open scratchpad item${snapshot.openCount === 1 ? '' : 's'}`}
        >
          <Pin className="size-3" />
          <span>{snapshot.openCount}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-80 p-0"
        sideOffset={8}
      >
        <div className="border-b border-[var(--border-default)] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Pin className="size-3.5 text-[var(--text-muted)]" />
            <span className="text-xs font-medium text-[var(--text-primary)]">
              Scratchpad
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">
              ({snapshot.openCount} open)
            </span>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {snapshot.openItems.map((item, idx) => (
            <div
              key={`${idx}-${item.text}`}
              className="rounded-md px-2 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <span className="mr-2 text-[var(--text-muted)]">[ ]</span>
              {item.text}
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border-default)] px-3 py-2 text-[10px] text-[var(--text-muted)]">
          Mark done via <code className="rounded bg-[var(--bg-elevated)] px-1 py-px">/scratchpad done &lt;text&gt;</code> in chat. Done items auto-evict at session end.
        </div>
      </PopoverContent>
    </Popover>
  );
});
