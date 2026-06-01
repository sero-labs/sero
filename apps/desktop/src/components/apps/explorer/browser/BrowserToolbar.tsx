import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Camera, MessageSquareQuote, RotateCw, X } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { BrowserTab } from '@/types/browser';

interface BrowserToolbarProps {
  tab: BrowserTab;
  onNavigate: (urlOrQuery: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
  onSharePage: () => void;
  onCaptureArea: () => void;
}

export function BrowserToolbar({
  tab, onNavigate, onBack, onForward, onReload, onStop, onSharePage, onCaptureArea,
}: BrowserToolbarProps) {
  // Mirror the tab URL into the input but let the user edit freely. When the
  // tab navigates elsewhere (e.g. clicking a link), the field refreshes to
  // match unless the user has focused it.
  const [draft, setDraft] = useState(tab.url);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(tab.url);
  }, [tab.url, focused]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    onNavigate(value);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setDraft(tab.url);
      (event.target as HTMLInputElement).blur();
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-2"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!tab.canGoBack}
        onClick={onBack}
        title="Back"
        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-40"
      >
        <ArrowLeft className="size-[14px]" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!tab.canGoForward}
        onClick={onForward}
        title="Forward"
        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-40"
      >
        <ArrowRight className="size-[14px]" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={tab.isLoading ? onStop : onReload}
        title={tab.isLoading ? 'Stop' : 'Reload'}
        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      >
        {tab.isLoading ? <X className="size-[14px]" /> : <RotateCw className="size-[14px]" />}
      </Button>
      <input aria-label="Address or search query"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        placeholder="Search DuckDuckGo or type a URL"
        spellCheck={false}
        autoComplete="off"
        className={cn(
          'mx-1 h-6 flex-1 rounded bg-[var(--bg-base)] px-2 text-xs',
          'border border-[var(--border-subtle)] text-[var(--text-primary)]',
          'placeholder:text-[var(--text-muted)]',
          'focus:border-[var(--border-default)] focus:outline-none',
        )}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onSharePage}
        title="Share page with chat"
        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      >
        <MessageSquareQuote className="size-[14px]" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onCaptureArea}
        title="Screenshot area to chat"
        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      >
        <Camera className="size-[14px]" />
      </Button>
    </form>
  );
}
