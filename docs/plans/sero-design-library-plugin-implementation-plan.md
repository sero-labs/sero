# Sero Design Library Plugin — Implementation Plan

**Status:** PR 1 merged (#318). PR 2a open for review (#320); PR 2b next.
**Branch:** `feat/design-library-design` (PR 1 landed on `feat/design-library-plugin-v2`, merged as #318)
**Plugin:** `@sero-ai/plugin-design-library`
**App ID:** `design-library` · **Scope:** Global · **Dev port:** `5190` (verified unused) · **Icon:** `palette`
**Supersedes:** the 2026-07-25 draft of this file, including its Gate A structure and single-PR delivery

Product behaviour lives in `docs/specs/sero-design-library-plugin-spec.md`. Rationale lives in `docs/decisions/sero-design-library-first-release-decisions.md`. This document is build order only.

---

## 1. Governing constraints

- Reuse Sero's public plugin and runtime contracts. No custom preload APIs, no new desktop IPC, no Design Library-specific host changes, no imports from desktop source or `sero-web-plugin`.
- No direct filesystem access from UI code.
- No binary payloads in reactive state.
- No vendor types outside the media adapter.
- No reference pixels in generated output.
- No mutable Gallery snapshots.
- Never exceed 500 LOC in a source file.

## 2. Reuse map

| Need | Sero capability | Use |
|---|---|---|
| Structure | `packages/templates/skills/sero-plugin/example/sero-notes-plugin` | Canonical scaffold, scoped CSS, Module Federation config |
| Discovery | `sero.app` manifest | Global app auto-discovery |
| UI state | `useAppState()` | Lightweight summaries only |
| UI actions | `useAppTools()` | All domain mutation through grouped plugin tools |
| Background work | `createAppRuntime()` | One global runtime coordinator, single authoritative writer |
| Structured AI | `host.subagents.runStructured()` | Configured models, structured schemas, `repair`, cancellation |
| Model list | `useAvailableModels()` / `host.models.list()` | Feed `AvailableModelPicker`; resolve a pinned model in the runtime |
| Agent tools | `AppRuntimeSubagentRunParams.customTools` | Hand media tools to the generating model (precedent: `sero-kanban-plugin`) |
| Chat access | `sero.plugin.bridgeTools` | Expose plugin tools to the main Sero agent |
| Theme | `@sero-ai/ui` + theme CSS tokens | Colour, typography, spacing, radius |
| Files | `host.appState.globalDir()` | Plugin-owned records and binaries |
| Preview | `blob:` + `sandbox="allow-scripts"` (precedent: `HtmlPreview.tsx`) | Isolated frame; CSP allows `frame-src blob:` |
| Tests | Vitest with per-file jsdom (precedent: `sero-mcp-plugin`) | Component and unit tests |

## 3. Target shape

```text
plugins/sero-design-library-plugin/
├── package.json                 # sero.app + sero.plugin manifest
├── vite.config.ts
├── shared/                      # JSON-serialisable domain, no vendor types
│   ├── types.ts                 # items, designs, variants, revisions, gallery
│   ├── media.ts                 # MediaCapability, request/result/provenance
│   ├── tweaks.ts                # manifest + control primitives
│   ├── schemas.ts               # structured-output schemas
│   ├── state-io.ts              # queue + cross-process lock + revision CAS
│   ├── file-lock.ts
│   └── defaults.ts
├── extension/                   # read-and-intent only; never writes records
│   ├── index.ts
│   ├── paths.ts
│   └── tools/
├── runtime/                     # the single authoritative writer
│   ├── index.ts
│   ├── coordinator.ts
│   ├── projection.ts            # index = pure projection of records
│   ├── jobs/
│   ├── librarian/
│   ├── generation/
│   ├── build/                   # esbuild transform + document assembly
│   ├── preview/
│   └── media/
│       ├── contract.ts          # MediaProvider — no vendor types
│       ├── registry.ts
│       ├── tools.ts             # ToolDefinitions handed to the model
│       ├── budget.ts            # per-run caps, video confirmation
│       └── providers/
│           ├── fal.ts           # the ONLY importer of @fal-ai/client
│           └── fake.ts          # deterministic test double
└── ui/
    ├── DesignLibraryApp.tsx
    ├── pages/{Library,Design,Gallery,Settings}Page.tsx
    ├── components/
    ├── tweaks/
    └── hooks/
```

## 4. Tool surface

Grouped tools with validated action enums.

| Tool | Actions |
|---|---|
| `design_library_assets` | Upload lifecycle, preview read, original read, delete, copy to Library |
| `design_library_items` | Get, update field, reset field, favourite, collect, soft delete, restore, permanent delete |
| `design_library_analysis` | Analyse, reanalyse, cancel, retry |
| `design_library_designs` | Create, open, revise, update/reset tweak, reset all, retry variant, cancel variant, delete, restore |
| `design_library_media` | Generate, edit, upscale, generate video, list, retry, delete, promote to Library |
| `design_library_gallery` | Save version, feature, open, duplicate, remix, delete, restore, purge |
| `design_library_export` | Export an exact Gallery version to Downloads or the workspace |
| `design_library_settings` | Read/update models, media config, generation defaults, recipes |

`bridgeTools` exposes the read and create surfaces to the main agent. Media tools passed to a generation run as `customTools` use a narrower, capability-shaped schema — the model asks for a capability and a prompt, never an endpoint or an administration action.

## 5. Storage

Reactive state: item / Design / family / version / job summaries, search and page preferences, generation defaults, schema version, state revision.

```text
items/<item-id>/{record.json,original.<ext>,preview.webp}
designs/<design-id>/record.json
designs/<design-id>/variants/<variant-id>/
designs/<design-id>/media/<asset-id>/
gallery/<family-id>/{family.json,versions/<version-id>/}
jobs/<job-id>.json
uploads/<upload-id>/
secrets.json            # 0600, never in reactive state, never returned to UI
trash/
```

Every write goes through `shared/state-io.ts`: in-process queue per path, cross-process exclusive lock directory, revision compare-and-swap. Requests are append-only and consumed by a monotonic watermark. Concurrency tests must prove a stale writer cannot overwrite newer state.

## 6. Job contract

One persisted job per variant; separate persisted jobs for Librarian and media calls. Successful siblings never roll back. Cancellation uses `AbortSignal`. Restart reconciles running jobs into resumable states. The runtime keeps working while the plugin UI is closed. No generic scheduler.

---

# PR 1 — Library

**Status: merged** as [#318](https://github.com/sero-labs/sero/pull/318).

The plugin becomes useful on its own: collect references, understand them, organise them.

**Build**

- [x] 1. Canonical scaffold, manifest, Module Federation, scoped CSS, dark/light themes.
- [x] 2. `shared/` domain types, schemas and fixtures.
- [x] 3. `shared/state-io.ts` and `file-lock.ts` with concurrency tests, plus `runtime/projection.ts`.
- [x] 4. Runtime coordinator and the persisted job contract.
- [x] 5. Bounded ingestion: file picker, drag-and-drop, clipboard paste → 512 KiB base64 chunks → `uploads/` → one ingest request. Checksum duplicate detection. Original and preview storage.
- [x] 6. Uniform grid backed by summaries, with a bounded renderer image cache.
- [x] 7. Librarian: `platformTools: 'readOnly'`, structured output with `repair`, automatic on import, reanalysis, cancel, retry, restart recovery.
- [x] 8. Inspector: whole-field override and per-field reset, override *presence* explicit in storage.
- [x] 9. Search, filters, favourites, manual collections, derived style groups.
- [x] 10. Soft delete, restore, purge, tombstoned provenance.
- [x] 11. Settings page: Librarian and Design model pickers, generation defaults, prompt recipes.
- [x] 12. `bridgeTools` read surface for the main agent.

**Accept when** all import methods converge on one pipeline; a duplicate opens the existing item; restart preserves items and resumes analysis; manual fields survive reanalysis; every field resets independently; search, filters, favourites, collections and style groups work over the grid; UI never touches plugin files directly; stale-writer tests pass; model selections persist and are honoured.

**Decisions taken while building**

- The renderer produces the preview (canvas → WebP) rather than the runtime, so no image library enters the background process. A file the browser cannot decode still imports and falls back to its original in the grid.
- The UI reads images through `design_library_assets` as base64 content blocks, since it has no filesystem access. That makes the bounded renderer cache load-bearing rather than an optimisation.
- View preferences (scope, query, filters, sort) are held locally and persisted on a debounce through a `view.set` request, so typing does not queue a request per keystroke and the single-writer rule still holds.
- Every analysis field — including vocabulary, palette and the eight-group visual profile — is edited through one line-based text form, so the override contract covers all thirteen fields without thirteen bespoke controls.
- **The Librarian receives the image through a plugin-owned `customTools` tool, not a file path.** The platform read tool is scoped to the workspace and a Library item lives in the profile's app directory, so a path is always refused. The tool runs in the runtime, returns an `ImageContent` block, and lets the run drop to `platformTools: 'none'` — stricter than read-only, and identical on host and container workspaces.
- **An analysis produced without calling that tool is rejected.** The tool records whether it was invoked, and the runtime — not the reply — decides. A model that cannot see the image will otherwise return a well-formed profile describing nothing, which would pass validation and silently poison every design built from it.
- Records are validated on read (`normalizeItemRecord` / `normalizeJobRecord`), and startup chores are best-effort. A record from an older version is skipped and reported, never crashed on and never deleted.
- **Opening a reference is a navigation, not a side panel** — the reference takes the whole surface (image left, analysis right), matching prototype state 2. A side inspector at grid width had room for neither. Consequence: a new import no longer selects, or a bulk import would throw the user into the last file; an exact duplicate still opens the existing item.
- **Clicking a card selects; an explicit edit button opens it.** Double-click was tried and dropped: nothing on screen advertises it, and it aims badly at a card that already answers single clicks. The button carries its own translucent surface so it stays legible over any image.

---

# PR 2 — Design

Turn references into runnable work.

**Split into two PRs while building.** As specified this is eleven items across four loosely-coupled areas, and PR 1 was already large enough that two rounds of review found real defects in it. The boundary puts the risky half first: the spec requires isolation to be *"proven with hostile fixtures before production preview work"* (§7), so sandboxing, CSP and the build pipeline land where they can be reviewed on their own rather than alongside a sessions rail and a tweaks panel.

- **PR 2a — the generation pipeline.** Items 1 (Design records and autosave only), 2, 4, 5, 6. Minimal UI: enough to create a Design and watch a variant render. **Complete.**
- **PR 2b — the working surface.** Items 1 (sessions rail, restore-to-position), 3 (the dialog's remaining polish), 7, 8, 9, 10, 11.

**Build**

1. [~] Design records, continuous autosave. *(Sessions rail and restore-to-position are 2b.)*
2. [x] Ordered reference selection up to six, primary semantics, guardrail synthesis and blocking-conflict resolution.
3. [~] Create dialog: request, prompt recipe, output target, variation mode, variant count, inspiration strength, applied guardrails, synthesis panel. *(Built; the prototype's polish lands with 2b.)*
4. [x] Generation runs with `platformTools: 'none'` — structured language in, no pixels. One to five independently persisted, cancellable variant jobs with partial success and independent retry.
5. [x] `runtime/build/`: esbuild TSX transform, React bundled from plugin dependencies, Tailwind browser build inlined, document assembly for both targets, refusal and reporting of imports outside the approved set.
6. [x] `runtime/preview/`: blob URL, `sandbox="allow-scripts"`, `default-src 'none'` CSP, guard harness, warning surface outside the frame, resource cleanup. Hostile fixtures for both targets.
7. Tweaks: AI-authored manifest emitted with each successful revision, validator that drops invalid/duplicate/inert controls and reports them in one collapsible line, generic control rendering, value-only postMessage channel, per-control and panel reset, Copy CSS. Rendered as a fourth inspector tab inside a `ResizablePanel` (`@sero-ai/ui`) whose width persists, with a collapsible sessions rail.
8. Tweak persistence: separate defaults and overrides, continuous autosave, one revision per editing session at the defined checkpoints.
9. Revision replace/retain with recoverable history.
10. Responsive viewport controls.
11. `bridgeTools` create surface — the main agent can start a Design from named references.

**Decisions taken while building 2a**

- **Generated files arrive through a plugin-owned `customTools` tool, not in the reply.** Asking for one JSON object makes the model escape hundreds of lines of markup into string literals, which it gets wrong often enough to matter. A tool call per file also lets the runtime check each one as it lands, and — the load-bearing part — lets the *runtime* decide whether a design was produced. A model that describes a page it never wrote returns a plausible sentence, and accepting it marks a variant ready with nothing to render.
- **A revision is a file tree on disk, not a string in the record.** The prototype's Files tab shows markup, styles and script separately, and `record.json` is read and rewritten under a lock on every variant transition — inlining pages would grow it to hundreds of kilobytes. Files are written before the record entry naming them, so a startup chore sweeps revision directories nothing points at.
- **Jobs carry a discriminated target** (`item` or `variant`) rather than a bare `itemId`. A generation job has no item, and an empty id would reach a path helper during restart recovery and throw part-way through the repair pass.
- **The approved import set is enforced at resolution, not by scanning.** esbuild gets a resolver that knows the emitted files and the approved packages and nothing else, so an unapproved import has nowhere to resolve. A refused module loads as an empty *CommonJS* module: a named import from an empty ES module is a compile error and would cost the whole page.
- **Clearing a view key uses `null`.** The patch travels as JSON and `undefined` is dropped, so a clear never reached the runtime — already true of leaving a reference in PR 1, and visible the moment the Design surface cleared two keys at once.
- **A reference must be analysed before it can start a Design.** The run receives the Librarian's language and nothing else, so an unanalysed reference contributes nothing; skipping it silently would make the Design lie about its provenance.
- New dependencies: `esbuild` (external in the plugin bundle via `sero.app.runtimeExternals`), `@tailwindcss/browser`, and `react`/`react-dom`/`lucide-react` promoted from devDependencies because the runtime bundles them into previews.

**Accept when** only incompatible guardrails block; reference pixels never enter output; sibling variants survive failure and cancellation; work restores to the previous position; both targets render from a self-contained frame with no workspace, install or network; restricted calls are blocked while safe output still renders; an invalid tweak message cannot alter undeclared CSS or execute code; manifests are design-specific and validated, never drawn from a fixed catalogue; tweak state autosaves, survives restart and restores exactly without revision spam.

---

# PR 3 — Media and Gallery

Generation of imagery and video, and a permanent archive.

**Build**

1. `runtime/media/contract.ts` — capability, request, result, error, provenance, context. No vendor types.
2. `providers/fal.ts` — the only importer of `@fal-ai/client`. Queue-subscribe with `AbortSignal` forwarding and progress reporting; storage upload for image-to-image and upscale sources; every result downloaded through `context.store`; failures normalised to `MediaError` with an honest `retryable`.
3. `providers/fake.ts` — deterministic test double; contract tests run against both.
4. Credential resolution: `FAL_KEY` env, then `secrets.json`. Never in reactive state, never returned to the UI; the UI sees `env | stored | missing`.
5. `budget.ts` — per-run call cap, mandatory video confirmation, cost capture. Exceeding the cap stops further calls and reports it without failing the run.
6. `tools.ts` — capability-shaped `ToolDefinition`s passed as `customTools` to generation runs and bridged to the main agent.
7. Library entry points: Generate inspiration, Restyle/vary. Generated items analyse automatically and keep generation provenance.
8. Video support: storage, thumbnail, playback, frame-based Librarian analysis with motion language.
9. Design asset tray: reuse across variants, placeholder on failure, asset-only retry preserving history, per-asset and per-Design cost, Copy to Library.
10. Gallery: immutable snapshot transaction, family grouping, featured pointer, revision selector, deterministic snapshot re-render preview in a scaled `sandbox=""` iframe mounted on scroll, reopen at exact revision, explicit Duplicate and Remix, recoverable deletion and purge.
11. Export: exact code with effective tweak values resolved, bundled assets, metadata manifest, to Downloads or the active workspace.
12. Hardening: keyboard and screen-reader operation for every generated tweak control, job announcements, reduced motion including generated motion controls, incremental grid rendering, bounded preview cache, fault injection for recovery and cleanup, external plugin installation test.

**Accept when** all four capabilities work from both the agent and explicit actions; results are local and no remote URL reaches a preview or export; provider failure does not fail the whole variant; no vendor type exists outside the adapter and the fake adapter passes the same contract tests; caps hold and video is confirmed; costs are visible; Gallery versions stay byte-identical after source deletion; old versions never mutate; export matches the snapshot, runs standalone and does not depend on the Tweaks runtime; both export destinations work.

---

## 7. Verification

```bash
pnpm --filter @sero-ai/plugin-design-library build
pnpm --filter @sero-ai/plugin-design-library typecheck
pnpm --filter @sero-ai/plugin-design-library test
bash scripts/build-plugin.sh plugins/sero-design-library-plugin
pnpm typecheck   # monorepo root, before every commit
```

Manual verification per PR:

- **PR 1** — global discovery; all three import paths; duplicate handling; search, filters, collections; analysis, reanalysis and per-field reset; restart mid-analysis; model picker persistence.
- **PR 2** — reference ordering and conflict blocking; both output targets; variant failure, cancellation and restart; hostile previews and invalid tweak messages; tweak relevance, live update, reset, Copy CSS and revision coalescing.
- **PR 3** — each capability from both entry points; provider failure and asset-only retry; cap and video confirmation; Gallery source deletion; both export destinations; external plugin installation.

## 8. Notes

- `@sero-ai/ui` and any other `packages/*` change needs republishing to npm before external plugins pick it up.
- Update `apps/docs-site` before opening each PR.
- Draft PR #306 is superseded by this plan and should be closed when PR 1 opens.
