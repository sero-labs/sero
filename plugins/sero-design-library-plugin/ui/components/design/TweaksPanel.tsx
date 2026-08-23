import { Button } from '@sero-ai/ui/components/ui/button';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { groupTweaks } from '../../../shared/tweaks';
import type { TweakSurface } from '../../hooks/useTweaks';
import { TweakControl } from './TweakControl';

/**
 * The Tweaks tab (spec §6.5).
 *
 * Everything on screen belongs to one revision: the controls it authored, the
 * ones validation dropped, and the values in force. Nothing here is a fixed
 * catalogue, so an empty panel is a real answer — this page had nothing worth a
 * control — rather than a failure.
 *
 * The omissions are one line that expands. A block of warnings beside a working
 * page would make every design look broken; a silent drop would leave the user
 * wondering where the control they were promised went.
 */

export interface TweaksPanelProps {
  tweaks: TweakSurface;
}

export function TweaksPanel({ tweaks }: TweaksPanelProps) {
  const groups = groupTweaks(tweaks.manifest.controls);

  if (tweaks.loading) {
    return <p className="text-muted-foreground px-4 py-3 text-sm">Loading the controls…</p>;
  }

  if (groups.length === 0) {
    return (
      <div className="px-4 py-3">
        <p className="text-muted-foreground text-sm">
          This revision has no live controls. Revising the variant is how it gets some.
        </p>
        {tweaks.dropped.length > 0 && <OmittedControls dropped={tweaks.dropped} />}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-4 py-3">
          {groups.map((group) => (
            <section key={group.group} className="space-y-3">
              <h4 className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                {group.group}
                <span className="bg-border h-px flex-1" />
              </h4>
              {group.controls.map((definition) => (
                <TweakControl
                  key={definition.id}
                  definition={definition}
                  value={tweaks.values[definition.id] ?? definition.defaultValue}
                  edited={tweaks.edited.has(definition.id)}
                  onChange={(value) => tweaks.set(definition.id, value)}
                  onReset={() => tweaks.reset(definition.id)}
                />
              ))}
            </section>
          ))}
        </div>
      </ScrollArea>

      {tweaks.dropped.length > 0 && (
        <div className="px-4 pb-2">
          <OmittedControls dropped={tweaks.dropped} />
        </div>
      )}

      <div className="border-border flex items-center gap-2 border-t px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={tweaks.editedCount === 0}
          onClick={tweaks.resetAll}
        >
          Reset all
        </Button>
        <CopyCss css={tweaks.css} />
        <span className="text-muted-foreground ml-auto text-sm tabular-nums">
          {tweaks.editedCount} edited
        </span>
      </div>
    </div>
  );
}

function OmittedControls({ dropped }: { dropped: TweakSurface['dropped'] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="text-muted-foreground text-sm">
      <button
        type="button"
        className="underline underline-offset-2"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {dropped.length} control{dropped.length === 1 ? '' : 's'} omitted
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1">
          {dropped.map((entry) => (
            <li key={`${entry.label}:${entry.reason}`} className="wrap-break-word">
              <span className="font-medium">{entry.label}</span> — {entry.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Copy CSS. The confirmation is the button itself: a toast for a clipboard write
 * is more interface than the action deserves.
 */
function CopyCss({ css }: { css: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={css === ''}
      onClick={() => {
        void navigator.clipboard.writeText(css).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1_500);
        });
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy CSS'}
    </Button>
  );
}
