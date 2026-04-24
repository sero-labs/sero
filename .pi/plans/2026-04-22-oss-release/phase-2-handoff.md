# OSS Alpha Phase 2 Handoff

Status: Ready after G1
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/decision-log.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/plan.md`

## Purpose

Translate the G1 synthesis into low-conflict Phase 2 ownership so later work can run concurrently without re-litigating scope.

## Fixed G1 decisions

These are now the working defaults for Phase 2:
- License: **Apache-2.0**
- Alpha distribution: **source-only**
- Public support surface: **GitHub Issues + PRs only**
- Docs stack: **RSPress**
- Public docs scope: curated canonical docs only; no historical plans/runbooks
- Root contributor commands: `pnpm install`, `pnpm dev`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:ci`
- Cleanup posture: **preserve before prune**; no public-tree trimming yet

## Phase 2 lane ownership

| Lane | Exclusive surface | Ready now | Notes |
| --- | --- | --- | --- |
| Governance | `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/**`, `.github/pull_request_template.md` | Yes | Must reflect Apache-2.0, issues/PR-only support, and private security reporting. |
| Repo Infra | root `package.json`, `turbo.json`, `.github/workflows/**`, root test/dev script surface, optional `pnpm doctor` | Yes | Keep one owner for root command surface and CI/test gating. |
| Docs Platform | docs-site app/config/nav/home shell | Yes | Build only the alpha IA; do not migrate historical plans into the site. |
| Presentation | `README.md`, launch screenshots/assets, homepage hero if not owned by Docs Platform | Yes | Must reflect source-only alpha, macOS Apple Silicon scope, and known limitations. |
| Sanitation | repo-wide doc trimming, moves, removals, archive execution | No | Blocked until G3 + `migration-map.md`. |

## Alpha docs IA to use in Phase 2

This is the agreed minimum docs-site scope:
1. Overview
2. Getting Started
3. Installation / Requirements
4. Development Setup
5. Architecture
6. Plugins
7. Testing / Evals
8. Security / Privacy
9. Troubleshooting
10. Known Limitations

## Quality-gate targets to wire toward

### PR gate
- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @sero/desktop test -- --run`
- `pnpm --filter @sero/desktop test:e2e:ci`

### Nightly/manual gate
- `pnpm eval:snapshot`
- selected package/plugin tests not yet in the PR gate
- `pnpm --filter @sero/desktop test:e2e:local`
- full `pnpm eval` when credentials/budget are available

### Release gate
- PR gate
- working-tree secret scan
- git-history secret scan
- docs build
- clean-clone install/run smoke
- manual smoke: app launch, one workspace action, one agent/tool round trip, one plugin load path

## Public command-surface rules

### README/docs quickstart surface
- `pnpm install`
- `pnpm dev`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm test:ci`

### Keep out of quickstart
- `pnpm clean`
- `pnpm eval*`
- `pnpm rebuild-electron`
- release/signing/container helpers
- `knip*`
- plugin export/build wrappers

`apps/desktop/scripts/dev.sh` may remain in-tree, but it is not the public first-run command.

## Explicitly blocked until later gates
- deleting or moving `.pi/plans/**`, `docs/plans/**`, `docs/superpowers/**`, `.claude/**`, or `AGENTS.md`
- promising public binaries
- linking historical plan/spec material from the docs site
- broad repo-wide script cleanup without the Repo Infra owner

## Recommended order
1. Governance lane drafts new OSS/community files.
2. Docs Platform lane stands up the RSPress skeleton and nav shell.
3. Presentation lane drafts `README.md` against the same positioning.
4. Repo Infra lane lands root `test` / `test:ci` / CI-tiering work and trims the public command story.
5. Only after canonical docs exist should Sanitation start `migration-map.md` and cleanup planning.
