import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ChatToolCallMessage } from '@/types/ipc';
import { isToolLive } from '../ToolCallState';
import { ToolDetailBody } from './ToolDetailBody';
import { ToolRowHeader } from './ToolRowHeader';

/**
 * Rows layout: every tool opens where it sits, so the shape of the turn stays
 * visible while one step is read. Live tools open themselves until the user
 * says otherwise.
 */
export function ToolRows({
  tools,
  workspaceId,
  onDetailOpen,
}: {
  tools: ChatToolCallMessage[];
  workspaceId: string | null;
  /** Called when the reader opens a row, so the group stops auto-collapsing. */
  onDetailOpen?: () => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  return (
    <div className="min-w-0">
      {tools.map((tool, index) => {
        const isOpen = overrides[tool.id] ?? isToolLive(tool);

        return (
          <motion.div
            key={tool.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: index * 0.03 }}
            className={cn('border-t border-(--border-subtle)/50 first:border-t-0', isOpen && 'pb-2')}
          >
            <button
              type="button"
              onClick={() => {
                if (!isOpen) onDetailOpen?.();
                setOverrides((previous) => ({ ...previous, [tool.id]: !isOpen }));
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-150',
                'hover:bg-(--bg-elevated)/60',
                isOpen && 'bg-(--bg-elevated)/40',
              )}
            >
              <ChevronRight
                className={cn(
                  'size-3 shrink-0 text-(--text-muted) transition-transform duration-150',
                  isOpen && 'rotate-90',
                )}
              />
              <ToolRowHeader tool={tool} workspaceId={workspaceId} />
            </button>

            {isOpen ? (
              <div className="ml-4.25 border-l border-(--border-subtle) py-2 pl-3 pr-3">
                <ToolDetailBody tool={tool} workspaceId={workspaceId} />
              </div>
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}
