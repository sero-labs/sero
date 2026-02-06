import React, { useCallback, useEffect, useRef, useState } from 'react';
import './CommandBar.css';

interface Props {
  onClose: () => void;
  onNewProject: () => void;
  onOpenSkills?: () => void;
  onOpenSettings?: () => void;
}

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

export function CommandBar({ onClose, onNewProject, onOpenSkills, onOpenSettings }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    {
      id: 'new-project',
      label: 'New Project',
      shortcut: '⌘N',
      action: () => { onNewProject(); onClose(); },
    },
    {
      id: 'new-terminal',
      label: 'New Terminal',
      shortcut: '⌘T',
      action: () => { /* TODO */ onClose(); },
    },
    {
      id: 'new-agent',
      label: 'New Agent Chat',
      action: () => { /* TODO */ onClose(); },
    },
    {
      id: 'toggle-preview',
      label: 'Toggle Preview',
      action: () => { /* TODO */ onClose(); },
    },
    {
      id: 'open-skills',
      label: 'Skills',
      shortcut: '⌘⇧S',
      action: () => { onOpenSkills?.(); onClose(); },
    },
    {
      id: 'open-settings',
      label: 'Settings / Environment Variables',
      shortcut: '⌘,',
      action: () => { onOpenSettings?.(); onClose(); },
    },
  ];

  const filtered = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    inputRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[selectedIndex]) {
            filtered[selectedIndex].action();
          }
          break;
      }
    },
    [filtered, selectedIndex]
  );

  return (
    <div className="command-bar-overlay" onClick={onClose}>
      <div className="command-bar" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-bar-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
        />
        <div className="command-bar-results">
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`command-bar-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={cmd.action}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="command-bar-item-label">{cmd.label}</span>
              {cmd.shortcut && (
                <span className="command-bar-item-shortcut">{cmd.shortcut}</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="command-bar-empty">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  );
}
