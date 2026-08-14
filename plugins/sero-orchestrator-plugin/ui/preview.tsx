/**
 * Throwaway preview harness (ux-refit-plan.md §7). Renders room-kit
 * primitives and screens from fixtures on the plugin dev server:
 *
 *   SERO_DEV_PLUGINS=orchestrator pnpm dev   (or `pnpm --filter @sero-ai/plugin-orchestrator dev`)
 *   http://localhost:5198/ui/preview.html
 *
 * The Sero shell normally supplies the scope root and the design tokens;
 * here the mount div carries data-sero-plugin="orchestrator" and the theme
 * switcher writes each preset's tokens inline on that root, exactly the
 * variables the host's applyThemePreset would set on the document.
 *
 * Removed with the rest of the harness before the final commit.
 */

import { StrictMode, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { validateThemePreset } from '@sero-ai/ui/theme';
import type { ColorTokens, ThemePreset } from '@sero-ai/ui/theme';
import defaultThemeJson from '../../../packages/templates/themes/default.json';
import rosePineThemeJson from '../../../packages/templates/themes/rose-pine.json';
import './preview-harness.css';

// ── Theme plumbing ───────────────────────────────────────────

function mustParse(raw: unknown, name: string): ThemePreset {
  const preset = validateThemePreset(raw);
  if (!preset) throw new Error(`Harness theme ${name} failed validation`);
  return preset;
}

const defaultTheme = mustParse(defaultThemeJson, 'default');
const rosePineTheme = mustParse(rosePineThemeJson, 'rose-pine');

interface ThemeChoice {
  label: string;
  preset: ThemePreset;
  mode: 'light' | 'dark';
}

const THEMES: ThemeChoice[] = [
  { label: 'Default · dark', preset: defaultTheme, mode: 'dark' },
  { label: 'Default · light', preset: defaultTheme, mode: 'light' },
  { label: 'Rosé Pine', preset: rosePineTheme, mode: 'dark' },
];

const WIDTHS = [1400, 1000, 780] as const;

/**
 * Mirror of apply-theme.ts's derived opacity variants — the host generates
 * these from the base tokens at apply time, so the harness must too.
 */
const DERIVED_OPACITY_VARS: Array<[string, keyof ColorTokens, number]> = [
  ['--brand-primary-muted', 'brandPrimary', 10],
  ['--brand-primary-subtle', 'brandPrimary', 15],
  ['--brand-primary-faint', 'brandPrimary', 3],
  ['--brand-primary-border', 'brandPrimary', 20],
  ['--brand-secondary-muted', 'brandSecondary', 10],
  ['--brand-secondary-subtle', 'brandSecondary', 15],
  ['--brand-secondary-faint', 'brandSecondary', 3],
  ['--brand-secondary-border', 'brandSecondary', 20],
  ['--status-success-muted', 'statusSuccess', 10],
  ['--status-success-subtle', 'statusSuccess', 15],
  ['--status-success-faint', 'statusSuccess', 3],
  ['--status-success-border', 'statusSuccess', 20],
  ['--status-warning-muted', 'statusWarning', 10],
  ['--status-warning-subtle', 'statusWarning', 15],
  ['--status-warning-faint', 'statusWarning', 3],
  ['--status-warning-border', 'statusWarning', 20],
  ['--status-error-muted', 'statusError', 10],
  ['--status-error-subtle', 'statusError', 15],
  ['--status-error-faint', 'statusError', 3],
  ['--status-error-border', 'statusError', 20],
  ['--status-info-muted', 'statusInfo', 10],
  ['--status-info-subtle', 'statusInfo', 15],
  ['--status-info-faint', 'statusInfo', 3],
  ['--status-info-border', 'statusInfo', 20],
  ['--collab-primary-muted', 'collabPrimary', 10],
  ['--collab-primary-subtle', 'collabPrimary', 15],
  ['--collab-primary-border', 'collabPrimary', 20],
  ['--voice-recording-muted', 'voiceRecording', 20],
  ['--voice-processing-muted', 'voiceProcessing', 15],
  ['--banner-primary-muted', 'bannerPrimary', 10],
  ['--banner-primary-subtle', 'bannerPrimary', 15],
  ['--banner-primary-border', 'bannerPrimary', 20],
];

function kebab(key: string): string {
  return `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

/** Inline CSS variables for one preset+mode, as applyThemePreset would set. */
function themeVars(colors: ColorTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === 'string' && value) vars[kebab(key)] = value;
  }
  for (const [cssVar, baseKey, pct] of DERIVED_OPACITY_VARS) {
    const base = colors[baseKey];
    if (base) vars[cssVar] = `color-mix(in srgb, ${base} ${pct}%, transparent)`;
  }
  return vars;
}

// ── Preview sections ─────────────────────────────────────────
// Phase 2 registers every room-kit primitive here; screen phases add their
// fixture-driven screens.

interface Section {
  title: string;
  render: () => ReactNode;
}

const SECTIONS: Section[] = [
  {
    title: 'Phase 1 — room token layer',
    render: () => (
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-[9px] border border-room-line bg-room-surface p-4">
          <div className="room-mono-micro uppercase tracking-[0.12em] text-brand-primary">Proposed room</div>
          <div className="mt-2 text-base font-semibold text-room-text">Session-fixation fix for the login flow</div>
          <div className="mt-1 text-sm text-room-text2">
            Ink tier 2 — the approach sentence sits in this tone.
          </div>
          <div className="mt-1 text-sm text-room-text3">
            Ink tier 3 — supporting detail and row subtitles.
          </div>
          <div className="mt-1 text-sm text-room-text4">
            Ink tier 4 — hints, footnotes, and the faintest meta.
          </div>
          <div className="mt-3 rounded-lg border border-room-line-strong bg-room-sunken p-3 text-sm text-room-text2">
            Sunken input fill — derived, offset from the base toward the ink.
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="size-[30px] rounded-lg bg-linear-[140deg] from-room-face-from to-room-face-to" />
            <span className="size-[30px] rounded-lg bg-linear-[140deg] from-room-face-c-from to-room-face-c-to" />
            <span className="size-[30px] rounded-lg bg-linear-[140deg] from-room-face-new-from to-room-face-new-to" />
            <span className="room-tabular text-sm text-room-text3">$3.18 / $6.00 · 41m</span>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="rounded-md bg-brand-primary px-3 py-1 text-sm text-brand-primary-foreground">brand</span>
          <span className="rounded-md border border-brand-primary-border bg-brand-primary-muted px-3 py-1 text-sm text-brand-primary">emerald wash</span>
          <span className="rounded-md border border-collab-primary-border bg-collab-primary-muted px-3 py-1 text-sm text-collab-primary">violet wash</span>
          <span className="rounded-md border border-status-warning-border bg-status-warning-muted px-3 py-1 text-sm text-status-warning">amber wash</span>
          <span className="rounded-md border border-status-error-border bg-status-error-muted px-3 py-1 text-sm text-status-error">red wash</span>
          <span className="rounded-md border border-status-info-border bg-status-info-muted px-3 py-1 text-sm text-status-info">blue wash</span>
        </div>
      </div>
    ),
  },
];

// ── Harness shell ────────────────────────────────────────────

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  color: '#b7b7c0',
  fontSize: 12,
  borderBottom: '1px solid #26262b',
  position: 'sticky',
  top: 0,
  background: '#050506',
  zIndex: 10,
};

function ToolbarButton({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        font: 'inherit',
        padding: '4px 10px',
        borderRadius: 6,
        border: on ? '1px solid #34d399' : '1px solid #393940',
        background: on ? 'rgba(52,211,153,.1)' : 'transparent',
        color: on ? '#8ce7c5' : '#b7b7c0',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function PreviewApp() {
  const [themeIndex, setThemeIndex] = useState(0);
  const [width, setWidth] = useState<number>(WIDTHS[0]);
  const theme = THEMES[themeIndex];
  const colors = theme.mode === 'dark' ? theme.preset.colors.dark : theme.preset.colors.light;
  const vars = themeVars(colors);

  return (
    <>
      <div style={toolbarStyle}>
        <span style={{ marginRight: 8, color: '#74747f' }}>Orchestrator preview</span>
        {THEMES.map((t, i) => (
          <ToolbarButton key={t.label} label={t.label} on={i === themeIndex} onClick={() => setThemeIndex(i)} />
        ))}
        <span style={{ width: 1, height: 16, background: '#26262b', margin: '0 6px' }} />
        {WIDTHS.map((w) => (
          <ToolbarButton key={w} label={`${w}px`} on={w === width} onClick={() => setWidth(w)} />
        ))}
      </div>
      <div style={{ padding: 24, display: 'grid', justifyContent: 'start', gap: 24 }}>
        <div style={{ width, border: '1px solid #26262b', borderRadius: 10, overflow: 'hidden' }}>
          <div
            data-sero-plugin="orchestrator"
            className={theme.mode === 'dark' ? 'dark' : undefined}
            style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', ...vars } as CSSProperties}
          >
            {SECTIONS.map((section) => (
              <section key={section.title}>
                <div
                  className="room-mono-micro"
                  style={{ padding: '14px 16px 0', color: 'var(--text-muted)' }}
                >
                  {section.title.toUpperCase()}
                </div>
                {section.render()}
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('preview: #root missing');
createRoot(rootEl).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>,
);
