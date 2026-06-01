/**
 * ColorSection, collapsible group of colour pickers for a token category.
 */

import { useState } from 'react';
import { ColorPicker } from './ColorPicker';

interface ColorSectionProps {
  title: string;
  tokens: Array<{ key: string; label: string; value: string }>;
  onChange: (key: string, value: string) => void;
}

export function ColorSection({ title, tokens, onChange }: ColorSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[var(--border-subtle)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between py-2 px-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span>{title}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="flex flex-col gap-1.5 pb-3 px-1">
          {tokens.map((t) => (
            <ColorPicker
              key={t.key}
              label={t.label}
              value={t.value}
              onChange={(v) => onChange(t.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
