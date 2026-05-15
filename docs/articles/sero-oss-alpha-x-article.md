# We need better than chat boxes for coding agents

Today I’m open-sourcing the alpha of **Sero**.

Sero is a local-first, agent-first desktop workspace for macOS, Linux, and Windows.

The short version:

**Zero context switch, zero sprawl.**

The longer version is that modern agent-assisted development has outgrown the chat box.

You have an editor in one window, terminals in another, browser previews elsewhere, logs in a tab, MCP tools in config files, scripts scattered around the repo, and the agent trying to infer what is happening through text alone.

That works surprisingly well.

But it also feels like the wrong shape.

Agents are becoming active participants in software work. They don’t just answer questions anymore. They inspect code, run commands, operate tools, test interfaces, modify files, manage workflows, and carry context across sessions.

So why are we still giving them a tiny chat panel bolted onto an old workflow?

Sero is my attempt at a different shape.

## Sero is a workshop, not another chat UI

Sero is a dedicated desktop shell for agent-assisted software work.

Inside one workspace, you get:

- agent chat
- files
- terminals
- previews
- browser flows
- project memory
- plugins
- background jobs
- visual inspection
- workspace state

The goal isn’t to replace your editor, terminal, browser, or Git client.

The goal is to coordinate them around the agent loop.

When the agent needs to inspect a UI, it should be able to see the product.

When it needs context, that context should live with the workspace.

When you need a new tool, workflow, or dashboard, it should be possible to build it as a plugin and use it immediately.

That is the direction Sero is exploring.

## Built directly on Pi

Sero is built on top of **Pi**, the open-source coding agent platform.

Pi provides the agentic harness: sessions, tools, extensions, skills, prompts, and the core loop.

Sero adds the desktop environment around it.

The way I think about it:

**Pi is the brain.  
The container is the body.  
The Electron UI is the face.**

Sero does not treat the agent as a side panel. The agent is part of the workspace operating model.

Plugins can expose Pi tools, slash commands, React UIs, widgets, background jobs, and provider integrations.

That matters because real workflows are not only text.

A Git workflow may need a UI.

A scheduler may need background runtime.

A browser workflow may need screenshots.

A memory system may need persistent project context.

A plugin should be able to bring all of that with it.

## Local-first by default

Sero is intentionally not a hosted agent platform.

The alpha direction is local-first desktop software.

Your workspace files, logs, auth state, memory, runtime state, and plugin data are designed to stay on your machine unless you explicitly connect external services.

On supported machines, Sero can run workspaces with Apple Container or Docker for stronger isolation and a path toward Linux-like development parity.

If containers are unavailable, Sero can still run in host mode with reduced capabilities where supported.

This is early, imperfect, and not trying to hide that.

But the principle matters:

**The development environment should belong to the person doing the work.**

## Why open source now?

Because Sero is at the stage where it needs real users, real contributors, and real pressure from real workflows.

The alpha is source-only.

It is rough.

The plugin and runtime contracts are not stable yet.

The UX still needs polish.

Theming is incomplete.

Some flows will change.

Some things will break.

But the core idea is now concrete enough to share:

**agent workflows should have their own native workspace, not just another chat surface.**

I want Sero to become a place where people can experiment with that idea in the open.

## What you can do with it today

In the current alpha, Sero includes:

- an Electron + React desktop shell
- Pi-backed chat sessions
- workspace-based project organization
- explorer/editor/terminal/browser/preview surfaces
- Apple Container and Docker-backed workspace execution
- host-mode fallback where supported
- persistent memory
- built-in plugin architecture
- plugin UIs loaded into the desktop shell
- scheduler/reminder tooling
- Git/VCS surfaces
- docs and test infrastructure

It is aimed at early adopters and contributors building from source across macOS, Linux, and Windows, with macOS Apple Silicon as the maintainer-validated baseline.

If you want polished end-user software, wait.

If you like trying weird developer tools before they are fully safe, this is for you.

## The bigger bet

I think the next wave of developer tools will not just be “IDE + AI.”

It will be environments where agents, tools, UI, project state, memory, automation, and runtime are composed together.

Not everything should happen in chat.

Not every useful tool should be an MCP server hidden behind text.

Not every workflow should be trapped in a SaaS tab.

There is room for a local, extensible, agent-native workshop.

That is what Sero is trying to become.

## Try it

Sero is open source under Apache-2.0.

Repo: https://github.com/sero-labs/sero  
Website: https://sero-ai.dev  
Docs: https://docs.sero-ai.dev

Current alpha requirements:

- macOS, Linux, or Windows
- Node.js 22
- pnpm 10
- Docker or Apple Container recommended for the full experience

Run from source:

```bash
pnpm install
pnpm build
pnpm dev
```

If you try it, I’d love feedback on the shape of the product:

What feels promising?  
What feels wrong?  
What should an agent-native workspace do that today’s tools don’t?

Sero is early.

But I think the direction is worth building in public.

**Zero context switch. Zero sprawl.**

---

## Title options

1. **Sero is now open source: a local-first workspace for agent-assisted software**
2. **Launching Sero OSS alpha**
3. **We need better than chat boxes for coding agents**
4. **Sero: an open-source local Workshop OS for AI agents**

## Suggested launch post to link the article

Sero is now open source.

It’s a local-first, agent-first desktop workspace built on Pi.

The bet: coding agents need more than chat boxes. They need a real workshop — files, terminals, browser, memory, plugins, runtime, and UI in one place.

OSS alpha here ↓  
[article link]
