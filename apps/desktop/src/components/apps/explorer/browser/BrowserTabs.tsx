/**
 * BrowserTabs — draggable, scrollable tab strip for the in-app browser.
 * Mirrors the EditorTabBar style (dnd-kit reorder, context menu, overflow
 * fades) so Browser and Editor feel like the same tabbed surface.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Globe, Plus } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import {
  useActiveBrowserTabId,
  useBrowserStore,
  useWorkspaceBrowserTabs,
} from '@/stores/browser';
import type { BrowserTab } from '@/types/browser';

/* ── Single sortable tab ──────────────────────────────────── */

interface SortableBrowserTabProps {
  tab: BrowserTab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  onBookmark: () => void;
  onCopyUrl: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function SortableBrowserTab({
  tab, isActive, onSelect, onClose, onCloseOthers, onCloseAll,
  onBookmark, onCopyUrl, onMouseDown, onContextMenu,
}: SortableBrowserTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const label = tab.isLoading && !tab.title ? 'Loading…' : (tab.title || tab.url);

  return (
    <div
      ref={setNodeRef} style={style}
      className={cn(
        'group flex items-center gap-1.5 px-2.5 h-full cursor-pointer shrink-0 select-none',
        'border-r border-[var(--border-subtle)] text-xs whitespace-nowrap transition-colors',
        'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
        isActive && 'bg-[var(--bg-elevated)] text-[var(--text-primary)] relative',
      )}
      data-tab-id={tab.id}
      {...attributes} {...listeners}
      onClick={onSelect}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      title={tab.title ? `${tab.title}\n${tab.url}` : tab.url}
    >
      {tab.favicon ? (
        <img src={tab.favicon} alt="" className="size-3.5 shrink-0 rounded-sm" />
      ) : (
        <Globe className="size-3.5 shrink-0 text-[var(--text-muted)] opacity-60" />
      )}
      <span className={cn('font-normal max-w-[180px] truncate', isActive && 'font-medium')}>
        {label}
      </span>
      {tab.isLoading && (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full border border-[var(--text-muted)] border-t-transparent animate-spin"
        />
      )}
      <button type="button"
        className={cn(
          'flex items-center justify-center size-4 border-none bg-transparent',
          'text-[var(--text-muted)] text-sm leading-none cursor-pointer rounded-sm',
          'ml-0.5 opacity-0 transition-opacity shrink-0',
          'group-hover:opacity-60 hover:!opacity-100 hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]',
          isActive && 'opacity-60',
        )}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        onMouseDown={(e) => e.stopPropagation()}
        title="Close"
      >×</button>
      {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-primary)]" />}
    </div>
  );
}

/* ── Tab bar ──────────────────────────────────────────────── */

interface BrowserTabsProps {
  workspaceId: string;
}

export function BrowserTabs({ workspaceId }: BrowserTabsProps) {
  const tabs = useWorkspaceBrowserTabs(workspaceId);
  const activeTabId = useActiveBrowserTabId(workspaceId);
  const setActive = useBrowserStore((s) => s.setActive);
  const closeTab = useBrowserStore((s) => s.closeTab);
  const closeOtherTabs = useBrowserStore((s) => s.closeOtherTabs);
  const closeAllTabs = useBrowserStore((s) => s.closeAllTabs);
  const createTab = useBrowserStore((s) => s.createTab);
  const reorderTabs = useBrowserStore((s) => s.reorderTabs);
  const addBookmark = useBrowserStore((s) => s.addBookmark);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowLeft, setOverflowLeft] = useState(false);
  const [overflowRight, setOverflowRight] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const restrictToHorizontal: Modifier = useCallback(({ transform }) => ({ ...transform, y: 0 }), []);

  // Auto-scroll the active tab into view when it changes.
  useEffect(() => {
    if (!activeTabId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(
      `[data-tab-id="${globalThis.CSS.escape(activeTabId)}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  const updateOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setOverflowLeft(el.scrollLeft > 1);
    setOverflowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateOverflow();
    el.addEventListener('scroll', updateOverflow, { passive: true });
    const ro = new ResizeObserver(updateOverflow);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateOverflow); ro.disconnect(); };
  }, [updateOverflow, tabs.length]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = tabs.map((t) => t.id);
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;
    reorderTabs(workspaceId, arrayMove(ids, oldIdx, newIdx));
  }, [tabs, reorderTabs, workspaceId]);

  const handleTabContextMenu = useCallback(
    async (event: React.MouseEvent, tab: BrowserTab) => {
      event.preventDefault();
      event.stopPropagation();
      const action = await window.sero.browser.showTabContextMenu(tab.id, workspaceId);
      switch (action) {
        case 'bookmark':
          addBookmark({ title: tab.title || tab.url, url: tab.url, favicon: tab.favicon });
          break;
        case 'copy-url':
          await window.sero.clipboard.writeText(tab.url);
          break;
        case 'close':
          closeTab(tab.id);
          break;
        case 'close-others':
          closeOtherTabs(tab.id);
          break;
        case 'close-all':
          closeAllTabs(workspaceId);
          break;
      }
    },
    [addBookmark, closeAllTabs, closeOtherTabs, closeTab, workspaceId],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      // Middle-click closes the tab (universal browser convention).
      if (e.button === 1) {
        e.preventDefault();
        closeTab(id);
      }
    },
    [closeTab],
  );

  return (
    <div className="flex items-stretch h-8 bg-[var(--bg-base)] border-b border-[var(--border-subtle)] shrink-0 overflow-hidden relative">
      {overflowLeft && (
        <div className="absolute top-0 bottom-px left-0 w-7 pointer-events-none z-10 bg-gradient-to-r from-[var(--bg-base)] to-transparent" />
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToHorizontal]}
      >
        <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
          <div className="relative min-w-0 flex-1">
            <div
              ref={scrollRef}
              className="flex h-full w-full items-stretch overflow-x-auto overflow-y-hidden scrollbar-none"
            >
              {tabs.map((tab) => (
                <SortableBrowserTab
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  onSelect={() => setActive(tab.id)}
                  onClose={() => closeTab(tab.id)}
                  onCloseOthers={() => closeOtherTabs(tab.id)}
                  onCloseAll={() => closeAllTabs(workspaceId)}
                  onBookmark={() =>
                    addBookmark({ title: tab.title || tab.url, url: tab.url, favicon: tab.favicon })
                  }
                  onCopyUrl={() => {
                    void window.sero.clipboard.writeText(tab.url);
                  }}
                  onMouseDown={(e) => handleMouseDown(e, tab.id)}
                  onContextMenu={(e) => { void handleTabContextMenu(e, tab); }}
                />
              ))}
            </div>
            {overflowRight && (
              <div className="absolute top-0 bottom-px right-0 w-7 pointer-events-none z-10 bg-gradient-to-l from-[var(--bg-base)] to-transparent" />
            )}
          </div>
        </SortableContext>
      </DndContext>
      <button type="button"
        onClick={() => createTab(workspaceId)}
        className={cn(
          'flex h-full shrink-0 items-center border-l border-[var(--border-subtle)] px-2.5',
          'text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
        )}
        title="New tab (⌘T)"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
