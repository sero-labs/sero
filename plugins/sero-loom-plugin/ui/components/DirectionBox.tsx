import { useEffect, useRef, useState } from 'react';
import { Section } from './primitives';

// Persistent creative direction. Commits on blur; stays in sync with external
// updates (e.g. the agent calling loom_direction) while not focused.
export function DirectionBox({ value, onCommit }: { value: string; onCommit: (s: string) => void }) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  return (
    <Section title="Creative Direction">
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          if (local !== value) onCommit(local);
        }}
        rows={3}
        placeholder="Standing orders for every generation… e.g. cinematic, slow, dark teal moods; organic forms; avoid harsh reds."
        className="w-full resize-none rounded-md border border-input bg-background p-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <p className="text-[10px] text-muted-foreground/60">
        The agent reads this on every change and honors it.
      </p>
    </Section>
  );
}
