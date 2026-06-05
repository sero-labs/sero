import { Button } from '@sero-ai/ui';

import type { Palette, Vec3 } from '../../shared/types';
import { randomConfig } from '../../shared/types';
import { paletteGradientCss } from '../lib/loom-ui';
import { Section, Slider } from './primitives';

const KEYS: { key: keyof Palette; label: string; min: number; max: number }[] = [
  { key: 'a', label: 'bias (a)', min: 0, max: 1 },
  { key: 'b', label: 'amp (b)', min: 0, max: 1 },
  { key: 'c', label: 'freq (c)', min: 0, max: 2 },
  { key: 'd', label: 'phase (d)', min: 0, max: 1 },
];

const CHANNELS = ['R', 'G', 'B'] as const;

export function PaletteEditor({
  palette,
  onChange,
}: {
  palette: Palette;
  onChange: (recipe: (p: Palette) => void) => void;
}) {
  const randomize = () => {
    const rnd = randomConfig().palette;
    onChange((p) => {
      p.a = rnd.a;
      p.b = rnd.b;
      p.c = rnd.c;
      p.d = rnd.d;
    });
  };

  return (
    <Section
      title="Palette"
      right={
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={randomize}>
          Randomize
        </Button>
      }
    >
      <div
        className="h-6 w-full rounded-md border border-border"
        style={{ background: paletteGradientCss(palette) }}
        aria-label="Palette preview"
      />
      <div className="flex flex-col gap-2">
        {KEYS.map(({ key, label, min, max }) => (
          <div key={key} className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</span>
            <div className="flex flex-col gap-1">
              {CHANNELS.map((ch, i) => (
                <Slider
                  key={ch}
                  label={ch}
                  value={(palette[key] as Vec3)[i]}
                  min={min}
                  max={max}
                  step={0.01}
                  onChange={(v) =>
                    onChange((p) => {
                      const vec = [...(p[key] as Vec3)] as Vec3;
                      vec[i] = v;
                      p[key] = vec;
                    })
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground/60">
        color(t) = a + b·cos(2π(c·t + d)). Vary freq & phase to reshape the whole mood.
      </p>
    </Section>
  );
}
