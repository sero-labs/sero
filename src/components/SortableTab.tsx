import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  id: string;
  isActive: boolean;
  statusColor: string;
  name: string;
  onSelect: () => void;
  onClose: () => void;
  onRename: (newName: string) => void;
}

export function SortableTab({ id, isActive, statusColor, name, onSelect, onClose, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) {
      onRename(trimmed);
    }
    setEditing(false);
  }, [editValue, name, onRename]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditValue(name);
    setEditing(true);
  }, [name]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`shell-tab ${isActive ? 'active' : ''}`}
      {...attributes}
      {...listeners}
      role="tab"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(e) => e.key === 'Enter' && !editing && onSelect()}
    >
      <span className="shell-tab-dot" style={{ backgroundColor: statusColor }} />
      {editing ? (
        <input
          ref={inputRef}
          className="shell-tab-rename-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          maxLength={40}
        />
      ) : (
        <span className="shell-tab-name">{name}</span>
      )}
      <button
        className="shell-tab-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
    </div>
  );
}
