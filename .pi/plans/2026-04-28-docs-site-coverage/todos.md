# Docs Site Complete Coverage Todos

**Tag:** `docs-site-coverage`
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`
**Spec/source plan:** `docs/plans/docs-site-complete-coverage-plan.md`
**Status:** Draft execution backlog

> Every todo is self-contained and repeats the architectural constraints workers must preserve. Public docs may use root `docs/**` as source material, but public nav must not link internal/transient trees such as `.pi/plans/**`, `docs/plans/**`, `docs/superpowers/**`, or `docs/deslopify/**`.

## Checklist

- [x] Every todo references the plan artifact.
- [x] Every todo has explicit constraints and anti-patterns.
- [x] Every todo includes either source-file references or an expected Markdown/config example.
- [x] Todos are sequenced and dependencies are noted.
- [x] Acceptance criteria are verifiable by reading files or running commands.

---

## DSC-001 — Create the docs-site coverage audit

**Tags:** `docs-site-coverage`
**Depends on:** none
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Create `apps/docs-site/docs/reference/coverage-audit.md` as the source-of-truth checklist for docs-site coverage. This audit drives the rest of the work: every top-level desktop feature should be mapped to user entry points, implementation/source files, current docs coverage, gaps, and status.

## Constraints

- Documentation-only: do not change desktop product code.
- Treat root `docs/**`, `apps/desktop/**`, `plugins/**`, and `../plugins/**` as source material, not public navigation targets.
- Mark uncertain or partial features explicitly; do not document planned behavior as shipped.
- Include existing docs consistency columns so later workers update old pages, not just add new pages.
- **Do NOT** link `.pi/plans/**`, `docs/plans/**`, `docs/superpowers/**`, or `docs/deslopify/**` from public nav.

## Files

- Create `apps/docs-site/docs/reference/coverage-audit.md` — public reference checklist.
- Modify `apps/docs-site/docs/reference/index.md` — add a link after the page exists.

## Expected Outcome

A reference page with a machine-readable-ish Markdown table and status legend. It should cover shell/layout, profiles/onboarding, workspace, Explorer/editor/terminal/LSP, chat/agent sessions, context controls, subagents/collaboration, containers/dev servers, browser/app capture, CLI, providers/models, apps/plugins, built-ins, external plugins, remote control, MCP, Git/checkpoints, memory, scheduler, Web, evals/testing, security/privacy, and media coverage.

### Example

```md
# Coverage Audit

## Status legend

| Status | Meaning |
|---|---|
| Covered | Has current docs-site coverage and source was checked |
| Partial | Has docs, but important behavior is missing or stale |
| Missing | Needs a new guide/reference page or section |
| Not user-facing | Keep out of public docs except implementation reference |

## Product coverage

| Area | User entry point | Source of truth checked | Current docs | Gap / action | Status |
|---|---|---|---|---|---|
| Sero CLI | Agent `sero-cli`, terminal `sero ...` | `apps/desktop/electron/cli/commands/**` | none | Add `reference/sero-cli.md` | Missing |
```

## Acceptance Criteria

- [x] `coverage-audit.md` exists and includes status legend plus product coverage table.
- [x] Each row cites concrete source files or directories checked.
- [x] Existing docs that need updates are named in the gap/action column.
- [x] `reference/index.md` links to the audit without linking internal plan files.

**Completion note (2026-04-28):** Added `apps/docs-site/docs/reference/coverage-audit.md` and linked it from `apps/docs-site/docs/reference/index.md`. The audit includes source-checked rows, current-doc destinations, gaps/actions, and status values.

---

## DSC-002 — Update docs-site scope rules for the expanded public surface

**Tags:** `docs-site-coverage`
**Depends on:** DSC-001
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Update docs-site-level scope guidance so it matches the expanded complete-coverage effort. The current `apps/docs-site/README.md` describes a narrower alpha IA and will mislead later workers unless revised.

## Constraints

- Keep the public/private boundary from `docs/README.md` intact.
- The docs-site README should describe the expanded coverage categories without turning into a giant IA duplicate.
- Preserve the rule that public nav must not link internal/transient docs.
- **Do NOT** delete root docs or move source docs as part of this todo.

## Files

- Modify `apps/docs-site/README.md` — expanded docs-site scope and content rules.
- Read `docs/README.md` — preserve public vs internal documentation model.
- Read `apps/docs-site/rspress.config.ts` — understand current public IA before writing scope text.

## Expected Outcome

The README tells contributors that `apps/docs-site/docs/**` is the curated public surface for setup, workspace, agents, runtime, apps/plugins, integrations, CLI/reference, quality/security, and troubleshooting.

### Example

```md
## Scope

Keep this site focused on current public Sero behavior:
- Start/setup: overview, installation, profiles, providers, local models
- Workspace/runtime: workspaces, Explorer, containers, dev servers, browser capture
- Agents: chat sessions, context controls, subagents, collaboration, memory, scheduler
- Apps/plugins: built-ins, app store, dashboard widgets, plugin catalog
- Reference: architecture, CLI, state, model config, plugins, evals, security, troubleshooting
```

## Acceptance Criteria

- [x] `apps/docs-site/README.md` no longer claims only the old narrow IA is allowed.
- [x] Internal/transient nav exclusions remain explicit.
- [x] The README still points to `pnpm --filter @sero/docs-site build` for validation.

**Completion note (2026-04-28):** Updated `apps/docs-site/README.md` to describe the expanded public coverage categories while preserving the public/private boundary and validation command.

---

## DSC-003 — Add profiles and onboarding guide coverage

**Tags:** `docs-site-coverage`
**Depends on:** DSC-001
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Create user-facing coverage for profiles and onboarding. Profiles are a first-run and everyday isolation concept, but current docs only mention them across several pages.

## Constraints

- Explain profile isolation clearly but do not claim cryptographic isolation.
- Use `SERO_HOME` / `<SERO_HOME>/agent` terminology consistently with `electron/env.ts` and `reference/state-and-folders.md`.
- Include custom profile locations, restart-on-switch, transferable auth/config sources where supported, and what profile deletion means.
- Update existing docs that mention profiles so they link to the new guide.
- **Do NOT** use `~/.pi/agent/`; Sero uses profile-scoped `~/.sero-ui/agent/` by default.

## Files

- Create `apps/docs-site/docs/guide/profiles-and-onboarding.md`.
- Modify `apps/docs-site/docs/guide/workspace-and-chat.md` — replace duplicated profile primer with link/summary.
- Modify `apps/docs-site/docs/reference/state-and-folders.md` — link to profile guide and verify paths.
- Modify `apps/docs-site/docs/reference/security-privacy.md` — align profile isolation caveats.
- Source references: `docs/features/profiles.md`, `apps/desktop/src/components/profiles/**`, `apps/desktop/electron/profile/**`, `apps/desktop/src/types/ipc-channels.ts` profiles section.

## Expected Outcome

A beginner can understand what a profile is, when onboarding appears, how switching profiles changes local state, and what files/secrets belong to each profile.

### Example

```md
# Profiles and Onboarding

## Fast path

1. Launch Sero.
2. Create a profile name such as `Work` or `Personal`.
3. Connect at least one model provider.
4. Pick LOW / MED / HIGH defaults.
5. Open or create a workspace.

## What a profile owns

| State | Typical location |
|---|---|
| Workspaces | `<SERO_HOME>/agent/workspaces.json` |
| Auth and provider settings | `<SERO_HOME>/agent/auth.json`, `<SERO_HOME>/agent/.env` |
```

## Acceptance Criteria

- [x] New guide starts with plain-language overview and quick path.
- [x] Existing profile mentions link to the new guide where appropriate.
- [x] State/security pages retain redaction warnings for profile files.
- [x] Coverage audit row for profiles/onboarding is updated to Covered/Partial with links.

**Completion note (2026-04-28):** Added `apps/docs-site/docs/guide/profiles-and-onboarding.md`, reduced duplicate profile primer text in `workspace-and-chat.md`, linked profile guidance from state/security/admin docs, and updated the coverage audit to Covered.

---

## DSC-004 — Expand models and providers guide from provider source files

**Tags:** `docs-site-coverage`
**Depends on:** DSC-001
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Expand `guide/models-and-providers.md` so users can see exact provider support, auth modes, env var behavior, health states, model tiers, thinking levels, and recovery steps.

## Constraints

- Provider tables must be source-checked against implementation files, not copied from memory.
- Include plugin-defined provider behavior, especially Alibaba Coding Plan via `sero.providers` manifest metadata.
- Explain OAuth vs API key vs env-backed vs local/custom provider states.
- Keep detailed custom schema in `reference/models-json.md` (DSC-005); do not overload this guide.
- **Do NOT** claim Sero bundles third-party credentials.

## Files

- Modify `apps/docs-site/docs/guide/models-and-providers.md`.
- Modify `apps/docs-site/docs/guide/settings-models-admin.md` — link and terminology consistency.
- Source references: `apps/desktop/electron/shared/auth/provider-catalog.ts`, `apps/desktop/electron/features/onboarding/provider-health.ts`, `apps/desktop/electron/features/onboarding/model-groups.ts`, `docs/guides/combined-model-selection.md`, `plugins/sero-alibaba-plugin/package.json`.

## Expected Outcome

The guide names all built-in API-key providers, explains live model availability, LOW/MED/HIGH tiers, thinking levels, provider health statuses, env-backed credentials, and common recovery paths.

### Example

```md
## Supported API-key providers

Source checked: `apps/desktop/electron/shared/auth/provider-catalog.ts`.

| Provider | Provider ID | Auth mode | Notes |
|---|---|---|---|
| Anthropic | `anthropic` | API key / env | Models appear when credentials and registry data are available |
| OpenAI | `openai` | API key / env | Also required for voice transcription |
| Alibaba Coding Plan | plugin-defined | API key / package provider metadata | Present when plugin manifest is available |
```

## Acceptance Criteria

- [x] Guide lists built-in provider catalog from source.
- [x] Guide explains statuses: `healthy`, `env`, `local`, `missing`, `broken_expired`, `broken_invalid`, `unknown` in user language.
- [x] Guide links to LM Studio and `models.json` pages after they exist.
- [x] Existing model/admin docs do not contradict the expanded guide.

**Completion note (2026-04-28):** Expanded `guide/models-and-providers.md` from provider catalog, provider health, model groups, combined model selection, and Alibaba manifest sources; linked Admin/settings docs and marked the coverage row Covered.

---

## DSC-005 — Add LM Studio guide and `models.json` reference

**Tags:** `docs-site-coverage`
**Depends on:** DSC-004
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Add a task guide for LM Studio/local LLM setup and a reference page for custom provider configuration in `models.json`.

## Constraints

- Keep `guide/local-llms-lm-studio.md` task-oriented and beginner-friendly.
- Keep `reference/models-json.md` exact/schema-oriented with examples.
- Explain host/container reachability carefully; local services may need host-reachable URLs when consumed from inside containers.
- Include supported API shapes from implementation/source plan: OpenAI-compatible completions/responses, Anthropic messages, Google Generative AI, Ollama tags fallback where source confirms.
- **Do NOT** invent a complete schema if source files do not support it; mark uncertain fields as source-check-needed or omit.

## Files

- Create `apps/docs-site/docs/guide/local-llms-lm-studio.md`.
- Create `apps/docs-site/docs/reference/models-json.md`.
- Modify `apps/docs-site/docs/guide/models-and-providers.md` — link both pages.
- Source references: `apps/desktop/src/types/local-models.ts`, `apps/desktop/electron/ipc/agent/handlers/local-models.ts`, `apps/desktop/electron/features/onboarding/provider-health.ts`, `docs/guides/combined-model-selection.md`.

## Expected Outcome

A user can start LM Studio’s OpenAI-compatible local server, configure Sero with a base URL such as `http://localhost:1234/v1`, test/fetch models, assign tiers, and troubleshoot common failures.

### Example

```md
# Local LLMs with LM Studio

## Quick path

1. In LM Studio, download and load a chat model.
2. Start the local server with OpenAI-compatible API enabled.
3. In Sero, open Settings/Admin → Models → Local models.
4. Add a provider with base URL `http://localhost:1234/v1`.
5. Use API key `none` unless your local server requires one.
6. Fetch/test models, then assign LOW/MED/HIGH tiers.
```

## Acceptance Criteria

- [x] LM Studio guide has quick path, setup, tier assignment, and troubleshooting.
- [x] `models-json.md` includes a source-checked example JSON block.
- [x] Container/host reachability caveat is present.
- [x] `models-and-providers.md` links to both pages.

**Completion note (2026-04-28):** Added `guide/local-llms-lm-studio.md` and `reference/models-json.md`, linked them from models/admin/state/reference pages, and updated the local/custom models coverage row to Covered.

---

## DSC-006 — Add containers/dev servers guide and container isolation reference

**Tags:** `docs-site-coverage`
**Depends on:** DSC-001
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Document container-backed workspaces, dev-server registration/exposure, and the container isolation model in beginner and reference layers.

## Constraints

- Separate task guide from reference details.
- Explain one macOS container per workspace, workspace mounts, attached folders/references, lazy start, host fallback, and dev-server exposure by container IP.
- Explain why container dev servers reduce host port conflicts without implying they eliminate every network issue.
- Add ASCII diagrams where they clarify execution and preview flow.
- Update existing container/troubleshooting/explorer docs for consistency.

## Files

- Create `apps/docs-site/docs/guide/containers-dev-servers.md`.
- Create `apps/docs-site/docs/reference/container-isolation.md`.
- Modify `apps/docs-site/docs/reference/containers-host-mode.md` — keep host-mode info but link/split deeper topics.
- Modify `apps/docs-site/docs/guide/explorer-workspace.md` — align dev-server/terminal sections.
- Modify `apps/docs-site/docs/reference/troubleshooting.md` — add container IP/dev-server failure cases.
- Source references: `docs/guides/macos-containers.md`, `docs/decisions.md` AD-018/AD-019, `docs/testing/container-tools-tests.md`, `apps/desktop/electron/features/container/**`, `apps/desktop/electron/cli/commands/container/devserver.ts`.

## Expected Outcome

Users understand where code runs, how previews connect, what host mode changes, and how to debug “server works in terminal but not preview”, “host port already used”, and “container IP changed”.

### Example

```md
```text
Agent / terminal command
        ↓
workspace container `sero-<workspaceId>`
        ↓ starts dev server on container port
Sero dev-server registry
        ↓ exposes preview URL using container IP
Explorer browser preview
```
```

## Acceptance Criteria

- [x] Guide explains dev-server quick path and port-conflict behavior.
- [x] Reference explains lifecycle, mounts, env, network semantics, cleanup, and host-mode fallback.
- [x] Troubleshooting includes the three required dev-server/container cases.
- [x] Coverage audit rows for containers/dev servers are updated.

**Completion note (2026-04-28):** Added `guide/containers-dev-servers.md` and `reference/container-isolation.md`, split deeper lifecycle/mount/network details out of host-mode, aligned Explorer and troubleshooting, and marked container/dev-server audit rows Covered.

---

## DSC-007 — Create canonical `sero-cli` reference

**Tags:** `docs-site-coverage`
**Depends on:** DSC-001
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Create an exhaustive public reference for the host `sero-cli` command surface, including built-in namespaces, batch behavior, extension/plugin command bridging, syntax examples, output shapes, side effects, and errors.

## Constraints

- Generate command inventory from `apps/desktop/electron/cli/**`, especially command registration/help files.
- Cover namespaces: `app`, `appstate`, `artifacts`, `browser`, `devserver`, `terminal`, `editor`, `vcs`, `session`, `set-title`, `workspace`, plus plugin-bridged commands.
- Explain command scope: workspace/session context, source (`tool`, `bash`, `terminal`), batch execution, interactive commands, timeouts, and blacklisted roots.
- Include examples for normal users and agent/operator contexts.
- **Do NOT** document nonexistent commands from old specs unless they exist in code.

## Files

- Create `apps/docs-site/docs/reference/sero-cli.md`.
- Modify `apps/docs-site/docs/reference/index.md` — link reference.
- Source references: `apps/desktop/electron/cli/index.ts`, `apps/desktop/electron/cli/core/registry.ts`, `apps/desktop/electron/cli/core/types.ts`, `apps/desktop/electron/cli/commands/**`, `docs/specs/sero-cli-tool-spec.md` for architecture context only.

## Expected Outcome

A user can find the exact syntax and behavior of each command namespace, understand when commands affect app UI/workspace/session state, and see common failure messages.

### Example

```md
## `workspace`

Source checked: `apps/desktop/electron/cli/commands/workspace/workspace.ts`.

| Command | What it does | Side effects |
|---|---|---|
| `sero workspace list` | Lists known workspaces | none |
| `sero workspace open <id>` | Opens a workspace in Sero | updates active/open workspace state |

```bash
sero workspace list
sero workspace info --json
```
```

## Acceptance Criteria

- [x] Every built-in namespace has syntax, examples, output/side effects/errors.
- [x] Plugin-bridged command behavior and scoping are explained.
- [x] Batch/multiline behavior is documented.
- [x] Reference cites source file ownership for each table/section.

**Completion note (2026-04-28):** Added `reference/sero-cli.md` from current CLI registry/core and command sources, linked it from the reference index, and updated the audit row to Covered.

---

## DSC-008 — Add browser/app capture and visual-control docs

**Tags:** `docs-site-coverage`
**Depends on:** DSC-006, DSC-007
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Document Sero’s app/browser control surfaces: visible browser mode, app navigation, screenshots, DOM interactions, dev-server previews, and MP4 recording.

## Constraints

- Distinguish the visible in-app browser from hidden automation/capture mechanisms.
- Use `reference/sero-cli.md` for exact command tables; keep guide pages workflow-oriented.
- Include storage locations for screenshots/recordings where source confirms.
- Include limitations and recovery tips for capture failures and UI targeting.
- **Do NOT** imply browser capture is a general-purpose full browser automation replacement unless source supports it.

## Files

- Create `apps/docs-site/docs/guide/browser-and-capture.md`.
- Optionally create `apps/docs-site/docs/guide/agent-visual-control.md` if browser/capture would be too large.
- Modify `apps/docs-site/docs/guide/explorer-workspace.md` — link/summarize preview/browser behavior.
- Modify `apps/docs-site/docs/reference/sero-cli.md` — ensure `app` and `browser` sections link to guide.
- Source references: `apps/desktop/electron/cli/commands/browser/browser.ts`, `apps/desktop/electron/cli/commands/apps/app-control*.ts`, `apps/desktop/src/lib/app-control-bridge.ts`, `apps/desktop/src/lib/app-control/dom-interactions.ts`, `docs/diagrams/agent-app-control.html`.

## Expected Outcome

A user/operator can preview a dev server, capture an app screenshot, interact with UI, and record a short MP4 while understanding limitations.

### Example

```md
## Screenshot a running app

```bash
sero app open web
sero app screenshot --output ./web-app.png
```

Use screenshots when you need the agent or a support report to see the current app panel.
```

## Acceptance Criteria

- [x] Guide covers visible browser, app switching, screenshots, interactions, previews, recording.
- [x] Guide links to exact CLI reference sections.
- [x] Limitations and failure recovery are included.
- [x] Coverage audit rows for visual/app control are updated.

**Completion note (2026-04-28):** Added `guide/browser-and-capture.md`, linked Explorer/troubleshooting and `reference/sero-cli.md`, and marked browser/app capture audit coverage Covered.

---

## DSC-009 — Add agent sessions, composer, context, and voice guide

**Tags:** `docs-site-coverage`
**Depends on:** DSC-001, DSC-004
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Create a practical guide for day-to-day agent sessions and chat composer controls: slash commands, `@` file references, attachments, context editor, context presets, workspace snapshot insertion, thinking/memory visibility toggles, steering/abort/queued follow-ups, model selector, and voice transcription.

## Constraints

- This is user-facing; start with outcomes and workflows, not IPC internals.
- Explain that memory/history/context help but are not guarantees; users should include critical instructions in the current prompt.
- Voice transcription requires OpenAI credentials; explain mic permissions, supported error cases, and privacy implications.
- Update `workspace-and-chat.md` and `models-and-providers.md` so they do not duplicate or contradict this guide.
- **Do NOT** overpromise that all context is always sent on every turn.

## Files

- Create `apps/docs-site/docs/guide/agent-sessions-and-context.md`.
- Modify `apps/docs-site/docs/guide/workspace-and-chat.md` — link as deeper chat/context guide.
- Modify `apps/docs-site/docs/guide/models-and-providers.md` — move/link chat context details.
- Modify `apps/docs-site/docs/guide/settings-models-admin.md` — link agents/skills/prompts context.
- Source references: `apps/desktop/src/components/layout/ChatPromptArea.tsx`, `ContextEditor.tsx`, `WorkspaceSnapshotMenuItem.tsx`, `SlashCommandMenu.tsx`, `FileReferenceMenu.tsx`, `VoiceTranscriptionControl.tsx`, `apps/desktop/electron/features/agent/assistants/voice-transcription.ts`, `apps/desktop/src/hooks/useMessageQueue.ts`.

## Expected Outcome

A beginner can send better prompts, attach files/context, adjust what the agent sees, use voice input, steer/stop an active turn, and understand what each composer control does.

### Example

```md
## Fast path: include a file and a workspace snapshot

1. Type `@` and choose a file from the workspace.
2. Open Actions → Insert workspace snapshot.
3. Add your current goal in plain language.
4. Check the model selector, then send.

Use snapshots for orientation, not as a replacement for asking the agent to inspect current files.
```

## Acceptance Criteria

- [x] Guide covers all composer controls named in this todo.
- [x] Voice transcription section mentions OpenAI API key requirement and common errors.
- [x] Existing chat/model docs link to the new guide and remain consistent.
- [x] Coverage audit rows for agent sessions/context/voice are updated.

**Completion note (2026-04-28):** Added `guide/agent-sessions-and-context.md`, linked it from workspace/chat, models/providers, and Settings/Admin docs, and marked agent sessions/context/voice rows Covered in the audit.

---

## DSC-010 — Add subagents, agent definitions, and collaboration/debate coverage

**Tags:** `docs-site-coverage`
**Depends on:** DSC-009
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Surface subagents and agent definitions in the docs site, including user workflows, definition schema, discovery paths, model/tier resolution, tools/skills defaults, no-recursion rule, and multi-agent collaboration/debate mode.

## Constraints

- Split user guide and reference details.
- Explain built-in agents, when Sero delegates, single/parallel/fan-out patterns, result display, abort/clear completed behavior, and child session limitations.
- Collaboration/debate is related but distinct: document the 4-agent collaboration framework and degraded mode without implying every subagent run is collaboration mode.
- Update state/folders and admin docs to link `~/.sero-ui/agent/agents/` / `<SERO_HOME>/agent/agents/` to the new reference.
- **Do NOT** claim child subagents can recursively spawn subagents; source says recursion is prevented.

## Files

- Create `apps/docs-site/docs/guide/subagents.md`.
- Create `apps/docs-site/docs/reference/agent-definitions.md`.
- Optionally create `apps/docs-site/docs/guide/agent-collaboration.md` if collaboration/debate is too long for `subagents.md`.
- Modify `apps/docs-site/docs/guide/settings-models-admin.md`.
- Modify `apps/docs-site/docs/reference/state-and-folders.md`.
- Source references: `docs/features/subagents.md`, `docs/specs/subagents.md`, `apps/desktop/electron/features/subagent/**`, `apps/desktop/electron/features/collaboration/**`, `apps/desktop/src/components/layout/CollaborationActivityPanel.tsx`, `apps/desktop/src/types/subagent.ts`, `apps/desktop/src/types/collaboration.ts`.

## Expected Outcome

Users understand when to use subagents/collaboration and plugin authors/admin users can write valid agent definition files.

### Example

```md
## Agent definition locations

Sero reads profile-scoped agent definitions from:

```text
<SERO_HOME>/agent/agents/
```

Definitions are Markdown files with frontmatter. Child sessions do not receive `subagent` / `create_agent` tools, so subagents cannot recursively spawn more subagents.
```

## Acceptance Criteria

- [x] User guide explains delegation and visible results.
- [x] Reference documents schema/frontmatter forms from source.
- [x] No-recursion and child-session limitations are explicit.
- [x] Collaboration/debate and degraded mode are covered.
- [x] Existing admin/state docs link to new pages.

**Completion note (2026-04-28):** Added `guide/subagents.md` and `reference/agent-definitions.md`, including no-recursion/child-session limits, collaboration/debate degraded mode, and Admin/state cross-links.

---

## DSC-011 — Add dashboard and widgets user guide

**Tags:** `docs-site-coverage`
**Depends on:** DSC-001
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Document the Dashboard as a real user surface: adding widgets, draggable/resizable layout, static manifest widgets, runtime widgets, persistence, and limitations.

## Constraints

- Keep guide user-facing; plugin author API details belong in DSC-019.
- Explain widget placement and sizing as user-adjustable hints, not fixed guarantees.
- Mention dashboard layout persistence through profile layout state.
- Update plugin/app docs that currently mention widgets so they link to the guide.
- **Do NOT** promise every app exposes widgets.

## Files

- Create `apps/docs-site/docs/guide/dashboard-widgets.md`.
- Modify `apps/docs-site/docs/guide/workspace-and-chat.md` — Dashboard section links here.
- Modify `apps/docs-site/docs/guide/plugins-and-apps.md` — widget overview links here.
- Modify `apps/docs-site/docs/reference/state-and-folders.md` — dashboard layout state consistency.
- Source references: `apps/desktop/src/components/apps/dashboard/Dashboard.tsx`, `AddWidgetDialog.tsx`, `DashboardWidget.tsx`, `WidgetMount.tsx`, `apps/desktop/src/stores/dashboard.ts`, `apps/desktop/src/types/layout.ts`, `packages/app-runtime/src/use-widget-registration.ts`.

## Expected Outcome

Users know what the Dashboard is for, how to add/remove/resize widgets, why available widgets depend on installed apps/plugins, and where layout state is stored.

### Example

```md
## Add a widget

1. Open Dashboard from the app sidebar or command menu.
2. Click **Add Widget**.
3. Choose a widget exposed by an installed app/plugin.
4. Drag or resize it on the grid.

Dashboard layout is saved in profile layout state, so it follows the active profile.
```

## Acceptance Criteria

- [x] Guide covers add/remove/drag/resize and empty state.
- [x] Guide distinguishes manifest widgets from runtime widgets in plain language.
- [x] Existing Dashboard/widget mentions link to the guide.
- [x] Coverage audit row for Dashboard/widgets is updated.

**Completion note (2026-04-28):** Added `guide/dashboard-widgets.md`, linked workspace/plugins/app-store/state docs, and marked Dashboard/widgets Covered in the audit.

---

## DSC-012 — Document checkpoints, turn undo, and source-control safety

**Tags:** `docs-site-coverage`
**Depends on:** DSC-009
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Clarify Sero’s manual checkpoints, chat turn undo, restore checkpoint, and source-control safety model. This can be a new guide or a substantial expansion of Git/Explorer docs.

## Constraints

- Distinguish manual checkpoints from internal turn-undo snapshots.
- Explain that chat undo restores files and rewinds the session tree, while source-control restore is a VCS/file operation.
- Include caution around conflicts, uncommitted work, and branch/worktree safety.
- Update Git Integration docs rather than creating contradictory parallel explanations.
- **Do NOT** imply turn undo is a substitute for reviewing file changes.

## Files

- Create `apps/docs-site/docs/guide/checkpoints-and-undo.md` OR expand `apps/docs-site/docs/guide/git-integration.md` if the content stays concise.
- Modify `apps/docs-site/docs/guide/explorer-workspace.md` — link checkpoint/source-control behavior.
- Modify `apps/docs-site/docs/reference/troubleshooting.md` — add restore/undo failure notes if source supports.
- Source references: `docs/guides/version-control-user-flow.md`, `apps/desktop/src/hooks/useCheckpointRestore.ts`, `apps/desktop/electron/ipc/agent/core/agent-checkpoint.ts`, `apps/desktop/electron/ipc/integrations/vcs.ts`, `apps/desktop/src/types/ipc-channels.ts` agent/vcs sections.

## Expected Outcome

Users understand which recovery tool to use after a bad agent turn, a bad manual edit, or a source-control mistake.

### Example

```md
| Action | Restores files? | Rewinds chat/session? | Typical use |
|---|---:|---:|---|
| Undo this turn | yes | yes | Retry a prompt after an agent made unwanted changes |
| Restore checkpoint | yes | no | Return workspace files to a manual checkpoint |
| Manual checkpoint | no | no | Save a known-good state before risky work |
```

## Acceptance Criteria

- [x] Manual checkpoints and turn undo are clearly distinguished.
- [x] Git/Explorer docs link to the canonical explanation.
- [x] Safety caveats are present.
- [x] Coverage audit rows for checkpoints/undo are updated.

**Completion note (2026-04-28):** Added `guide/checkpoints-and-undo.md`, cross-linked Git/Explorer/troubleshooting, and marked checkpoint/undo coverage Covered in the audit.

---

## DSC-013 — Expand testing/evals docs into a practical workflow

**Tags:** `docs-site-coverage`
**Depends on:** DSC-001
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Make testing/evals docs actionable for users/developers: explain snapshot evals vs real LLM evals, commands, auth/cost requirements, scenario matrix, adding scenarios, interpreting failures, and relationship to typecheck/build/unit/e2e tests.

## Constraints

- Keep current alpha quality model truthful: not every suite is a PR gate.
- Use root scripts and eval configs as source-of-truth.
- Include cost/auth warnings for `pnpm eval`.
- If adding a guide page, keep `reference/testing-evals.md` as canonical reference or link them clearly.
- **Do NOT** claim a repo-wide `turbo run test` public contract exists.

## Files

- Modify `apps/docs-site/docs/reference/testing-evals.md`.
- Optionally create `apps/docs-site/docs/guide/running-evals.md` for task flow.
- Modify `apps/docs-site/docs/guide/development-setup.md` — link eval workflow.
- Source references: `docs/testing/eval-guide.md`, `promptfooconfig.yaml`, `eval/promptfoo-snapshot.yaml`, `eval/scenarios/**`, `package.json`, `apps/desktop/electron/__tests__/**`.

## Expected Outcome

A contributor can choose the right command (`pnpm eval:snapshot`, `pnpm eval`, `pnpm eval:view`), understand when to run it, and interpret failures without guessing.

### Example

```md
| Command | When to use | Cost/auth |
|---|---|---|
| `pnpm eval:snapshot` | Fast prompt assembly/cache drift check | low/no live LLM depending on config |
| `pnpm eval` | Full promptfoo eval against real providers | requires credentials and may cost money |
| `pnpm eval:view` | Inspect saved promptfoo results | no new model calls |
```

## Acceptance Criteria

- [x] Docs cover snapshot vs real evals and view command.
- [x] Scenario coverage matrix exists or explicitly lists how to inspect scenarios.
- [x] Auth/cost and failure interpretation are documented.
- [x] Development setup links to eval docs.

**Completion note (2026-04-28):** Expanded `reference/testing-evals.md`, added `guide/running-evals.md`, linked development setup, and marked testing/evals Covered in the audit.

---

## DSC-014 — Create plugin catalog and catalog data rules

**Tags:** `docs-site-coverage`
**Depends on:** DSC-001
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Create a plugin catalog page that covers built-in and external plugins at a glance, with category, package name, status, source manifest, install/enable notes, and whether a full page exists.

## Constraints

- Built-in plugins under `plugins/sero-*-plugin/` must be distinguished from external/local plugins under `../plugins/`.
- Catalog entries must cite `package.json` manifests and README/source when available.
- Mark external plugins as external/local; do not imply they ship built into Sero.
- Use the catalog to prevent sidebar bloat: not every plugin page needs top-level nav.
- **Do NOT** copy plugin capabilities from memory without manifest/source checks.

## Files

- Create `apps/docs-site/docs/guide/plugin-catalog.md` OR `apps/docs-site/docs/plugins/catalog.md` based on final IA.
- Modify `apps/docs-site/docs/guide/plugins-and-apps.md` — link catalog.
- Modify `apps/docs-site/docs/guide/app-store-favorites.md` — link catalog/install caveats.
- Source references: `plugins/*/package.json`, `plugins/*/README.md`, `../plugins/*/package.json`, `../plugins/*/README.md` where present.

## Expected Outcome

Users can see what plugins exist, which are built-in vs external, what each is for, and where to go next.

### Example

```md
| Plugin | Package | Status | Category | Source checked | Full page |
|---|---|---|---|---|---|
| Git | `@sero-ai/plugin-git` | Built-in | Developer workflow | `plugins/sero-git-plugin/package.json` | `/guide/git-integration` |
| Google | `@sero-ai/plugin-google` | External/local | Integration | `../plugins/sero-google-plugin/package.json` | planned |
```

## Acceptance Criteria

- [x] Catalog includes every built-in plugin and every external plugin listed in the source plan.
- [x] Built-in/external status is explicit in every row.
- [x] Existing plugin/app docs link to the catalog.
- [x] Coverage audit plugin rows are updated.

---

**Completion note (2026-04-28):** Added `apps/docs-site/docs/plugins/catalog.md`, linked it from plugin/app docs, and updated the coverage audit rows for built-in and external/local plugins.

## DSC-015 — Polish built-in plugin documentation coverage

**Tags:** `docs-site-coverage`
**Depends on:** DSC-014
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Ensure built-in plugins have complete user-facing coverage, either through existing guide pages or new dedicated sections/pages: Admin, Alibaba Coding Plan provider, Cron/Scheduler, Git, MCP, Memory, User Feedback, and Web.

## Constraints

- Prefer improving existing pages for already-covered plugins instead of creating duplicate pages.
- Add dedicated coverage only where absent (e.g. Admin/User Feedback/Alibaba if existing pages are too thin).
- Each built-in plugin section/page must include overview, quick path, UI entry point, agent/CLI/tool capabilities where relevant, data storage, auth/secrets, limitations, and source package.
- Keep plugin pages aligned with catalog entries.
- **Do NOT** claim built-in plugins are removable through Plugin Manager.

## Files

- Modify existing built-in pages: `guide/scheduler-reminders.md`, `guide/git-integration.md`, `guide/mcp.md`, `guide/memory.md`, `guide/web.md`, `guide/settings-models-admin.md`.
- Create pages only if needed, e.g. `apps/docs-site/docs/guide/user-feedback.md` or `apps/docs-site/docs/reference/alibaba-provider.md`.
- Source references: `plugins/sero-admin-plugin/**`, `plugins/sero-alibaba-plugin/**`, `plugins/sero-cron-plugin/**`, `plugins/sero-git-plugin/**`, `plugins/sero-mcp-plugin/**`, `plugins/sero-memory-plugin/**`, `plugins/sero-user-feedback-plugin/**`, `plugins/sero-web-plugin/**`.

## Expected Outcome

Every built-in plugin has at least one clear docs-site destination and catalog linkage.

### Example

```md
## Source and state

Source package: `plugins/sero-user-feedback-plugin`.

| Surface | What to document |
|---|---|
| Agent tools | `question`, `questionnaire`, permission prompts |
| UI | Pending questions app/panel behavior |
| State/privacy | Pending answers can contain user-provided private text |
```

## Acceptance Criteria

- [x] Catalog rows link to the relevant built-in docs pages/sections.
- [x] Admin, Alibaba, and User Feedback are no longer missing or vague.
- [x] Existing built-in docs use consistent plugin terminology.
- [x] Coverage audit marks built-in plugins as covered/partial with links.

---

**Completion note (2026-04-28):** Polished built-in coverage through Admin/settings, models/providers (Alibaba), Scheduler, Memory, Web, catalog links, and new `plugins/user-feedback.md`; updated coverage audit.

## DSC-016 — Add priority external plugin pages: Google, Kanban, Notes, Todo, Research, Plan Mode

**Tags:** `docs-site-coverage`
**Depends on:** DSC-014
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Create full plugin pages for the highest-priority external/local plugins: Google, Kanban, Notes, Todo, Research, and Plan Mode.

## Constraints

- Use the common plugin page template from the source plan.
- Mark each page as external/local unless source proves otherwise.
- Cite package manifest fields and README/source files.
- Include auth/secrets/privacy notes, UI walkthrough placeholders/screenshots if available, agent/CLI capabilities, data storage, runtime/widgets, limitations, and recovery tips.
- **Do NOT** imply these external plugins ship with the desktop app.

## Files

- Create pages under final plugin-doc path, e.g. `apps/docs-site/docs/plugins/google.md`, `kanban.md`, `notes.md`, `todo.md`, `research.md`, `plan-mode.md` OR guide paths chosen by IA.
- Modify plugin catalog to link these pages.
- Source references: `../plugins/sero-google-plugin/**`, `../plugins/sero-kanban-plugin/**`, `../plugins/sero-notes-plugin/**`, `../plugins/sero-todo-plugin/**` or actual todo package path, `../plugins/sero-research-plugin/**`, `../plugins/sero-plan-mode-plugin/**`.

## Expected Outcome

Major external plugins have approachable pages that explain the user problem, first successful path, setup/auth, UI, agent capabilities, storage, limitations, and source package.

### Example

```md
# Google Plugin

> Status: external/local plugin. It is not bundled with Sero unless installed or activated as a local dev session.

## Try it first

1. Install or activate the Google plugin.
2. Open the Google app from the sidebar.
3. Complete OAuth if prompted.
4. Ask Sero: “Summarize today’s demo calendar using fake/sample data.”

## Source checked

- `../plugins/sero-google-plugin/package.json`
- `../plugins/sero-google-plugin/README.md`
```

## Acceptance Criteria

- [x] Six priority plugin pages exist.
- [x] Each page follows the template and states external/local status.
- [x] Catalog links to all six pages.
- [x] Pages avoid unsupported claims and cite source files.

---

**Completion note (2026-04-28):** Added priority external/local pages for Google, Kanban, Notes, Todo, Research, and Plan Mode under `apps/docs-site/docs/plugins/`; catalog links all six.

## DSC-017 — Add second-tier external plugin pages: Spotify, ImageGen, Starling, Weight

**Tags:** `docs-site-coverage`
**Depends on:** DSC-014, DSC-016
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Create full or near-full pages for second-tier external/local plugins with special setup/privacy caveats: Spotify, ImageGen, Starling Bank, and Weight Tracker.

## Constraints

- Use the same template as DSC-016.
- Emphasize secrets/privacy for banking, personal tracking, and media/auth providers.
- Mention Widevine/Castlabs caveats for Spotify if source confirms.
- Mention Gemini/image output storage and API key requirements for ImageGen if source confirms.
- **Do NOT** include real banking, health, or personal account examples; use fake/demo data.

## Files

- Create pages under final plugin-doc path: `spotify.md`, `imagegen.md`, `starling.md`, `weight-tracker.md`.
- Modify plugin catalog to link these pages.
- Source references: `../plugins/sero-spotify-plugin/**`, `../plugins/sero-imagegen-plugin/**`, `../plugins/sero-starling-plugin/**`, `../plugins/sero-weight-tracker-plugin/**`.

## Expected Outcome

Riskier or setup-heavy external plugins have clear privacy/setup warnings and practical quick starts.

### Example

```md
## Privacy and secrets

Use fake/demo data in screenshots and support reports. Do not paste real bank tokens, personal health data, or account identifiers into public issues.

| Secret/data | Where to check source |
|---|---|
| Starling token | `../plugins/sero-starling-plugin/package.json` and extension source |
```

## Acceptance Criteria

- [x] Four second-tier plugin pages exist or catalog rows explain why full page is deferred.
- [x] Privacy/secrets caveats are prominent.
- [x] Catalog links are updated.
- [x] No real personal data examples appear.

---

**Completion note (2026-04-28):** Added second-tier external/local pages for Spotify, ImageGen, Starling Bank, and Weight Tracker with privacy/setup caveats and catalog links.

## DSC-018 — Add lightweight external plugin pages/examples: Calculator, Daily Quote, Humanizer, SlopZilla, Tetris

**Tags:** `docs-site-coverage`
**Depends on:** DSC-014
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Add lightweight pages or catalog-expanded sections for smaller/demo external plugins: Calculator, Daily Quote, Humanizer, SlopZilla, and Tetris.

## Constraints

- These can be shorter than priority plugin pages, but still need overview, try-first path, install/enable path, capabilities, limitations, and source manifest.
- Daily Quote and Notes may be useful plugin-author examples; cross-link author docs where relevant.
- Keep novelty/game plugins clearly framed as examples or optional apps.
- **Do NOT** over-prioritize these over core docs if time is constrained; catalog-expanded sections are acceptable if complete enough.

## Files

- Create lightweight pages or expanded catalog sections for `calc`, `daily-quote`, `humanizer`, `slopzilla`, `tetris`.
- Modify plugin catalog with final links/status.
- Source references: `../plugins/sero-calc-plugin/**`, `../plugins/sero-daily-quote-plugin/**`, `../plugins/sero-humanizer-plugin/**`, `../plugins/sero-slopzilla-plugin/**`, `../plugins/sero-tetris-plugin/**`.

## Expected Outcome

Every external plugin from the source plan has at least catalog-level coverage; smaller plugins either have concise pages or complete catalog descriptions.

### Example

```md
## Calculator

Status: external/local utility plugin.

- **Use it for:** simple calculator app/tool examples.
- **Try first:** ask Sero to calculate a small expression, then open the app UI if available.
- **Source checked:** `../plugins/sero-calc-plugin/package.json`.
```

## Acceptance Criteria

- [x] All five smaller plugins have page or catalog-expanded coverage.
- [x] Each entry cites a source manifest/path.
- [x] Plugin catalog clearly shows which have full pages vs catalog-only coverage.

---

**Completion note (2026-04-28):** Added catalog-expanded coverage for Calculator, Daily Quote, Humanizer, SlopZilla, and Tetris with source manifest paths and catalog-only status.

## DSC-019 — Expand local plugin development and app-runtime author reference

**Tags:** `docs-site-coverage`
**Depends on:** DSC-014
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Improve plugin-author docs with local plugin development sessions and a compact `@sero-ai/app-runtime` API reference.

## Constraints

- Explain installed plugin vs local plugin development vs attached folder as separate concepts.
- Cover dev session states: live UI dev server, built UI fallback, backend-only, UI unavailable, needs attention/broken recovery.
- App runtime reference must list current exported hooks and explain when to use each.
- Keep author docs concise; link to deeper plugin pages/examples rather than duplicating everything.
- **Do NOT** describe `SERO_DEV_PLUGINS` as the product workflow; source says Admin local plugin development is the user-facing flow.

## Files

- Modify `apps/docs-site/docs/reference/plugins.md`.
- Modify `apps/docs-site/docs/guide/plugins-and-apps.md`.
- Modify `apps/docs-site/docs/reference/plugin-author-quick-path.md`.
- Create `apps/docs-site/docs/reference/app-runtime.md` if the hook table would make existing pages too long.
- Source references: `docs/features/local-plugin-development.md`, `docs/features/sero-apps.md`, `packages/app-runtime/README.md`, `packages/app-runtime/src/index.ts`, `packages/app-runtime/src/use-ai.ts`, `packages/app-runtime/src/use-app-tools.ts`, `packages/app-runtime/src/use-widget-registration.ts`, `apps/desktop/electron/features/plugins/dev-sessions/**`.

## Expected Outcome

Plugin authors know how to run a local checkout in Sero and how to use the app-runtime hooks without guessing from source.

### Example

```md
| Hook/API | Use it for | Notes |
|---|---|---|
| `useAppState` | Read/write app state JSON | State is workspace/global based on manifest scope |
| `useAI` | Prompt the app-scoped agent session | Requires app/workspace context |
| `useAppTools` | Invoke app-owned tools from UI | Throws if bridge is unavailable |
| `useWidgetRegistration` | Register runtime dashboard widgets | Sticky for renderer session |
```

## Acceptance Criteria

- [x] Local plugin development docs distinguish the three concepts.
- [x] App-runtime hooks/API table is present and source-checked.
- [x] Plugin author quick path links to the new/expanded reference.
- [x] No product-flow docs recommend `SERO_DEV_PLUGINS` as the normal user workflow.

---

**Completion note (2026-04-28):** Expanded local plugin development docs in `reference/plugins.md`, linked author docs, and added `reference/app-runtime.md` with source-checked hook/API table.

## DSC-020 — Create media asset structure and capture notes

**Tags:** `docs-site-coverage`
**Depends on:** DSC-001
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Create stable docs-site asset directories and a capture-notes document for screenshots/media hygiene, required captures, omissions, viewport/app version notes, and redaction rules.

## Constraints

- Do not capture or commit secrets, private repos, real email, banking, API keys, or personal data.
- Prefer still screenshots; use MP4/GIF only when motion is the feature.
- It is acceptable to record omissions with reasons when capture cannot happen in this pass.
- Keep asset paths stable under `apps/docs-site/docs/assets/`.
- **Do NOT** reuse unrelated screenshots just to satisfy a checklist.

## Files

- Create directories under `apps/docs-site/docs/assets/`: `shell/`, `explorer/`, `containers/`, `cli/`, `models/`, `subagents/`, `browser-capture/`, `evals/`, `plugins/`.
- Create `apps/docs-site/docs/assets/CAPTURE_NOTES.md`.
- Modify `apps/docs-site/docs/reference/coverage-audit.md` — add media status/omission links.

## Expected Outcome

The docs project has a repeatable capture checklist and a place to record what was captured, how, with what fake data, and what remains omitted.

### Example

```md
# Capture Notes

| Asset | Page | Captured from | Viewport | Data hygiene | Status |
|---|---|---|---|---|---|
| `models/lm-studio-success.png` | Local LLMs | disposable profile | 1440×900 | fake endpoint/no token | needed |

## Rules

- Use disposable profiles and sample workspaces.
- Crop or hide token fields.
- Record app version/commit when possible.
```

## Acceptance Criteria

- [x] Asset directories exist.
- [x] `CAPTURE_NOTES.md` includes rules and required screenshot/media matrix.
- [x] Coverage audit records media status or omission reason for visual features.

**Completion note (2026-04-28):** Created stable media directories under `apps/docs-site/docs/assets/`, added `CAPTURE_NOTES.md` with hygiene rules, required capture matrix, and explicit omissions, and updated the coverage audit media row/final omissions.

---

## DSC-021 — Rework Rspress IA/sidebar/nav and index pages

**Tags:** `docs-site-coverage`
**Depends on:** DSC-003 through DSC-020 page creation
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Update `rspress.config.ts`, guide/reference index pages, and homepage links so the docs follow the complete-coverage reader journey.

## Constraints

- Do this after page files exist; do not add nav links to missing pages.
- Group pages by reader journey, not by implementation directory names.
- Avoid sidebar bloat: use catalog/index pages for plugin long tail.
- Keep human-friendly labels.
- Check `rspress.config.ts` line count stays under 500 LOC because it is a source file.
- **Do NOT** link internal/transient planning docs from public nav.

## Files

- Modify `apps/docs-site/rspress.config.ts`.
- Modify `apps/docs-site/docs/index.md`.
- Modify `apps/docs-site/docs/guide/index.md`.
- Modify `apps/docs-site/docs/reference/index.md`.
- Read current patterns in `apps/docs-site/rspress.config.ts` before editing.

## Expected Outcome

Navigation has coherent sections for Start/Setup, Workspace, Agents, Apps & Plugins, Integrations, and Reference. Index pages match the sidebar and explain where to start.

### Example

```ts
const guideAgents = [
  { text: 'Agent Sessions and Context', link: '/guide/agent-sessions-and-context' },
  { text: 'Subagents', link: '/guide/subagents' },
  { text: 'Memory', link: '/guide/memory' },
  { text: 'Scheduler and Reminders', link: '/guide/scheduler-reminders' },
];
```

## Acceptance Criteria

- [x] Sidebar links only existing public docs-site pages.
- [x] Guide/reference index pages match the new IA.
- [x] Homepage links reflect the expanded docs surface.
- [x] `wc -l apps/docs-site/rspress.config.ts` reports under 500 lines.

**Completion note (2026-04-28):** Reworked `rspress.config.ts` around Start/Setup, Workspace/Runtime, Agents/Automation, Apps/Integrations, selected plugin pages, and Reference groups; updated home, guide index, and reference index. Config link check found no missing pages and `wc -l` reported 130 lines.

---

## DSC-022 — Run existing-doc consistency pass across the whole docs site

**Tags:** `docs-site-coverage`
**Depends on:** DSC-003 through DSC-021
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Perform a final consistency pass over existing docs so new pages do not contradict older wording. This is deliberately separate from IA: it checks terminology, paths, links, caveats, screenshots, and source-of-truth references.

## Constraints

- Update existing pages; do not leave stale duplicate explanations.
- Keep guide pages beginner-first and references exact but practical.
- Ensure all Sero agent paths use `<SERO_HOME>/agent` or `~/.sero-ui/agent` where appropriate, never `~/.pi/agent`.
- Ensure alpha/partial features are marked consistently.
- **Do NOT** convert public docs into internal implementation dumps.

## Files

- Review/modify: `apps/docs-site/docs/guide/overview.md`, `workspace-and-chat.md`, `explorer-workspace.md`, `settings-models-admin.md`, `models-and-providers.md`, `plugins-and-apps.md`, `app-store-favorites.md`, `git-integration.md`, `remote-control.md`.
- Review/modify: `apps/docs-site/docs/reference/state-and-folders.md`, `security-privacy.md`, `troubleshooting.md`, `known-limitations.md`, `support-scope.md`, `architecture.md`.
- Use `rg` checks for stale terms and broken old links.

## Expected Outcome

Existing docs read as part of one coherent docs site and direct readers to the new canonical pages.

### Example

```bash
rg -n "~/.pi/agent|docs/plans|superpowers|deslopify|coming soon|TODO" apps/docs-site/docs apps/docs-site/rspress.config.ts
rg -n "Containers and Host Mode|models.json|Subagents|Sero CLI" apps/docs-site/docs
```

## Acceptance Criteria

- [x] No stale `~/.pi/agent` references remain in public docs-site content.
- [x] No public docs-site nav/index links internal/transient docs.
- [x] Existing docs link to new canonical pages instead of duplicating stale summaries.
- [x] Coverage audit statuses reflect final consistency state.

**Completion note (2026-04-28):** Ran stale-term/internal-tree checks, confirmed no public nav/index links to transient docs and no `~/.pi/agent` references, verified existing docs link to canonical pages, and added final consistency/remaining-gap notes to the coverage audit.

---

## DSC-023 — Validate docs build and final coverage traceability

**Tags:** `docs-site-coverage`
**Depends on:** DSC-001 through DSC-022
**Plan:** `.pi/plans/2026-04-28-docs-site-coverage/plan.md`

## What

Run final validation: build docs site, check public links/source references at a practical level, verify source-file line-count rules for touched TS files, and update the coverage audit with any remaining gaps/omissions.

## Constraints

- Run validation from the monorepo root.
- Fix build failures and broken obvious docs-site links before finishing.
- If screenshots/media remain missing, record explicit omission reasons rather than silently leaving gaps.
- Check touched source files such as `rspress.config.ts` for the 500 LOC rule.
- **Do NOT** skip validation because changes are “docs-only”.

## Files

- Modify `apps/docs-site/docs/reference/coverage-audit.md` — final statuses/remaining gaps.
- Modify `apps/docs-site/docs/assets/CAPTURE_NOTES.md` — final media status.
- Potentially modify any docs page with broken links discovered during validation.
- Read `apps/docs-site/package.json` for scripts.

## Expected Outcome

The docs-site builds successfully, remaining omissions are explicit, and reviewers can trace coverage from audit rows to pages.

### Example

```bash
pnpm --filter @sero/docs-site build
wc -l apps/docs-site/rspress.config.ts
find apps/docs-site/docs -type f -name '*.md' | sort
```

## Acceptance Criteria

- [x] `pnpm --filter @sero/docs-site build` succeeds.
- [x] `rspress.config.ts` is under 500 LOC.
- [x] Coverage audit links every completed page and records remaining gaps.
- [x] Capture notes record captured assets or omission reasons.
- [x] Final summary lists any deferred plugin/media/docs gaps.

**Completion note (2026-04-28):** `pnpm --filter @sero/docs-site build` succeeded, `rspress.config.ts` is 130 lines, practical Markdown/config link checks found 0 missing internal links, and final media/docs omissions are recorded in the coverage audit and capture notes.
