import { memo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';

import type { BuildReport, LoomPiece } from '../../shared/types';
import { PanelCard } from './primitives';

type Tab = 'common' | string;

/**
 * Power-user surface: the piece's actual GLSL, per pass, with the build report
 * inline. Apply goes through the same compile path the agent uses.
 */
export const CodePanel = memo(function CodePanel({
  piece,
  build,
  onApply,
}: {
  piece: LoomPiece;
  build: BuildReport | undefined;
  onApply: (piece: LoomPiece) => void;
}) {
  const tabs: Tab[] = ['common', ...piece.passes.map((p) => p.id)];
  const [tab, setTab] = useState<Tab>(piece.passes[piece.passes.length - 1]?.id ?? 'common');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const sourceOf = (t: Tab): string =>
    drafts[t] ?? (t === 'common' ? (piece.common ?? '') : (piece.passes.find((p) => p.id === t)?.code ?? ''));

  const dirty = Object.keys(drafts).length > 0;

  const apply = () => {
    const next: LoomPiece = {
      ...piece,
      common: sourceOf('common') || undefined,
      passes: piece.passes.map((p) => ({ ...p, code: sourceOf(p.id) })),
    };
    setDrafts({});
    onApply(next);
  };

  const errors = build?.status === 'error' ? build.errors : [];

  return (
    <PanelCard
      title="Code"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] text-muted-foreground">
            {build?.status === 'ok' ? `build ok${build.fps ? ` · ~${build.fps} fps` : ''}` : build ? 'build failed' : ''}
          </span>
          <Button size="sm" variant="outline" onClick={apply} disabled={!dirty}>
            Apply
          </Button>
        </div>
      }
    >
      {errors.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-2">
          {errors.slice(0, 6).map((e, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setTab(e.pass)}
              className="text-left font-mono text-[10px] leading-snug text-destructive"
            >
              [{e.pass}
              {e.line !== null ? `:${e.line}` : ''}] {e.message}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              tab === t ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground'
            }${drafts[t] !== undefined ? ' italic' : ''}`}
          >
            {t}
          </button>
        ))}
      </div>

      <textarea
        value={sourceOf(tab)}
        onChange={(e) => setDrafts((d) => ({ ...d, [tab]: e.target.value }))}
        spellCheck={false}
        rows={16}
        className="min-h-48 flex-1 resize-none rounded-md border border-input bg-background/60 p-2 font-mono text-[11px] leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </PanelCard>
  );
});
