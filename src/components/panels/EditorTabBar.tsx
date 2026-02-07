import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface EditorTab {
  path: string;
  dirty: boolean;
}

interface Props {
  tabs: EditorTab[];
  activeTab: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onReorderTabs: (paths: string[]) => void;
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    ts: '🟦', tsx: '⚛️', js: '🟨', jsx: '⚛️',
    json: '📋', md: '📝', css: '🎨', html: '🌐',
    py: '🐍', rs: '🦀', go: '🔷', sh: '⬛',
    yml: '⚙️', yaml: '⚙️', toml: '⚙️',
  };
  return icons[ext] ?? '📄';
}

/* ── Individual sortable tab ──────────────────────────────── */

interface SortableTabProps {
  tab: EditorTab;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onMiddleClick: (e: React.MouseEvent) => void;
}

function SortableEditorTab({ tab, isActive, onSelect, onClose, onMiddleClick }: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.path });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const fileName = tab.path.split('/').pop() ?? tab.path;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`editor-tab ${isActive ? 'active' : ''}`}
      {...attributes}
      {...listeners}
      data-tab-path={tab.path}
      onClick={onSelect}
      onMouseDown={onMiddleClick}
      title={tab.path}
    >
      <span className="editor-tab-icon">{fileIcon(fileName)}</span>
      <span className="editor-tab-name">{fileName}</span>
      {tab.dirty && <span className="editor-tab-dirty">●</span>}
      <button
        className="editor-tab-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        title="Close"
      >
        ×
      </button>
    </div>
  );
}

/* ── Tab bar with overflow indicators ─────────────────────── */

export function EditorTabBar({ tabs, activeTab, onSelectTab, onCloseTab, onReorderTabs }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowLeft, setOverflowLeft] = useState(false);
  const [overflowRight, setOverflowRight] = useState(false);

  // Drag sensors — require 5px movement before dragging starts (allows clicks)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Lock drag to horizontal axis
  const restrictToHorizontal: Modifier = useCallback(({ transform }) => ({
    ...transform,
    y: 0,
  }), []);

  // ── Auto-scroll active tab into view ──
  useEffect(() => {
    if (!activeTab || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-tab-path="${globalThis.CSS.escape(activeTab)}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeTab]);

  // ── Overflow detection ──
  const updateOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setOverflowLeft(scrollLeft > 1);
    setOverflowRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateOverflow();
    el.addEventListener('scroll', updateOverflow, { passive: true });

    const ro = new ResizeObserver(updateOverflow);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', updateOverflow);
      ro.disconnect();
    };
  }, [updateOverflow, tabs.length]);

  // ── Drag end handler ──
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const paths = tabs.map((t) => t.path);
      const oldIdx = paths.indexOf(active.id as string);
      const newIdx = paths.indexOf(over.id as string);
      if (oldIdx < 0 || newIdx < 0) return;

      onReorderTabs(arrayMove(paths, oldIdx, newIdx));
    },
    [tabs, onReorderTabs],
  );

  const handleMiddleClick = useCallback(
    (e: React.MouseEvent, path: string) => {
      if (e.button === 1) {
        e.preventDefault();
        onCloseTab(path);
      }
    },
    [onCloseTab],
  );

  if (tabs.length === 0) return null;

  const tabIds = tabs.map((t) => t.path);

  return (
    <div className="editor-tab-bar">
      {overflowLeft && <div className="editor-tabs-fade editor-tabs-fade-left" />}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToHorizontal]}>
        <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
          <div ref={scrollRef} className="editor-tabs-scroll">
            {tabs.map((tab) => (
              <SortableEditorTab
                key={tab.path}
                tab={tab}
                isActive={tab.path === activeTab}
                onSelect={() => onSelectTab(tab.path)}
                onClose={() => onCloseTab(tab.path)}
                onMiddleClick={(e) => handleMiddleClick(e, tab.path)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {overflowRight && <div className="editor-tabs-fade editor-tabs-fade-right" />}
    </div>
  );
}
