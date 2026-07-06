import { useState } from 'react';
import type { AppAI } from '@sero-ai/app-runtime';
import { ArrowUp, Sparkles } from 'lucide-react';

const STUDIO_PROCESS =
  'Follow the Loom studio process: call loom_get first and honor the persistent creative direction; ' +
  'author real GLSL with loom_compose and fix any compile errors it returns; then call loom_see and ' +
  'refine until the piece truly matches the brief. Declare 3-6 meaningful params. ' +
  'Reply with one short sentence about the look.';

/** The primary interface: talk to Loom. Floats bottom-center over the art. */
export function PromptBar({ ai }: { ai: AppAI }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const run = async (instruction: string) => {
    if (busy) return;
    setBusy(true);
    setStatus('Loom is working…');
    try {
      let streamed = false;
      const reply = await ai.promptStream(instruction, () => {
        if (!streamed) {
          streamed = true;
          setStatus('Loom is composing…');
        }
      });
      setStatus(reply.trim().slice(0, 200));
      setText('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const instruction = text.trim();
    if (!instruction) return;
    void run(`Loom instruction from the user: "${instruction}". ${STUDIO_PROCESS}`);
  };

  const surprise = () => {
    void run(
      `Surprise me: invent a brand new Loom piece — a concept and technique the gallery does not have yet. ${STUDIO_PROCESS}`,
    );
  };

  return (
    <div className="pointer-events-auto flex w-[min(560px,80%)] flex-col items-center gap-1.5">
      {status && (
        <p className="max-w-full truncate rounded-full bg-background/70 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
          {status}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex w-full items-center gap-1.5 rounded-full border border-border bg-background/85 p-1.5 pl-4 shadow-xl backdrop-blur-md"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe a piece, or ask for changes…"
          aria-label="Talk to Loom"
          disabled={busy}
          className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
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
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  );
}
