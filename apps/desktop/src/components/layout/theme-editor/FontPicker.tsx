/**
 * FontPicker — dropdown with common font stacks plus a custom text input.
 * Used for --font-sans and --font-mono in the theme editor.
 */

import { useState, useCallback } from 'react';
import { loadGoogleFont, preloadAllGoogleFonts } from '@/lib/google-fonts';

interface FontPickerProps {
  label: string;
  value: string;
  presets: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}

// Preload all Google Fonts once so previews render immediately.
let _fontsPreloaded = false;

export function FontPicker({ label, value, presets, onChange }: FontPickerProps) {
  if (!_fontsPreloaded) {
    _fontsPreloaded = true;
    preloadAllGoogleFonts();
  }

  const isCustom = !presets.some((p) => p.value === value);
  const [showCustom, setShowCustom] = useState(isCustom);

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      if (v === '__custom__') {
        setShowCustom(true);
      } else {
        setShowCustom(false);
        loadGoogleFont(v);
        onChange(v);
      }
    },
    [onChange],
  );

  const handleCustomInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  // Resolve which select option is active
  const selectValue = showCustom ? '__custom__' : value;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      <select
        value={selectValue}
        onChange={handleSelect}
        className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
      >
        {presets.map((p) => (
          <option key={p.label} value={p.value}>
            {p.label}
          </option>
        ))}
        <option value="__custom__">Custom…</option>
      </select>
      {showCustom && (
        <input
          type="text"
          value={value}
          onChange={handleCustomInput}
          placeholder="e.g. 'Inter', system-ui, sans-serif"
          spellCheck={false}
          className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] font-mono outline-none focus:border-[var(--border-focus)]"
        />
      )}
      {/* Live preview of the font */}
      <p
        className="rounded bg-[var(--bg-base)] border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-[var(--text-secondary)] leading-relaxed"
        style={{ fontFamily: value }}
      >
        The quick brown fox jumps over the lazy dog. 0123456789
      </p>
    </div>
  );
}

// ── Font stack presets ───────────────────────────────────────

export const SANS_PRESETS = [
  {
    label: 'System Default',
    value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  // ── Web fonts (loaded from Google Fonts CDN) ──
  {
    label: 'Inter',
    value: "'Inter', system-ui, sans-serif",
  },
  {
    label: 'Geist',
    value: "'Geist', system-ui, sans-serif",
  },
  {
    label: 'Source Sans 3',
    value: "'Source Sans 3', system-ui, sans-serif",
  },
  {
    label: 'IBM Plex Sans',
    value: "'IBM Plex Sans', system-ui, sans-serif",
  },
  // ── macOS-native fonts (always available, no loading needed) ──
  {
    label: 'Helvetica Neue',
    value: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  {
    label: 'Avenir Next',
    value: "'Avenir Next', 'Avenir', system-ui, sans-serif",
  },
];

export const MONO_PRESETS = [
  // ── Web fonts (loaded from Google Fonts CDN) ──
  {
    label: 'JetBrains Mono',
    value: "'JetBrains Mono', Menlo, monospace",
  },
  {
    label: 'Fira Code',
    value: "'Fira Code', Menlo, monospace",
  },
  {
    label: 'Source Code Pro',
    value: "'Source Code Pro', Menlo, monospace",
  },
  {
    label: 'IBM Plex Mono',
    value: "'IBM Plex Mono', Menlo, monospace",
  },
  // ── macOS-native fonts (always available, no loading needed) ──
  {
    label: 'Menlo',
    value: "Menlo, Monaco, 'Courier New', monospace",
  },
  {
    label: 'Monaco',
    value: "Monaco, Menlo, 'Courier New', monospace",
  },
  {
    label: 'Courier New',
    value: "'Courier New', Courier, monospace",
  },
];
