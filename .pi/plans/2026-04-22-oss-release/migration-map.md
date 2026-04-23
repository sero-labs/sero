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
| `.pi/plans/2026-04-19-kanban-extraction/**` | feature planning artifacts | transient with reusable facts | `docs/features/**`, `docs/plugins/**`, `docs/decisions.md` if lasting decisions exist | archived on `private-archive/batch-b-pre-prune-2026-04-23`; removed from public tree in Batch B |
| `.pi/plans/2026-04-19-local-plugin-dev-sessions/**` | feature planning / review for plugin-dev sessions | transient with reusable facts | `docs/features/local-plugin-development.md`, `docs/plugins/guide.md`, `docs/decisions.md` | archived on `private-archive/batch-b-pre-prune-2026-04-23`; removed from public tree in Batch B |
| `.pi/plans/2026-04-20-emoji-to-lucide-icons/**` | implementation planning artifacts | transient with reusable facts | product/docs only if any enduring convention exists; otherwise none | archived on `private-archive/batch-b-pre-prune-2026-04-23`; removed from public tree in Batch B |
| `.pi/plans/2026-04-20-github-auth-unification/**` | auth flow planning artifacts | transient with reusable facts | `docs/features/**`, `docs/security/**`, `docs/decisions.md` | archived on `private-archive/batch-b-pre-prune-2026-04-23`; removed from public tree in Batch B |
| `.pi/plans/2026-04-20-mcp-adaptor-plugin/**` | plugin planning artifacts | transient with reusable facts | `docs/plugins/**`, `docs/decisions.md` if durable contracts exist | archived on `private-archive/batch-b-pre-prune-2026-04-23`; removed from public tree in Batch B |
| `docs/plans/index.md` | map of historical/internal planning docs | durable internal | internal docs index only | keep internal until cleanup strategy is executed |
| `docs/plans/2026-04-06-unified-model-selection.md` | historical implementation/design plan | transient with reusable facts | `docs/decisions.md`, relevant feature docs | archived on `private-archive/batch-c6-pre-prune-2026-04-23`; removed from public tree in Batch C step 6 |
| `docs/plans/2026-04-08-agent-browser-migration-plan.md` | feature migration plan | transient with reusable facts | `docs/architecture.md`, relevant feature docs | archived on `private-archive/batch-c4-pre-prune-2026-04-23`; removed from public tree in Batch C step 4 |
| `docs/plans/2026-04-10-multi-root-workspaces-for-plugin-dev.md` | workspace/plugin-dev planning | transient with reusable facts | `docs/plugins/guide.md`, `docs/features/**`, `docs/decisions.md` | archived on `private-archive/batch-c7-pre-prune-2026-04-23`; removed from public tree in Batch C step 7 |
| `docs/plans/2026-04-12-pr-136-followups.md` | follow-up task list | transient / possibly disposable | none unless a durable decision is hidden inside | archived on `private-archive/batch-c1-pre-prune-2026-04-23`; removed from public tree in Batch C step 1 |
| `docs/plans/2026-04-12-pr-137-followups.md` | follow-up task list | transient / possibly disposable | none unless a durable decision is hidden inside | archived on `private-archive/batch-c1-pre-prune-2026-04-23`; removed from public tree in Batch C step 1 |
| `docs/plans/2026-04-13-apps-desktop-wave-f-periphery-closeout.md` | implementation closeout notes | transient with reusable facts | `docs/architecture.md`, `docs/decisions.md` if lasting decisions exist | archived on `private-archive/batch-c2-pre-prune-2026-04-23`; removed from public tree in Batch C step 2 |
| `docs/plans/2026-04-17-chat-turn-undo-and-snapshot-separation.md` | feature/history plan | transient with reusable facts | `docs/features/**`, `docs/decisions.md` | archived on `private-archive/batch-c5-pre-prune-2026-04-23`; removed from public tree in Batch C step 5 |
| `docs/plans/2026-04-17-gateway-owner-wide-qr-access.md` | gateway feature plan | transient with reusable facts | `docs/security/**`, `docs/features/**` | archived on `private-archive/batch-c3-pre-prune-2026-04-23`; removed from public tree in Batch C step 3 |
| `docs/plans/2026-04-19-local-plugin-dev-sessions.md` | public-ish but still transient planning doc | transient with reusable facts | `docs/features/local-plugin-development.md`, `docs/plugins/guide.md` | archived on `private-archive/batch-c8-pre-prune-2026-04-24`; removed from public tree in Batch C step 8 |
| `docs/plans/apps-desktop-deslopify-tasklist.md` | engineering cleanup backlog | durable internal | `docs/deslopify/**` | keep internal or merge into deslopify records later |
| `docs/plans/desktop-packages-plugins-deslopify-tasklist.md` | engineering cleanup backlog | durable internal | `docs/deslopify/**` | keep internal or merge into deslopify records later |
| `docs/superpowers/plans/2026-04-04-google-auth-ux.md` | historical feature planning doc | transient with reusable facts | `docs/features/**`, `docs/security/**`, `docs/decisions.md` | archived on `private-archive/batch-d1-pre-prune-2026-04-24`; removed from public tree in Batch D step 1 |
| `docs/superpowers/specs/2026-04-04-google-auth-ux-design.md` | historical feature design spec | transient with reusable facts | `docs/features/**`, `docs/security/**`, `docs/decisions.md` | archived on `private-archive/batch-d2-pre-prune-2026-04-24`; removed from public tree in Batch D step 2 |
| `docs/superpowers/plans/2026-04-04-dynamic-model-provider.md` | historical feature planning doc | transient with reusable facts | `docs/features/**`, `docs/architecture.md`, `docs/decisions.md` | archived on `private-archive/batch-d3-pre-prune-2026-04-24`; removed from public tree in Batch D step 3 |
| `docs/superpowers/plans/2026-04-05-onboarding-polish.md` | historical feature planning doc | transient with reusable facts | `docs/features/**`, `docs/architecture.md`, `docs/decisions.md` | archived on `private-archive/batch-d4-pre-prune-2026-04-24`; removed from public tree in Batch D step 4 |
| `docs/superpowers/specs/2026-04-05-onboarding-polish-design.md` | historical feature design spec | transient with reusable facts | `docs/features/**`, `docs/architecture.md`, `docs/decisions.md` | archived on `private-archive/batch-d5-pre-prune-2026-04-24`; removed from public tree in Batch D step 5 |
| `docs/superpowers/plans/2026-04-06-merge-admin-resources.md` | historical feature planning doc | transient with reusable facts | `docs/features/**`, `docs/architecture.md`, `docs/decisions.md` | archived on `private-archive/batch-d6-pre-prune-2026-04-24`; removed from public tree in Batch D step 6 |
| `docs/superpowers/plans/2026-04-06-providers-panel.md` | historical feature planning doc | transient with reusable facts | `docs/features/**`, `docs/architecture.md`, `docs/decisions.md` | archived on `private-archive/batch-d7-pre-prune-2026-04-24`; removed from public tree in Batch D step 7 |
| `docs/superpowers/plans/2026-04-04-onboarding-simplification-plan.md` | historical feature planning doc | transient with reusable facts | `docs/features/**`, `docs/architecture.md`, `docs/decisions.md` | archived on `private-archive/batch-d8-pre-prune-2026-04-24`; removed from public tree in Batch D step 8 |
| `docs/superpowers/plans/**` | historical feature planning docs | transient with reusable facts | `docs/features/**`, `docs/architecture.md`, `docs/decisions.md` | plan subtree now pruned; only spec/design docs remain pending targeted triage |
| `docs/superpowers/specs/2026-04-04-dynamic-model-provider-progress.md` | historical feature progress/status doc | transient with reusable facts | code + tests, `docs/superpowers/specs/2026-04-04-dynamic-model-provider-design.md` | archived on `private-archive/batch-d9-pre-prune-2026-04-24`; removed from public tree in Batch D step 9 |
| `docs/superpowers/specs/2026-04-04-onboarding-simplification-implementation-spec.md` | historical feature implementation spec | transient with reusable facts | shipped code, `docs/superpowers/specs/2026-04-04-onboarding-resilience-analysis.md` | archived on `private-archive/batch-d10-pre-prune-2026-04-24`; removed from public tree in Batch D step 10 |
| `docs/superpowers/specs/2026-04-06-merge-admin-resources-design.md` | historical feature design spec | transient with reusable facts | code, `docs/decisions.md`, `docs/features/**` | archived on `private-archive/batch-d11-pre-prune-2026-04-24`; removed from public tree in Batch D step 11 |
| `docs/superpowers/specs/2026-04-06-providers-panel-design.md` | historical feature design spec | transient with reusable facts | code, `docs/guides/combined-model-selection.md`, `docs/features/**` | archived on `private-archive/batch-d12-pre-prune-2026-04-24`; removed from public tree in Batch D step 12 |
| `docs/superpowers/specs/**` | higher-fidelity design/spec docs | durable internal if still referenced; otherwise transient with reusable facts | `docs/features/**`, `docs/architecture.md`, `docs/decisions.md` | remaining files still pending targeted triage / harvest + archive where stale |
| `docs/deslopify/**` | technical review lineage and refactor facts/plans | durable internal | `docs/deslopify/**` | keep internal |
| `.claude/commands/**` | local agent command helpers | durable internal | none by default; mirror only repo-wide conventions if needed | archived on `private-archive/batch-a-pre-prune-2026-04-23`; removed from public tree in Batch A |
| `.claude/skills/**` | local agent skill definitions | durable internal | none by default; mirror only durable conventions | archived on `private-archive/batch-a-pre-prune-2026-04-23`; removed from public tree in Batch A |
| `.claude/settings.local.json` | local machine config | disposable / local-only | none | archived on `private-archive/batch-a-pre-prune-2026-04-23`; removed from public tree in Batch A |
| `AGENTS.md` | repo operating rules and maintainer guidance | durable internal | selective public mirrors in `CONTRIBUTING.md`, `README.md`, `apps/docs-site/docs/**` | archive snapshot captured on `private-archive/batch-a-pre-prune-2026-04-23`; temporarily retained because current Pi CLI sessions still rely on it; user will remove manually later |
| `CLAUDE.md` | symlink/alias to internal operating rules | durable internal | same as `AGENTS.md` | archived on `private-archive/batch-a-pre-prune-2026-04-23`; removed from public tree in Batch A |

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

### `.claude/**`, `AGENTS.md`, and `CLAUDE.md`
- Batch A ran on 2026-04-23.
- Private archive snapshot branch: `private-archive/batch-a-pre-prune-2026-04-23`.
- `.claude/**` and `CLAUDE.md` were removed from the public tree.
- `AGENTS.md` was restored immediately afterward because current Pi CLI
  sessions still rely on it; do not auto-delete it again in this cleanup wave.

## Next recommended serial follow-ups

1. Harvest durable facts from the highest-value transient docs first:
   - local plugin development
   - GitHub auth unification
   - gateway/public security notes
   - major superpowers design docs that still define current behavior
2. Normalize or strip absolute-path examples in transient docs before any public reuse.
3. When the docs harvest is far enough along, take the private archive snapshot and convert this map into explicit keep/move/archive/delete actions for each remaining subtree.
