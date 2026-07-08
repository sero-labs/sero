import { memo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { AppAI } from '@sero-ai/app-runtime';
import { ArrowUp, Loader2, Sparkles } from 'lucide-react';

const STUDIO_PROCESS =
  'Follow the Loom studio process: call loom_get first and honor the persistent creative direction; ' +
  'author real GLSL with loom_compose and fix any compile errors it returns; call loom_see once, then ' +
  'refine only if the first result is clearly broken or badly misses the brief. Declare 3-6 meaningful params. ' +
  'Keep first drafts GPU-light: prefer one image pass, or one 0.5-scale buffer pass at most. ' +
  'Reply with one short sentence about the look.';

/** The primary interface: talk to Loom. Floats bottom-center over the art. */
export const PromptBar = memo(function PromptBar({
  ai,
  direction,
  externalBusy,
  externalStatus,
  onBusyChange,
}: {
  ai: AppAI;
  direction: string;
  externalBusy?: boolean;
  externalStatus?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const run = async (instruction: string) => {
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setStatus('Loom is generating…');
    try {
      let streamed = false;
      const reply = await ai.promptStream(instruction, () => {
        if (!streamed) {
          streamed = true;
          setStatus('Finishing…');
        }
      });
      setStatus(reply.trim().slice(0, 200));
      setText('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const statusBusy = busy || externalBusy;
  const visibleStatus = statusBusy ? status || externalStatus || 'Loom is generating…' : status || externalStatus || '';

  const withDirection = (brief: string) => {
    const guidance = direction.trim();
    return guidance ? `${brief} Persistent creative direction: ${JSON.stringify(guidance)}.` : brief;
  };

  const send = () => {
    const instruction = text.trim();
    if (!instruction) return;
    void run(`${withDirection(`Loom instruction from the user: "${instruction}".`)} ${STUDIO_PROCESS}`);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    send();
  };

  const surprise = () => {
    void run(
      `${withDirection('Surprise me: invent a brand new Loom piece — a concept and technique the gallery does not have yet.')} ${STUDIO_PROCESS}`,
    );
  };

  return (
    <div className="pointer-events-auto flex w-[min(760px,calc(100vw-2rem))] flex-col items-center gap-1.5">
      {visibleStatus && (
        <p
          role="status"
          aria-live="polite"
          className={
            statusBusy
              ? 'flex max-w-full items-center gap-2 rounded-2xl border border-border bg-background/90 px-4 py-2 text-sm font-medium text-foreground shadow-2xl shadow-black/30 backdrop-blur-md'
              : 'max-w-full truncate rounded-full bg-background/70 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur'
          }
        >
          {statusBusy && <Loader2 className="size-4 shrink-0 animate-spin" />}
          <span className="truncate">{visibleStatus}</span>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex w-full items-end gap-1.5 rounded-3xl border border-border bg-background/85 p-1.5 pl-4 shadow-xl backdrop-blur-md"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe a piece, or ask for changes…"
          aria-label="Talk to Loom"
          disabled={busy}
          rows={1}
          className="field-sizing-content max-h-[6.25rem] min-h-8 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm leading-5 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={surprise}
          disabled={busy}
          title="Surprise me"
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <Sparkles className="size-4" />
        </button>
        <button
          type="submit"
          disabled={busy || !text.trim()}
          title="Send"
          className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </form>
    </div>
  );
});
