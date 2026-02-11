import { useAppStore } from '@/stores/app';

/**
 * StatusBar — bottom bar showing workspace info (à la VSCode).
 *
 * Left side: branch / connection indicators.
 * Right side: model, encoding, line info, etc.
 *
 * All placeholder text for now.
 */
export function StatusBar() {
  const theme = useAppStore((s) => s.theme);

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border/50 bg-[var(--bg-base)] px-3 text-[11px] text-[var(--text-muted)]">
      {/* ── Left ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span>⎇ main</span>
        <span>0 problems</span>
      </div>

      {/* ── Right ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span>Sero v0.1.0</span>
        <span className="capitalize">{theme}</span>
      </div>
    </footer>
  );
}
