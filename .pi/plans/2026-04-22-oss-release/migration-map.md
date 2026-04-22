# OSS Alpha Migration Map

Status: Drafted for preserve-before-prune triage
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/decision-log.md`
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/slices/01-docs-plans-audit.md`

## Purpose

This file is the inventory/classification map for transient or internal docs that
must be triaged before any public-tree cleanup.

Rule: **harvest before prune**.

Nothing listed here should be deleted or moved from the public tree until:
1. durable facts are harvested into canonical destinations
2. the private archive snapshot is taken
3. the final cleanup action is explicitly chosen

## Canonical destination map

| Fact type | Canonical destination |
| --- | --- |
| public product positioning | `README.md`, `apps/docs-site/docs/guide/**` |
| contributor/setup flows | `CONTRIBUTING.md`, `apps/docs-site/docs/guide/**` |
| architecture/system boundaries | `docs/architecture.md`, `docs/decisions.md`, `apps/docs-site/docs/reference/architecture.md` |
| plugin lifecycle and compatibility | `docs/plugins/guide.md`, `docs/plugins/technical.md`, `apps/docs-site/docs/reference/plugins.md` |
| testing / CI / eval policy | `.github/workflows/test.yml`, `CHANGELOG.md` when relevant, `apps/docs-site/docs/reference/testing-evals.md` |
| security / privacy posture | `SECURITY.md`, `docs/security/**`, `apps/docs-site/docs/reference/security-privacy.md` |
| troubleshooting and setup caveats | `docs/node-pty-setup.md`, `docs/guides/macos-containers.md`, `apps/docs-site/docs/reference/troubleshooting.md` |
| release/versioning decisions | `CHANGELOG.md`, `.pi/plans/2026-04-22-oss-release/release-versioning.md` |
| code-quality review lineage | `docs/deslopify/**` |
| maintainer/agent operating rules | `AGENTS.md` until split, then selective public mirrors in `CONTRIBUTING.md` / public docs |

## Inventory and classification

| Path / pattern | Current role | Bucket | Canonical destination for harvested facts | Later action |
| --- | --- | --- | --- | --- |
| `.pi/plans/2026-04-22-oss-release/**` | active release coordination hub | transient with reusable facts | `CHANGELOG.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `apps/docs-site/docs/**`, repo config/workflows | keep during release effort; archive privately after completion |
| `.pi/plans/2026-04-19-kanban-extraction/**` | feature planning artifacts | transient with reusable facts | `docs/features/**`, `docs/plugins/**`, `docs/decisions.md` if lasting decisions exist | harvest + archive |
| `.pi/plans/2026-04-19-local-plugin-dev-sessions/**` | feature planning / review for plugin-dev sessions | transient with reusable facts | `docs/features/local-plugin-development.md`, `docs/plugins/guide.md`, `docs/decisions.md` | harvest + archive |
| `.pi/plans/2026-04-20-emoji-to-lucide-icons/**` | implementation planning artifacts | transient with reusable facts | product/docs only if any enduring convention exists; otherwise none | likely archive, delete from public tree later |
| `.pi/plans/2026-04-20-github-auth-unification/**` | auth flow planning artifacts | transient with reusable facts | `docs/features/**`, `docs/security/**`, `docs/decisions.md` | harvest + archive |
| `.pi/plans/2026-04-20-mcp-adaptor-plugin/**` | plugin planning artifacts | transient with reusable facts | `docs/plugins/**`, `docs/decisions.md` if durable contracts exist | harvest + archive |
| `docs/plans/index.md` | map of historical/internal planning docs | durable internal | internal docs index only | keep internal until cleanup strategy is executed |
| `docs/plans/2026-04-06-unified-model-selection.md` | historical implementation/design plan | transient with reusable facts | `docs/decisions.md`, relevant feature docs | harvest + archive |
| `docs/plans/2026-04-08-agent-browser-migration-plan.md` | feature migration plan | transient with reusable facts | `docs/architecture.md`, relevant feature docs | harvest + archive |
| `docs/plans/2026-04-10-multi-root-workspaces-for-plugin-dev.md` | workspace/plugin-dev planning | transient with reusable facts | `docs/plugins/guide.md`, `docs/features/**`, `docs/decisions.md` | harvest + archive |
| `docs/plans/2026-04-12-pr-136-followups.md` | follow-up task list | transient / possibly disposable | none unless a durable decision is hidden inside | review quickly, then archive or delete |
| `docs/plans/2026-04-12-pr-137-followups.md` | follow-up task list | transient / possibly disposable | none unless a durable decision is hidden inside | review quickly, then archive or delete |
| `docs/plans/2026-04-13-apps-desktop-wave-f-periphery-closeout.md` | implementation closeout notes | transient with reusable facts | `docs/architecture.md`, `docs/decisions.md` if lasting decisions exist | harvest + archive |
| `docs/plans/2026-04-17-chat-turn-undo-and-snapshot-separation.md` | feature/history plan | transient with reusable facts | `docs/features/**`, `docs/decisions.md` | harvest + archive |
| `docs/plans/2026-04-17-gateway-owner-wide-qr-access.md` | gateway feature plan | transient with reusable facts | `docs/security/**`, `docs/features/**` | harvest + archive |
| `docs/plans/2026-04-19-local-plugin-dev-sessions.md` | public-ish but still transient planning doc | transient with reusable facts | `docs/features/local-plugin-development.md`, `docs/plugins/guide.md` | harvest + archive |
| `docs/plans/apps-desktop-deslopify-tasklist.md` | engineering cleanup backlog | durable internal | `docs/deslopify/**` | keep internal or merge into deslopify records later |
| `docs/plans/desktop-packages-plugins-deslopify-tasklist.md` | engineering cleanup backlog | durable internal | `docs/deslopify/**` | keep internal or merge into deslopify records later |
| `docs/superpowers/plans/**` | historical feature planning docs | transient with reusable facts | `docs/features/**`, `docs/architecture.md`, `docs/decisions.md` | harvest + archive |
| `docs/superpowers/specs/**` | higher-fidelity design/spec docs | durable internal if still referenced; otherwise transient with reusable facts | `docs/features/**`, `docs/architecture.md`, `docs/decisions.md` | keep internal until triaged; harvest + archive where stale |
| `docs/deslopify/**` | technical review lineage and refactor facts/plans | durable internal | `docs/deslopify/**` | keep internal |
| `.claude/commands/**` | local agent command helpers | durable internal | none by default; mirror only repo-wide conventions if needed | keep internal; later remove from public tree |
| `.claude/skills/**` | local agent skill definitions | durable internal | none by default; mirror only durable conventions | keep internal; later remove from public tree |
| `.claude/settings.local.json` | local machine config | disposable / local-only | none | ensure not part of curated public tree |
| `AGENTS.md` | repo operating rules and maintainer guidance | durable internal | selective public mirrors in `CONTRIBUTING.md`, `README.md`, `apps/docs-site/docs/**` | split later; remove raw internal version from curated public tree |
| `CLAUDE.md` | symlink/alias to internal operating rules | durable internal | same as `AGENTS.md` | remove from curated public tree when `AGENTS.md` is split |

## Triage notes by subtree

### `.pi/plans/**`
- Treat as a working notebook and coordination surface, not a polished public-doc area.
- Preserve the active OSS release plan set until this program is complete.
- Older feature-plan folders are strong archive candidates after harvesting facts.

### `docs/plans/**`
- This is the main mixed bucket.
- Historical plans should not remain in the curated public surface long-term.
- Deslopify tasklists are better treated as durable internal engineering records than public docs.

### `docs/superpowers/**`
- Rich source of product and UX facts, but mostly not canonical public docs.
- Strong candidate for harvest + archive after the docs-site/reference docs are fully populated.

### `docs/deslopify/**`
- Keep as the long-lived internal review archive.
- Do not prune as part of the first public-doc cleanup wave.

### `.claude/**` and `AGENTS.md`
- Internal tooling/operating surfaces only.
- Split and mirror only the contributor-facing parts later.

## Next recommended serial follow-ups

1. Harvest durable facts from the highest-value transient docs first:
   - local plugin development
   - GitHub auth unification
   - gateway/public security notes
   - major superpowers design docs that still define current behavior
2. Normalize or strip absolute-path examples in transient docs before any public reuse.
3. When the docs harvest is far enough along, take the private archive snapshot and convert this map into explicit keep/move/archive/delete actions for each remaining subtree.
