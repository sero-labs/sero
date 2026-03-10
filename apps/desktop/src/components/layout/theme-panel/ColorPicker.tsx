/**
 * ColorPicker — inline colour swatch + text input for editing a single token.
 * Clicking the swatch opens the native <input type="color"> picker.
 */

import { useCallback, useRef } from 'react';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSwatchClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value.trim();
      if (/^#[0-9a-fA-F]{3,8}$/.test(v)) {
        onChange(v);
      }
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleSwatchClick}
        className="h-6 w-6 shrink-0 rounded border border-[var(--border-default)] cursor-pointer"
        style={{ backgroundColor: value }}
        title={`Pick colour for ${label}`}
      />
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={handleInputChange}
        className="sr-only"
        tabIndex={-1}
      />
      <span className="text-xs text-[var(--text-secondary)] w-20 truncate">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={handleTextChange}
        className="flex-1 min-w-0 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] font-mono"
        spellCheck={false}
      />
    </div>
  );
}
