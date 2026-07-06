# Project memory — 60-second demo

## Hook

I came back later and Sero still knew the project.

## Shot list

| Time | Shot | Must be visible | Spoken/caption line |
|------|------|-----------------|---------------------|
| 0:00–0:07 | Labelled cut: "Earlier today". A chat where I've been explaining a service I'm building. | Caption chip "Earlier today". Chat panel with a couple of my messages describing the project (stack, a design decision). | "Earlier, I walked Sero through a service I'm building." |
| 0:07–0:18 | The agent records a project fact on its own. | An assistant turn with a `memory` tool call in the message — `sero memory write --target memory ...` — saving the decision (e.g. Postgres over the event store, and why). | "It saved the decision as I made it — I never said 'remember this'." |
| 0:18–0:24 | Quit and reopen. Real, but shown as a labelled cut. | Sero window closes; caption chip "Quit + reopen"; app relaunches to a fresh, empty chat (new session). | "Then I quit. New session, empty chat." |
| 0:24–0:33 | In the fresh chat I ask an architectural question about the same project. | Empty chat, my typed prompt visible, e.g. "Given how we're storing events, where should the read model live?" Send. | "So I ask an architecture question — no recap, no re-pasting." |
| 0:33–0:42 | Turn on memory visibility so the viewer sees what fed the answer. | Cursor clicks the Database icon in the prompt-area toolbar (tooltip "Show memory context"). A collapsed card "Memory (N sections)" appears on the reply. | "It answers straight away — and I can see why." |
| 0:42–0:50 | Expand the memory card. | The "Memory (N sections)" card expanded: monospace context showing IDENTITY/USER blocks and the long-term memory, including the Postgres decision saved in the earlier session. | "The project facts from before were loaded into this turn." |
| 0:50–0:57 | The answer itself references the remembered decision. | The assistant reply text visibly citing the earlier choice (e.g. "Since you chose Postgres as the source of truth, keep the read model as a projection off it…"). | "The answer builds on what it knew, not on what I just typed." |
| 0:57–1:00 | End card. | Sero logo + line: "Persistent project memory across sessions." | "It remembered the project." |

## Honest caveats

- What persists: long-term facts, decisions and preferences (`MEMORY.md`), your profile (`USER.md`), the agent's identity (`IDENTITY.md`), and append-only daily activity logs. They live as markdown in the global workspace (`~/.sero-ui/workspaces/global/`) and are git-tracked by Sero's checkpoint system.
- What does not persist: the raw chat transcript is not replayed into a new session. Only what was saved to the memory files carries over — facts the agent proactively saved, the activity observer's per-turn "modified/ran" lines, and the on-exit session summary. If a fact was never saved, it will not be there.
- How it reaches the new session: on each turn Sero injects identity, profile and long-term memory into the system prompt (frozen once per session by default), plus semantic search results retrieved from memory using your current prompt. Daily logs are search-only — they surface through retrieval when relevant, not by being injected wholesale.
- Required setup: memory is the built-in `sero-memory-plugin`. On first run it asks a short 3-step setup (identity, profile, long-term memory) before any of this works. Semantic recall uses QMD; if QMD is unavailable it degrades to keyword/grep search, so cross-phrasing recall is weaker but still functional.
- The "Show memory context" Database toggle sits in the prompt-area toolbar and is off by default; the memory cards it reveals are display-only and add no tokens to the model. In the demo it is turned on purely so the viewer can see the injected context.
- Labelled cuts and real durations: the "Earlier today" segment is a genuine earlier session recorded separately, shown as a cut, not one continuous take. "Quit + reopen" is real but compressed — the relaunch itself takes a few seconds and is trimmed to about two.
- Beta rough edges: proactive saving depends on the model deciding a fact is worth keeping, so it is not guaranteed for every detail — pre-check the earlier session actually saved the decision before filming. QMD re-indexing is debounced and asynchronous, so a just-saved fact can take a moment to appear in semantic search; leaving a gap between the two sessions avoids a miss. The on-exit summary runs at low reasoning effort and is brief by design.
