/**
 * EditorTabBar — draggable, scrollable tab strip for open editor files.
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
import { cn } from '@sero/ui/lib/utils';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator,
} from '@sero/ui/components/ui/context-menu';
import { FileIcon } from '../file-tree/file-icons';

export interface EditorTab {
  path: string;
  dirty: boolean;
}

interface Props {
  tabs: EditorTab[];
  activeTab: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCloseOtherTabs: (path: string) => void;
  onCloseAllTabs: () => void;
  onReorderTabs: (paths: string[]) => void;
  rightSlot?: React.ReactNode;
}

/* ── Single sortable tab ──────────────────────────────────── */

function SortableEditorTab({ tab, isActive, onSelect, onClose, onCloseOthers, onCloseAll, onMiddleClick }: {
  tab: EditorTab; isActive: boolean;
  onSelect: () => void; onClose: () => void;
  onCloseOthers: () => void; onCloseAll: () => void;
  onMiddleClick: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.path });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const fileName = tab.path.split('/').pop() ?? tab.path;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef} style={style}
          className={cn(
            'flex items-center gap-1 px-2.5 h-full cursor-pointer shrink-0 select-none',
            'border-r border-[var(--border-subtle)] text-xs whitespace-nowrap transition-colors',
            'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
            isActive && 'bg-[var(--bg-elevated)] text-[var(--text-primary)] relative',
          )}
          data-tab-path={tab.path}
          {...attributes} {...listeners}
          onClick={onSelect} onMouseDown={onMiddleClick} title={tab.path}
        >
          <FileIcon fileName={fileName} extension={fileName.split('.').pop()?.toLowerCase()} className="size-3.5 shrink-0 text-[var(--text-muted)]" />
          <span className={cn('font-normal', isActive && 'font-medium')}>{fileName}</span>
          {tab.dirty && <span className="text-[9px] text-[var(--accent-primary)] ml-0.5 shrink-0">●</span>}
          <button
            className={cn(
              'flex items-center justify-center size-4 border-none bg-transparent',
              'text-[var(--text-muted)] text-sm leading-none cursor-pointer rounded-sm',
              'ml-0.5 opacity-0 transition-opacity shrink-0',
              'group-hover:opacity-60 hover:!opacity-100 hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]',
              (isActive) && 'opacity-60',
            )}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Close"
          >×</button>
          {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-primary)]" />}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={onClose}>Close</ContextMenuItem>
        <ContextMenuItem onSelect={onCloseOthers}>Close Others</ContextMenuItem>
        <ContextMenuItem onSelect={onCloseAll}>Close All</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ── Tab bar ──────────────────────────────────────────────── */

export function EditorTabBar({ tabs, activeTab, onSelectTab, onCloseTab, onCloseOtherTabs, onCloseAllTabs, onReorderTabs, rightSlot }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowLeft, setOverflowLeft] = useState(false);
  const [overflowRight, setOverflowRight] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const restrictToHorizontal: Modifier = useCallback(({ transform }) => ({ ...transform, y: 0 }), []);

  useEffect(() => {
    if (!activeTab || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-tab-path="${globalThis.CSS.escape(activeTab)}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeTab]);

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
    const paths = tabs.map((t) => t.path);
    const oldIdx = paths.indexOf(active.id as string);
    const newIdx = paths.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorderTabs(arrayMove(paths, oldIdx, newIdx));
  }, [tabs, onReorderTabs]);

  const handleMiddleClick = useCallback(
    (e: React.MouseEvent, path: string) => { if (e.button === 1) { e.preventDefault(); onCloseTab(path); } },
    [onCloseTab],
  );

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-stretch h-8 bg-[var(--bg-base)] border-b border-[var(--border-subtle)] shrink-0 overflow-hidden relative">
      {overflowLeft && <div className="absolute top-0 bottom-px left-0 w-7 pointer-events-none z-10 bg-gradient-to-r from-[var(--bg-base)] to-transparent" />}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToHorizontal]}>
        <SortableContext items={tabs.map((t) => t.path)} strategy={horizontalListSortingStrategy}>
          <div className="relative min-w-0 flex-1">
            <div ref={scrollRef} className="flex h-full w-full items-stretch overflow-x-auto overflow-y-hidden scrollbar-none">
              {tabs.map((tab) => (
                <SortableEditorTab
                  key={tab.path} tab={tab} isActive={tab.path === activeTab}
                  onSelect={() => onSelectTab(tab.path)}
                  onClose={() => onCloseTab(tab.path)}
                  onCloseOthers={() => onCloseOtherTabs(tab.path)}
                  onCloseAll={onCloseAllTabs}
                  onMiddleClick={(e) => handleMiddleClick(e, tab.path)}
                />
              ))}
            </div>
            {overflowRight && <div className="absolute top-0 bottom-px right-0 w-7 pointer-events-none z-10 bg-gradient-to-l from-[var(--bg-base)] to-transparent" />}
          </div>
        </SortableContext>
      </DndContext>
      {rightSlot && (
        <div className="shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50">
          {rightSlot}
        </div>
      )}
    </div>
  );
}
