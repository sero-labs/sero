# OSS-0101 Docs / Plans Audit

> Note (2026-04-23): later prune steps have since removed the legacy
> `.pi/plans/2026-04-19*` / `2026-04-20*` folders and several historical
> `docs/plans/**` files from this branch after taking archive snapshots
> (including `private-archive/batch-b-pre-prune-2026-04-23` and
> `private-archive/batch-c*-pre-prune-2026-04-23`). References below to those
> paths remain as historical audit evidence.

## Executive summary
- The repo’s public-facing risk is mostly **documentation sprawl and path leakage**, not active secret leakage.
- `docs/security/**` and several root docs are strong candidates for **durable public** status; they already encode reusable security and gateway facts.
- `.pi/plans/**` is predominantly **transient with reusable facts**: it contains useful rationale and architecture notes, but also release-specific drafts, local paths, and work-in-progress decisions.
- `docs/plans/**` is a mixed bucket: some files are useful as durable migration history, but many are now **stale plan artifacts** that should be harvested and archived rather than kept as current truth.
- `docs/superpowers/**` is mostly **transient/internal design history** with reusable implementation facts; it is valuable for provenance, but not a polished public docs surface.
- `docs/deslopify/**` is best treated as **durable internal**: a living engineering-maintenance record that should not be promoted as user-facing documentation.
- The biggest sanitization issue is repeated hardcoded local paths like `/Users/danielcarter/...` in plans and specs, plus some direct references to `~/.pi/agent/` that conflict with Sero’s own agent-directory convention.
- `AGENTS.md` is clearly internal operating guidance and should remain internal unless the team explicitly chooses to publish contributor ops conventions.
- There is no evidence in the scanned docs of live secret material; the concern is **exposing machine-specific paths, internal workflows, and stale plans**.
- The release should define a clear public docs boundary now, before any pruning, and harvest durable facts into canonical docs later.

## Scope covered
Reviewed major trees and representative files under:
- `.pi/plans/2026-04-22-oss-release/` — spec, plan, scout context, checklist, and the prompt driving this audit.
- `.pi/plans/2026-04-19-local-plugin-dev-sessions/` and `.pi/plans/2026-04-20-github-auth-unification/` — representative transient planning docs with absolute-path leakage.
- `docs/plans/` — index and representative plans, including `2026-04-19-local-plugin-dev-sessions.md`.
- `docs/superpowers/` — representative plans/specs for onboarding, providers, auth UX, and model-provider work.
- `docs/deslopify/` — index and selected facts/plan files.
- `docs/security/` — `security-audit-plan.md`, `gateway.md`, and `outstanding-hardening.md` as representative durable security docs.
- `AGENTS.md` — repository-wide maintainer instructions and internal operating conventions.
- `.claude/skills/**` — scanned because the prompt explicitly allows maintainer-facing docs that materially affect readiness; these are internal-only skill docs, not public docs.

## Classification table

| path | bucket | evidence / rationale | recommended later action |
|---|---|---|---|
| `AGENTS.md` | durable internal | Repo operating rules, architecture conventions, and release constraints for maintainers; not public product documentation. | Keep internal; if any contributor-facing guidance is needed, extract a smaller public `CONTRIBUTING.md`/docs page later. |
| `docs/security/gateway.md` | durable public | Explains gateway threat model, token storage, limitations, and verification checklist in user-relevant terms. | Keep and polish as a public security doc; sanitize examples if needed. |
| `docs/security/security-audit-plan.md` | durable internal | Full penetration-test/hardening plan with implementation details and test cases; mostly engineering/internal. | Preserve internally or split reusable public security facts into separate public docs. |
| `docs/security/outstanding-hardening.md` | durable internal | Internal backlog of remaining security work and implementation references. | Keep internal; harvest user-facing caveats into public security docs. |
| `docs/plans/index.md` | durable internal | Index of ad-hoc planning docs; helps maintainers navigate transient material. | Keep as an internal map or replace with a smaller release-appropriate planning index. |
| `docs/plans/2026-04-19-local-plugin-dev-sessions.md` | transient with reusable facts | Implementation plan with durable terminology decisions and architecture rationale, but still a plan artifact. | Harvest the terminology/model decisions into canonical docs; archive the plan after extraction. |
| `docs/plans/2026-04-17-chat-turn-undo-and-snapshot-separation.md` | transient with reusable facts | Likely a past implementation plan with potentially reusable rationale; no evidence it is meant to be public-facing truth. | Audit for reusable facts, then archive/remove from public docs if obsolete. |
| `docs/superpowers/plans/2026-04-04-dynamic-model-provider.md` | transient with reusable facts | Design/implementation plan, not end-user documentation; likely contains durable reasoning and architecture notes. | Archived on `private-archive/batch-d3-pre-prune-2026-04-24`; removed from this branch after harvest review. |
| `docs/superpowers/plans/2026-04-04-google-auth-ux.md` | transient with reusable facts | UX plan/spec material for internal implementation work. | Archived on `private-archive/batch-d1-pre-prune-2026-04-24`; removed from this branch after harvest review. |
| `docs/superpowers/specs/2026-04-04-google-auth-ux-design.md` | transient with reusable facts | Design spec with reusable auth-validation and UX constraints, but still a project spec. | Archived on `private-archive/batch-d2-pre-prune-2026-04-24`; removed from this branch after harvest review. |
| `docs/superpowers/specs/2026-04-04-onboarding-resilience-analysis.md` | transient with reusable facts | Analysis doc with useful failure-mode reasoning; still internal planning content. | Preserve key failure modes in a durable design/security doc; archive the rest. |
| `docs/deslopify/index.md` | durable internal | Living map of refactor reviews and follow-ups; explicitly internal/maintenance-oriented. | Keep internal; do not promote to public docs. |
| `docs/deslopify/outstanding.md` | durable internal | Backlog/closeout tracker for code-quality work. | Keep internal until the maintenance program is intentionally published. |
| `docs/deslopify/desktop-packages-plugins/facts.md` | durable internal | Review facts and findings supporting refactor work; not public product docs. | Keep internal; use as source material only. |
| `docs/deslopify/desktop-packages-plugins/plan.md` | durable internal | Refactor plan with engineering cleanup tasks. | Keep internal/backlog-only; do not surface as user-facing docs. |
| `.pi/plans/2026-04-22-oss-release/spec.md` | transient with reusable facts | Release-spec draft that defines the OSS alpha program; useful as planning source, not public docs. | Keep as internal release planning input; later extract canonical public docs from it. |
| `.pi/plans/2026-04-22-oss-release/plan.md` | transient with reusable facts | Execution plan with release decisions and task decomposition. | Keep internal to the release effort; archive after decisions are executed. |
| `.pi/plans/2026-04-22-oss-release/scout-context.md` | transient with reusable facts | Recon summary with strong factual content, but still an ephemeral planning artifact. | Harvest facts into final release docs, then archive. |
| `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md` | transient with reusable facts | Contains architecture and storage decisions plus absolute local paths. | Sanitize paths, preserve only durable decisions, then archive. |
| `.pi/plans/2026-04-19-local-plugin-dev-sessions/spec.md` | transient with reusable facts | Feature spec with durable model terminology, but still a work artifact. | Move lasting terminology/architecture into canonical docs or code comments; archive the spec. |
| `.pi/plans/2026-04-20-github-auth-unification/plan.md` | transient with reusable facts | Renderer auth architecture plan with reusable ideas but still internal draft. | Preserve reusable auth-UX decisions elsewhere; archive after extraction. |
| `.pi/plans/2026-04-20-github-auth-unification/spec.md` | transient with reusable facts | Feature spec, mostly internal design guidance. | Archive after copying durable public-facing constraints into docs. |
| `.pi/plans/2026-04-20-mcp-adaptor-plugin/scout-context.md` | transient with reusable facts | Recon notes for a plugin effort; useful as history, not public docs. | Archive once key facts are moved to the relevant plugin docs. |
| `.claude/skills/deslopify/SKILL.md` | durable internal | Tooling/agent skill instructions for maintainers, not public repo docs. | Keep internal; do not publish in OSS docs tree. |
| `.claude/skills/fix-slop/SKILL.md` | durable internal | Maintenance/workflow skill instructions; internal-only operational doc. | Keep internal. |
| `docs/plans/desktop-packages-plugins-deslopify-tasklist.md` | durable internal | Tasklist for cleanup work, likely still active or referenceable internally. | Keep internal; if fully closed, migrate durable lessons elsewhere and archive. |
| `docs/plans/apps-desktop-deslopify-tasklist.md` | durable internal | Similar cleanup tasklist for a specific area. | Keep internal; archive only after durable lessons are captured. |
| `docs/superpowers/plans/2026-04-06-merge-admin-resources.md` | transient with reusable facts | Large implementation plan with lots of concrete file/path details. | Harvest reusable architecture/UX facts, then archive. |
| `docs/superpowers/plans/2026-04-06-providers-panel.md` | transient with reusable facts | Large implementation plan; valuable as provenance, not a current doc. | Archive after extracting durable model/UX rules. |
| `docs/superpowers/plans/2026-04-05-onboarding-polish.md` | transient with reusable facts | Implementation plan with concrete onboarding insights. | Keep only if still active; otherwise archive after harvesting. |
| `docs/superpowers/plans/2026-04-04-google-auth-ux.md` | transient with reusable facts | Design/implementation plan for auth UX. | Archive after extracting stable UX/security facts. |

## Absolute-path / private-reference findings

| path | issue | severity | suggested sanitization |
|---|---|---|---|
| `.pi/plans/2026-04-19-local-plugin-dev-sessions/plan.md` | Hardcoded local directory `/Users/danielcarter/Documents/Dev/projects/sero/sero` and example `/Users/daniel/Code/sero-my-plugin`. | high | Replace with repo-relative references or sanitized placeholders like `<repo-root>` / `<plugin-checkout-path>`. |
| `.pi/plans/2026-04-19-local-plugin-dev-sessions/spec.md` | Same machine-specific root path leakage. | high | Remove absolute local path; use repo-relative or generic examples only. |
| `.pi/plans/2026-04-20-github-auth-unification/plan.md` | Hardcoded repo root `/Users/danielcarter/Documents/Dev/projects/sero/sero`. | medium | Convert to relative references or `<repo-root>`. |
| `.pi/plans/2026-04-20-github-auth-unification/spec.md` | Hardcoded repo root path in frontmatter/body. | medium | Replace with relative path or generic placeholder. |
| `.pi/plans/2026-04-20-mcp-adaptor-plugin/plan.md` | Hardcoded repo root path. | medium | Replace with relative path or placeholder. |
| `.pi/plans/2026-04-20-mcp-adaptor-plugin/scout-context.md` | Hardcoded repo root path. | medium | Replace with relative path or placeholder. |
| `.pi/plans/2026-04-20-mcp-adaptor-plugin/spec.md` | Hardcoded repo root path. | medium | Replace with relative path or placeholder. |
| `.pi/plans/2026-04-22-oss-release/scout-context.md` | Hardcoded repo root path in the release-context note. | medium | Use repo-relative path or `<repo-root>`. |
| `.pi/plans/2026-04-22-oss-release/spec.md` | Earlier release plan references `/Users/danielcarter/...` in examples. | medium | Normalize to generic placeholders before public reuse. |
| `docs/plans/2026-04-19-local-plugin-dev-sessions.md` | Example session path uses `/Users/daniel/.../sero-google-plugin`. | high | Sanitize to `<plugin-checkout-path>` or a repo-relative example. |
| `docs/superpowers/plans/2026-04-04-dynamic-model-provider.md` | Repeated command examples used `/Users/danielcarter/Documents/Dev/projects/sero/sero`. | medium | Archived on `private-archive/batch-d3-pre-prune-2026-04-24`; removed from this branch after prior sanitization review. |
| `docs/superpowers/plans/2026-04-05-onboarding-polish.md` | Same hardcoded repo root in command examples. | medium | Use relative path or environment-variable placeholder. |
| `docs/superpowers/plans/2026-04-06-merge-admin-resources.md` | Same hardcoded repo root in command examples. | medium | Replace with generic placeholder. |
| `docs/superpowers/plans/2026-04-06-providers-panel.md` | Same hardcoded repo root in command examples. | medium | Replace with generic placeholder. |
| `.claude/skills/deslopify/SKILL.md` | Mentions `~/.pi/agent/` as an anti-pattern; this is private-path reference material and can be confusing in public docs. | low | If surfaced publicly, reword to Sero’s `~/.sero-ui/agent/` convention and frame the PI path only as historical/internal drift. |
| `.claude/skills/fix-slop/SKILL.md` | Same agent-directory drift reference. | low | Keep internal; if excerpted publicly, sanitize to Sero-managed agent path. |
| `docs/security/gateway.md` | Exposes local secret locations such as `~/.sero-ui/agent/.env`; these are necessary but should be reviewed for public wording consistency. | low | Keep the location but ensure surrounding copy is defensive and does not imply unsafe sharing. |

## Recommended G1 decisions
1. **Public docs boundary:** public docs should include durable product, setup, architecture, plugin, security, and release guidance; plans/specs stay internal unless explicitly promoted.
2. **Internal plan archive policy:** `.pi/plans/**`, `docs/plans/**`, and `docs/superpowers/**` should be treated as **harvest-then-archive** sources, not as current user docs.
3. **AGENTS.md stance:** remain internal; do not publish as a public contributor doc without a deliberate rewrite.
4. **`.claude/**` stance:** keep internal; these are agent skill instructions, not public repo docs.
5. **`docs/deslopify/**` stance:** keep internal/durable as engineering-maintenance records.
6. **Sanitization requirement:** any docs retained in public trees must remove machine-specific paths and private local checkout examples.
7. **Canonical destination preference:** durable facts from plans should land in `README.md`, `docs/sero.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/features/**`, `docs/plugins/**`, `docs/security/**`, or a future docs-site source tree.

## Preserve-before-prune follow-ups
- Inventory all `.pi/plans/**`, `docs/plans/**`, and `docs/superpowers/**` files into durable public / durable internal / transient reusable / disposable buckets before deleting anything.
- Extract durable architecture facts from the local-plugin-dev and GitHub-auth plans into canonical docs before archiving the plan files.
- Normalize all hardcoded local paths across planning docs into placeholders or repo-relative references.
- Decide whether `docs/plans/index.md` should remain an internal index or become a smaller release-planning landing page.
- Confirm whether the public release will keep any history pages from `docs/superpowers/**`, or whether those should be private-only going forward.
- Add a public-facing docs policy that explains which docs are canonical and which are historical/archival.

## Blockers / open questions
- No final decision yet on whether any `docs/plans/**` or `docs/superpowers/**` content should be directly published as public docs, versus harvested into new canonical pages first.
- Need a release-owned archive location/strategy for obsolete plan docs after facts are extracted.
- Need a definitive public/private policy for agent tooling docs (`AGENTS.md`, `.claude/**`) if the OSS repo is meant to be contributor-friendly but not agent-internal.
- Some docs intentionally reference local secret locations for security guidance; those should be reviewed later for wording consistency, but they are not secret leaks by themselves.
