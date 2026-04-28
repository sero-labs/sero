# Docs Site Complete Coverage Plan

_Last updated: 2026-04-28_

## Goal

Turn `apps/docs-site/` into a complete beginner-friendly guide and reference for all functionality that already exists in Sero, including built-in desktop features, runtime behavior, CLI commands, model/provider setup, local LLM setup, visual/browser automation, evals, and external plugins in `../plugins`.

The docs must assume the reader has **no prior knowledge of Sero**. They should explain what Sero is, why a feature matters, where to find it in the UI, what happens when the user clicks or runs something, and how to recover when something goes wrong. Technical reference material is still needed, but it should support a user-friendly learning path rather than replace it.

This plan is documentation-only unless a feature is found to be undiscoverable because the product itself lacks labels/help text.

## Current state snapshot

`apps/docs-site/docs/` currently covers the basics:

- Start/setup: overview, installation, development setup.
- Workspace: workspaces/chat, Explorer, settings/admin, models/providers, MCP, themes.
- Built-ins: memory, web, remote control, scheduler, git.
- Plugins: plugin/app overview, app store/favorites, plugin author references.
- Reference: architecture, containers/host mode, state/folders, testing/evals, security/privacy, troubleshooting, limitations.

Major gaps remain:

- Container networking/dev-server behavior is under-explained, especially automatic exposure by container IP and why this avoids port contention.
- Container isolation model is not separated from host-mode setup/troubleshooting.
- Agent definitions and subagents exist in repo docs but are not surfaced in the docs site.
- `sero-cli` command coverage is missing as a canonical reference.
- Model providers are described generally, but the exact provider catalog and local/custom provider flow are not fully documented.
- LM Studio/local LLM setup needs a task guide.
- Browser mode, app screenshots, app interaction, preview capture, and MP4 recording need an operator guide.
- Evals need a clearer user/developer workflow and matrix.
- External plugins in `/Users/danielcarter/Documents/Dev/projects/sero/plugins` are mostly absent.
- Screenshot/media coverage is sparse and not governed by a repeatable capture checklist.

## Documentation principles

1. **Assume zero Sero knowledge.** Introduce every Sero-specific concept before using it: workspace, app/plugin, agent session, subagent, container, model provider, MCP, `sero-cli`, gateway, eval, and so on.
2. **Write user-first, not implementation-first.** Start pages with plain-language outcomes: what the feature does, why a user would use it, where it lives in the app, and the shortest successful path.
3. **Layer complexity progressively.** Use a structure like: overview → quick start → guided walkthrough → common workflows → troubleshooting → advanced/reference details.
4. **Group pages logically and preserve narrative flow.** Do not add new pages wherever there is space. Each section should have a clear purpose, related pages should sit together, and the sidebar should guide a reader from basic concepts to practical workflows to deeper reference material.
5. **Avoid random one-off sections.** If a topic does not fit the current information architecture, adjust the IA deliberately: rename groups, add a coherent subsection, or split overloaded sections instead of placing the page in an irrelevant area.
6. **Use friendly explanations before tables.** Reference tables are allowed, but every table should be preceded by context and followed by examples.
7. **Show real UI paths.** Prefer wording like “Open Settings → Models” or “Click the Web app in the sidebar” before mentioning files/classes/IPC internals.
8. **Docs are generated from the current app, not memory.** Each page must list source files inspected and commands used where relevant, but keep those provenance notes unobtrusive.
9. **Separate user guide from reference.** Guides answer “how do I do X?”; reference answers “what exactly exists and how does it behave?”. Reference pages should still include short explanations and examples.
10. **Screenshots should prove current UI.** Capture from a clean/default profile where possible, with secrets hidden and test data clearly fake.
11. **Use ASCII diagrams where they clarify flow or architecture.** Prefer small, readable diagrams for runtime paths, container networking, agent/subagent delegation, plugin loading, CLI command routing, and data/storage flows. Keep diagrams close to the explanation they support.
12. **Every CLI/plugin/provider table needs an owner source.** Prefer `package.json` manifests, CLI registry help strings, IPC handlers, and extension registrations.
13. **Avoid documenting planned behavior as shipped.** If a feature is partial/experimental, mark it explicitly.

## Phase 1 — Inventory and source-of-truth audit

Create `apps/docs-site/docs/reference/coverage-audit.md` with a machine-readable-ish checklist of product areas and links to current docs pages.

### 1.1 Desktop feature inventory

Inspect these areas and record feature names, UI entry points, source files, and current docs coverage:

- Shell/layout: title bar, main sidebar, chat panel, status bar, command menu, dashboard.
- Profiles/onboarding: provider setup, profile copy/migration, health checks.
- Workspace management: create/open/remove/switch, workspace state, `.sero-workspace.json`, host/container mode.
- Explorer: files, editor, previews, HTML iframe preview, terminals, LSP/editor state.
- Chat/agent sessions: multi-session pool, model switching, context controls, prompt/skill/agent management.
- App/plugin runtime: app discovery, favorites, widgets, module federation, app agents, app state.
- Built-in apps/plugins: Admin, Cron/Scheduler, Git, MCP, Memory, Web, User Feedback, Alibaba provider.
- Integrations: GitHub auth/VCS, Tailscale gateway/remote control, MCP OAuth.
- Visual/app control: app navigation, screenshots, DOM interaction, recording, preview tabs.
- Testing/evals/security: unit/e2e/eval scripts, promptfoo, security/privacy boundaries.

### 1.2 CLI inventory

Generate the canonical `sero-cli` command list from `apps/desktop/electron/cli/commands/**` and extension bridge registrations.

Currently visible host namespaces include:

| Namespace | Current source | Coverage needed |
|---|---|---|
| `app` | `electron/cli/commands/apps/app-control.ts` | navigation, screenshots, click/type/scroll/select/hover/inspect/get-text, MP4 record, preview |
| `appstate` | `electron/cli/commands/apps/app-state.ts` | app state read/write/reset behavior |
| `artifacts` | `electron/cli/commands/apps/artifacts.ts` | artifact registry lifecycle |
| `browser` | `electron/cli/commands/browser/browser.ts` | tabs/pages/browser mode operations |
| `devserver` | `electron/cli/commands/container/devserver.ts` | list/register/stop, container IP exposure |
| `terminal` | `electron/cli/commands/container/terminal.ts` | terminal listing/read/control |
| `editor` | `electron/cli/commands/editor/editor.ts` | active editor/file context |
| `vcs` | `electron/cli/commands/vcs/vcs.ts` | status/log/diff/checkpoint/push/remote/fetch/bookmarks |
| `session` | `electron/cli/commands/agent/session.ts` | session info |
| `set-title` | `electron/cli/commands/agent/session.ts` | rename session |
| `workspace` | `electron/cli/commands/workspace/workspace.ts` | list/info/create/open/remove/switch and confirmation gates |
| plugin tool commands | bridged from `pi.registerTool()` | per-plugin command tables |

Deliverables:

- `apps/docs-site/docs/reference/sero-cli.md`: exhaustive command reference with syntax, examples, output shape, side effects, errors, and batch behavior.
- `apps/docs-site/docs/guide/agent-visual-control.md`: task guide for screenshots, interactions, previewing dev servers, and screen recording.
- Update sidebar/nav to expose both pages.

### 1.3 Provider/model inventory

Use these sources:

- Built-in API-key provider catalog: `apps/desktop/electron/shared/auth/provider-catalog.ts`.
- OAuth provider catalog from Pi SDK via `getOAuthProviders()`.
- Plugin-defined providers from `sero.providers` in plugin `package.json`, currently including Alibaba Coding Plan.
- Local/custom model config: `~/.sero-ui/agent/models.json`, handled by `local-models.ts`.

Built-in API-key providers currently exposed by Sero:

- Anthropic
- OpenAI
- Google/Gemini
- OpenRouter
- xAI
- Groq
- Cerebras
- Mistral
- Azure OpenAI
- Hugging Face
- Vercel AI Gateway
- ZAI
- OpenCode
- Kimi
- Plugin-defined providers, e.g. Alibaba Coding Plan

Deliverables:

- Expand `guide/models-and-providers.md` with exact supported provider list, auth modes, env var behavior, health states, model tiers, and failure recovery.
- Add `guide/local-llms-lm-studio.md` with LM Studio setup:
  - start LM Studio local server;
  - choose OpenAI-compatible API;
  - base URL such as `http://localhost:1234/v1`;
  - API key `none` or LM Studio configured key;
  - fetch/test models;
  - assign LOW/MED/HIGH tiers;
  - troubleshoot container/host reachability if a local endpoint is consumed from inside a container.
- Add `reference/models-json.md` for custom provider schema and supported APIs: OpenAI completions/responses, Anthropic messages, Google Generative AI, Ollama `/api/tags` fallback.

### 1.4 Subagent/agent definition inventory

Source docs already exist in `docs/features/subagents.md`, `docs/specs/subagents.md`, and implementation under `apps/desktop/electron/features/subagent/**`.

Deliverables:

- `apps/docs-site/docs/guide/subagents.md`: user-facing guide explaining built-in agents, when Sero delegates, single/parallel/fan-out use, and how results appear.
- `apps/docs-site/docs/reference/agent-definitions.md`: frontmatter/schema reference, global directory, model/tier resolution, tools/skills defaults, no-recursion rule, child session limitations.
- Update state/folders page to link `~/.sero-ui/agent/agents/` to the new reference.

### 1.5 Container inventory

Source docs already exist in `docs/guides/macos-containers.md`, `docs/decisions.md` AD-018/AD-019, `docs/testing/container-tools-tests.md`, and implementation under `apps/desktop/electron/features/container/**`.

Deliverables:

- Split `reference/containers-host-mode.md` into or supplement with:
  - `guide/containers-dev-servers.md`: why containers reduce port fighting; dev servers bind inside per-workspace containers; Sero exposes registered servers by container IP; UI previews do not require the host port to be free.
  - `reference/container-isolation.md`: one container per workspace, workspace mount, command execution path, PTY path, SSH forwarding, env handling, network semantics, lifecycle, cleanup, host-mode fallback, known security boundaries.
- Add diagrams for container execution and dev-server exposure.
- Add troubleshooting entries for “server works in terminal but not preview”, “port already used on host”, and “container IP changed”.

### 1.6 Browser mode / capture inventory

Sources:

- `apps/desktop/electron/cli/commands/browser/browser.ts`
- `apps/desktop/electron/cli/commands/apps/app-control*.ts`
- `apps/desktop/src/lib/app-control-bridge.ts`
- `docs/diagrams/agent-app-control.html`

Deliverables:

- `guide/browser-and-capture.md`: browser mode, dev-server preview, screenshot capture, UI interaction, recording MP4, storage locations, limitations.
- `reference/app-control-cli.md` or fold into `reference/sero-cli.md`: every `sero app` and `sero browser` command.
- New screenshots/video samples:
  - active app screenshot;
  - dev-server preview screenshot;
  - before/after click auto-screenshot;
  - recording output in `sero-recordings/`.

### 1.7 Evals/testing inventory

Sources:

- `docs/testing/eval-guide.md`
- `eval/promptfoo-snapshot.yaml`
- `promptfooconfig.yaml`
- `eval/scenarios/**`
- `apps/desktop/electron/__tests__/**`

Deliverables:

- Expand `reference/testing-evals.md` or add `guide/running-evals.md` with:
  - `pnpm eval:snapshot`, `pnpm eval`, `pnpm eval:view`;
  - when to use each;
  - auth requirements and cost notes;
  - scenario coverage matrix;
  - how to add a scenario;
  - how to interpret failures;
  - relationship to unit tests, Playwright, smoke tests, and typecheck.

## Phase 2 — External plugin documentation

Add a plugin catalog and individual pages for every external plugin under `/Users/danielcarter/Documents/Dev/projects/sero/plugins`.

### 2.1 Catalog page

Create `apps/docs-site/docs/plugins/catalog.md` or `apps/docs-site/docs/guide/plugin-catalog.md` grouped by category:

| Plugin | Package | Category/doc focus |
|---|---|---|
| Calculator | `@sero-ai/plugin-calc` | utility app, agent calculator tool |
| Daily Quote | `@sero-ai/plugin-daily-quote` | global quote app |
| Google | `@sero-ai/plugin-google` | Gmail/Calendar, runtime, auth, notifications |
| Humanizer | `@sero-ai/plugin-humanizer` | text rewriting/transformation |
| ImageGen | `@sero-ai/plugin-imagegen` | Gemini image generation setup and outputs |
| Kanban | `@sero-ai/plugin-kanban` | AI-driven dev board, runtime/widgets |
| Notes | `@sero-ai/plugin-notes` | note-taking UI and tools |
| Plan Mode | `@sero-ai/plugin-plan-mode` | read-only exploration and execution plans |
| Research | `@sero-ai/plugin-research` | multi-agent research orchestration |
| SlopZilla | `@sero-ai/plugin-slopzilla` | creative idea generator |
| Spotify | `@sero-ai/plugin-spotify` | Web Playback SDK, auth, Widevine/Castlabs caveats |
| Starling Bank | `@sero-ai/plugin-starling` | bank dashboard, token/privacy caveats |
| Tetris | `@sero-ai/plugin-tetris` | game app |
| Todo | `@sero-ai/todo-plugin` | tasks, CLI/tool examples |
| Weight | `@sero-ai/plugin-weight-tracker` | personal tracker/privacy caveats |

### 2.2 Per-plugin page template

Each plugin page must be approachable for someone who has never used that plugin or Sero before. Start with the user problem it solves, then show the shortest path to a successful result before introducing implementation details.

Each page should include:

1. Plain-language overview: what it does and who it is for.
2. “Try it first” quick start with a small example.
3. Install/enable path.
4. UI walkthrough with screenshots.
5. Agent/CLI capabilities and examples.
6. Auth/API keys/secrets required, explained in non-technical terms first.
7. Data storage path/state file.
8. Widgets/runtime/background behavior.
9. Known limitations and recovery tips.
10. Source package and manifest fields.

### 2.3 Built-in plugin pages

Add or expand dedicated pages for built-ins:

- Admin
- Alibaba Coding Plan provider
- Cron/Scheduler
- Git
- MCP
- Memory
- User Feedback
- Web

## Phase 3 — Screenshot and media capture system

### 3.1 Asset structure

Use stable paths under `apps/docs-site/docs/assets/`:

```text
assets/
  shell/
  explorer/
  containers/
  cli/
  models/
  subagents/
  browser-capture/
  evals/
  plugins/<plugin-id>/
```

### 3.2 Capture checklist

For each page, capture or include at least one of:

- UI screenshot for visual features.
- Terminal/CLI output block for command-line features.
- ASCII diagram for simple flows or mental models.
- Rendered diagram for complex invisible runtime behavior.
- Short MP4/GIF only when motion is the feature; otherwise use stills.

Required screenshots/media:

- Fresh onboarding/provider setup.
- Model tier selector and local model config.
- LM Studio connection test success/failure.
- Workspace with sidebar/chat/explorer labelled.
- Container dev server list + preview by container IP.
- Host-mode warning/fallback state.
- Subagent running/result display.
- Agent definitions editor/list in Admin/settings.
- `sero-cli` help and representative command outputs.
- Browser/app screenshot capture flow.
- App recording start/stop and output file.
- Evals terminal output and Promptfoo report.
- App Store/catalog installed plugin view.
- One hero screenshot per plugin, plus auth/settings screen where relevant.

### 3.3 Capture hygiene

- Use a disposable profile and sample workspace.
- Seed fake/demo data; never use real email, banking, API keys, or private repos.
- Hide or crop token fields.
- Prefer macOS light/dark mode consistency per docs section.
- Record viewport size and app version in `assets/CAPTURE_NOTES.md`.

## Phase 4 — Information architecture updates

Update `apps/docs-site/rspress.config.ts` and index pages.

This phase is not just a sidebar edit. Before adding pages, review the full reader journey and group topics by how users naturally learn Sero:

1. What is Sero and how do I get started?
2. How do I set up models, workspaces, and the local runtime?
3. How do I use the core workspace day to day?
4. How do agents, subagents, memory, and automation work?
5. How do apps/plugins expand Sero?
6. How do integrations, remote access, browser capture, and advanced workflows work?
7. Where do I find exact reference details, troubleshooting, and developer material?

Pages should only be added to a section when they strengthen that section's flow. If a new topic feels misplaced, reorganize the surrounding section instead of burying it.

Suggested new sidebar structure:

### Guide

- Start Here
- Setup
  - Installation / Requirements
  - Development Setup
  - Models and Providers
  - Local LLMs with LM Studio
- Workspace
  - Workspaces and Chat
  - Explorer Workspace
  - Containers and Dev Servers
  - Browser Mode and Capture
  - Themes
- Agents
  - Agent Sessions and Context
  - Subagents
  - Memory
  - Scheduler and Reminders
- Apps and Plugins
  - Plugins and Apps
  - App Store and Favorites
  - Plugin Catalog
  - Built-in Apps
- Integrations
  - Git Integration
  - MCP
  - Web
  - Remote Control

### Reference

- Architecture
- Sero CLI
- Agent Definitions
- Model Provider Reference
- `models.json` Custom Models
- Container Isolation Model
- State and Folders
- Plugin Authoring
- Testing / Evals
- Security / Privacy
- Troubleshooting
- Known Limitations

## Phase 5 — Execution order

1. **Coverage audit first**: create the checklist and mark existing pages.
2. **High-impact missing core docs**:
   - containers/dev servers;
   - `sero-cli`;
   - models/providers + LM Studio;
   - subagents/agent definitions;
   - browser/capture/recording;
   - evals.
3. **Screenshot pass for core docs**.
4. **External plugin catalog**.
5. **Per-plugin pages in priority order**:
   - Google, Kanban, Notes, Todo, Research, Plan Mode;
   - Spotify, ImageGen, Starling, Weight;
   - Calculator, Daily Quote, Humanizer, SlopZilla, Tetris.
6. **Built-in plugin page polish**.
7. **Final IA/sidebar/search pass**.
8. **Docs validation**: build docs site, run link checks if available, verify all touched source files under LOC limit where applicable.

## Acceptance criteria

- A new user can understand what Sero is, what each major area does, and where to click without reading source code or prior internal docs.
- The docs-site sidebar and index pages follow a logical learning path; pages are not randomly added to unrelated sections.
- Every guide page starts with a plain-language overview, a quick-start path, and at least one concrete example.
- Advanced implementation details are clearly separated from beginner workflows.
- Every top-level desktop feature has either a guide page, reference page, or explicit “not user-facing” coverage note.
- Every `sero-cli` host namespace has documented syntax, examples, output, side effects, and errors, with a short explanation of when a normal user would care.
- Every built-in and external plugin has a catalog entry; major plugins have full pages.
- Provider docs list all currently supported built-in API-key providers and plugin-defined providers.
- LM Studio and local/custom model setup can be completed by following docs alone.
- Container docs explain isolation and dev-server port behavior clearly enough for a beginner to understand why port conflicts are reduced and how to debug them.
- Browser/app control docs explain screenshots and MP4 recording with examples.
- Evals docs explain quick snapshot evals vs real LLM evals and when to run each.
- ASCII diagrams are used where they improve understanding of flows, runtime boundaries, or relationships.
- Screenshot assets exist for all visual features listed in the capture checklist or have an explicit reason for omission.
- `pnpm --filter @sero-ai/docs-site build` succeeds.
