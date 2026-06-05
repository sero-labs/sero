import { Button } from '@sero-ai/ui';

import {
  MAX_LAYERS,
  type BlendMode,
  type Layer,
  type LoomGraph,
  type Palette,
  type ParticleLayer,
  type RaymarchLayer,
} from '../../shared/graph';
import { paletteGradientCss } from '../lib/loom-ui';
import { ScalarRow, Section, SelectRow, Slider } from './primitives';

type Mutate = (recipe: (g: LoomGraph) => void) => void;
const BLENDS: readonly BlendMode[] = ['normal', 'add', 'screen'];

function rndPalette(): Palette {
  const r = (lo: number, hi: number) => +(lo + Math.random() * (hi - lo)).toFixed(2);
  return {
    a: [0.5, 0.5, 0.5],
    b: [r(0.3, 0.55), r(0.3, 0.55), r(0.3, 0.55)],
    c: [r(0.6, 1.4), r(0.6, 1.4), r(0.6, 1.4)],
    d: [r(0, 1), r(0, 1), r(0, 1)],
  };
}

function makeLayer(type: Layer['type']): Layer {
  const id = `${type}-${Math.random().toString(36).slice(2, 7)}`;
  if (type === 'particles') {
    return {
      id, type: 'particles', blend: 'add', opacity: 1, enabled: true, count: 150_000,
      field: 'vec3(sin(p.y*2+t), cos(p.z*2+t), sin(p.x*2-t))',
      strength: 0.6, spread: 1.3, pointSize: 2, palette: rndPalette(), colorDrive: 'id + t*0.02',
    };
  }
  return {
    id, type: 'raymarch', blend: 'normal', opacity: 1, enabled: true,
    camera: { distance: 4, orbitSpeed: 0.3, height: 0.6 },
    sdf: { kind: 'shape', shape: 'sphere', size: 1, at: [0, 0, 0] },
    palette: rndPalette(), colorDrive: '0.25*depth + 0.4*ny + 0.02*t', glow: 0.4, fractalFold: 0,
  };
}

function ExprText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 truncate text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  );
}

export function LayerList({ graph, mutate }: { graph: LoomGraph; mutate: Mutate }) {
  return (
    <Section
      title={`Layers (${graph.layers.length}/${MAX_LAYERS})`}
      right={
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={graph.layers.length >= MAX_LAYERS} onClick={() => mutate((g) => { g.layers.push(makeLayer('raymarch')); })}>
            + SDF
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={graph.layers.length >= MAX_LAYERS} onClick={() => mutate((g) => { g.layers.push(makeLayer('particles')); })}>
            + Particles
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        {graph.layers.map((layer, i) => (
          <LayerCard key={layer.id} layer={layer} i={i} total={graph.layers.length} mutate={mutate} />
        ))}
      </div>
    </Section>
  );
}

function LayerCard({ layer, i, total, mutate }: { layer: Layer; i: number; total: number; mutate: Mutate }) {
  const set = (recipe: (l: Layer) => void) => mutate((g) => recipe(g.layers[i]));
  return (
    <div className={`flex flex-col gap-1.5 rounded-md border p-2 ${layer.enabled === false ? 'border-border/40 opacity-60' : 'border-border'}`}>
      <div className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={layer.enabled !== false}
          onChange={(e) => set((l) => { l.enabled = e.target.checked; })}
          aria-label="Enable layer"
          className="size-3.5"
        />
        <span className="text-[11px] font-medium capitalize text-foreground">{layer.type}</span>
        <select
          value={layer.blend}
          onChange={(e) => set((l) => { l.blend = e.target.value as BlendMode; })}
          aria-label="Blend mode"
          className="ml-auto h-6 rounded border border-input bg-background px-1 text-[10px] text-foreground"
        >
          {BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <button type="button" title="Move up" disabled={i === 0} onClick={() => mutate((g) => { [g.layers[i - 1], g.layers[i]] = [g.layers[i], g.layers[i - 1]]; })} className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30">↑</button>
        <button type="button" title="Move down" disabled={i === total - 1} onClick={() => mutate((g) => { [g.layers[i + 1], g.layers[i]] = [g.layers[i], g.layers[i + 1]]; })} className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30">↓</button>
        <button type="button" title="Remove" disabled={total <= 1} onClick={() => mutate((g) => { g.layers.splice(i, 1); })} className="px-1 text-muted-foreground hover:text-destructive disabled:opacity-30">✕</button>
      </div>

      <button
        type="button"
        onClick={() => set((l) => { l.palette = rndPalette(); })}
        title="Randomize palette"
        className="h-5 w-full rounded border border-border"
        style={{ background: paletteGradientCss(layer.palette) }}
        aria-label="Randomize palette"
      />

      <ScalarRow label="opacity" value={layer.opacity} min={0} max={1} onChange={(v) => set((l) => { l.opacity = v; })} />

      {layer.type === 'raymarch' ? (
        <>
          <ScalarRow label="cam dist" value={(layer as RaymarchLayer).camera.distance} min={1.5} max={8} onChange={(v) => set((l) => { (l as RaymarchLayer).camera.distance = v; })} />
          <ScalarRow label="orbit" value={(layer as RaymarchLayer).camera.orbitSpeed} min={0} max={2} onChange={(v) => set((l) => { (l as RaymarchLayer).camera.orbitSpeed = v; })} />
          <ScalarRow label="glow" value={(layer as RaymarchLayer).glow} min={0} max={1} onChange={(v) => set((l) => { (l as RaymarchLayer).glow = v; })} />
          <Slider label="fractal" value={(layer as RaymarchLayer).fractalFold} min={0} max={6} step={1} onChange={(v) => set((l) => { (l as RaymarchLayer).fractalFold = Math.round(v); })} />
          <ExprText label="color" value={(layer as RaymarchLayer).colorDrive} onChange={(v) => set((l) => { (l as RaymarchLayer).colorDrive = v; })} />
        </>
      ) : (
        <>
          <Slider label="count" value={(layer as ParticleLayer).count} min={10000} max={1000000} step={10000} onChange={(v) => set((l) => { (l as ParticleLayer).count = Math.round(v); })} />
          <ScalarRow label="strength" value={(layer as ParticleLayer).strength} min={0} max={2} onChange={(v) => set((l) => { (l as ParticleLayer).strength = v; })} />
          <ScalarRow label="spread" value={(layer as ParticleLayer).spread} min={0.2} max={3} onChange={(v) => set((l) => { (l as ParticleLayer).spread = v; })} />
          <ScalarRow label="size" value={(layer as ParticleLayer).pointSize} min={0.5} max={8} onChange={(v) => set((l) => { (l as ParticleLayer).pointSize = v; })} />
          <ExprText label="field" value={(layer as ParticleLayer).field} onChange={(v) => set((l) => { (l as ParticleLayer).field = v; })} />
          <ExprText label="color" value={(layer as ParticleLayer).colorDrive} onChange={(v) => set((l) => { (l as ParticleLayer).colorDrive = v; })} />
        </>
      )}
    </div>
  );
}
