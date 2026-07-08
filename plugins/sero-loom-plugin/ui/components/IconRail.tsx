import { memo } from 'react';
import { Camera, Code2, Images, Moon, Pause, Play, Settings2, SlidersHorizontal, type LucideIcon } from 'lucide-react';

export type PanelId = 'controls' | 'gallery' | 'code' | 'settings';

const PANELS: { id: PanelId; icon: LucideIcon; title: string }[] = [
  { id: 'controls', icon: SlidersHorizontal, title: 'Controls' },
  { id: 'gallery', icon: Images, title: 'Gallery' },
  { id: 'code', icon: Code2, title: 'Code' },
  { id: 'settings', icon: Settings2, title: 'Settings' },
];

function RailButton({
  icon: Icon,
  title,
  active,
  onClick,
  busy,
}: {
  icon: LucideIcon;
  title: string;
  active?: boolean;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={busy}
      className={`flex size-9 items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${
        active ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      <Icon className={`size-4${busy ? ' animate-pulse' : ''}`} />
    </button>
  );
}

export const IconRail = memo(function IconRail({
  active,
  onToggle,
  paused,
  onTogglePause,
  onCapture,
  capturing,
  onAmbient,
  buildError,
}: {
  active: PanelId | null;
  onToggle: (id: PanelId) => void;
  paused: boolean;
  onTogglePause: () => void;
  onCapture: () => void;
  capturing: boolean;
  onAmbient: () => void;
  buildError: boolean;
}) {
  return (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-xl border border-border bg-background/85 p-1.5 shadow-xl backdrop-blur-md">
      {PANELS.map((p) => (
        <span key={p.id} className="relative">
          <RailButton icon={p.icon} title={p.title} active={active === p.id} onClick={() => onToggle(p.id)} />
          {p.id === 'code' && buildError && (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-destructive" title="Shader error" />
          )}
        </span>
      ))}
      <div className="mx-1.5 my-0.5 border-t border-border/60" />
      <RailButton icon={paused ? Play : Pause} title={paused ? 'Play' : 'Pause'} onClick={onTogglePause} />
      <RailButton icon={Camera} title="Capture wallpaper" onClick={onCapture} busy={capturing} />
      <RailButton icon={Moon} title="Ambient mode (Esc to exit)" onClick={onAmbient} />
    </div>
  );
});
