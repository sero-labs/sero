# Plugin developer guide — verification (task 4.3)

Gate for the Early Builders challenge (task 4.5): the plugin developer guide must
let an external builder ship a working plugin **from the published docs alone**.
This is the record of that test and the doc fixes it produced.

## Method

- A fresh-eyes builder (gpt-5.5, sandboxed to a temp dir and blind to the Sero
  source repo) was given **only** the published plugin docs and the public
  starter repo the docs point to, then asked to build a *new* plugin
  (`sero-scratchpad-plugin`: a textarea with file-backed state + one extension
  tool). Every point where the docs were missing, wrong, or forced a guess was
  logged.
- The result was independently re-verified: `pnpm install` → `typecheck` →
  `build` all green, producing `dist/ui/remoteEntry.js`.
- The canonical starter (`sero-labs/sero-daily-quote-plugin`) was separately
  cloned and built standalone outside the monorepo — install, typecheck, and
  build all pass. All referenced npm packages are published
  (`@sero-ai/app-runtime@0.1.3`, pi packages at `0.80.3`).

**Outcome: a new plugin can be built from the docs — but only by copying the
starter for several pieces the prose did not teach.** Those became the fixes
below.

## Gaps found and fixed

| # | Gap | Severity | Fix |
| --- | --- | --- | --- |
| 1 | The dependency contract for external plugins was never stated: no `workspace:*` (only resolves inside the monorepo), no `@sero-ai/ui` (host-internal design lib), published versions only. The starter avoids it by construction, so prose never taught it — but an author who adds `@sero-ai/ui` or copies a built-in plugin hits an uninstallable package. | Major | New "Dependencies for external plugins" section + checklist item in the author quick-path. |
| 2 | The working `vite.config.ts` Module Federation details lived only in the starter file: React shared-singleton block, `optimizeDeps.exclude: ['@sero-ai/app-runtime']`, `server.origin`, dev-vs-prod `base`, `component`↔`exposes` name match. The builder could only reproduce them by copying. | Major | Expanded "Module Federation basics" with each field and why it matters. |
| 3 | The extension↔UI shared state file was underspecified: how the extension resolves the same file `useAppState` uses, and how `sero.app.stateFile` relates to `scope`. The fresh build resolved the path from `cwd` only and silently pointed a global-scoped app at the wrong file. | Major | "File-backed state" now shows scope-based resolution + the `SERO_HOME` vs `cwd` snippet; app-runtime state rule clarifies `stateFile` is a hint, not an override. |
| 4 | Package-manager ambiguity: docs say `pnpm install`, the starter ships `package-lock.json` (npm). The builder followed npm. | Minor | Quickstart states either works; use whichever matches the shipped lockfile. |
| 5 | The starter `typecheck` script only checks `ui/tsconfig.json`, so a broken extension can pass the documented typecheck. | Minor | Quickstart + checklist require typechecking both UI and extension. |
| 6 | The author path never closed the loop — no "now load your plugin into Sero" step for a from-scratch build. | Minor | New "Run your plugin in Sero" pointer (Admin → Plugins → Local Plugin Development). |

Files changed: `apps/docs-site/docs/reference/plugin-author-quick-path.md`,
`plugin-quickstart.md`, `app-runtime.md`.

## What the docs already got right (kept)

- The starter is correctly identified as the right no-runtime starting point,
  and it builds cleanly standalone.
- The minimal file shape was enough to scaffold a standalone package.
- `useAppState` guidance and the "no browser storage" rule were clear and
  directly usable.
- Host-capability guidance (`appAgent.invokeTool`, `bridgeTools`) was clear
  enough to wire the UI→tool call intentionally.
- The production `base: './'` rule was explicit.

## Recommended follow-ups (do not block task 4.5)

Deeper doc work, larger than a gap fix — worth doing before a heavy builder
push, tracked in [drafts/outstanding-questions.md](drafts/outstanding-questions.md):

- Document the `useAppTools().run` return/error contract (resolved value, error
  behaviour, whether `details` reaches the UI).
- A fuller Pi extension authoring reference (or a clear link to Pi's own docs)
  covering `execute` arguments, `renderCall`/`renderResult`, and session
  lifecycle events — much of this is upstream Pi surface, so linking is likely
  better than duplicating.
- Two fixes belong to the external starter repo, not this repo (need Dan's
  sign-off to change): the starter's `typecheck` should cover both tsconfigs,
  and its lockfile should match the documented package manager.
