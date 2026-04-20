import {
  FileText,
  FolderOpen,
  Pencil,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { SubagentEntry } from '@/types/ipc';

const TOOL_ICONS: Record<string, LucideIcon> = {
  read: FileText,
  bash: Terminal,
  write: Pencil,
  edit: Pencil,
  ls: FolderOpen,
  find: Search,
  grep: Search,
  glob: Search,
};

function ToolIcon({ name }: { name: string }) {
  const Icon = TOOL_ICONS[name] ?? Wrench;
  return <Icon className="size-3" />;
}

interface CollaborationLiveActivityProps {
  entry: SubagentEntry | null;
  accentClass: string;
  borderClass: string;
}

export function CollaborationLiveActivity({
  entry,
  accentClass,
  borderClass,
}: CollaborationLiveActivityProps) {
  if (!entry) return null;

  const liveOutput = entry.liveOutput.trim();
  const preview = liveOutput.length > 700 ? `…${liveOutput.slice(-700)}` : liveOutput;
  const visibleToolActivity = entry.toolActivity.filter((item) => item.toolName);
  const currentToolActivity =
    [...visibleToolActivity].reverse().find((item) => item.running) ??
    visibleToolActivity[visibleToolActivity.length - 1] ??
    null;

  if (!preview && !currentToolActivity) return null;

  return (
    <div className="mt-2 flex w-full flex-col gap-2">
      {preview && (
        <div className={cn('overflow-hidden rounded-xl border bg-[var(--bg-base)]/70', borderClass)}>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className={cn('text-[9px] font-semibold uppercase tracking-[0.14em]', accentClass)}>
              Live output
            </span>
            <span className={cn('text-[10px] animate-pulse', accentClass)}>█</span>
          </div>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words px-3 pb-3 text-[10px] leading-relaxed text-[var(--text-secondary)]/85">
            {preview}
          </pre>
        </div>
      )}

      {currentToolActivity && (
        <div className={cn('overflow-hidden rounded-xl border bg-[var(--bg-base)]/55', borderClass)}>
          <div className="px-3 py-2">
            <span className={cn('text-[9px] font-semibold uppercase tracking-[0.14em]', accentClass)}>
              Tool activity
            </span>
          </div>
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 py-1">
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  currentToolActivity.running
                    ? 'animate-pulse bg-[var(--status-info)]'
                    : 'bg-[var(--status-success)]',
                )}
              />
              <ToolIcon name={currentToolActivity.toolName} />
              <span className="shrink-0 text-[10px] font-medium text-[var(--text-secondary)]/80">
                {currentToolActivity.toolName}
              </span>
              <span className="min-w-0 truncate text-[10px] text-[var(--text-muted)]">
                {currentToolActivity.argsSummary}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
