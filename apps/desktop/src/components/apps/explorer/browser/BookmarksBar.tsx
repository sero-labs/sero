/**
 * BookmarksBar, horizontal strip of user bookmarks below the toolbar.
 *
 * Click → navigate active tab. Middle-click or ⌘-click → open in new tab.
 * Right-click → rename / delete via context menu.
 */

import { useState, type MouseEvent } from 'react';
import { Globe, Star } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@sero-ai/ui/components/ui/dialog';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { useBrowserStore } from '@/stores/browser';
import type { BrowserBookmark } from '@/types/browser';

interface BookmarksBarProps {
  /** Workspace a new-tab bookmark should land in. */
  workspaceId: string;
  /** Called when a bookmark should replace the active tab's URL. */
  onNavigate: (url: string) => void;
}

export function BookmarksBar({ workspaceId, onNavigate }: BookmarksBarProps) {
  const bookmarks = useBrowserStore((s) => s.bookmarks);
  const createTab = useBrowserStore((s) => s.createTab);
  const removeBookmark = useBrowserStore((s) => s.removeBookmark);
  const updateBookmark = useBrowserStore((s) => s.updateBookmark);

  const [editing, setEditing] = useState<BrowserBookmark | null>(null);

  const handleBookmarkContextMenu = async (event: MouseEvent, bm: BrowserBookmark) => {
    event.preventDefault();
    event.stopPropagation();
    const action = await window.sero.browser.showBookmarkContextMenu();
    switch (action) {
      case 'open':
        onNavigate(bm.url);
        break;
      case 'open-new-tab':
        createTab(workspaceId, bm.url);
        break;
      case 'edit':
        setEditing(bm);
        break;
      case 'delete':
        removeBookmark(bm.id);
        break;
    }
  };

  if (bookmarks.length === 0) {
    return (
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 text-sm text-[var(--text-muted)]">
        <Star className="size-3" />
        <span>No bookmarks yet, press ⌘B on any page to save it here.</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 scrollbar-none">
        {bookmarks.map((bm) => (
          <button type="button"
            key={bm.id}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) createTab(workspaceId, bm.url);
              else onNavigate(bm.url);
            }}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                createTab(workspaceId, bm.url);
              }
            }}
            onContextMenu={(e) => { void handleBookmarkContextMenu(e, bm); }}
            className={cn(
              'flex h-5 shrink-0 items-center gap-1.5 rounded px-1.5 text-sm',
              'text-[var(--text-muted)] transition-colors',
              'hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
            )}
            title={`${bm.title}\n${bm.url}`}
          >
            {bm.favicon ? (
              <img src={bm.favicon} alt="" className="size-3 shrink-0 rounded-sm" />
            ) : (
              <Globe className="size-3 shrink-0 opacity-60" />
            )}
            <span className="max-w-[140px] truncate">{bm.title}</span>
          </button>
        ))}
      </div>

      {editing && (
        <EditBookmarkDialog
          bookmark={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateBookmark(editing.id, patch);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

interface EditBookmarkDialogProps {
  bookmark: BrowserBookmark;
  onClose: () => void;
  onSave: (patch: { title: string; url: string }) => void;
}

function EditBookmarkDialog({ bookmark, onClose, onSave }: EditBookmarkDialogProps) {
  const [title, setTitle] = useState(bookmark.title);
  const [url, setUrl] = useState(bookmark.url);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit bookmark</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <label htmlFor="bookmark-title-input" className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            Name
            <Input id="bookmark-title-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label htmlFor="bookmark-url-input" className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
            URL
            <Input id="bookmark-url-input" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => onSave({ title: title.trim() || bookmark.title, url: url.trim() || bookmark.url })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
