# OSS-0103 Scripts / Devflow Audit

## Executive summary
- Root `package.json` is the main public command surface; it currently mixes true top-level workflows with ad hoc utility wrappers and native-module repair scripts.
- `apps/desktop/package.json` duplicates several commands already available in `apps/desktop/scripts/*` via shell wrappers, especially dev, release, signing, and native rebuild flows.
- The strongest wrapper duplication is around `dev` / `dev.sh`, `release` / `build-release.sh`, `sign-vmp` / `sign-vmp.sh`, and `build:electron` / `build-electron.mjs`.
- Root `dev` is a thin alias to the desktop package; root `build`/`typecheck` are canonical monorepo commands, but root `clean`, `rebuild-electron`, and eval commands are more operational than contributor-facing.
- `apps/desktop/scripts/dev.sh` is doing a lot: discovery, cleanup, remote startup, host startup, Electron startup, logging, and lifecycle monitoring. It is the main contributor entrypoint for local app dev.
- There is at least one command mismatch/confusion surface: root `knip:apps` references `apps/web-remote`, but the repo currently also has built-in plugin and desktop-specific script surfaces that are not reflected in the same “public command” story.
- `scripts/build-plugin.*` and `scripts/export-plugin-source.*` are paired wrapper surfaces; the `.sh` files are just shells around the `.mjs` drivers.
- Native-module repair is split across install-time auto-fix scripts and manual rebuild commands, which is good for reliability but confusing for a simplified OSS onboarding surface.

## Scope covered
Read and inspected:
- root `package.json`
- `apps/desktop/package.json`
- `scripts/**` helper scripts and wrappers
- `apps/desktop/scripts/**`
- contributor-facing package manifests in `apps/desktop/`, `apps/web-remote/`, `packages/*`, and `plugins/*`
- `docs/architecture.md` for dev-flow references

## Script inventory and purpose
| Path / command | Current purpose | Audience | Canonical or duplicate? | Notes |
|---|---|---:|---|---|
| `pnpm dev` | Runs `pnpm --filter @sero/desktop dev` | Contributors | Canonical root alias | Thin wrapper; likely the main OSS entrypoint.
| `pnpm build` | `turbo run build` | Contributors/CI | Canonical | Monorepo build orchestrator.
| `pnpm typecheck` | `turbo run typecheck` | Contributors/CI | Canonical | Monorepo typecheck orchestrator.
| `pnpm clean` | Removes node_modules, dist, out, turbo temp, etc. | Maintainers | Utility | Broad cleanup; not a normal contributor workflow.
| `pnpm postinstall` | Rebuilds node-pty and better-sqlite3 | Contributors/CI | Canonical reliability hook | Auto-fixes native modules at install time.
| `pnpm rebuild-electron` | `bash apps/desktop/scripts/rebuild-electron.sh` | Desktop devs | Utility wrapper | Root-level shortcut for desktop rebuild/relaunch.
| `pnpm eval`, `pnpm eval:snapshot`, `pnpm eval:view` | Promptfoo evaluation flows | Maintainers/AI evals | Utility | Useful, but not part of public OSS onboarding.
| `apps/desktop dev` | Concurrent renderer + Electron dev | Desktop devs | Canonical within desktop package | Duplicated by `apps/desktop/scripts/dev.sh` for full workflow.
| `apps/desktop dev:renderer` | Vite renderer server | Desktop devs | Canonical subcommand | Building block for dev flow.
| `apps/desktop dev:electron` | Build Electron then launch Electron | Desktop devs | Canonical subcommand | Overlaps with `scripts/rebuild-electron.sh` behavior.
| `apps/desktop build:electron` | Runs `node scripts/build-electron.mjs` | Desktop devs | Canonical subcommand | Duplicated by root-level/dev scripts using same file.
| `apps/desktop build` | Electron build + Vite build | Desktop devs/CI | Canonical | Package-local build.
| `apps/desktop start` | Launches Electron | Desktop devs | Utility | No build step.
| `apps/desktop typecheck` | Renderer + Electron TS checks | Desktop devs/CI | Canonical | Package-local type safety gate.
| `apps/desktop test` | Vitest | Desktop devs/CI | Canonical | Unit test entrypoint.
| `apps/desktop test:e2e*` | Playwright e2e variants | Desktop devs/CI | Canonical | Build-first e2e commands.
| `apps/desktop container:nat*` | Container NAT setup/teardown | Desktop/container maintainers | Utility | Host-specific admin command.
| `apps/desktop container:build-image` | Builds `sero-node:latest` | Maintainers | Utility | Docker/image workflow, not contributor baseline.
| `apps/desktop sign-vmp` | Signs Widevine/VMP assets | Maintainers | Utility | Paired with shell wrapper.
| `apps/desktop release*` | Release packaging via shell script | Maintainers | Utility | Heavy release workflow.
| `apps/desktop pack`, `dist` | Electron-builder packaging | Maintainers | Utility | Packaging commands; `dist` is effectively release packaging.
| `apps/desktop/scripts/dev.sh` | Full dev orchestration: discover remotes, build, start Vite/Electron, monitor lifecycle | Contributors | Canonical dev-flow driver | Main operational script; much broader than package.json `dev`.
| `apps/desktop/scripts/dev-log.sh` | Same as dev, with agent logging | Contributors/debugging | Duplicate wrapper | Minimal wrapper around `dev.sh`.
| `apps/desktop/scripts/rebuild-electron.sh` | Rebuild main/preload and restart Electron | Desktop devs | Utility driver | Fast restart without tearing down Vite.
| `apps/desktop/scripts/build-release.sh` | Full release pipeline with install/typecheck/build/rebuild/sign/package | Maintainers | Canonical release driver | Most comprehensive release workflow; duplicates some package scripts.
| `apps/desktop/scripts/build-electron.mjs` | Build main/preload bundle | Desktop devs | Canonical implementation file | Used by multiple wrappers.
| `apps/desktop/scripts/prepare-packaging.mjs` | Prepare packaging layout before electron-builder | Maintainers | Utility implementation | Not directly exposed in package.json.
| `apps/desktop/scripts/setup-container-nat.sh` | Configure container NAT | Maintainers | Utility implementation | Root package exposes wrapper commands.
| `apps/desktop/scripts/sign-vmp.sh` | VMP signing helper | Maintainers | Utility implementation | Root/package wrapper exposure exists.
| `scripts/build-plugin.mjs` / `.sh` | Build distributable plugin bundle | Plugin authors/maintainers | `.sh` is wrapper; `.mjs` is canonical | Clear wrapper duplication.
| `scripts/export-plugin-source.mjs` / `.sh` | Export plugin source repo bundle | Plugin authors/maintainers | `.sh` is wrapper; `.mjs` is canonical | Clear wrapper duplication.
| `scripts/run-promptfoo.mjs` | Launch promptfoo inside Electron runtime | Eval maintainers | Canonical implementation | Root `eval*` scripts wrap this.
| `scripts/promptfoo-electron-runner.cjs` | Electron-side promptfoo runner | Eval maintainers | Internal helper | Not contributor-facing.
| `scripts/rebuild-node-pty.mjs` | Auto-detect/rebuild node-pty for Node ABI | Contributors | Canonical install hook helper | Called by `postinstall`.
| `scripts/rebuild-better-sqlite3.mjs` | Auto-detect/rebuild better-sqlite3 for Electron ABI | Contributors | Canonical install hook helper | Called by `postinstall`.

## Duplicate / legacy / confusing surfaces
| Path / command | Problem | Evidence | Recommended later action |
|---|---|---|---|
| `pnpm dev` vs `apps/desktop/scripts/dev.sh` | Two public “start dev” surfaces, but only one has the full orchestration logic. | Root `dev` is just `pnpm --filter @sero/desktop dev`; `dev.sh` performs discovery, cleanup, build, start, and lifecycle monitoring. | Make one the canonical public command and demote the other to an implementation detail or a compatibility alias.
| `apps/desktop dev` vs `apps/desktop/scripts/dev.sh` | Duplicate dev orchestration surface inside the desktop package. | `apps/desktop dev` is `concurrently "npm run dev:renderer" "npm run dev:electron"`; `dev.sh` additionally handles remotes, web-remote, logs, cleanup, and relaunch behavior. | Decide whether package.json `dev` should call the shell script or remain a simpler low-level command.
| `build:electron` vs `scripts/build-electron.mjs` and `rebuild-electron` | Build/relaunch logic is split across package.json and shell wrappers. | `apps/desktop dev:electron` and `build:electron` both point at `scripts/build-electron.mjs`; `root rebuild-electron` calls `apps/desktop/scripts/rebuild-electron.sh`. | Consolidate the user-facing story around one restart/build command family.
| `release` / `release:signed` vs `apps/desktop/scripts/build-release.sh` | Package scripts are just thin wrappers around a much more complete release pipeline script. | `release*` map to `bash scripts/build-release.sh[ --sign]`; the shell script itself installs, typechecks, builds, rebuilds native modules, signs, and packages. | Keep only one documented public release command surface.
| `sign-vmp` vs `scripts/sign-vmp.sh` | Wrapper duplication for a single native/signing step. | package.json points to `bash scripts/sign-vmp.sh`; actual shell script not needed in public docs. | Hide the wrapper from OSS docs unless users actually need direct invocation.
| `build-plugin.sh` vs `build-plugin.mjs`; `export-plugin-source.sh` vs `.mjs` | Shell wrappers add no real behavior beyond invoking the Node driver. | Each `.sh` is a two-line `bash` entrypoint calling the `.mjs` file. | Document the Node driver as canonical; keep shell wrappers only for compatibility.
| `pnpm clean` | Over-broad cleanup command can be destructive/confusing for newcomers. | Removes node_modules across apps/packages/plugins and temp/build dirs. | Treat as maintainer-only; avoid showing in public quickstart.
| `pnpm eval*` | Evaluation flow is not a contributor-facing setup/dev command. | Uses promptfoo and Drizzle patching; separate from build/dev/test. | Keep out of OSS quickstart and contributor onboarding docs.
| `knip:apps` | Audit command is specialized and references a non-root workspace (`apps/web-remote`). | Root script hardcodes `--workspace apps/web-remote` plus desktop knip run. | Confirm whether this belongs in public docs or only in maintainer tooling.
| `build-release.sh` install/typecheck/build chain | Long release script duplicates monorepo commands internally. | Shell script runs `pnpm install`, `pnpm typecheck`, `pnpm build`, then packaging steps. | Good for release automation, but should be clearly labeled as release-only. |

## Recommended public command surface
Suggested future public surface for OSS contributors:
- `pnpm install`
- `pnpm dev` → canonical one-liner for running Sero locally
- `pnpm build`
- `pnpm typecheck`
- `pnpm test` where available at package level, or explicit package tests for `apps/desktop`
- `pnpm clean` only as a maintainer recovery command, not in the quickstart
- `apps/desktop` subcommands only when working directly in that package: `dev`, `build`, `typecheck`, `test`, `test:e2e`
- release/admin/plugin/export commands should be documented separately as advanced workflows, not onboarding commands

## `pnpm doctor` recommendation
Recommend adding a root `pnpm doctor` later as a single contributor health check that validates:
- pnpm version / install state
- required workspace packages resolve
- native modules load in their target runtime (`node-pty` under Node; `better-sqlite3` under Electron)
- desktop app prerequisites exist when relevant (`electron`, Vite, Playwright browsers)
- container/image tooling availability only when the user opts into container workflows
- a short summary with actionable fixes, not a full build

Rationale: the current setup spreads health checks across postinstall, release scripts, and manual rebuild commands. A dedicated doctor would give OSS users a single diagnostic path without forcing release or packaging workflows.

## Recommended G1 decisions
- Pick one canonical local dev command for OSS docs: either root `pnpm dev` or `apps/desktop/scripts/dev.sh`, but not both as equal first-class entrypoints.
- Keep `package.json` lean by limiting root scripts to workspace-wide or cross-cutting commands; move specialized operational flows out of the public surface where possible.
- Keep wrapper commands only when they preserve compatibility or shell ergonomics; otherwise favor the implementation file as the documented entrypoint.
- Separate contributor onboarding commands from maintainer-only release, signing, container, eval, and packaging commands.
- Make native-module repair behavior explicit in docs so contributors understand why install-time scripts run.
- If the OSS alpha wants a smaller command surface, prioritize collapsing duplicate launch/rebuild/release wrappers before touching deeper build logic.

## Blockers / open questions
- Should OSS docs point to root `pnpm dev` or directly to `apps/desktop/scripts/dev.sh` as the canonical startup command?
- Is `apps/desktop dev` intended to remain a low-level primitive, or should it be redirected to the shell-based orchestration script?
- Do we want to preserve direct exposure of release, signing, and container commands in the public README, or keep them in advanced docs only?
- Should `pnpm clean`, `pnpm eval*`, and `knip:apps` remain in the root public surface after OSS simplification, or be moved to maintainer-only docs/scripts?
- Is `apps/web-remote` still part of the intended contributor workflow, given it is referenced by `knip:apps` and `dev.sh` but is not central to the main desktop onboarding story?
