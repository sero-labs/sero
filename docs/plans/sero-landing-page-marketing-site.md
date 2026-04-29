# Sero Landing Page / Marketing Site Plan

The landing page should not position Sero as only a polished agent IDE or a desktop shell with plugins.

The stronger idea is:

> **Sero is the agent you can make your own.**

It starts as a local-first macOS workspace for agent-assisted work, but its real leverage is that users can shape what their Sero becomes. It can be a coding partner, personal assistant, research desk, operations console, project memory system, or something more specific — because capabilities can be added as plugins, agents, skills, prompts, memory, providers, and integrations.

The page should communicate this clearly:

> If Sero cannot do something yet, you can ask Sero to help build the capability and keep it as part of your workspace.

That is the value proposition. The project is not just extensible in the developer-platform sense; it is **user-directed, agent-assisted extensibility**.

## Repo research used

This plan is grounded in the current project docs, curated public docs, screenshots, and code:

- `README.md` — Sero is a local-first, agent-first desktop workspace with plugin-first extensibility and Pi-native agent model.
- `docs/sero.md` — Pi is the brain; Sero is built on Pi, not a chatbot bolted onto a UI.
- `apps/docs-site/docs/guide/overview.md` — the public alpha framing: project workspaces, Pi-backed chat, plugins, terminals, previews, and local runtime orchestration in one shell.
- `apps/docs-site/docs/guide/workspace-and-chat.md` — profile onboarding, model/provider setup, workspace/session tree, persistent global chat panel, command menu, layout persistence, and screenshots for the main shell.
- `apps/docs-site/docs/guide/explorer-workspace.md` — files, attached roots, editor, browser/preview tabs, diffs, terminals, dev-server surfaces, and runtime caveats.
- `apps/docs-site/docs/guide/settings-models-admin.md` — Admin surfaces for configuration files, agents, skills, prompts, and sessions.
- `apps/docs-site/docs/guide/plugins-and-apps.md` and `apps/docs-site/docs/guide/app-store-favorites.md` — user-facing plugin model, App Store, discovery, favorites, install/uninstall, retained state, compatibility, and trust boundaries.
- `apps/docs-site/docs/guide/memory.md` — user-facing memory model: profile/global markdown files, chat context visibility, scratchpad, slash commands, privacy limits.
- `apps/docs-site/docs/guide/web.md`, `mcp.md`, `scheduler-reminders.md`, `git-integration.md`, and `models-and-providers.md` — public descriptions of built-in plugin capabilities and their screenshots.
- `apps/docs-site/docs/assets/images/` — existing screenshot library for Explorer, chat, Admin, App Store, plugin management, local plugin development, memory, web research, MCP, Git, Scheduler, model setup, themes, and remote control.
- `docs/features/sero-apps.md` — a Sero app is a Pi extension plus optional React UI, shared file-backed state, and optional runtime behavior.
- `docs/plugins/guide.md` and `docs/plugins/technical.md` — plugins can be installed from npm, git, or local paths and can ship UI, tools, commands, runtime behavior, provider metadata, and widgets.
- `docs/features/local-plugin-development.md` — Sero can run a local plugin checkout directly in production Sero via Admin → Plugins → Local Plugin Development.
- `packages/templates/skills/sero-plugin/SKILL.md` — the canonical plugin shape includes Pi extension, web UI, background runtime, shared state, prompt templates, skills, widgets, and host capabilities.
- `docs/features/subagents.md` and `apps/desktop/electron/features/subagent/extensions/tool.ts` — users can create named specialist agents with `create_agent`; definitions are editable markdown files under the active Sero agent directory and are discovered dynamically.
- `plugins/sero-admin-plugin` — Admin already exposes management surfaces for Agents, Skills, Prompts, Settings, Models, Plugins, Logs, and Sessions.
- `docs/features/memory.md` — deeper Memory implementation: identity, user profile, long-term facts, daily logs, scratchpad, context injection, lifecycle hooks.
- Built-in plugin manifests — current examples include Admin, Scheduler, Git, MCP, Memory, Web, User Feedback, and provider plugins.

### Public screenshot inventory to mine before creating new assets

The landing page should reuse or art-direct from the existing curated screenshot set before inventing visuals from scratch:

| Story | Existing screenshots |
|---|---|
| Main workspace / chat | `explorer-view.jpg`, `workspace-sessions.jpg`, `chat.jpg`, `chat-menu.jpg`, `command-menu.jpg` |
| Project workspace | `explorer.jpg`, `explorer-editor.jpg`, `explorer-diff.jpg`, `explorer-browser.jpg`, `explorer-preview-2.jpg`, `explorer-terminal.jpg`, `explorer-dev-servers.jpg`, `workspace-references.jpg` |
| Customization / DIY agent | `admin-agents.jpg`, `admin-skills.jpg`, `prompt-management.jpg`, `admin-settings.jpg`, `admin-sessions.jpg` |
| Plugin ecosystem | `app-store.jpg`, `app-discovery.jpg`, `favourites-menu.jpg`, `plugin-management.jpg`, `local-plugin-preview.jpg`, `plugin.jpg` |
| Plugin examples | `kanban.jpg`, `kanban2.jpg`, `kanban-options.jpg`, `imagegen.jpg`, `debate.jpg` |
| Memory / durable context | `memory.jpg`, `memory-chat.jpg`, `slash-commands.jpg` |
| Built-in capabilities | `git-management.jpg`, `git-ship-deck.jpg`, `mcp.jpg`, `mcp-server.jpg`, `mcp-manager.jpg`, `research.jpg`, `cron-jobs.jpg`, `cron-jobs-editor.jpg`, `cron-reminder.jpg` |
| Onboarding / profiles / providers | `create-profile.jpg`, `create-profile-2.jpg`, `provider-list.jpg`, `model-tiers.jpg`, `model-select.jpg`, `admin-model.jpg`, `admin-model-tiers.jpg`, `model-manage.jpg` |
| Themes / personalization | `theme-select.jpg`, `theme-editor.jpg`, `theme-editor-2.jpg`, `theme-editor-3.jpg` |

These images should be treated as the first visual source of truth. The marketing design can crop, frame, sequence, or restage them, but it should not ignore the current public product surface.

## Product thesis

Sero is a **DIY agent desktop**.

That does not mean a toy customization panel. It means:

1. **The agent has a place to work** — real project folders, sessions, chat, tools, runtime, plugins, and state live together.
2. **The agent can gain durable abilities** — useful workflows can become plugins, tools, commands, panels, widgets, background runtimes, provider integrations, prompts, skills, or specialist agents.
3. **The user owns the shape of the agent** — different profiles can evolve into different Seros: work, personal, research, open-source, experiments.

A concise public framing:

> Sero is a local-first desktop where you can build with an agent, then teach that agent new abilities by turning repeated workflows into plugins.

## Primary audience

End users first, with a technical bias:

- developers who already use coding agents and want the workflow to feel less temporary
- power users who want a personal AI assistant they can actually customize
- open-source maintainers who need project memory, review helpers, git tooling, and repeatable workflows
- builders who want one agent workspace that can grow around their habits
- plugin authors who want to create agent-usable tools with UI, state, and background behavior

## The pain to name clearly

Most AI tools give users a chat box. The chat box can help, but the environment around it is disposable:

- the agent forgets what matters unless the user keeps reminding it
- recurring workflows stay as prompt recipes instead of becoming durable tools
- project context is scattered across terminals, browsers, editors, notes, and old chats
- custom behavior requires leaving the product and wiring external systems manually
- personal assistant use cases and coding use cases live in separate silos

Sero's answer:

> Stop adapting yourself to a generic agent. Adapt the agent workspace to you.

## The value proposition in one sentence

> Sero is a local-first macOS workspace where an AI agent can work beside your projects, remember context, and turn repeated workflows into durable plugins you ask it to build.

Alternative shorter versions:

- **Build the agent only you need.**
- **Turn prompts into tools.**
- **Your agent, your tools, your workspace.**
- **A local workspace that grows new abilities.**
- **An agent you can make your own.**

Recommended hero headline:

> **Build the agent only you need.**

Recommended hero subhead:

> Sero turns repeated prompts into tools, plugins, assistants, and workflows inside a local-first macOS workspace.

Supporting line:

> Start with a capable agent workspace. Then ask Sero to become the coding partner, personal assistant, research desk, or project cockpit your work actually needs.

This is stronger than “A calm desktop for building with agents” or “An agent you can make your own.” Those lines are accurate, but they do not explain why a user should care. The sharp claim is that Sero converts repeated agent work into durable personal software.

## Messaging hierarchy

### Level 1 — User-facing promise

**Make Sero become what you need.**

Sero can be a coding partner, personal assistant, research desk, project memory, or custom operations console because its capabilities are not fixed.

### Level 2 — Mechanism

**Capabilities become durable surfaces.**

A repeated workflow can become:

- a tool the agent can call
- a command the user can run
- a sidebar app
- a dashboard widget
- a background runtime
- a prompt template
- a specialist subagent
- a skill
- a provider or external integration

### Level 3 — Technical credibility

**This is built into the architecture.**

Plugins are Pi extensions plus optional React UIs and optional background runtimes. They use shared file-backed state, Module Federation, host capabilities, and manifest-driven discovery. Local plugin development lets a checkout run directly in Sero.

### Level 4 — Honest alpha boundary

Sero is currently source-only OSS alpha, macOS Apple Silicon focused, with evolving plugin/runtime contracts. The site should present the vision confidently while being precise about current support.

## What Sero can become

This should be a major marketing section. The point is to help users imagine their own Sero, not just admire the default app.

### Coding partner

For repositories, branches, diffs, reviews, tests, terminals, previews, and project-specific workflows.

Relevant current pieces:

- workspace-bound sessions
- Git plugin
- subagents such as scout, analyst, reviewer, test-writer
- local runtime / containers
- plugin tools and commands

### Personal assistant

For reminders, recurring prompts, personal memory, profiles, web research, and custom integrations.

Relevant current pieces:

- Scheduler plugin
- Memory plugin
- Web plugin
- profile-specific state
- custom plugins for user-specific services

### Research desk

For web search, source fetching, bookmarks, notes, summaries, specialist agents, and saved context.

Relevant current pieces:

- Web plugin
- Memory plugin
- MCP plugin
- custom agents and skills

### Operations console

For dashboards, monitors, routines, external APIs, provider plugins, and background jobs.

Relevant current pieces:

- plugin UIs
- dashboard widgets
- background runtimes
- MCP / external service integration
- provider metadata

### Custom domain assistant

For any repeatable workflow the user wants to teach Sero: finance tracking, writing workflows, home automation, customer support triage, release management, content pipelines, or personal knowledge systems.

The claim should be:

> If it can be expressed as local state, UI, tools, commands, background work, or an integration, Sero can grow toward it through plugins.

Avoid claiming every domain is supported out of the box.

## The core product loop

This loop should be the centerpiece of the landing page.

### The Sero loop

1. **Ask**
   Tell Sero what you want to be able to do.

2. **Build**
   Sero helps create or modify a plugin: shared state, tools, UI, runtime, prompts, or skills.

3. **Activate**
   Run the plugin through Local Plugin Development or install it from a package/source.

4. **Use**
   The new capability appears as an app, tool, command, widget, or background behavior.

5. **Keep improving**
   The next time the workflow changes, ask Sero to extend it again.

Short marketing version:

> Ask for a capability. Turn it into a plugin. Keep it forever.

This is the important “self-improvement” message. It should not be phrased as vague autonomous self-modification. It is user-directed, agent-assisted capability building.

## Recommended page structure

### 1. Floating nav

Minimal, premium, detached from the top.

Links:

- Product
- Make it yours
- Plugins
- Docs
- GitHub
- Get Sero / Join alpha

### 2. Hero

Headline:

> **An agent you can make your own.**

Subhead:

> Sero is a local-first macOS workspace where your agent can code, remember, research, run tools, and grow new capabilities through plugins you ask it to build.

Primary CTA:

- **Get the macOS alpha** or **Join the alpha**

Secondary CTA:

- **See how Sero grows**

Hero visual:

A large product theatre showing the Sero desktop. The important detail is not only chat beside code; it should show the workspace gaining a new capability:

- prompt: “Create a release checklist plugin for this repo.”
- generated plugin files or checklist UI appearing in the center panel
- plugin tile appearing in the sidebar
- agent calling the new tool in the chat panel

This visual communicates the loop immediately.

### 3. Problem section

Headline:

> **Generic agents make you carry the workflow.**

Copy:

> You paste the same context, repeat the same instructions, reopen the same tools, and keep the useful parts in your head. A chat can help for one task, but it rarely becomes part of how you work.

Resolution:

> Sero turns useful workflows into durable workspace capabilities.

### 4. Product thesis section

Headline:

> **Your Sero can become different from mine.**

Three columns, but not generic feature cards — use a strong editorial layout.

#### Shape the agent

Edit memory, identity, prompts, skills, specialist agents, models, and profiles.

#### Shape the tools

Add plugins with tools, commands, UI, widgets, runtimes, providers, and external integrations.

#### Shape the workspace

Keep projects, sessions, runtime, context, and plugin state together.

### 5. The self-extension loop

Headline:

> **When Sero is missing a capability, ask it to make one.**

Use a five-step horizontal or vertical product flow:

1. “I need a weekly planning assistant for this project.”
2. Sero scaffolds a plugin.
3. The plugin registers tools and shared state.
4. The UI appears in the sidebar.
5. Future sessions use it as native behavior.

This should be the page’s most memorable section.

### 6. What can it become?

Headline:

> **Build the agent you actually wanted.**

Use four large use-case panels:

- Coding partner
- Personal assistant
- Research desk
- Operations console

Each panel should show concrete capability examples and one “make it yours” example.

Example copy:

> Start with Git, memory, web, scheduling, and subagents. Then add the plugin that only your workflow needs.

### 7. Plugin system section

Headline:

> **Plugins are not add-ons. They are how Sero learns new work.**

Copy:

> A Sero plugin can add an app UI, agent tools, commands, dashboard widgets, background runtime behavior, provider metadata, prompts, and skills. The agent can use those tools from future sessions, and the UI can keep persistent state with the workspace.

Show the architecture simply:

```txt
Plugin
├─ UI panel
├─ Agent tools / commands
├─ Shared file-backed state
├─ Background runtime
├─ Widgets
├─ Prompts / skills
└─ Provider or external integration
```

Avoid burying this in developer jargon, but do show enough detail to prove it is real.

### 8. Built-in starting points

Headline:

> **Sero starts with useful abilities. You decide what comes next.**

Show current bundled plugins and systems:

- Memory — identity, user profile, long-term facts, daily logs, scratchpad
- Scheduler — recurring prompts and reminders
- Web — search, fetch, code lookup, bookmarks, activity
- Git — branches, staging, commits, diffs, history
- MCP — connect external MCP tools and resources
- Admin — edit agents, skills, prompts, plugins, settings, logs, sessions
- Subagents — scout, analyst, reviewer, test-writer, plus custom named agents

This makes the product feel useful now while supporting the larger DIY story.

### 9. Local-first credibility

Headline:

> **Local-first by default. Extensible by design.**

Key points:

- macOS-focused desktop app
- real folders and workspaces
- profile-scoped state
- source-only OSS alpha posture
- container-backed workspaces when available
- host-mode fallback for reduced workflows
- plugins installed from npm, git, local paths, or run directly from local dev checkouts

### 10. Honest alpha section

Headline:

> **Early, useful, and built in public.**

Copy:

> Sero is a source-only OSS alpha for macOS on Apple Silicon. The core idea is already visible: a local agent workspace that can grow around the way you work. Some plugin/runtime contracts will evolve as the ecosystem hardens.

Do not hide the alpha status. It builds trust with technical users.

### 11. Final CTA

Headline:

> **Make Sero yours.**

Subhead:

> Start with a local agent workspace. Then teach it the tools, assistants, and workflows you want to keep.

CTAs:

- **Get Sero / Join alpha**
- **Read plugin docs**
- **View source**

## Feature bento rewrite

The old bento was too generic. Use these instead.

### Large card: Make new abilities

> Ask Sero to create the missing tool, panel, command, or background job. When it works, keep it as a plugin.

Visual: prompt → plugin files → sidebar app → agent tool call.

### Medium card: Personal memory and identity

> Sero can remember preferences, project facts, identity, daily work, and open scratchpad items across sessions.

Visual: memory files and injected context block.

### Medium card: Specialist agents

> Create named agents for recurring roles: reviewer, researcher, release manager, migration planner, support triage.

Visual: agent cards with model/thinking badges.

### Medium card: Workspace-bound state

> Sessions, plugin state, bookmarks, git context, and tools stay attached to the workspace instead of floating in chat history.

Visual: workspace tree and app state file.

### Wide card: UI + tools + runtime

> Plugins can ship React UI, Pi tools, commands, widgets, provider metadata, and long-running background behavior.

Visual: split architecture diagram.

### Small card: Local plugin development

> Run a plugin checkout directly in Sero while you iterate.

Visual: Admin plugin dev session state.

## Copy style rules

Use concrete language. Avoid generic AI marketing.

Good phrases:

- “An agent you can make your own.”
- “Ask for a capability. Turn it into a plugin. Keep it forever.”
- “Your Sero can become different from mine.”
- “Stop carrying workflows around as prompts.”
- “Plugins are how Sero learns new work.”
- “A local workspace that grows around your habits.”
- “Turn repeated work into durable tools.”

Avoid:

- “revolutionize”
- “unleash”
- “next-generation”
- “10x”
- “seamless”
- “autonomous workforce”
- “AI-powered productivity”
- “magic”

## Why anyone should care

The site needs to answer this faster and more concretely than a normal agent-tool landing page.

### The generic-agent problem

Most AI tools rent the user a generic assistant. The user still has to carry the workflow: prompts, preferences, repeated instructions, project rituals, integrations, and context.

### The Sero difference

Sero turns the useful parts of those repeated interactions into local, durable capabilities:

- a recurring prompt becomes a prompt template or scheduled job
- a repeated role becomes a named specialist agent
- a persistent preference becomes memory or identity
- a workflow checklist becomes an app panel or widget
- an integration becomes a plugin tool the agent can call
- background coordination becomes a plugin runtime

### The emotional payoff

The product is not “another place to chat with an AI.” It is a place where your agent gets more like yours every week.

### The practical payoff

Users should care because Sero reduces repeated setup. The second time they need a workflow, it should be easier. The tenth time, it should feel native.

## Visual direction

The visual system should support the DIY-agent thesis and avoid looking like another Linear/Vercel/AI SaaS clone.

### Aesthetic name

**Workshop OS**

Not pure SaaS gloss. Not cyber AI. It should feel like a precise, personal, local machine for making tools.

### What makes it stand out

The landing page should use a **toolmaking / field-manual** art direction rather than generic glass SaaS:

- real Sero screenshots treated as product evidence, not decoration
- annotated “workbench” compositions: prompt → files → plugin manifest → sidebar app → tool call
- cutaway diagrams of plugin anatomy using actual file names and manifest fields
- visible local paths, dev ports, state files, and agent definitions where appropriate
- capability “modules” that feel like parts being installed into a personal machine
- before/after contrasts: disposable prompt recipe versus durable Sero plugin
- one interactive “what should your Sero become?” selector that morphs the product theatre between coding partner, personal assistant, research desk, and operations console

The distinctive visual metaphor is **a workshop for making agents**, not a cloud dashboard.

### Palette

Use warm monochrome page surfaces with dark product frames.

```txt
Canvas:        #F7F4ED / #FAF8F3
Ink:           #161616
Muted text:    #746F67
Panel dark:    #0D0E0E
Panel mid:     #171918
Hairline:      rgba(22, 22, 22, 0.10)
Accent:        muted moss / oxide green / aged copper
```

Avoid neon purple/blue “AI” styling.

### Typography

Do **not** default to Geist. Geist is clean, but it is now strongly associated with Vercel-style developer marketing and will make Sero feel more generic.

Recommended open-source stack:

```txt
Display: Bricolage Grotesque
Body:    Mona Sans or Atkinson Hyperlegible Next
Mono:    Commit Mono or Berkeley Mono if licensed
```

Why this works:

- **Bricolage Grotesque** has a maker/workshop character that fits the DIY-agent thesis and is less sterile than Geist/Satoshi.
- **Mona Sans** keeps body/UI copy technical and readable without feeling like the default SaaS font.
- **Commit Mono** reinforces code, manifests, plugins, and local development without becoming a retro-terminal cliché.

Premium licensed alternative if available:

```txt
Display: ABC Diatype / LL Bradford / FK Grotesk Neue
Body:    ABC Diatype / Suisse Int’l
Mono:    Berkeley Mono / JetBrains Mono
```

Use typography as a brand signal: generous, precise, slightly idiosyncratic, never over-polished.

### Layout

Prefer:

- asymmetric editorial sections
- large product theatre
- one memorable “self-extension loop” sequence
- bento only where it explains real product surfaces
- wide headings that stay to 2–3 lines
- annotated screenshots and technical receipts from the real product

Avoid:

- generic 3-column SaaS feature rows
- fake metrics
- fake customer logos
- tiny unreadable product screenshots
- vague platform diagrams with no user story
- generic frosted-glass cards with purple glow

## Asset plan

### Existing screenshot-first rule

Before generating new conceptual assets, audit `apps/docs-site/docs/assets/images/` and select a screenshot-backed visual for each major claim. The marketing site should feel connected to the real product, not like a speculative mockup.

Recommended first-pass source mapping:

- Hero shell base: `explorer-view.jpg` or `chat.jpg`
- DIY/customization proof: `admin-agents.jpg`, `admin-skills.jpg`, `prompt-management.jpg`, `local-plugin-preview.jpg`
- Plugin ecosystem proof: `app-store.jpg`, `app-discovery.jpg`, `plugin-management.jpg`, `plugin.jpg`
- Memory proof: `memory.jpg`, `memory-chat.jpg`, `slash-commands.jpg`
- Coding partner proof: `explorer-editor.jpg`, `explorer-diff.jpg`, `explorer-terminal.jpg`, `git-management.jpg`, `git-ship-deck.jpg`
- Personal assistant proof: `cron-jobs.jpg`, `cron-jobs-editor.jpg`, `cron-reminder.jpg`, `memory.jpg`
- Research desk proof: `research.jpg`, `web.md` screenshot context, `mcp.jpg`, `mcp-manager.jpg`
- Personalization proof: `create-profile.jpg`, `model-tiers.jpg`, `theme-editor.jpg`

New generated/composited assets should only fill gaps the screenshots cannot express, especially the “ask Sero to build a plugin” loop.

### Asset 1 — Hero: capability creation theatre

A staged Sero screenshot or high-fidelity mock showing:

- left sidebar with existing apps
- chat request: “Build me a weekly planning plugin for this workspace.”
- generated plugin surface in the main panel
- new plugin tile appearing in the sidebar
- agent calling the plugin tool

This is the most important asset. It must communicate “Sero can become more.”

### Asset 2 — Extension loop sequence

Five frames:

1. Ask for a capability.
2. Sero creates plugin files.
3. Local Plugin Development activates the checkout.
4. New UI/tool appears.
5. Future session uses it.

This can be CSS/React rather than screenshots.

### Asset 3 — What Sero can become

Four illustrated product states:

- coding partner
- personal assistant
- research desk
- operations console

Each should be visibly the same Sero shell with different plugins/agents active.

### Asset 4 — Plugin anatomy diagram

A beautiful diagram of one plugin containing:

- UI
- tools
- commands
- shared state
- runtime
- widgets
- prompts/skills
- provider metadata

### Asset 5 — Admin customization surface

Screenshot or mock of Admin showing Agents, Skills, Prompts, Plugins. This supports the claim that Sero is user-shaped, not merely developer-shaped.

### Asset 6 — Memory / identity surface

Visual showing identity, user profile, long-term memory, scratchpad, and daily logs as local files/context blocks.

## Capital-attractive signals without saying it directly

The strongest signal is not “big market.” It is that Sero has a compounding product loop.

### Category creation

Sero is not just another coding assistant. It is a **DIY agent desktop**.

### User-directed extensibility

Users can shape Sero by asking it to create capabilities, not just by configuring settings.

### Ecosystem depth

Plugins are durable packages with UI, tools, commands, state, runtime behavior, widgets, providers, prompts, and skills.

### Personalization moat

Memory, identity, profiles, agents, skills, prompts, and plugin state make each Sero increasingly personal over time.

### Technical seriousness

Local-first state, container-backed workspaces, Pi-native sessions, Module Federation, manifest-driven capabilities, plugin compatibility checks, and source transparency.

### Honest momentum

Source-only alpha, real plugin examples, built-in plugin surfaces, and public docs make the project credible without pretending it is finished.

## Implementation recommendation

Use `apps/docs-site` first unless a separate `apps/landing` is explicitly desired.

### Option A — upgrade `apps/docs-site`

Pros:

- fastest route to a public-quality page
- docs and marketing stay close
- current deployment path likely already exists
- can link directly to plugin docs, support scope, and GitHub

Cons:

- Rspress customization may constrain highly cinematic motion

Best for: polished alpha launch.

### Option B — create `apps/landing`

Pros:

- full control over animation and art direction
- cleaner separation between marketing and docs
- better for a large public launch

Cons:

- more app setup
- extra deployment surface

Recommendation: **Option A first, Option B later if the landing page becomes a primary acquisition surface.**

## Suggested implementation shape for Option A

```txt
apps/docs-site/
  docs/
    index.md
    assets/
      marketing/
        hero-capability-theatre.webp
        extension-loop-ask.webp
        extension-loop-build.webp
        extension-loop-activate.webp
        extension-loop-use.webp
        plugin-anatomy.svg
        admin-customization.webp
  src/
    components/
      landing/
        LandingPage.tsx
        LandingHero.tsx
        CapabilityTheatre.tsx
        ExtensionLoop.tsx
        SeroCanBecome.tsx
        PluginAnatomy.tsx
        BuiltInStartingPoints.tsx
        AlphaCta.tsx
        landing.css
```

Respect the repo file-size rule for source files: keep each component under 500 LOC.

## Animation approach

Use motion to explain the product loop, not to decorate.

Recommended:

- subtle load reveal for hero product frame
- step-by-step extension loop with CSS transforms/opacity
- hover states for “what Sero can become” panels
- reduced-motion fallback
- no heavy WebGL or fake AI particle effects

If adding animation dependencies, verify `apps/docs-site/package.json` first. It currently only depends on Rspress, so prefer CSS and small custom IntersectionObserver utilities unless a stronger implementation case exists.

## Concrete homepage draft

### Hero

**Build the agent only you need.**

Sero turns repeated prompts into tools, plugins, assistants, and workflows inside a local-first macOS workspace.

Supporting line:

Start with a capable agent workspace. Then ask Sero to become the coding partner, personal assistant, research desk, or project cockpit your work actually needs.

Buttons:

- Get the macOS alpha
- See how Sero grows

### Problem

**Generic agents make you carry the workflow.**

A chat can help with one task, but repeated work stays trapped in prompts, notes, and memory. Sero turns useful workflows into durable workspace capabilities.

### Product thesis

**Your Sero can become different from mine.**

Shape the agent with memory, identity, prompts, skills, profiles, and specialist agents. Shape the tools with plugins, commands, UIs, widgets, runtimes, and integrations. Shape the workspace around the way you actually work.

### Self-extension loop

**When Sero is missing a capability, ask it to make one.**

Ask for a capability. Sero helps build a plugin. Run it locally. Use it as a sidebar app, agent tool, command, widget, or background workflow. Keep improving it as your needs change.

### What can it become?

**Build the agent you actually wanted.**

Sero can grow into a coding partner, personal assistant, research desk, operations console, or domain-specific assistant because the capability surface is open-ended.

### Plugins

**Plugins are how Sero learns new work.**

A plugin can add UI, tools, commands, file-backed state, dashboard widgets, background runtime behavior, provider metadata, prompts, and skills.

### Starting abilities

**Useful from the start. Yours over time.**

Memory, Scheduler, Web, Git, MCP, Admin, subagents, profiles, prompts, and skills give Sero a starting shape. Plugins let users keep changing it.

### Local-first

**Local-first by default. Extensible by design.**

Sero works with real folders, profile-scoped state, local plugin checkouts, and container-backed workspaces when available.

### CTA

**Make Sero yours.**

Start with a local agent workspace. Then teach it the tools, assistants, and workflows you want to keep.

- Get Sero
- Read plugin docs
- View source

## Next steps

1. Replace the current landing-page copy with the DIY-agent positioning.
2. Create one strong hero visual showing capability creation, not just the shell.
3. Build the self-extension loop section before polishing secondary feature sections.
4. Capture or mock Admin customization surfaces for agents, skills, prompts, and plugins.
5. Keep alpha support language honest and link to docs rather than overclaiming.
