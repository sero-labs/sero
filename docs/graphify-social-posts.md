# Graphify launch — social posts

---

## X (Twitter)

---

**Post 1 — the hook**

```
your agent now knows your entire codebase

graphify is now built into sero — it builds a knowledge graph of your code, merges graphs across all your workspaces, and lets the agent trace connections it couldn't see before

one build. updates automatically in the background after that.
```

---

**Post 2 — the problem it solves**

```
the thing that bothered me: paste a long file into chat, watch the agent lose track of it by message 10

graphify solves this differently — indexes your code into a graph once, then the agent can search it at any point without burning your context window

works across all your workspaces at once
```

---

**Post 3 — concrete example**

```
asked my agent: "how does the payment flow connect to the user profile?"

it answered correctly. without me pasting anything.

graphify had indexed both repos and traced the connection through the graph
```

---

**Post 4 — thread opener**

```
graphify is now a built-in sero plugin. here's what it actually does:

→ indexes your code into a knowledge graph (uses LLM once for the initial build)
→ merges graphs across all opted-in workspaces into one profile-wide graph
→ gives the agent 6 tools: search, trace paths, explain nodes, check status, rebuild, disable

after the first build, updates are push-based — no polling, no cost
```

---

**Post 5 — technical detail**

```
graphify update mechanics:

- finish a coding session → one incremental refresh queues automatically
- refresh is AST-only, no LLM call
- profile graph re-merges after every change
- sero closed overnight? boot catch-up runs on next start

zero polling. cost stays flat after day one.
```

---

**Post 6 — short punchy standalone**

```
asked "what calls into this function?" across three repos at once

sero + graphify just answered it

used to require grep + context juggling
```

---

## Discord

---

**Post 1 — full announcement**

```
**Graphify is now a built-in plugin**

Quick rundown of what's in this release:

Graphify builds a knowledge graph of your code across all the workspaces you opt in to. The first build is the only step that touches your AI provider — it reads your code once to extract concepts and relationships. After that, updates run automatically after each coding session (AST-only, no LLM, no cost).

The agent gets six new tools it picks up automatically: search across all workspaces, trace paths between concepts, explain any node, check index status, and manage indexing per workspace.

There's also auto-context: at session start, the agent gets a quiet orientation from your workspace's graph. On broad searches, graph hints get appended. Both are on by default and can be turned off.

**To try it:** open Graphify from the sidebar, toggle on the workspaces you want, wait for the first build.

Docs: https://docs.sero-ai.dev/plugins/graphify

Happy to answer questions — especially curious how it holds up on large monorepos.
```

---

**Post 2 — discussion starter**

```
been using graphify for a few weeks before shipping it

the most useful thing, unexpectedly: asking about *relationships* rather than definitions. "what calls into X", "how does A connect to B", "what does this module depend on" — that's where the graph beats grepping

what are the moments where you find yourself wishing the agent had better codebase context? curious what use cases come up for you
```

---

**Post 3 — technical transparency post**

```
a few implementation details about graphify that took some care to get right:

**no repo pollution** — graph files live in `~/.sero/apps/graphify/`, never inside your workspaces. container sessions get read-only access to graphs, your code stays in its container.

**push-based updates** — after a coding session, one incremental refresh queues automatically. AST only, no LLM. no background polling at all.

**provider-agnostic** — works with Claude, OpenAI, Gemini, DeepSeek, Kimi, or Ollama. uses whatever credentials you've already set up in Sero.

**first build is the only costly step** — set a token budget in settings if you want to cap it.

built on the open-source Graphify project by @SafiShamsi
```

---
