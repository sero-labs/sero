import { DEFAULT_GLASS_EFFECT, WINDOWS_GLASS_MATERIALS, type ThemeGlassEffect } from '@/types/theme';
import { useGlassStatusStore } from '@/stores/glass-status';
import { Slider } from '@sero-ai/ui/components/ui/slider';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui/components/ui/select';

const LAYERS = [
  { key: 'opacity', label: 'Window tint' },
  { key: 'sidebarOpacity', label: 'Sidebar tint' },
  { key: 'surfaceOpacity', label: 'Panel tint' },
  { key: 'selectionOpacity', label: 'Selection fill' },
  { key: 'borderOpacity', label: 'Border strength' },
] as const;

export function GlassControls({ glass, onChange }: {
  glass: ThemeGlassEffect;
  onChange: (updates: Partial<ThemeGlassEffect>) => void;
}) {
  const platform = window.sero?.platform;
  const error = useGlassStatusStore((state) => state.error);
  const radius = glass.blurRadius ?? DEFAULT_GLASS_EFFECT.blurRadius;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">Desktop glass</h3>
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--text-secondary)]">Glass background</span>
        <Switch size="sm" aria-label="Glass background" checked={glass.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })} />
      </label>
      <fieldset disabled={!glass.enabled} className="flex min-w-0 flex-col gap-3 disabled:opacity-50">
        {platform === 'darwin' && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs text-[var(--text-secondary)]">Desktop blur</span>
              <Slider aria-label="Desktop blur" disabled={!glass.enabled} min={0} max={64} step={1}
                value={[radius]} className="flex-1"
                onValueChange={([blurRadius]) => onChange({ blurRadius })} />
              <span className="w-10 text-right text-xs tabular-nums text-[var(--text-primary)]">{radius}px</span>
            </div>
          </div>
        )}
        {platform === 'win32' && (
          <Select disabled={!glass.enabled} value={glass.windowsMaterial ?? DEFAULT_GLASS_EFFECT.windowsMaterial}
            onValueChange={(value) => {
              const windowsMaterial = WINDOWS_GLASS_MATERIALS.find((item) => item === value);
              if (windowsMaterial) onChange({ windowsMaterial });
            }}>
            <SelectTrigger aria-label="Windows backdrop" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WINDOWS_GLASS_MATERIALS.map((material) => (
                <SelectItem key={material} value={material}>{material === 'acrylic' ? 'Acrylic' : material === 'mica' ? 'Mica' : 'Tabbed'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {LAYERS.map(({ key, label }) => {
          const percent = Math.round((glass[key] ?? DEFAULT_GLASS_EFFECT[key]) * 100);
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs text-[var(--text-secondary)]">{label}</span>
              <Slider aria-label={label} disabled={!glass.enabled} min={0} max={100} step={1}
                value={[percent]} className="flex-1"
                onValueChange={([value]) => onChange({ [key]: value / 100 })} />
              <span className="w-10 text-right text-xs tabular-nums text-[var(--text-primary)]">{percent}%</span>
            </div>
          );
        })}
        <p className="text-xs text-[var(--text-muted)]">
          Set all tint sliders to 0% to remove Sero's background fills. Keep a small tint for readable text over bright or detailed wallpaper.
        </p>
      </fieldset>
      {platform === 'linux' && <p className="text-xs text-[var(--text-muted)]">Native desktop blur is not available on Linux. Sero keeps solid backgrounds.</p>}
      {platform === 'win32' && <p className="text-xs text-[var(--text-muted)]">Requires Windows 11 22H2 or later. Windows controls the backdrop's blur and tint.</p>}
      {error && <p role="status" className="text-xs text-[var(--status-warning)]">{error}</p>}
    </section>
  );
}
