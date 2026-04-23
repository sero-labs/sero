# Public-Tree Prune Plan

Date: 2026-04-22
Branch: `feat/release-prep`
Status: Prepared, not yet executed

## Goal

Prepare the eventual **harvest + archive + remove** wave for non-curated docs and
maintainer-only artifacts without deleting anything prematurely.

This plan exists to make the later cleanup:
- truthful
- low-conflict
- reversible
- easy to execute in narrow batches

## Current open checklist items this supports

- `Remove only those public docs whose durable information has already been extracted or intentionally discarded`
- `Remove or relocate non-public artifacts from the public tree`

These items remain **open** until actual archive/remove work lands.

## Preconditions before any delete/move wave

1. **Take the private archive snapshot first**
   - per `decision-log.md`, use a private git mirror/branch snapshot
2. **Do not touch the active release hub yet**
   - keep `.pi/plans/2026-04-22-oss-release/**` until the OSS alpha effort is closed
3. **Verify harvested facts already have canonical homes**
   - plugin docs
   - support scope
   - testing/evals docs
   - security/privacy docs
   - architecture/decisions docs
4. **Check for remaining live references before each batch**
   - especially from `README.md`, `apps/docs-site/docs/**`, and canonical root docs
5. **Keep durable internal archives internal**
   - `docs/deslopify/**` is not part of the first prune wave

## Current inventory snapshot

Approximate tracked surfaces to prune later:
- legacy `.pi/plans/*` release/feature folders: **0 remaining** on this branch after Batch B (`private-archive/batch-b-pre-prune-2026-04-23` preserves the pre-prune snapshot)
- `docs/plans/*`: **12 files**
- `docs/superpowers/**`: **14 files**
- `AGENTS.md`: temporarily retained maintainer/agent operating guidance for Pi CLI compatibility

## Recommended execution batches

### Batch A — safest internal-only tooling surfaces

Targets:
- `.claude/**`
- `AGENTS.md` *(defer actual deletion while current Pi CLI sessions still rely on it)*
- `CLAUDE.md`

Why first:
- clearly not part of the curated public docs surface
- contributor-facing guidance has already been mirrored into public surfaces
- low risk of product-doc truth changing

Checks before execution:
- confirm no curated public doc links depend on these files
- keep any truly reusable contributor guidance in `CONTRIBUTING.md` / docs
- do **not** auto-delete `AGENTS.md` while the current Pi CLI/session harness
  still depends on it; let the user remove it manually later

### Batch B — legacy `.pi/plans/**` folders except the active OSS release hub

Status: **completed on 2026-04-23**

Archived snapshot branch:
- `private-archive/batch-b-pre-prune-2026-04-23`

Removed targets:
- `.pi/plans/2026-04-19-kanban-extraction/**`
- `.pi/plans/2026-04-19-local-plugin-dev-sessions/**`
- `.pi/plans/2026-04-20-emoji-to-lucide-icons/**`
- `.pi/plans/2026-04-20-github-auth-unification/**`
- `.pi/plans/2026-04-20-mcp-adaptor-plugin/**`

Why this batch was safe:
- these were clearly transient implementation/review artifacts
- migration-map classification already existed
- curated/public docs had no live references to these folders

### Batch C — `docs/plans/**` historical plan docs

Status: **completed for now**

Completed so far:
1. obviously transient follow-up/tasklist docs
   - `2026-04-12-pr-136-followups.md` ✅ removed in Batch C step 1 (`private-archive/batch-c1-pre-prune-2026-04-23`)
   - `2026-04-12-pr-137-followups.md` ✅ removed in Batch C step 1 (`private-archive/batch-c1-pre-prune-2026-04-23`)

Remaining suggested order inside this batch:
2. implementation closeout/history docs
   - `2026-04-13-apps-desktop-wave-f-periphery-closeout.md` ✅ removed in Batch C step 2 (`private-archive/batch-c2-pre-prune-2026-04-23`)
3. feature plans whose durable facts already have better homes
   - local plugin development / multi-root workspaces ✅ removed in Batch C step 7 (`private-archive/batch-c7-pre-prune-2026-04-23`)
   - local plugin dev sessions ✅ removed in Batch C step 8 (`private-archive/batch-c8-pre-prune-2026-04-24`)
   - gateway-owner-wide QR access ✅ removed in Batch C step 3 (`private-archive/batch-c3-pre-prune-2026-04-23`)
   - chat turn undo / snapshot separation ✅ removed in Batch C step 5 (`private-archive/batch-c5-pre-prune-2026-04-23`)
   - unified model selection ✅ removed in Batch C step 6 (`private-archive/batch-c6-pre-prune-2026-04-23`)
   - agent browser migration ✅ removed in Batch C step 4 (`private-archive/batch-c4-pre-prune-2026-04-23`)
4. internal index/tasklists last
   - `docs/plans/index.md` *(retained as the internal navigation hub for the remaining planning artifacts)*
   - deslopify tasklists *(retained as durable internal records for the still-live cleanup lineage)*

Why third:
- this tree is mixed and needs the most judgment
- some files are closer to durable internal history than pure disposable plans

Tail decision:
- Batch C tail is **not safe to prune yet** in this OSS release wave.
- Keep:
  - `docs/plans/index.md`
  - `docs/plans/apps-desktop-deslopify-tasklist.md`
  - `docs/plans/desktop-packages-plugins-deslopify-tasklist.md`

Checks before execution:
- verify each file's durable facts are harvested or intentionally dropped
- preserve deslopify-related lineage if still useful internally

### Batch D — `docs/superpowers/**` plans/specs

Status: **in progress**

Completed so far:
1. narrow historical plan removals
   - `docs/superpowers/plans/2026-04-04-google-auth-ux.md` ✅ removed in Batch D step 1 (`private-archive/batch-d1-pre-prune-2026-04-24`)

Remaining targets:
- `docs/superpowers/plans/**`
- `docs/superpowers/specs/**`

Why last:
- these files are dense and often contain higher-fidelity design reasoning
- they are valuable source material even when not curated public docs
- this batch has the highest risk of losing nuanced rationale if rushed

Checks before execution:
- confirm current onboarding/auth/provider/admin behavior is already captured in
  canonical docs or accepted decisions
- keep anything still serving as durable internal reference until a better home
  exists

## What should stay out of the first prune wave

Do **not** remove in the first pass:
- `.pi/plans/2026-04-22-oss-release/**`
- `docs/deslopify/**`
- canonical root docs and curated docs-site content
- strong canonical technical references that are still intentionally used from
  `docs/**`

## Success condition for the eventual cleanup wave

The cleanup wave is ready when each removed target has:
- a known archive location
- a recorded final action in `migration-map.md`
- no required curated-doc references
- no unharvested durable fact that still matters for alpha truthfulness
