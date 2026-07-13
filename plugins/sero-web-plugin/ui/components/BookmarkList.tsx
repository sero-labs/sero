// components/BookmarkList.tsx, Bookmark list with add form and delete.

import { useState, useCallback } from 'react';
import { useAppInfo, useAppState, useAgentPrompt } from '@sero-ai/app-runtime';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import {
  Bookmark as BookmarkIcon, Plus, Trash2, Tag, ArrowRight, ExternalLink,
} from 'lucide-react';
import type { WebAccessState, Bookmark } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
import { relativeTime } from '../lib/format';
import {
  addBookmark as addBookmarkAction,
  removeBookmark as removeBookmarkAction,
} from '../lib/web-actions';

export function BookmarkList() {
  const { workspaceId } = useAppInfo();
  const [state] = useAppState<WebAccessState>(DEFAULT_STATE);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');

  const addDirectly = useCallback(async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
    await addBookmarkAction(workspaceId, {
      action: 'add-bookmark',
      url: trimmedUrl,
      title: title.trim() || trimmedUrl,
      tags: tagList,
    });
    setUrl('');
    setTitle('');
    setTags('');
    setShowAdd(false);
  }, [url, title, tags, workspaceId]);

  const removeBookmark = useCallback(
    async (id: string) => {
      await removeBookmarkAction(workspaceId, id);
    },
    [workspaceId],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Add button / form */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        {!showAdd ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="size-3.5" />
            Add bookmark
          </Button>
        ) : (
          <AddBookmarkForm
            url={url}
            title={title}
            tags={tags}
            onUrlChange={setUrl}
            onTitleChange={setTitle}
            onTagsChange={setTags}
            onSubmit={addDirectly}
            onCancel={() => setShowAdd(false)}
          />
        )}
      </div>

      {/* Bookmark list */}
      {(state.bookmarks?.length ?? 0) === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16">
          <BookmarkIcon className="mb-2 size-5 text-muted-foreground/40" />
          <p className="text-base text-muted-foreground">No bookmarks yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Save URLs here or ask the agent to bookmark a page
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {(state.bookmarks ?? []).map((bm) => (
              <BookmarkRow key={bm.id} bookmark={bm} onRemove={removeBookmark} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── Add form ────────────────────────────────────────────────

interface AddBookmarkFormProps {
  url: string;
  title: string;
  tags: string;
  onUrlChange: (v: string) => void;
  onTitleChange: (v: string) => void;
  onTagsChange: (v: string) => void;
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
}

function AddBookmarkForm(props: AddBookmarkFormProps) {
  const inputClass =
    'w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';

  return (
    <form onSubmit={(e) => { e.preventDefault(); void props.onSubmit(); }} className="flex flex-col gap-2">
      <input aria-label="Bookmark URL" type="text" value={props.url} onChange={(e) => props.onUrlChange(e.target.value)}
        placeholder="URL…" autoFocus className={inputClass} />
      <input aria-label="Bookmark title" type="text" value={props.title} onChange={(e) => props.onTitleChange(e.target.value)}
        placeholder="Title (optional)…" className={inputClass} />
      <input aria-label="Bookmark tags" type="text" value={props.tags} onChange={(e) => props.onTagsChange(e.target.value)}
        placeholder="Tags (comma-separated)…" className={inputClass} />
      <div className="flex gap-2">
        <Button size="sm" disabled={!props.url.trim()} className="flex-1">Save</Button>
        <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ── Individual bookmark row ─────────────────────────────────

interface BookmarkRowProps {
  bookmark: Bookmark;
  onRemove: (id: string) => Promise<void>;
}

function BookmarkRow({ bookmark, onRemove }: BookmarkRowProps) {
  const prompt = useAgentPrompt();

  const fetchPage = useCallback(() => {
    prompt(`Fetch and summarise the content at: ${bookmark.url}`);
  }, [bookmark.url, prompt]);

  return (
    <div className="group flex items-start gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-secondary/50 animate-web-fade-in">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
        <BookmarkIcon className="size-3.5 text-emerald-400" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Title, full, wrapping */}
        <span className="text-base font-medium text-foreground leading-snug break-words">
          {bookmark.title}
        </span>

        {/* URL row: open in browser + fetch via agent */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group/link flex items-center gap-1 text-sm text-emerald-400/70 hover:text-emerald-400 transition-colors"
            title="Open in browser"
          >
            <ExternalLink className="size-2.5 shrink-0" />
            <span className="break-all">{bookmark.url}</span>
          </a>
          <button
            type="button"
            onClick={fetchPage}
            className="flex items-center gap-1 text-sm text-muted-foreground/50 hover:text-primary transition-colors"
            title="Fetch and summarise via agent"
          >
            <ArrowRight className="size-2.5" />
            Fetch
          </button>
        </div>

        {/* Timestamp */}
        <span className="text-sm text-muted-foreground/40">
          {relativeTime(bookmark.createdAt)}
        </span>

        {bookmark.description && (
          <p className="text-sm leading-relaxed text-muted-foreground/70">
            {bookmark.description}
          </p>
        )}

        {bookmark.tags.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {bookmark.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="px-1.5 py-0 text-sm leading-4 border-emerald-500/20 text-emerald-400/70 bg-emerald-500/5"
              >
                <Tag className="mr-0.5 size-2" />
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground/30 opacity-0 hover:text-destructive group-hover:opacity-100 transition-all"
        onClick={() => { void onRemove(bookmark.id); }}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}

export default BookmarkList;
