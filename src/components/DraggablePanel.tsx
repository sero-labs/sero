import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import './DraggablePanel.css';

interface Props {
  panelId: string;
  icon: string;
  title: string;
  isDragging: boolean;
  isDropTarget: boolean;
  children: React.ReactNode;
}

export function DraggablePanel({
  panelId,
  icon,
  title,
  isDragging,
  isDropTarget,
  children,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
  } = useDraggable({ id: panelId });

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: panelId });

  const showDropIndicator = isDropTarget || isOver;

  return (
    <div
      ref={setDropRef}
      className={`draggable-panel ${isDragging ? 'dragging' : ''} ${showDropIndicator ? 'drop-target' : ''}`}
    >
      {/* Toolbar — the drag handle */}
      <div
        ref={setDragRef}
        className="panel-toolbar"
        {...attributes}
        {...listeners}
      >
        <span className="panel-toolbar-icon">{icon}</span>
        <span className="panel-toolbar-title">{title}</span>
        <span className="panel-toolbar-drag-hint">⠿</span>
      </div>

      {/* Drop indicator overlay */}
      {showDropIndicator && (
        <div className="drop-indicator">
          <div className="drop-indicator-label">Drop to swap</div>
        </div>
      )}

      {/* Panel content */}
      <div className="panel-body">
        {children}
      </div>
    </div>
  );
}
