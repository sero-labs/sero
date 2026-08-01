import { ToggleGroup, ToggleGroupItem } from '@sero-ai/ui';
import { createContext, use, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * What a sprite is shown against, while it is being looked at.
 *
 * A sprite is transparent, so it is drawn on a checker — which is honest about
 * the transparency and useless for judging an outline. A dark character reads
 * one way on white and another on black, and a stray light pixel at the edge of
 * a hat is invisible on the checker and obvious on black.
 *
 * **It is a way of looking, not a property of the artwork.** Nothing here
 * reaches the frames: the choice is a CSS background on the box the picture sits
 * in, the frames stay transparent indexed PNGs, and the export path never sees
 * it. It is also not remembered between runs — it is a thing you flip, look at
 * and flip back.
 *
 * One choice for the whole page rather than one per pane, so the strip a frame
 * was picked off and the player it is watched in never disagree.
 */

export type Backdrop = 'none' | 'white' | 'black';

/** Transparency, shown rather than implied. */
const CHECKER: CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg,var(--muted) 25%,transparent 25%),linear-gradient(-45deg,var(--muted) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--muted) 75%),linear-gradient(-45deg,transparent 75%,var(--muted) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
};

const BACKDROPS: Record<Backdrop, CSSProperties> = {
  none: CHECKER,
  white: { backgroundColor: '#ffffff' },
  black: { backgroundColor: '#000000' },
};

const BackdropContext = createContext<{
  backdrop: Backdrop;
  setBackdrop: (backdrop: Backdrop) => void;
}>({ backdrop: 'none', setBackdrop: () => undefined });

export function BackdropProvider({ children }: { children: ReactNode }) {
  // 'none' by default: the checker is what a sprite is, and white and black are
  // the questions you go and ask of it.
  const [backdrop, setBackdrop] = useState<Backdrop>('none');
  const value = useMemo(() => ({ backdrop, setBackdrop }), [backdrop]);
  return <BackdropContext.Provider value={value}>{children}</BackdropContext.Provider>;
}

/** The style for the box a sprite is drawn in. */
export function useBackdrop(): CSSProperties {
  return BACKDROPS[use(BackdropContext).backdrop];
}

const CHOICES: { value: Backdrop; label: string; swatch: CSSProperties }[] = [
  { value: 'none', label: 'No background', swatch: { ...CHECKER, backgroundSize: '8px 8px' } },
  { value: 'white', label: 'White background', swatch: BACKDROPS.white },
  { value: 'black', label: 'Black background', swatch: BACKDROPS.black },
];

/**
 * The choice itself: three squares, each showing what it does.
 *
 * Drawn rather than named, because what each one does is exactly what it looks
 * like. The name is still on every one of them, for a screen reader and as
 * hover text.
 */
export function BackdropPicker({ className }: { className?: string }) {
  const { backdrop, setBackdrop } = use(BackdropContext);
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="What to show the sprite against"
      value={backdrop}
      // Radix clears the value when the active item is pressed again, and there
      // is no fourth state for a sprite to be shown against.
      onValueChange={(value) => {
        if (value !== '') setBackdrop(value as Backdrop);
      }}
      className={className}
    >
      {CHOICES.map((choice) => (
        <ToggleGroupItem
          key={choice.value}
          value={choice.value}
          aria-label={choice.label}
          title={choice.label}
          className="data-[state=on]:bg-primary/15 data-[state=on]:text-primary h-7 px-2"
        >
          {/* The border is what makes the white one visible on a light theme
              and the black one on a dark theme. */}
          <span className="border-border size-3.5 rounded-xs border" style={choice.swatch} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
