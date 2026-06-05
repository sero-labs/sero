import { useState } from 'react';
import { Button } from '@sero-ai/ui';
import type { AppAI, AppTools } from '@sero-ai/app-runtime';

export function TalkBox({ ai, tools }: { ai: AppAI; tools: AppTools }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const send = async () => {
    const instruction = text.trim();
    if (!instruction || busy) return;
    setBusy(true);
    setMsg('Working…');
    try {
      const reply = await ai.prompt(
        `Loom instruction from the user: "${instruction}". ` +
          `First call loom_get to read the current piece and creative direction, ` +
          `then use loom_compose to apply the change — iterate on / combine with what's there, ` +
          `honor the direction, and feel free to use expressions and multiple layers. ` +
          `Reply with one short sentence on the look.`,
      );
      setMsg(reply.trim().slice(0, 240));
      setText('');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const surprise = async () => {
    if (busy) return;
    setBusy(true);
    setMsg('Rolling…');
    try {
      const res = await tools.run('loom_random', {});
      setMsg(res.text?.slice(0, 240) || 'New piece generated.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell Loom what to do…"
          aria-label="Instruct Loom"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="sm"
          type="submit"
          disabled={busy || !text.trim()}
          className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white hover:from-violet-500/90 hover:to-fuchsia-500/90"
        >
          {busy ? '…' : 'Send'}
        </Button>
      </form>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={surprise} disabled={busy}>
          Surprise me
        </Button>
        {msg && <span className="truncate text-[11px] text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
