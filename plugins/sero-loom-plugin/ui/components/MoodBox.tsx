import { useState } from 'react';
import { Button } from '@sero-ai/ui';
import type { AppAI, AppTools } from '@sero-ai/app-runtime';

export function MoodBox({ ai, tools }: { ai: AppAI; tools: AppTools }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const generate = async () => {
    const mood = text.trim();
    if (!mood || busy) return;
    setBusy(true);
    setMsg('Composing…');
    try {
      const reply = await ai.prompt(
        `Change the Loom generative art to feel like: "${mood}". ` +
          `Call the loom_set tool with a partial config patch (palette, motion, paradigm, particles or raymarch). ` +
          `Then reply with one short sentence describing the look.`,
      );
      setMsg(reply.trim().slice(0, 240));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Generation failed');
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
          void generate();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe a mood… (e.g. stormy ocean at dusk)"
          aria-label="Describe a mood"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="sm"
          type="submit"
          disabled={busy || !text.trim()}
          className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white hover:from-violet-500/90 hover:to-fuchsia-500/90"
        >
          {busy ? '…' : 'Generate'}
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
