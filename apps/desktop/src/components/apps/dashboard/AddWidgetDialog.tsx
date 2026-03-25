/**
 * AddWidgetDialog — picker for adding widgets to the dashboard.
 *
 * Shows all available widgets grouped by app, with a search filter.
 * Clicking a widget adds it to the dashboard grid.
 */

import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sero-ai/ui/components/ui/dialog';
import type { AvailableWidget } from '@/types/dashboard';
import { getAppIcon } from '@/lib/app-icons';
import { useDashboardStore } from '@/stores/dashboard';

interface AddWidgetDialogProps {
  availableWidgets: AvailableWidget[];
}

export function AddWidgetDialog({ availableWidgets }: AddWidgetDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const addWidget = useDashboardStore((s) => s.addWidget);

  const filtered = useMemo(() => {
    if (!search.trim()) return availableWidgets;
    const q = search.toLowerCase();
    return availableWidgets.filter(
      (w) =>
        w.manifest.name.toLowerCase().includes(q) ||
        w.appName.toLowerCase().includes(q) ||
        w.manifest.description?.toLowerCase().includes(q),
    );
  }, [availableWidgets, search]);

  // Group by app
  const grouped = useMemo(() => {
    const map = new Map<string, AvailableWidget[]>();
    for (const w of filtered) {
      const group = map.get(w.appId) ?? [];
      group.push(w);
      map.set(w.appId, group);
    }
    return map;
  }, [filtered]);

  const handleAdd = (widget: AvailableWidget) => {
    addWidget(widget);
    setOpen(false);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-1.5">
          <Plus className="size-3.5" />
          Add Widget
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Search widgets..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          className="mb-3"
          autoFocus
        />

        <div className="max-h-80 space-y-4 overflow-y-auto">
          {grouped.size === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              {availableWidgets.length === 0
                ? 'No apps have registered widgets yet.'
                : 'No widgets match your search.'}
            </p>
          )}

          {Array.from(grouped.entries()).map(([appId, widgets]) => {
            const first = widgets[0];
            const Icon = getAppIcon(first.appIcon);
            return (
              <div key={appId}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Icon className="size-3.5 text-[var(--text-muted)]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {first.appName}
                  </span>
                </div>
                <div className="space-y-1">
                  {widgets.map((w) => (
                    <button
                      key={`${w.appId}:${w.manifest.id}`}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--bg-elevated)]"
                      onClick={() => handleAdd(w)}
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {w.manifest.name}
                        </div>
                        {w.manifest.description && (
                          <div className="text-xs text-[var(--text-muted)]">
                            {w.manifest.description}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-[var(--text-muted)]">
                        {w.manifest.defaultSize.w}x{w.manifest.defaultSize.h}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
