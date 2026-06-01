/**
 * FontPicker, scrollable list of font options, each rendered in its own
 * font face. Includes a "Custom…" option with a text input for arbitrary
 * CSS font stacks.
 */

import { useState, useCallback, useEffect } from 'react';
import { loadGoogleFont, preloadAllGoogleFonts } from '@/lib/google-fonts';

interface FontPickerProps {
  label: string;
  value: string;
  presets: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}

// Preload all Google Fonts once so the list renders correctly.
let _fontsPreloaded = false;

export function FontPicker({ label, value, presets, onChange }: FontPickerProps) {
  useEffect(() => {
    if (_fontsPreloaded) {
      return;
    }

    _fontsPreloaded = true;
    preloadAllGoogleFonts();
  }, []);

  const isCustom = !presets.some((p) => p.value === value);
  const [showCustom, setShowCustom] = useState(isCustom);

  const handlePick = useCallback(
    (fontValue: string) => {
      setShowCustom(false);
      loadGoogleFont(fontValue);
      onChange(fontValue);
    },
    [onChange],
  );

  const handleCustomToggle = useCallback(() => {
    setShowCustom(true);
  }, []);

  const handleCustomInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </span>

      {/* Scrollable font list */}
      <div className="flex max-h-[180px] flex-col overflow-y-auto rounded border border-[var(--border-subtle)] bg-[var(--bg-base)]">
        {presets.map((p) => {
          const active = !showCustom && p.value === value;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => handlePick(p.value)}
              className={`px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                active
                  ? 'bg-[var(--accent-primary)]/15 text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
              }`}
              style={{ fontFamily: p.value }}
            >
              {p.label}
            </button>
          );
        })}
        {/* Custom option */}
        <button
          type="button"
          onClick={handleCustomToggle}
          className={`px-2.5 py-1.5 text-left text-[13px] transition-colors ${
            showCustom
              ? 'bg-[var(--accent-primary)]/15 text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'
          }`}
        >
          Custom…
        </button>
      </div>

      {showCustom && (
        <input aria-label="e.g. 'Inter', system-ui, sans-serif"
          type="text"
          value={value}
          onChange={handleCustomInput}
          placeholder="e.g. 'Inter', system-ui, sans-serif"
          spellCheck={false}
          className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] font-mono outline-none focus:border-[var(--border-focus)]"
        />
      )}
    </div>
  );
}

// ── Font presets ─────────────────────────────────────────────

export const SANS_PRESETS: Array<{ label: string; value: string }> = [
  // System / native
  { label: 'System Default', value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { label: 'Helvetica Neue', value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: 'Avenir Next', value: "'Avenir Next', 'Avenir', system-ui, sans-serif" },
  // Google Fonts (loaded from CDN)
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
  { label: 'Geist', value: "'Geist', system-ui, sans-serif" },
  { label: 'Roboto', value: "'Roboto', system-ui, sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', system-ui, sans-serif" },
  { label: 'Lato', value: "'Lato', system-ui, sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', system-ui, sans-serif" },
  { label: 'Poppins', value: "'Poppins', system-ui, sans-serif" },
  { label: 'Nunito', value: "'Nunito', system-ui, sans-serif" },
  { label: 'Raleway', value: "'Raleway', system-ui, sans-serif" },
  { label: 'Source Sans 3', value: "'Source Sans 3', system-ui, sans-serif" },
  { label: 'IBM Plex Sans', value: "'IBM Plex Sans', system-ui, sans-serif" },
  { label: 'DM Sans', value: "'DM Sans', system-ui, sans-serif" },
  { label: 'Work Sans', value: "'Work Sans', system-ui, sans-serif" },
  { label: 'Plus Jakarta Sans', value: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { label: 'Manrope', value: "'Manrope', system-ui, sans-serif" },
  { label: 'Space Grotesk', value: "'Space Grotesk', system-ui, sans-serif" },
  { label: 'Outfit', value: "'Outfit', system-ui, sans-serif" },
  { label: 'Rubik', value: "'Rubik', system-ui, sans-serif" },
  { label: 'Karla', value: "'Karla', system-ui, sans-serif" },
];

export const MONO_PRESETS: Array<{ label: string; value: string }> = [
  // macOS native
  { label: 'Menlo', value: "Menlo, Monaco, 'Courier New', monospace" },
  { label: 'Monaco', value: "Monaco, Menlo, 'Courier New', monospace" },
  { label: 'Courier New', value: "'Courier New', Courier, monospace" },
  // Google Fonts (loaded from CDN)
  { label: 'JetBrains Mono', value: "'JetBrains Mono', Menlo, monospace" },
  { label: 'Fira Code', value: "'Fira Code', Menlo, monospace" },
  { label: 'Source Code Pro', value: "'Source Code Pro', Menlo, monospace" },
  { label: 'IBM Plex Mono', value: "'IBM Plex Mono', Menlo, monospace" },
  { label: 'Cascadia Code', value: "'Cascadia Code', Menlo, monospace" },
  { label: 'Roboto Mono', value: "'Roboto Mono', Menlo, monospace" },
  { label: 'Space Mono', value: "'Space Mono', Menlo, monospace" },
  { label: 'Inconsolata', value: "'Inconsolata', Menlo, monospace" },
  { label: 'DM Mono', value: "'DM Mono', Menlo, monospace" },
  { label: 'Ubuntu Mono', value: "'Ubuntu Mono', Menlo, monospace" },
];
