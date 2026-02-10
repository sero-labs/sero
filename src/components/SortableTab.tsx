import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { XIcon, LoaderIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './ui/input';

interface Props {
  id: string;
  isActive: boolean;
  isStopping: boolean;
  statusColor: string;
  name: string;
  onSelect: () => void;
  onClose: () => void;
  onRename: (newName: string) => void;
}

export function SortableTab({ id, isActive, isStopping, statusColor, name, onSelect, onClose, onRename }: Props) {
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
    if (trimmed && trimmed !== name) onRename(trimmed);
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
      className={cn(
        'group relative flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium select-none transition-colors whitespace-nowrap outline-none',
        isStopping
          ? 'opacity-50 pointer-events-none'
          : 'cursor-pointer',
        isActive
          ? 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
      )}
      {...attributes}
      {...listeners}
      role="tab"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(e) => e.key === 'Enter' && !editing && onSelect()}
    >
      {/* Status dot */}
      <span
        className="size-1.5 rounded-full shrink-0"
        style={{ backgroundColor: statusColor }}
      />

      {/* Name or rename input */}
      {editing ? (
        <Input
          ref={inputRef}
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
          className="h-5 text-xs px-1 py-0 w-24 border-ring"
        />
      ) : (
        <span className="max-w-[120px] overflow-hidden text-ellipsis">{name}</span>
      )}

      {/* Close button / stopping spinner */}
      {isStopping ? (
        <LoaderIcon className="size-3 animate-spin text-muted-foreground" />
      ) : (
        <button
          className={cn(
            'flex items-center justify-center size-4 rounded-sm transition-opacity',
            'opacity-0 group-hover:opacity-100',
            'hover:bg-muted text-muted-foreground hover:text-foreground',
          )}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <XIcon className="size-3" />
        </button>
      )}

      {/* Active indicator line */}
      {isActive && (
        <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
      )}
    </div>
  );
}
