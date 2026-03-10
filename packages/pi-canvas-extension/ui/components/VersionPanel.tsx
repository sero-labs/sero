/**
 * VersionPanel — shows version history for a document.
 * Allows restoring previous versions.
 */

import { memo } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import { ScrollArea } from '@sero/ui/components/ui/scroll-area';
import type { DocumentVersion } from '../../shared/types';

interface VersionPanelProps {
  versions: DocumentVersion[];
  currentContent: string;
  onRestore: (version: DocumentVersion) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const VersionPanel = memo(function VersionPanel({
  versions,
  currentContent,
  onRestore,
}: VersionPanelProps) {
  const reversed = [...versions].reverse();

  return (
    <div className="flex h-full w-56 flex-col border-l border-border/30">
      <div className="border-b border-border/20 px-3 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Version History
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {/* Current (unsaved) */}
          <div className={cn(
            'canvas-version-item px-3 py-2',
            'bg-accent/30',
          )}>
            <p className="text-xs font-medium text-foreground">Current</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground/50">
              {currentContent.length} chars
            </p>
          </div>

          {/* Saved versions */}
          {reversed.map((v) => (
            <div
              key={v.id}
              className="canvas-version-item group px-3 py-2"
            >
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-foreground/80">
                    {v.label ?? `Version ${v.id}`}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/50">
                    {formatDate(v.createdAt)} · {v.content.length} chars
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-5 text-[10px] text-muted-foreground/40 opacity-0 hover:text-foreground group-hover:opacity-100"
                  onClick={() => onRestore(v)}
                >
                  Restore
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
});
