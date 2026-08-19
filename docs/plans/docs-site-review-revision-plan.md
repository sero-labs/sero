# Plan: Review and Revise `apps/docs-site/`

## 1. Scope and goals

Review all 76 Markdown pages under `apps/docs-site/docs/`.

The revision must:

- Match current application behavior.
- Help Sero users and plugin authors equally.
- Use current UI labels and product terms.
- Use `sero-humanize` skill.
- Use ASD-STE100 Simplified Technical English.
- Remove obsolete, duplicate, speculative, unsafe, and low-value text.
- Preserve useful examples, commands, media, links, and page types.
- Keep each thin plugin page and rewrite it with verified, plugin-specific content.

This plan is based on:

- A full file inventory.
- A first-parent inspection of commit `8c25462607750ea744348d8a59fdbc7fe2aca82b`.
- Nine independent source reviews.
- A static link, route, anchor, and media check.
- Current application source, tests, manifests, package scripts, and UI labels.

No repository file was changed during the planning review.

## 2. Explicit exclusions and preservation rules

### Exclusions

The implementation must not:

- Change application behavior as part of a documentation edit.
- Treat root `docs/` as product authority.
- Add speculative features or planned behavior.
- Remove media only because it looks old or adds length.
- Delete or merge thin plugin pages. The approved direction is a verified rewrite for each page.
- Change plugin support status without manifest, source, or distribution evidence.
- Rewrite all pages into one common structure.
- Convert explanatory prose into list-only pages.
- Run paid model evals to validate documentation.
- Change public routes without approval and a redirect plan.

### Orchestrator protection

Commit `8c25462607750ea744348d8a59fdbc7fe2aca82b` changed these pages:

- `guide/index.md`
- `guide/orchestrator.md`
- `guide/rooms.md`
- `guide/rooms-advanced.md`
- `guide/scheduler-reminders.md`
- `guide/workflows.md`
- `guide/workflows-advanced.md`
- `reference/index.md`
- `reference/orchestrator.md`
- `reference/rooms.md`
- `reference/workflows.md`

It also changed `rspress.config.ts`, Orchestrator screenshots, and capture metadata.

Rules for these files:

1. Use the commit as the protected baseline.
2. Do not broadly rewrite, split, merge, move, or remove the protected pages.
3. Keep their task headings, tutorial flow, level of detail, examples, and media order.
4. Make only source-proven accuracy corrections.
5. Record every changed protected paragraph in an approval list.
6. Compare the final diff with the first-parent commit diff.
7. Confirm that no unrelated wording or structural change entered the protected pages.

## 3. Sources of truth

Use this order:

1. **Implemented application behavior**
   - Renderer UI and exact labels.
   - Zustand actions and persisted state.
   - Preload and IPC contracts.
   - Main-process handlers.
   - Plugin runtime behavior.
2. **Application tests and deterministic E2E tests**
3. **Package manifests, schemas, scripts, and release workflows**
4. **Current public external plugin repositories**
5. **Current published release artifacts**, when signing or packaging cannot be proved from source.
6. **Protected Orchestrator pages**, for writing style only.
7. **Root `docs/`**, as supporting context after application confirmation.

For each technical claim, record one of:

- Verified by application source.
- Verified by a deterministic test.
- Verified by a manifest or workflow.
- Verified by an external current source.
- Unclear and awaiting a product decision.
- Not verifiable and removed or qualified.

## 4. Proposed review method

### Pass 1: accuracy and content value

For each page:

1. Read the page in full.
2. Identify its user task and intended audience.
3. Inspect the current UI, source, tests, configuration, and commands.
4. Check every factual claim, command, path, limit, and UI label.
5. Check whether the page duplicates another page.
6. Check whether the page gives the reader a useful action or decision.
7. Assign one page action.
8. Record unclear behavior instead of guessing.

### Pass 2: structure and prose

1. Put prerequisites before actions.
2. Put the user action or answer first.
3. Remove meta narration and repeated introductions.
4. Use one term for each product concept.
5. Use active voice.
6. Keep one main instruction per sentence.
7. Keep exact UI labels unchanged.
8. Preserve useful prose. Do not convert all content into lists.
9. Compare the result with the original preservation set.

### Representative-page rule

Complete and review one representative page before changing the rest of each slice. This prevents a broad template rewrite.

### Screenshot planning rule

Complete the screenshot-method task in V0 before any slice captures new media. V0 must compare:

- Sero's built-in browser, app-control, screenshot, and recording tools.
- `agent-browser`.
- Playwright.
- A hybrid method that uses different tools for different Sero surfaces.

Do not select a tool in this planning document. Evaluate the options during implementation. Compare their ability to:

- control the current Sero desktop application or the required web surface;
- create a clean and repeatable starting state;
- stage useful sample content before capture;
- select the correct app, panel, tab, and crop;
- capture at a consistent size and scale;
- avoid personal data, credentials, local paths, and unstable content;
- repeat or update the capture after the UI changes; and
- record enough setup information for another person or agent to reproduce it.

Each implementation slice must decide what its screenshots need to show. Do not assume that an existing profile, workspace, session, plugin state, or application screen already contains useful content. Prepare a short capture brief for each new or replacement image. The brief must define:

- the user task or product fact that the image supports;
- the exact screen and visible controls;
- the sample profile, workspace, repository, records, or session data to stage;
- the state that makes the image useful, such as a meaningful result, error, comparison, or in-progress action;
- the information that must not appear;
- the crop, size, and surrounding context; and
- the check that proves the image still matches the application.

Use plausible, curated sample data. Do not publish a random populated screen or an empty screen only because it is easy to capture. The image must support the adjacent text and must not imply behavior that the application does not provide.

## 5. Documentation inventory method and baseline

### Current inventory

| Area | Pages |
|---|---:|
| Site root | 1 |
| Guides | 33 |
| Plugin pages | 16 |
| Reference | 25 |
| Published capture notes | 1 |
| **Total** | **76** |

Additional baseline:

- 143 tracked media files.
- 117 local media references from Markdown.
- 28 media files have no Markdown reference. Check all repository consumers before removal.
- All current internal page targets resolve.
- All checked local anchors resolve.
- All checked local image targets exist.
- Every page except `assets/CAPTURE_NOTES.md` has a navigation or content link.
- `CAPTURE_NOTES.md` is published automatically as `/assets/CAPTURE_NOTES`.

### Inventory record for implementation

Maintain one parent-owned inventory with:

- Source file.
- Public route.
- Page title.
- Sidebar and index entries.
- Audience.
- Documentation type.
- Images and other media.
- Commands and configuration examples.
- Internal and external links.
- Source evidence.
- Proposed action.
- Slice.
- Protection status.
- Unresolved decisions.
- Completion state.

## 6. Page-action criteria

### Keep with no changes

Use only when:

- All important claims match the application.
- The page has a clear audience and task.
- Commands, examples, links, screenshots, and labels are current.
- No material humanize defect exists.

### Correct or update

Use when:

- The structure and user task remain useful.
- Errors are local.
- A small number of labels, commands, claims, screenshots, or paths need correction.

### Rewrite

Use when:

- The central task flow is wrong or unsafe.
- Most of the page is generic or obsolete.
- The page does not help the reader complete a task.
- The page mixes incompatible audiences.
- The current structure hides important safety facts.

### Merge

Use only when:

- Two pages serve the same audience and task.
- One route adds no independent value.
- Useful content and incoming links can be preserved.
- The user approves the route and redirect change.

Thin plugin pages are excluded from this default because the approved direction is a rewrite for each page.

### Split

Use when:

- One page contains separate user journeys or documentation types.
- Each part has enough value to stand alone.
- The split has approval because it changes the dominant structure.

### Move

Use when:

- A page is valuable but published in the wrong audience or navigation area.
- The route and redirect effect are understood.
- The move has approval.

### Remove

Use only when:

- Current application behavior does not exist.
- The page has no current audience or historical need.
- No unique useful content remains.
- All incoming links and media consumers are known.
- The user approves removal.

## 7. Verification method

For each slice:

1. Trace each claim to current source.
2. Confirm exact labels in renderer code.
3. Confirm state paths in `platform/env`, state managers, and IPC handlers.
4. Confirm commands against parser and tool schemas, not service-layer types alone.
5. Confirm limits and defaults against constants and tests.
6. Confirm plugin status against its current manifest and repository.
7. Verify sample repositories and commands.
8. For each new or replacement screenshot, write and approve the slice-specific capture brief before capture.
9. Stage useful, plausible, and non-personal content for the required state.
10. Use the V0 capture method or its documented fallback.
11. Check screenshots against current UI and the purpose stated in the capture brief.
12. Scan screenshots for personal paths, session data, credentials, LAN addresses, and private resource content.
13. Check non-doc media consumers.
14. Run an internal link and anchor check.
15. Build the docs site.
16. Render at least one changed page from the slice.
17. Inspect the diff for accidental command, link, anchor, and media changes.

Required final commands during implementation:

```bash
pnpm --filter @sero/docs-site build
pnpm typecheck
git diff --check
```

Do not run a live model unless one specific property cannot be checked deterministically.

## 8. Subagent strategy

### Read-only evidence lanes

Use fresh read-only agents for independent product areas:

- Installation and models.
- Workspace and recovery.
- Runtimes, browser, and CLI.
- Agents, memory, scheduler, and evals.
- Protected Orchestrator pages.
- App integrations.
- Plugin catalog.
- Plugin-author contracts.
- Platform state, support, and security.

Each agent must:

- Read all assigned pages in full.
- Inspect application source and tests.
- Return page-level evidence.
- Make no edits.
- Report uncertainty instead of choosing product behavior.

### Parent responsibilities

One parent agent must:

- Own the complete inventory.
- Own the terminology list.
- Reconcile overlapping findings.
- Remove duplicated work.
- Apply the preservation rules.
- Approve every page action.
- Control all navigation changes.
- Keep the protected-commit change list.
- Run site-wide validation.

### Writing

Use one writer for one slice. Do not run parallel writers against shared navigation, indexes, or terminology.

After each slice, use a fresh reviewer for:

- Accuracy.
- Humanize and ASD-STE100.
- Links and media.
- Preservation.
- Scope control.

## 9. Page-level decision matrix

`Protected` means commit `8c254626…` controls the allowed change.

### V1 — Shared site contract

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/` | Site entry | Prospective and new users | Updater, release workflow, app manifests | High; clear entry path | Correct updater claim; replace stale “current beta” shell capture | V1 | No |
| `/guide/` | Guide index | All users | `rspress.config.ts`, route inventory | High; current task map | Keep | V1 | **Yes: preserve** |
| `/guide/overview` | Product overview | New users | Updater, host support matrix, profile paths | High | Correct update policy and unsupported broad claims | V1 | No |
| `/reference/` | Reference index | Advanced users and authors | Sidebar and route inventory | High | Keep | V1 | **Yes: preserve** |
| `/reference/known-limitations` | Product limits | All users | Support matrix, updater, runtime source | Medium; too broad and repetitive | Rewrite as a short current limitations page | V1 | No |
| `/reference/support-scope` | Support contract | Users and support | Release workflow, updater, host matrix | High but stale | Correct auto-update, signing, and platform statements | V1 | No |

### V2 — Platform facts, state, and safety

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/reference/environment-doctor` | Diagnostics | Users and support | Doctor registry, CLI, panel, packaged shim | High need; central claims are false | Rewrite on same route from the actual registered checks | V2 | No |
| `/reference/models-json` | Model configuration | Advanced users | Pi resolver, local-model UI, model schema | High but technically wrong | Rewrite environment syntax and authentication behavior | V2 | No |
| `/reference/security-privacy` | Security | All users | Gateway, safe storage, plugin permissions, renderer guards | High | Correct and update; keep structure and media | V2 | No |
| `/reference/state-and-folders` | Storage | Users and support | `platform/env`, plugin paths, layout IPC | High | Correct paths; separate durable state from logs and exports | V2 | No |
| `/assets/CAPTURE_NOTES` | Capture governance | Documentation maintainers | Rspress content root and capture consumers | Useful internally; not user documentation | Move outside the published content root after approval | V2 | No |

### V3 — Installation, profiles, and models

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/guide/getting-started` | First run | New users | Setup screen, onboarding runtime, release workflow | High but mixed audience | Update; move detailed source-build steps to Development Setup | V3 | No |
| `/guide/installation-requirements` | Installation | New users | Builder config, release targets, host matrix | High | Correct Node version, update policy, signing, and AppImage claims | V3 | No |
| `/guide/development-setup` | Source development | Contributors | Root and desktop package scripts | High but stale | Correct command behavior; become canonical source-build guide | V3 | No |
| `/guide/profiles-and-onboarding` | Profiles | All users | Profile manager, migration, copy and removal handlers | High | Correct onboarding and copy rules | V3 | No |
| `/guide/models-and-providers` | Models | All users | Provider catalog, health logic, Admin model UI | High | Correct UI paths, provider inventory, and session-model wording | V3 | No |
| `/guide/local-llms-lm-studio` | Local models | Local-model users | Presets and Model Manager controls | High | Correct exact UI labels and navigation | V3 | No |

### V4 — Workspace shell and recovery

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/guide/workspace-and-chat` | Desktop shell | New users | `App.tsx`, shell components, workspace store | High but overloaded | Rewrite; move onboarding and detailed chat content to existing pages | V4 | No |
| `/guide/explorer-workspace` | Explorer | Workspace users | Explorer panels, Git contribution, preview registry | High but stale | Rewrite current Explorer tasks; move detailed browser and support text | V4 | No |
| `/guide/checkpoints-and-undo` | Recovery | All users | VCS manager, snapshot manager, restore dialog | Safety-critical and wrong | Urgent rewrite; disclose Git commits and destructive cleanup | V4 | No |
| `/guide/themes` | Themes | All users | Theme panel, editor state, theme IPC | Medium; procedure is incomplete | Rewrite after the non-active-preset defect is resolved or documented | V4 | No |
| `/guide/dashboard-widgets` | Dashboard | Users and widget authors | Dashboard store and widget registry | Medium | Correct user flow; move author details to reference | V4 | No |

### V5 — Runtimes, browser, and CLI

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/guide/choose-workspace-runtime` | Runtime selection | All users | Runtime picker and resolution | High | Correct visible-browser terminology; keep structure | V5 | No |
| `/guide/containers-dev-servers` | Dev servers | Developers | Runtime backends, CLI, Dev Servers panel | High | Correct Host stop behavior, UI path, and registry lifetime | V5 | No |
| `/guide/browser-and-capture` | Browser and capture | Users and agents | Browser CLI, app-control bridge, recorder | High | Correct preview URLs and add current commands | V5 | No |
| `/reference/architecture` | Architecture | Advanced users and authors | Shell, zoom, workspace, plugin discovery | Medium | Rewrite selected sections; recapture private and stale media | V5 | No |
| `/reference/container-isolation` | Container behavior | Advanced users | Docker and Apple Container lifecycle | High but stale | Rewrite backend-specific lifecycle claims | V5 | No |
| `/reference/containers-host-mode` | Runtime reference | All users | Runtime picker, support matrix, log portal | High but duplicated | Rewrite as a concise comparison matrix | V5 | No |
| `/reference/sero-cli` | CLI | Advanced users and agents | CLI registry and handlers | High | Correct namespace, browser actions, batch behavior, and stop semantics | V5 | No |
| `/reference/troubleshooting` | Recovery | All users | Doctor, runtime, browser and capture handlers | Essential but unsafe | Rewrite unsafe recovery sections; keep symptom structure | V5 | No |

### V6 — Agents, memory, scheduler, and evals

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/guide/agent-sessions-and-context` | Agent sessions | All users | Composer, session context, message queue | High | Correct commands, steering, queueing, and system-prompt behavior | V6 | No |
| `/guide/subagents` | Delegation | Advanced users | Subagent runtime and Orchestration panel | Useful core; obsolete collaboration sections | Rewrite; remove removed Collaboration and Debate behavior; link Rooms | V6 | No |
| `/guide/memory` | Memory | All users | Memory plugin, transcripts, config, scheduler | High but incomplete | Correct transcript privacy, frozen snapshots, and consolidation | V6 | No |
| `/guide/scheduler-reminders` | Scheduler | Automation users | Cron plugin UI, tools, recovery | High and mostly current | Essential corrections only: tab order, time zones, screenshots | V6 | **Yes: limited** |
| `/guide/running-evals` | Evals | Contributors | Root scripts and eval providers | Medium | Correct snapshot scope; keep task workflow and reduce duplication | V6 | No |
| `/reference/agent-definitions` | Agent configuration | Advanced users | Discovery and model resolution | High | Correct uppercase tiers, name rules, and extension boundary | V6 | No |
| `/reference/testing-evals` | Test and eval reference | Contributors | Package scripts and GitHub workflows | High but wrong | Correct root test and CI behavior | V6 | No |

### V7 — Protected Orchestrator area

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/guide/orchestrator` | Mode choice | New users | Orchestrator manifest, tabs, grant policy | High | Correct one unsupported running-Room authority statement | V7 | **Yes: limited** |
| `/guide/workflows` | Workflow tutorial | New Workflow users | Create wizard, map, demo repository | High | Keep | V7 | **Yes: preserve** |
| `/guide/workflows-advanced` | Workflow management | Workflow users | Scheduler, worktrees, Library, Catalog | High | Keep | V7 | **Yes: preserve** |
| `/guide/rooms` | Room tutorial | New Room users | Planner, proposal, Room UI | High | Correct planning-cost statements only | V7 | **Yes: limited** |
| `/guide/rooms-advanced` | Room management | Room users | Revision plan, lifecycle, UI controls | High but materially wrong | Correct authority, Pause/Stop, archive, delete, and retention sections | V7 | **Yes: limited** |
| `/reference/orchestrator` | Terminology | Advanced users | Manifest and compatibility labels | High | Keep | V7 | **Yes: preserve** |
| `/reference/workflows` | Workflow reference | Advanced users | Tool schema, slash parser, runtime store | High | Correct action and command sections only | V7 | **Yes: limited** |
| `/reference/rooms` | Room reference | Advanced users | Room schema, grants, lifecycle, actions | High | Correct running-team authority and deletion behavior | V7 | **Yes: limited** |

### V8 — Apps and integrations

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/guide/app-store-favorites` | App discovery | All users | App Store UI, discovery, installer | High but repetitive | Rewrite exact install, favorite, uninstall, and retained-state flow | V8 | No |
| `/guide/plugins-and-apps` | Plugin overview | Users and authors | App manifests, compatibility, app-runtime | Medium; mixes audiences | Rewrite as a short map; move detailed author text to reference | V8 | No |
| `/guide/git-integration` | Git | Workspace users | Git plugin UI and tool schema | High | Correct agent actions, GitHub conditions, checkpoint relationship, screenshot | V8 | No |
| `/guide/mcp` | MCP | MCP users | MCP app, server CRUD, config paths | Low in current form | Rewrite as a task guide | V8 | No |
| `/guide/web` | Web plugin | Web users | Web manifest, tools, providers, state | High | Correct and tighten; replace unrelated screenshot | V8 | No |
| `/guide/remote-control` | Remote access | Remote users | Connect Device, gateway IPC, web remote | High detail; wrong first-use flow | Rewrite around current pairing; move protocol detail later | V8 | No |
| `/guide/settings-models-admin` | Administration | Advanced users | Admin navigation and state | High but incomplete | Add current sections and replace private or wrong screenshots | V8 | No |

### V9 — Built-in plugin guides

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/plugins/design-library` | Design generation | Design Library users | Manifest, tools, runtime, preview | High but too broad | Split only with approval; correct tool exposure and safety claims | V9 | No |
| `/plugins/graphify` | Code graph | Graphify users | Manifest, UI, tools, defaults | Medium; several false claims | Rewrite current controls, provider use, and paths | V9 | No |
| `/plugins/user-feedback` | Agent questions | All users | Built-in manifest, Chat and questionnaire UI | Low and inaccurate | Rewrite as a plugin-specific guide; explain Chat versus app behavior | V9 | No |

### V10 — External work and creation plugins (/Users/danielcarter/Documents/Dev/projects/sero/plugins)

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/plugins/google` | Gmail and Calendar | Google users | External manifest, OAuth UI, tools | Low | Rewrite install, OAuth, tools, state, and recovery | V10 | No |
| `/plugins/imagegen` | Image generation | Image users | External manifest and image request UI | Low; one false claim | Rewrite request attachments, provider needs, storage, and deletion | V10 | No |
| `/plugins/kanban` | Agent development board | Developers | External manifest and automation runtime | Low and unsafe | Rewrite; disclose agents, worktrees, PRs, and auto-merge | V10 | No |
| `/plugins/loom` | Generative art | Loom users | External manifest and current images | High | Correct/update; retain media | V10 | No |
| `/plugins/notes` | Notes | All users | External manifest, tool, widget, state | Low and generic | Rewrite as a full Notes-specific page | V10 | No |
| `/plugins/plan-mode` | Agent planning | Developers | External commands and tool | Low and incomplete | Rewrite exact plan lifecycle and command set | V10 | No |
| `/plugins/research` | Parallel research | Research users | External tool actions and commands | Low in current form | Rewrite approval, cancellation, cost, and result checks | V10 | No |
| `/plugins/signal-desk` | Feeds and briefings | Signal Desk users | External runtime, commands, state | Medium | Correct/update with setup, network, and schedule behavior | V10 | No |
| `/plugins/todo` | Workspace tasks | All users | External manifest, tool, command | Low and generic | Rewrite as a Todo-specific page | V10 | No |

### V11 — Personal integrations and plugin catalog (/Users/danielcarter/Documents/Dev/projects/sero/plugins)

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/plugins/spotify` | Spotify | Users evaluating compatibility | External manifest and repository README | Low; repository marks it deprecated | Keep route and rewrite as an exact compatibility/status page pending owner confirmation | V11 | No |
| `/plugins/starling` | Banking | Starling users | External manifest, safe storage, API bridge | Low for a sensitive feature | Rewrite permissions, token storage, PIN limits, and network behavior | V11 | No |
| `/plugins/weight-tracker` | Health data | Weight users | External manifest, tool actions, state | Low and generic | Rewrite with health-data, deletion, and storage details | V11 | No |
| `/plugins/catalog` | Plugin catalog | All users | In-repo manifests and external repositories | High but incomplete | Rewrite inventory, source, scope, requirements, and support state | V11 | No |

### V12 — Plugin-author start path

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/reference/plugins` | Plugin system | Plugin authors | Installer, compatibility, dev sessions | High | Correct ABI, CSS, source prefixes, and managed dev flow | V12 | No |
| `/reference/plugin-quickstart` | First plugin | New plugin authors | Notes template, plugin manager, plugin-vite | High need; current starter is stale | Rewrite with a maintained starter and exact development flow | V12 | No |
| `/reference/plugin-author-quick-path` | Author overview | New authors | Same contracts as quickstart and API refs | Medium; substantial duplication | Merge into Quickstart only after explicit route approval; otherwise rewrite as a short decision page | V12 | No |
| `/reference/plugin-end-to-end-example` | Complete example | Plugin authors | Notes template and Module Federation config | High | Rewrite as a concise example index | V12 | No |

### V13 — Plugin-author APIs and Agent Plugins

| Page or route | Product area | Audience | Application evidence | Current value | Proposed action | Slice | Protected |
|---|---|---|---|---|---|---|---|
| `/reference/agent-plugins` | Portable Agent Plugins | Users and authors | Admin UI, manager, source parser | High | Correct npm syntax and container restart limits | V13 | No |
| `/reference/app-runtime` | React runtime API | Plugin authors | Public package exports and host context | High | Correct source paths, exports, and `ready` state | V13 | No |
| `/reference/dashboard-components` | Shared UI | Widget and plugin authors | `@sero-ai/ui` exports and catalog | High | Small STE rewrite and styling-contract link | V13 | No |
| `/reference/plugin-extension-points` | Host contributions | Plugin authors | Contribution types, parser, federation loader | High | Correct exposed-module and widget-lifecycle contracts | V13 | No |

## 10. Vertical implementation slices

### V0 — Select the screenshot capture method

- [ ] **Options in scope:** evaluate Sero's built-in capture tools, `agent-browser`, Playwright, and a hybrid method. Do not assume that one tool must cover every desktop, web, plugin, or preview surface.
- [ ] **Surfaces to test:** select a small representative set that includes the Electron shell, a federated plugin UI, the visible Browser or preview, a dialog or popover, and a web-only surface when one exists.
- [ ] **Method criteria:** compare control reliability, deterministic setup, crop and resolution control, repeatability, tool availability, redaction safety, and maintenance cost.
- [ ] **Content staging:** confirm that each method can prepare curated sample data and a useful application state before capture. Do not score a method only on whether it can take a picture.
- [ ] **Capture playbook:** record the selected primary and fallback method for each surface type, with startup, navigation, capture, naming, crop, and cleanup steps.
- [ ] **Safe fixtures:** define the disposable profile, workspace, repositories, accounts, sessions, and plugin data that later slices can use. Require synthetic or public sample content.
- [ ] **Section handoff:** give every later slice a capture-brief template. The slice must decide the subject, staged content, and useful state during its own implementation research.
- [ ] **Acceptance and dependencies:** approve the method before any recapture begins. The result must support reproducible, interesting, accurate, and non-personal screenshots. This task does not decide which screenshots each slice needs.

### V1 — Shared site contract and terminology

- [ ] **Pages and navigation:** `/`, `/guide/`, `/guide/overview`, `/reference/`, Support Scope, Known Limitations, top navigation, and section indexes.
- [ ] **Application evidence:** updater, release targets, host support matrix, current app names, `rspress.config.ts`.
- [ ] **Behavior to verify:** public release status, updates, supported platforms, canonical product terms.
- [ ] **Value and audience:** establish the common contract for users and authors.
- [ ] **Page actions:** keep protected indexes; correct entry pages; focus support and limitations.
- [ ] **Humanize:** remove repeated beta framing and documentation-method narration.
- [ ] **Checks:** links, screenshots, release claims, terms, and external release URL.
- [ ] **Acceptance and dependencies:** one consistent support statement exists; V2–V13 use its terms. Preserve protected index changes.

### V2 — Platform facts, state, safety, and capture governance

- [ ] **Pages and navigation:** Environment Doctor, `models.json`, Security / Privacy, State and Folders, Capture Notes.
- [ ] **Application evidence:** Doctor registry, Pi resolver, `platform/env`, gateway, safe storage, plugin state.
- [ ] **Behavior to verify:** actual Doctor checks, env-variable syntax, state locations, security boundaries.
- [ ] **Value and audience:** keep operational facts public; identify internal capture governance precisely.
- [ ] **Page actions:** rewrite Doctor and `models.json`; correct state/security; request approval to move Capture Notes.
- [ ] **Humanize:** replace abstract security claims with specific boundaries and actions.
- [ ] **Checks:** paths, sensitive data, commands, screenshot consumers, automatic route generation.
- [ ] **Acceptance and dependencies:** every path is source-backed; no internal capture page remains public without an explicit decision. Depends on V1 terms.

### V3 — Installation, profiles, and models

- [ ] **Pages and navigation:** Getting Started, Installation, Development Setup, Profiles, Models, LM Studio.
- [ ] **Application evidence:** onboarding UI, profile manager, provider catalog, Model Manager, package scripts.
- [ ] **Behavior to verify:** first run, updates, runtime prerequisites, profile copy/removal, model setup.
- [ ] **Value and audience:** keep packaged installation and source development distinct.
- [ ] **Page actions:** update six pages; move source-build detail to Development Setup.
- [ ] **Humanize:** remove repeated conclusions and broad beta cautions.
- [ ] **Checks:** commands, Node and pnpm versions, UI labels, screenshots, signing claims.
- [ ] **Acceptance and dependencies:** a new user can install and configure a model; a contributor has one source-build path. Depends on V1 and V2.

### V4 — Workspace shell and recovery

- [ ] **Pages and navigation:** Workspace and Chat, Explorer, Checkpoints and Undo, Themes, Dashboard.
- [ ] **Application evidence:** shell, navigation store, Explorer contributions, VCS manager, theme store, dashboard store.
- [ ] **Behavior to verify:** workspace creation, shell navigation, Git views, destructive restore behavior, theme editing, widget persistence.
- [ ] **Value and audience:** keep daily workspace tasks in one coherent area.
- [ ] **Page actions:** rewrite overloaded workspace pages; urgent checkpoint rewrite; correct themes and widgets.
- [ ] **Humanize:** use visible object names and direct task headings.
- [ ] **Checks:** shortcuts by platform, screenshots, state paths, recovery warnings, related-page links.
- [ ] **Acceptance and dependencies:** no recovery command understates data loss. Theme instructions wait for the editor defect decision. Depends on V1–V3.

### V5 — Runtimes, browser, capture, and CLI

- [ ] **Pages and navigation:** eight runtime, browser, architecture, CLI, and troubleshooting pages.
- [ ] **Application evidence:** runtime picker, Host/Docker/Apple backends, CLI registry, browser manager, capture bridge.
- [ ] **Behavior to verify:** fail-closed selection, port forwarding, Host process ownership, browser versus app capture, logs.
- [ ] **Value and audience:** separate task guides from exact runtime reference.
- [ ] **Page actions:** keep routes; correct guides; rewrite stale reference sections.
- [ ] **Humanize:** remove implementation narration and uncertain recovery language.
- [ ] **Checks:** every command, URL form, process-control instruction, diagram, path, and anchor.
- [ ] **Acceptance and dependencies:** no broad `pkill`, quarantine bypass, container-IP, or false process-stop advice remains. Depends on V1–V4.

### V6 — Agents, memory, scheduler, and evals

- [ ] **Pages and navigation:** seven assigned pages and all “Subagents and Collaboration” labels.
- [ ] **Application evidence:** composer, session context, subagent runtime, Memory plugin, Scheduler, eval scripts, workflows.
- [ ] **Behavior to verify:** steering, queueing, subagent limits, transcript exports, consolidation, schedules, CI triggers.
- [ ] **Value and audience:** distinguish sessions, subagents, Rooms, Memory, and Workflows.
- [ ] **Page actions:** rewrite Subagents; correct the other six pages.
- [ ] **Humanize:** remove obsolete Collaboration language and repeated eval matrices.
- [ ] **Checks:** commands, screenshots, private data, time zones, model tiers, CI claims.
- [ ] **Acceptance and dependencies:** no removed Collaboration or Debate behavior remains. Scheduler commit changes remain intact except approved corrections. Depends on V1, V2, and V7 terminology.

### V7 — Protected Orchestrator Workflows and Rooms

- [ ] **Pages and navigation:** eight core pages, protected index entries, sidebar entries, and protected media.
- [ ] **Application evidence:** Orchestrator runtime, Room grants, planner calls, lifecycle, tool schema, UI controls.
- [ ] **Behavior to verify:** planning cost, running-team authority, Pause/Stop, deletion, actions, commands.
- [ ] **Value and audience:** keep the commit’s tutorial and reference quality.
- [ ] **Page actions:** keep three pages; apply only listed essential corrections to five pages.
- [ ] **Humanize:** no broad sentence pass. Use protected pages as the style standard.
- [ ] **Checks:** sample repositories, commands, screenshots, labels, links, anchors, and media order.
- [ ] **Acceptance and dependencies:** every protected change is on an approved whitelist. No unrelated structural diff exists. Application UI defects must be resolved or documented before recapture.

### V8 — App discovery and integrations

- [ ] **Pages and navigation:** App Store, Plugins and Apps, Git, MCP, Web, Remote Control, Admin.
- [ ] **Application evidence:** plugin manager, Git plugin, MCP plugin, Web plugin, gateway, web remote, Admin.
- [ ] **Behavior to verify:** discovery, uninstall retention, Git actions, MCP auth, web providers, pairing, Admin sections.
- [ ] **Value and audience:** keep each route; separate overview, task, and reference content.
- [ ] **Page actions:** rewrite five pages; correct Git and Admin.
- [ ] **Humanize:** remove repeated trust warnings and internal protocol-first explanations.
- [ ] **Checks:** screenshots for private paths, session data, LAN URLs, exact labels, commands, homepage consumers.
- [ ] **Acceptance and dependencies:** first-use flows work from the documented UI. Depends on V1–V7.

### V9 — Built-in plugin guides

- [ ] **Pages and navigation:** Design Library, Graphify, User Feedback.
- [ ] **Application evidence:** in-repo manifests, tool bridges, UI, runtime, state.
- [ ] **Behavior to verify:** tool exposure, provider use, preview safety, Chat questions, questionnaires.
- [ ] **Value and audience:** each page must provide a distinct user task.
- [ ] **Page actions:** correct or rewrite all three; split Design Library only with approval.
- [ ] **Humanize:** simplify long security explanations without weakening them.
- [ ] **Checks:** exact tool names, paths, provider claims, privacy, links, media.
- [ ] **Acceptance and dependencies:** each guide explains setup, safe use, verification, storage, and recovery. Depends on V2 and V8.

### V10 — External work and creation plugins

- [ ] **Pages and navigation:** Google, ImageGen, Kanban, Loom, Notes, Plan Mode, Research, Signal Desk, Todo.
- [ ] **Application evidence:** current public repositories, manifests, source, App Store discovery.
- [ ] **Behavior to verify:** install source, tools, commands, state scope, model cost, network use, destructive actions.
- [ ] **Value and audience:** retain and rewrite each page as requested.
- [ ] **Page actions:** rewrite eight pages; correct/update Loom.
- [ ] **Humanize:** remove the repeated generic template. Use plugin-specific prerequisites and checks.
- [ ] **Checks:** external links, source prefixes, screenshots, OAuth, API keys, Git and PR behavior.
- [ ] **Acceptance and dependencies:** every plugin page has a verified install path, first task, storage note, safety note, and recovery step. Depends on V8.

### V11 — Personal integrations and catalog

- [ ] **Pages and navigation:** Spotify, Starling, Weight, Plugin Catalog.
- [ ] **Application evidence:** current repositories, deprecation statements, safe storage, health-data storage, all manifests.
- [ ] **Behavior to verify:** compatibility, credential storage, PIN limits, deletion, network use, discovery status.
- [ ] **Value and audience:** preserve exact status information without guessing support policy.
- [ ] **Page actions:** rewrite all four pages; retain Spotify route unless the owner approves another action.
- [ ] **Humanize:** use direct status language. Do not use vague “legacy” labels without an explanation.
- [ ] **Checks:** repository status, package versions, platform dependencies, privacy, catalog links.
- [ ] **Acceptance and dependencies:** the catalog rule for Built-in, External, and Deprecated is explicit. Depends on V9 and V10.

### V12 — Plugin-author start path

- [ ] **Pages and navigation:** Plugins hub, Quickstart, Quick Path, End-to-End Example.
- [ ] **Application evidence:** installer, Local Plugin Development, Notes template, plugin-vite, compatibility checks.
- [ ] **Behavior to verify:** source prefixes, managed dev server, runtime ABI, CSS isolation, default exports.
- [ ] **Value and audience:** provide one clear first-author journey and one example index.
- [ ] **Page actions:** rewrite all four; merge Quick Path only after route approval.
- [ ] **Humanize:** remove repeated file maps and “canonical” claims that source does not support.
- [ ] **Checks:** commands, starter repository, package versions, example files, links.
- [ ] **Acceptance and dependencies:** a new author can build and load a current plugin without an unmanaged server. Depends on V8 and V13 contracts.

### V13 — Plugin APIs and Agent Plugins

- [ ] **Pages and navigation:** Agent Plugins, App Runtime, Dashboard Components, Plugin Extension Points.
- [ ] **Application evidence:** public package exports, Agent Plugin manager, federation loader, contribution parser, widget registry.
- [ ] **Behavior to verify:** npm syntax, API exports, module keys, default exports, widget lifetime, styling.
- [ ] **Value and audience:** keep exact API facts separate from tutorials.
- [ ] **Page actions:** correct all four pages.
- [ ] **Humanize:** keep tables; simplify dense sentences and contributor jargon.
- [ ] **Checks:** type names, source paths, code examples, screenshots, personal paths, package exports.
- [ ] **Acceptance and dependencies:** every example compiles against the documented public API. Complete before finalizing V12.

### V14 — Final site-wide validation

- [ ] **Full page coverage:** confirm one decision and one completed review record for all 76 pages.
- [ ] **Navigation and links:** check top navigation, all sidebars, index pages, routes, anchors, internal links, external links, and redirects.
- [ ] **Terminology and voice:** verify one glossary for Agent, Subagent, Room, Workflow, Scheduler, Host, Apple Container, Docker / Podman, App Store, Admin, and plugin status.
- [ ] **Unsupported claims:** search for removed Collaboration and Debate behavior, manual-update claims, container-IP examples, unsafe process commands, and unsupported Room actions.
- [ ] **Accuracy:** sample every slice against application source and tests. Recheck all commands and paths.
- [ ] **Media:** compare before and after media inventories. Confirm approval for every moved, removed, or replaced asset. Check non-doc consumers.
- [ ] **Protected commit:** compare all protected pages, navigation, and media with `8c254626…`. Confirm that only approved essential corrections changed.
- [ ] **Final validation:** run the docs build, root typecheck, link checker, `git diff --check`, rendered-page review, and a final `sero-humanize` review.

Acceptance requires:

- Zero unreviewed pages.
- Zero known broken internal links or anchors.
- Zero unsupported product claims.
- Zero stale exact UI labels in changed pages.
- Zero unapproved media removal.
- Zero broad rewrite of protected Orchestrator pages.
- A clean list of unresolved product questions.

## 11. Risks and dependencies

### High-risk documentation defects already found

- Checkpoint restore and turn undo can remove files. Current documentation understates this.
- Broad `pkill` commands can stop unrelated applications.
- Current docs recommend bypassing macOS quarantine.
- Remote Control documents the wrong first-use prerequisite.
- Collaboration and Debate engines were removed, but the Subagents guide still documents them.
- Room deletion removes member session files, contrary to the protected guide and reference.
- Room planning calls a model before **Start room**.
- A running Room cannot currently add members or increase member access.
- Several Doctor checks described in documentation are not registered.
- `models.json` environment-variable syntax is wrong.
- Automatic update behavior is described as manual.
- Several screenshots contain personal paths, session details, LAN addresses, or removed controls.
- Plugin-author pages omit required runtime ABI and Module Federation rules.

### Implementation dependencies

- A clean synthetic profile for screenshots.
- Current release artifact verification for signing and notarization claims.
- Current external plugin repositories.
- Stable sample repositories for Workflow and Room tutorials.
- Product decisions for known UI/runtime contradictions.
- Redirect support if any approved page merge or move occurs.

## 12. Open questions before implementation

1. **Capture Notes route**  
   `apps/docs-site/docs/assets/CAPTURE_NOTES.md` is an internal screenshot matrix, but Rspress publishes it as `/assets/CAPTURE_NOTES`. Should it move to a non-published location such as `apps/docs-site/CAPTURE_NOTES.md`, or should it remain public?

2. **Spotify status**  
   The current external repository README marks the plugin deprecated, and current Sero uses stock Electron without the former Widevine/Castlabs setup. The plan keeps and rewrites the route. Confirm whether this is the intended product status.

3. **Plugin-author Quick Path**  
   `plugin-author-quick-path.md` substantially duplicates Quickstart and several API references. Should it become a short decision page, or may its unique content merge into Quickstart with a redirect?

4. **Design Library structure**  
   The page is 290 lines and combines setup, tutorial, reference, security, export, and provider configuration. May it split into task and reference pages, or must it remain one route?

5. **Release signing claims**  
   Source configuration allows unsigned artifacts when secrets are absent. Which current release artifacts are confirmed signed and notarized?

6. **Theme editor defect**  
   Source review indicates that editing a non-active preset can load and save the active preset instead. Should documentation omit that procedure until the application defect is fixed?

7. **Room behavior conflicts**  
   Current UI copy says planning spends nothing, but runtime planning calls a model. Protected docs also describe running-team changes that the grant system refuses. Should the application change first, or should the documentation describe the current limits immediately?

8. **GitHub branch protection**  
   Repository workflows do not prove which checks GitHub requires for merge. Should the reference describe workflow triggers only, or is external branch-protection evidence available?

9. **External plugin support vocabulary**  
   Confirm the public meanings of **Built-in**, **External**, **Deprecated**, and **Unsupported** before the catalog and sidebar use these labels.
