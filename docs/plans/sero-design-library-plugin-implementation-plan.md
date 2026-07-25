# Sero Design Library Plugin Implementation Plan

**Status:** Ready for implementation  
**Target branch:** `feat/design-library-plugin`  
**Plugin:** `@sero-ai/plugin-design-library`  
**App ID:** `design-library`  
**Scope:** Global

## 1. Purpose

This plan turns the approved prototype and product specification into a reuse-first implementation sequence.

The governing rule is:

> Use Sero's existing plugin contracts and proven repository patterns first. Add plugin-owned code only where the repository has no reusable capability, and do not introduce design-library-specific host APIs.

The first release is an image-only vertical slice:

1. Import an image.
2. Browse it in Library.
3. Run Librarian analysis.
4. Edit user-owned metadata and guardrails.
5. Select one or more references.
6. Generate runnable HTML/CSS variants.
7. Preview variants in an isolated iframe.
8. Save a chosen variant to Gallery.
9. Restart Sero and recover all durable state.

Video import and URL capture follow after this loop is proven.

## 2. Repository sources reviewed

The implementation must follow:

- `packages/templates/skills/sero-plugin/SKILL.md`
- Every file in `packages/templates/skills/sero-plugin/references/`
- `packages/templates/skills/sero-plugin/example/sero-notes-plugin/`
- `packages/app-runtime`
- `packages/common/src/app-runtime-background.ts`
- `packages/ui`
- `packages/plugin-vite`
- `plugins/sero-orchestrator-plugin`
- `plugins/sero-cron-plugin`
- `plugins/sero-web-plugin`
- `plugins/sero-mcp-plugin`
- `apps/desktop/src/components/apps/explorer/editor/HtmlPreview.tsx`
- `apps/desktop/electron/features/apps/runtime/manager.ts`
- `apps/desktop/electron/features/apps/state/manager.ts`

## 3. Reuse audit

| Requirement | Existing Sero capability or precedent | Decision |
|---|---|---|
| Plugin structure | Canonical `sero-notes-plugin` example | Copy and rename the canonical structure. Delete unused widget and CLI surfaces. |
| Discovery and registration | `sero.app` manifest auto-discovery | No host registry edits. |
| Global app lifecycle | `scope: "global"` plus the runtime manager's global target | Use the existing singleton global app and runtime lifecycle. |
| Global state location | `SERO_HOME` resolution and `globalStatePath` | Use the resolved `ctx.stateFilePath` and its parent directory. Do not invent profile paths. |
| Reactive UI state | `useAppState()` | Subscribe to the lightweight index. Domain mutations go through tools, not `updateState`. |
| UI to plugin actions | `useAppTools()` and `appAgent.invokeTool` | All imports, mutations, analysis, generation and Gallery actions use plugin tools. |
| Atomic JSON writes | `ctx.host.appState.update()` in runtimes and the established extension atomic-write pattern | Use the host API from the runtime. Use a small plugin-local extension helper where Pi-safe tools must write. |
| Additional JSON documents | `AppRuntimeStateApi.read/update/watch` and the Orchestrator split-store pattern | Store the reactive index separately from full item, design and Gallery records. |
| Binary files | No generic app-state binary API exists | Use plugin-owned Node file I/O with temporary files and atomic rename. No host IPC is added. |
| Long-running work | `createAppRuntime()` | Use one global background runtime for recovery, analysis and generation. |
| Runtime startup recovery | Runtime `start()` plus the Orchestrator coordinator precedent | Reconcile interrupted jobs at startup and drain queued jobs. |
| Structured AI | `host.subagents.runStructured()` | Use the existing subagent runner, restricted custom tools, repair callback, cancellation and provenance metadata. |
| Cancellation | `runStructured({ signal })` | Maintain runtime-owned `AbortController` instances keyed by job ID. |
| Job concurrency | No reusable generic job queue exists | Implement a small plugin-owned dispatcher over persisted job summaries. Do not depend on Cron or Orchestrator internals. |
| Shared UI | `@sero-ai/ui` | Use existing primitives, dialogs, controls, badges, scroll areas and semantic tokens. |
| CSS isolation | `@sero-ai/ui/styles/plugin.css` and `seroPluginCssScope()` | Reuse the canonical scoped Tailwind/Vite configuration. |
| Module Federation | Canonical notes Vite configuration | Reuse it with `sero_design_library`, the selected free development port, and both named/default exports. |
| HTML preview isolation | Existing Explorer `HtmlPreview` and MCP viewer patterns | Adapt the established blob URL, opaque-origin iframe, CSP injection and URL cleanup pattern inside the plugin. Do not import desktop source. |
| URL and document ingestion | Functionality currently lives inside `sero-web-plugin` | Do not duplicate it and do not import Web plugin source. Defer URL capture until neutral extraction is available. |
| Video frame extraction | Functionality currently lives inside `sero-web-plugin` | Do not duplicate it for the first alpha. Extract reusable helpers later or implement only the missing neutral adapter. |
| Thumbnail generation | No reusable neutral image pipeline exists | Validate a plugin-owned browser or runtime adapter in a spike before selecting a dependency. |
| Large asset transfer | No generic binary upload seam exists | Use a bounded chunk protocol over `useAppTools()`. This is plugin-owned code on the existing generic bridge. |
| Search/filtering | No cross-plugin design-library index exists | Start with in-memory filtering of lightweight summaries. Add virtualisation before the documented scale target. |
| Routing | No plugin-specific router is required | Use component state for Library, Design and Gallery. Persist only genuine user preferences. |

## 4. Explicit non-goals

The implementation will not add:

- Custom preload APIs
- Custom IPC channels
- A new host state manager
- A new app runtime abstraction
- A new router
- A new generic scheduler
- A dependency on Cron, Orchestrator or Web plugin internals
- Imports from desktop source aliases
- `localStorage`
- SQLite for the MVP
- Automatic CLI bridging
- A dashboard widget for the first alpha

## 5. Correct plugin shape

```text
plugins/sero-design-library-plugin/
├── package.json
├── vite.config.ts
├── shared/
│   ├── defaults.ts
│   ├── schemas.ts
│   └── types.ts
├── extension/
│   ├── index.ts
│   ├── paths.ts
│   ├── state-io.ts
│   ├── tool-results.ts
│   └── tools/
│       ├── assets.ts
│       ├── items.ts
│       ├── analysis.ts
│       ├── designs.ts
│       └── gallery.ts
├── runtime/
│   ├── index.ts
│   ├── coordinator.ts
│   ├── store.ts
│   ├── jobs/
│   ├── librarian/
│   ├── generation/
│   └── preview/
└── ui/
    ├── DesignLibraryApp.tsx
    ├── styles.css
    ├── components/
    ├── hooks/
    ├── pages/
    │   ├── LibraryPage.tsx
    │   ├── DesignPage.tsx
    │   └── GalleryPage.tsx
    └── index.html
```

No source file should exceed 500 lines.

## 6. Manifest decisions

The manifest will use:

```json
{
  "sero": {
    "app": {
      "id": "design-library",
      "name": "Design Library",
      "icon": "panels-top-left",
      "scope": "global",
      "styleIsolation": "scope",
      "stateFile": ".sero/apps/design-library/state.json",
      "ui": "./dist/ui/remoteEntry.js",
      "component": "DesignLibraryApp",
      "runtime": "./runtime/index.ts",
      "devPort": 5200
    },
    "plugin": {
      "category": "creative",
      "tags": ["design", "inspiration", "gallery", "ai"],
      "requiredHostCapabilities": [
        "appAgent.invokeTool",
        "appRuntime.background"
      ],
      "bridgeTools": false
    }
  }
}
```

Port `5200` is provisionally free in the audited branch and must be rechecked immediately before scaffolding.

`tool.cli` is intentionally omitted because the MVP does not expose these tools as `sero` commands.

## 7. Tool surface

Use a small grouped tool surface rather than registering every mutation as a separate agent tool:

| Tool | Actions |
|---|---|
| `design_library_assets` | `upload_begin`, `upload_chunk`, `upload_commit`, `upload_abort`, `read_preview`, `read_original` |
| `design_library_items` | `get`, `update`, `delete`, `set_collections` |
| `design_library_analysis` | `analyse`, `reanalyse`, `cancel` |
| `design_library_designs` | `create`, `get_variant`, `revise`, `delete_variant`, `export` |
| `design_library_gallery` | `save`, `update`, `delete`, `favourite`, `open`, `remix`, `save_version`, `add_to_library` |
| `design_library_recipes` | `save`, `delete`, `set_default` |

Use `StringEnum` for action values. Validate action-specific arguments explicitly and return clear errors.

The UI uses these tools directly. The agent receives the same plugin-owned capabilities without a 25-tool prompt surface.

## 8. State and storage

### 8.1 Reactive index

`state.json` contains only data required to render browsers, selection counts, progress and settings:

- Item summaries
- Collections and smart-group settings
- Design-session summaries
- Gallery summaries and family summaries
- Job summaries
- Prompt-recipe summaries
- Schema version and revision

The UI subscribes with:

```ts
const [state] = useAppState(DEFAULT_STATE);
```

It does not call `updateState` for domain mutations.

### 8.2 Full records and assets

Full records live beside the index under the resolved global app directory:

```text
items/<item-id>.json
assets/<item-id>/original.<ext>
assets/<item-id>/preview.webp
designs/<session-id>/<variant-id>/*
gallery/<gallery-id>/*
jobs/<job-id>.json
uploads/<upload-id>/*
```

Use `ctx.host.appState.update()` for JSON written by the runtime. Use temporary file plus rename for binary files. The extension uses the same atomic convention while remaining Pi-safe.

### 8.3 Concurrency ownership

- The runtime is the single writer for job transitions and generated records.
- Extension tools serialise mutations to the main index.
- Upload sessions have per-upload write queues.
- Runtime recovery converts orphaned `running` jobs into a retryable or failed state according to job type.

## 9. Background runtime

The runtime is justified and already supported for global apps.

Its coordinator will:

1. Read and normalise state in `start()`.
2. Recover interrupted work.
3. Drain queued jobs.
4. React to subsequent state changes in `handleStateChange()`.
5. Track active `AbortController` instances.
6. Dispose active work cleanly when Sero shuts down or reloads the plugin.

Initial concurrency:

- Analysis: 2
- Generation: 1
- Gallery snapshot: 1

These are plugin policies, not a new generic queue framework.

## 10. Librarian execution

Librarian uses `host.subagents.runStructured()` with:

- `platformTools: "none"`
- A plugin-owned, read-only asset tool
- A plugin-local schema validator
- In-session repair with at most two attempts
- An `AbortSignal`
- Bounded input images

Persist:

- Generated analysis
- User overrides separately
- Resolved provider and model
- Duration
- Token usage and cost when available
- Prompt/schema version

Reanalysis replaces generated fields and reapplies user overrides.

## 11. Generated preview security

The preview component will adapt Sero's existing safe HTML preview patterns:

- Assemble the generated HTML, CSS and JavaScript into one bounded document.
- Inject a restrictive CSP.
- Create a blob URL.
- Render with `sandbox="allow-scripts"` only.
- Omit `allow-same-origin`.
- Use `referrerPolicy="no-referrer"`.
- Revoke replaced and unmounted blob URLs.
- Block remote network access by default.
- Display generation errors outside the iframe.

The plugin will not import desktop implementation files and will not add a host preview API.

## 12. Implementation sequence

### PR 1: Canonical foundation and real shell

Reuse:

- Canonical notes plugin structure
- Manifest, TypeScript, Module Federation and scoped CSS patterns
- `@sero-ai/ui`
- `useAppState` and `useAppTools`

Build:

- Plugin scaffold
- Shared state types, defaults and normalisers
- Library, Design and Gallery page shell
- Prototype-derived components with fixture data
- Uniform Library rows and bottom-aligned metadata
- Empty, loading and error states
- Component tests for navigation, selection and grid alignment

Acceptance:

- Plugin appears as a global app.
- Dark and light themes work.
- Build and typecheck pass.
- No custom host code exists.

### PR 2: Durable image Library

Reuse:

- Generic app tool bridge
- Existing state watcher and atomic JSON APIs
- Established plugin path resolution

Build:

- Grouped asset and item tools
- Bounded image upload protocol
- Checksum and MIME validation
- Atomic original and preview storage
- Lightweight item index and full item records
- Lazy preview reads through the asset tool
- Paste, drag/drop and file picker
- Inspector editing and deletion
- Upload cleanup and migration tests

Acceptance:

- An image appears immediately after import.
- Restart preserves it.
- The UI never reads plugin files directly.
- Failed uploads leave no published item.

### PR 3: Runtime jobs and Librarian

Reuse:

- Global `createAppRuntime`
- `host.appState`
- `host.subagents.runStructured`
- Existing repair, cancellation and provenance contracts

Build:

- Minimal persisted job dispatcher
- Startup recovery
- Restricted read-only asset custom tool
- Librarian prompt and schema
- Editable user overrides
- Reanalysis merge policy
- Progress and failure UI

Acceptance:

- Analysis survives closing the Design Library view.
- Cancelling a job aborts the subagent.
- Invalid structured output is repaired or fails clearly.
- User overrides survive reanalysis.

### PR 4: Design generation and secure workbench

Reuse:

- Structured subagents
- Existing Sero iframe isolation patterns
- `@sero-ai/ui` tabs and controls

Build:

- Reference selection and create dialog
- Blend and per-reference prompt assembly
- Three initial variants
- Variant records and files
- Secure preview component
- Desktop, tablet and mobile widths
- Regenerate, revise and delete
- Export

Acceptance:

- One failed variant does not fail the session.
- Generated code cannot access the host or network.
- Preview URLs are cleaned up.
- Completed variants reopen after restart.

### PR 5: Gallery vertical slice

Reuse:

- Split JSON store pattern
- Existing Library visual components

Build:

- Explicit save to Gallery
- Immutable snapshot copy
- Family grouping and favourites
- Gallery search
- Open as a new editable Design session
- Save as a new version
- Delete without damaging source or sibling snapshots

Acceptance:

- Deleting the source Design session does not damage Gallery.
- Prior versions never mutate.
- The full image to analysis to design to Gallery flow survives restart.

### PR 6: Alpha hardening

Build:

- Keyboard navigation and multi-selection
- Screen-reader progress announcements
- Reduced motion
- Incremental rendering or virtualisation
- Bounded asset cache
- Recovery and cleanup fault injection
- Packaging validation
- End-to-end plugin tests

Acceptance:

- The image-only alpha is installable through the standard external-plugin process.
- `pnpm build`, `typecheck`, tests and `scripts/build-plugin.sh` pass.

### PR 7: Neutral ingestion extraction

Only begin after the image-only alpha is stable.

Refactor genuinely reusable pieces from `sero-web-plugin` into a neutral published package, with Web plugin tests proving no behavioural regression:

- URL normalisation
- HTTP fetch guards
- Readability and metadata extraction
- Content-type detection
- Video frame helpers where they are genuinely provider-neutral

Do not move Web plugin state, provider selection, bookmarks, history or UI.

### PR 8: Video and URL import

Use the neutral package from PR 7 and add only Design Library-specific orchestration:

- Video upload and representative frames
- URL screenshot capture
- Browser discovery and isolated Playwright context
- Capture fallback order
- Analysis of bounded frames and screenshots

## 13. Required spikes

Run these before committing to their production implementations:

1. **Chunked image upload:** measure tool-bridge throughput, memory and cancellation using 512 KiB chunks.
2. **Preview generation:** compare browser-native WebP thumbnail creation with a runtime dependency, including external-plugin packaging.
3. **Multimodal structured run:** prove that the runtime custom tool returns image content correctly with `platformTools: "none"`.
4. **Preview isolation:** prove CSP, sandbox and no-network behaviour with deliberately hostile generated HTML.
5. **Gallery durability:** delete source sessions and shared assets in tests, then confirm snapshots remain intact.

Video and Playwright spikes are deferred until PR 7.

## 14. Verification commands

```bash
pnpm install
pnpm --filter @sero-ai/plugin-design-library build
pnpm --filter @sero-ai/plugin-design-library typecheck
pnpm --filter @sero-ai/plugin-design-library test
bash scripts/build-plugin.sh plugins/sero-design-library-plugin
```

Then run Sero with the plugin enabled and verify:

1. Global app discovery
2. UI tool calls
3. Extension writes causing UI updates
4. Runtime job recovery
5. Plugin reload and cleanup
6. External bundle installation

## 15. Definition of implementation-ready

Implementation can begin when this plan is accepted. PR 1 must not introduce persistence, AI, ingestion or preview infrastructure beyond the shared types and fixture boundaries needed to make later PRs compile cleanly.

Every PR description must include a short reuse statement:

- Reused unchanged
- Adapted from an existing Sero pattern
- New plugin-owned code
- Deferred because an existing capability must first be extracted
