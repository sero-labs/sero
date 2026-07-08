import { memo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Trash2 } from 'lucide-react';

import type { LoomPreset } from '../../shared/types';
import { PanelCard } from './primitives';

export const GalleryPanel = memo(function GalleryPanel({
  presets,
  onSave,
  onLoad,
  onDelete,
  onFork,
}: {
  presets: LoomPreset[];
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  /** "Riff on this" — routes a remix brief through the agent. */
  onFork: (preset: LoomPreset) => void;
}) {
  const [name, setName] = useState('');

  return (
    <PanelCard
      title="Gallery"
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            onSave(trimmed);
            setName('');
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Save current as…"
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background/60 px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button size="sm" type="submit" variant="outline" disabled={!name.trim()}>
            Save
          </Button>
        </form>
      }
    >
      {presets.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">Nothing saved yet — name the current piece below.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => (
            <div key={p.id} className="group relative overflow-hidden rounded-lg border border-border/60">
              <button
                type="button"
                onClick={() => onLoad(p.id)}
                disabled={!p.piece}
                title={p.piece ? `Load "${p.name}"` : 'Legacy piece — ask Loom to recreate it'}
                className="block w-full disabled:cursor-not-allowed"
              >
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt={p.name} className="aspect-video w-full object-cover" />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-secondary to-background text-[9px] uppercase tracking-widest text-muted-foreground/60">
                    {p.piece ? 'no preview' : 'legacy'}
                  </div>
                )}
                <span className="block truncate px-1.5 py-1 text-left text-[11px] text-foreground">{p.name}</span>
              </button>
              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onFork(p)}
                  title="Riff on this piece"
                  className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground backdrop-blur hover:bg-background"
                >
                  riff
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  title="Delete"
                  className="rounded bg-background/80 p-1 text-destructive backdrop-blur hover:bg-background"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
});
