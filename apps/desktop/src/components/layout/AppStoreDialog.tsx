import { useState } from 'react';
import { Search, Store } from 'lucide-react';
import { Input } from '@sero-ai/ui/components/ui/input';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import type { AppEntry } from '@/stores/app';
import { AppStoreCard } from './AppStoreCard';

interface AppStoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps: AppEntry[];
  activeApp: string;
  isFavourite: (appId: string) => boolean;
  onToggleFavourite: (appId: string) => void;
  onActivateApp: (appId: string) => void;
}

function buildSearchText(app: AppEntry): string {
  const manifest = app.manifest;
  const plugin = manifest?.plugin;
  return [
    app.label,
    manifest?.description ?? '',
    manifest?.packageName ?? '',
    manifest?.version ?? '',
    manifest?.scope ?? '',
    plugin?.category ?? '',
    plugin?.tags?.join(' ') ?? '',
    plugin?.minSeroVersion ?? '',
    plugin ? (plugin.preBuilt ? 'pre-built' : 'source') : '',
  ]
    .join('\n')
    .toLowerCase();
}

export function AppStoreDialog({
  open,
  onOpenChange,
  apps,
  activeApp,
  isFavourite,
  onToggleFavourite,
  onActivateApp,
}: AppStoreDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.trim().toLowerCase();
  const filteredApps = apps
    .filter((app) => {
      if (!query) return true;
      return buildSearchText(app).includes(query);
    })
    .slice()
    .sort((a, b) => {
      const favDelta = Number(isFavourite(b.id)) - Number(isFavourite(a.id));
      if (favDelta !== 0) return favDelta;
      return a.label.localeCompare(b.label);
    });

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) setSearchQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[min(82vh,44rem)] max-w-5xl flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-[var(--border-default)] px-4 py-3 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Store className="size-4" />
            App Store
          </DialogTitle>
          <DialogDescription>
            Browse installed Sero apps and choose which ones appear in the sidebar.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-[var(--border-default)] px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              autoFocus
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search apps…"
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4">
            {apps.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border-default)] p-6 text-center">
                <p className="text-sm text-[var(--text-secondary)]">No discovered apps yet.</p>
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border-default)] p-6 text-center">
                <p className="text-sm text-[var(--text-secondary)]">No apps match “{searchQuery}”.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {filteredApps.map((app) => (
                  <AppStoreCard
                    key={app.id}
                    entry={app}
                    active={activeApp === app.id}
                    favourite={isFavourite(app.id)}
                    onToggleFavourite={() => onToggleFavourite(app.id)}
                    onActivate={() => {
                      onActivateApp(app.id);
                      handleOpenChange(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
