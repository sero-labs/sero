import { Button } from '@sero-ai/ui';

import {
  MAX_PRIMITIVES,
  type LoomConfig,
  type ParticleColorMode,
  type ParticleField,
  type SdfShape,
} from '../../shared/types';
import { Section, SelectRow, Slider } from './primitives';

type OnLive = (recipe: (d: LoomConfig) => void) => void;

const FIELDS: readonly ParticleField[] = ['curl', 'lorenz', 'aizawa', 'gravity'];
const COLOR_MODES: readonly ParticleColorMode[] = ['velocity', 'age', 'position'];
const SHAPES: readonly SdfShape[] = ['sphere', 'box', 'torus', 'capsule'];

export function ControlPanel({ config, onLive }: { config: LoomConfig; onLive: OnLive }) {
  return (
    <>
      <Section title="Motion">
        <Slider label="speed" value={config.motion.speed} min={0} max={3} onChange={(v) => onLive((d) => { d.motion.speed = v; })} />
        <Slider label="turbulence" value={config.motion.turbulence} min={0} max={1} onChange={(v) => onLive((d) => { d.motion.turbulence = v; })} />
      </Section>

      {config.paradigm === 'particles' ? (
        <Section title="Particles">
          <SelectRow label="field" value={config.particles.field} options={FIELDS} onChange={(v) => onLive((d) => { d.particles.field = v; })} />
          <Slider label="count" value={config.particles.count} min={10000} max={1000000} step={10000} onChange={(v) => onLive((d) => { d.particles.count = Math.round(v); })} />
          <Slider label="strength" value={config.particles.fieldStrength} min={0} max={2} onChange={(v) => onLive((d) => { d.particles.fieldStrength = v; })} />
          <Slider label="noise freq" value={config.particles.noiseFrequency} min={0.05} max={4} onChange={(v) => onLive((d) => { d.particles.noiseFrequency = v; })} />
          <Slider label="evolution" value={config.particles.noiseEvolution} min={0} max={2} onChange={(v) => onLive((d) => { d.particles.noiseEvolution = v; })} />
          <Slider label="point size" value={config.particles.pointSize} min={0.5} max={8} onChange={(v) => onLive((d) => { d.particles.pointSize = v; })} />
          <SelectRow label="color by" value={config.particles.colorMode} options={COLOR_MODES} onChange={(v) => onLive((d) => { d.particles.colorMode = v; })} />
        </Section>
      ) : (
        <Section title="Raymarch">
          <Slider label="blend" value={config.raymarch.blendSmoothness} min={0} max={1} onChange={(v) => onLive((d) => { d.raymarch.blendSmoothness = v; })} />
          <Slider label="cam dist" value={config.raymarch.cameraDistance} min={1.5} max={8} onChange={(v) => onLive((d) => { d.raymarch.cameraDistance = v; })} />
          <Slider label="orbit" value={config.raymarch.cameraOrbitSpeed} min={0} max={2} onChange={(v) => onLive((d) => { d.raymarch.cameraOrbitSpeed = v; })} />
          <Slider label="glow" value={config.raymarch.glow} min={0} max={1} onChange={(v) => onLive((d) => { d.raymarch.glow = v; })} />
          <Slider label="fractal" value={config.raymarch.fractalIterations} min={0} max={5} step={1} onChange={(v) => onLive((d) => { d.raymarch.fractalIterations = Math.round(v); })} />
          <PrimitiveEditor config={config} onLive={onLive} />
        </Section>
      )}
    </>
  );
}

function PrimitiveEditor({ config, onLive }: { config: LoomConfig; onLive: OnLive }) {
  const prims = config.raymarch.primitives;
  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          shapes ({prims.length}/{MAX_PRIMITIVES})
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          disabled={prims.length >= MAX_PRIMITIVES}
          onClick={() =>
            onLive((d) => {
              d.raymarch.primitives.push({ shape: 'sphere', position: [0, 0, 0], scale: 0.8, morphAmount: 0.3, morphSpeed: 1 });
            })
          }
        >
          + Add
        </Button>
      </div>
      {prims.map((p, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
          <div className="flex items-center gap-2">
            <SelectRow
              label={`#${i + 1}`}
              value={p.shape}
              options={SHAPES}
              onChange={(v) => onLive((d) => { d.raymarch.primitives[i].shape = v; })}
            />
            <Button
              size="icon-xs"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              disabled={prims.length <= 1}
              onClick={() => onLive((d) => { d.raymarch.primitives.splice(i, 1); })}
              aria-label="Remove shape"
              title="Remove shape"
            >
              ✕
            </Button>
          </div>
          <Slider label="scale" value={p.scale} min={0.05} max={3} onChange={(v) => onLive((d) => { d.raymarch.primitives[i].scale = v; })} />
          <Slider label="morph" value={p.morphAmount} min={0} max={1} onChange={(v) => onLive((d) => { d.raymarch.primitives[i].morphAmount = v; })} />
          <Slider label="morph spd" value={p.morphSpeed} min={0} max={4} onChange={(v) => onLive((d) => { d.raymarch.primitives[i].morphSpeed = v; })} />
        </div>
      ))}
    </div>
  );
}
