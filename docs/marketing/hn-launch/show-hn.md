# Draft: Show HN (task 5.1)

Status: DRAFT — Agent→Dan. Do not post until every gate in
[gate-audit.md](gate-audit.md) is green (task 5.4 is Dan-only, founder present all
day). The `[demo link]` slot fills once the flagship demo (3.3) is recorded.

Copy rules honoured: plain descriptive title (HN punishes marketing titles);
slogans stay out of the post body; every claim is honest and beta-scoped; the
provocative framing lives in the *product*, not the pitch. The
[security FAQ](security-faq.md) (5.2) is the pre-written answer bank for the
comment thread.

---

## Title

```text
Show HN: Sero – a local-first desktop workspace for AI agents
```

## URL

```text
https://github.com/sero-labs/sero
```

## Body

```text
Hi HN. I'm building Sero, an open-source, local-first desktop app that gives a
coding agent a real place to work instead of a chat box.

The itch: terminal agents like Claude Code, Codex, and Pi are great, but real
software work isn't just terminal text. It's browser state, screenshots, a
running dev server, files, git, logs, memory across sessions, and workflows that
outlive a single prompt. I kept bridging those gaps by hand — copying context
between windows, re-explaining the project every session. Sero puts them in one
place: chat, terminals, a built-in visual browser the agent can actually see,
plugins with their own UI, persistent project memory, and durable long-running
loops.

The part I find most interesting to build is that the workspace can extend
itself. You can ask Sero for a workflow, it writes the plugin, you review and
approve it, and the new UI mounts inside the app and runs — a self-extending
workspace with a human approval step in the middle. The same engine runs durable
"loops": step plans Sero executes and recovers, reacting to events (a merged PR)
or a schedule, and stopping to ask before anything leaves your machine. [demo link]

It's built on Pi (github.com/badlogic/pi), the open-source agent loop. Pi is the
minimal, stable loop; Sero is the desktop product surface around it. It is not a
replacement for Claude Code, Cursor, or Codex — it's the workspace those
workflows grow into when the agent needs more than a terminal.

Local-first, honestly: the app, your workspaces, agent sessions, memory, plugin
state, and logs all live in a local profile on your machine. There's no
telemetry backend collecting your sessions. The only thing that leaves is the
model call to the provider you configure — and that can stay fully local, since
Sero doesn't bundle a model and works with any OpenAI-compatible server (Ollama,
LM Studio, vLLM presets) as well as hosted APIs.

Agents get real surfaces here — terminal, files, browser — so trust matters. A
permission gate prompts on dangerous shell patterns; plugins are real code you
review before installing, like any dependency; loops are plans you activate, and
outward side effects wait for approval. It's a power-user tool and the docs say
plainly what is and isn't gated. Happy to go deep on the security model in the
comments.

Honest beta caveats: it's an open-source public beta. macOS (Apple Silicon)
builds are signed and notarized and are the maintainer-validated baseline;
Windows (x64) and Linux (x64/arm64) builds are provided but less battle-tested,
and Windows is unsigned during the beta so you'll see a SmartScreen prompt.
Plugin and loop APIs aren't stable yet. Some UX is rough.

Try it: download from github.com/sero-labs/sero/releases/latest, connect a model,
open a project folder, and run a first workflow — about 10 minutes. Or run from
source. Architecture is in docs/architecture.md; the security model is in
SECURITY.md and the security & privacy reference.

I'd genuinely value this crowd's take on two things: does a full desktop surface
around the agent earn its complexity over a terminal agent, and where does the
self-extending-workspace idea worry you? I'll be here in the comments all day.
```

---

## Posting notes for Dan (5.4)

- **Be first in the thread.** Post a top comment immediately with the
  architecture + security links so the framing is set before questions arrive.
- **Answer bank ready:** paste from [security-faq.md](security-faq.md) for the
  predictable objections (self-extending workspace, terminal/file access,
  arbitrary plugin code, "isn't this dangerous", telemetry, unsigned Windows).
- **Timing:** US weekday morning (Pacific) tends to give the longest front-page
  window. Only post once the gate audit is fully green.
- **Capture the outcome (5.5):** rank, comment count, star delta, downloads,
  first-run signals into [metrics-log.md](../metrics-log.md) within 48h —
  regardless of result.
```
