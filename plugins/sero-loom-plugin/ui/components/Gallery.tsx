import { useState } from 'react';
import { Button } from '@sero-ai/ui';

import type { LoomPreset } from '../../shared/types';
import { paletteGradientCss } from '../lib/loom-ui';
import { Section } from './primitives';

export function Gallery({
  presets,
  onSave,
  onLoad,
  onDelete,
}: {
  presets: LoomPreset[];
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const save = () => {
    const n = name.trim();
    if (!n) return;
    onSave(n);
    setName('');
  };

  return (
    <Section title={`Gallery (${presets.length})`}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Save current as…"
          aria-label="Preset name"
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" type="submit" disabled={!name.trim()}>Save</Button>
      </form>

      {presets.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">No saved pieces yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {presets.map((p) => (
            <li key={p.id} className="group flex items-center gap-2">
              <button
                type="button"
                onClick={() => onLoad(p.id)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border/60 p-1 pr-2 text-left transition-colors hover:bg-secondary/40"
                title="Load piece"
              >
                <span className="h-6 w-10 shrink-0 rounded border border-border" style={{ background: paletteGradientCss(p.graph.layers[0]?.palette ?? { a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], d: [0, 0, 0] }) }} />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{p.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground/60">{p.graph.layers.length}L</span>
              </button>
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                onClick={() => onDelete(p.id)}
                aria-label={`Delete ${p.name}`}
                title="Delete"
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
