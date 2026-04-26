# Feature Inventory Information Architecture Proposal

**Plan:** `.pi/plans/2026-04-26-feature-inventory/plan.md`  
**Inventory:** `.pi/plans/2026-04-26-feature-inventory/verified-inventory.md`  
**Backlog:** `.pi/plans/2026-04-26-feature-inventory/docs-backlog.md`  
**Verification log:** `.pi/plans/2026-04-26-feature-inventory/verification-log.md`

This is an IA planning artifact only. It is not polished docs, marketing copy, onboarding copy, or release-note text. It proposes where future docs/copy work should land without relocating existing files.

## Inputs Checked

### Existing root `docs/` structure

Required command: `find docs -maxdepth 2 -type f -name '*.md'`.

Current root docs candidates:

- `docs/README.md`
- `docs/SKILL.md`
- `docs/analysis/context-bloat-reduction.md`
- `docs/analysis/host-mode-container-implementation-checklist.md`
- `docs/analysis/host-mode-container-support.md`
- `docs/architecture.md`
- `docs/checklists/pr-147-review-checklist.md`
- `docs/decisions.md`
- `docs/deslop.md`
- `docs/deslopify/index.md`
- `docs/deslopify/outstanding.md`
- `docs/features/local-plugin-development.md`
- `docs/features/memory.md`
- `docs/features/profiles.md`
- `docs/features/sero-apps.md`
- `docs/features/subagents.md`
- `docs/google-plugin-notifications.md`
- `docs/guides/combined-model-selection.md`
- `docs/guides/macos-containers.md`
- `docs/guides/native-modules.md`
- `docs/guides/version-control-user-flow.md`
- `docs/ideas/multi-workspace-spec.md`
- `docs/node-pty-setup.md`
- `docs/plans/apps-desktop-deslopify-tasklist.md`
- `docs/plans/desktop-packages-plugins-deslopify-tasklist.md`
- `docs/plans/github-permissions-public-launch-plan.md`
- `docs/plans/github-permissions-public-launch-status.md`
- `docs/plans/index.md`
- `docs/plans/public-launch-final-checklist.md`
- `docs/plugins/end-to-end-example.md`
- `docs/plugins/guide.md`
- `docs/plugins/host-compatibility.md`
- `docs/plugins/quickstart.md`
- `docs/plugins/technical.md`
- `docs/reference/state-and-folders.md`
- `docs/security/gateway.md`
- `docs/security/hardening-plan.md`
- `docs/security/outstanding-hardening.md`
- `docs/security/security-audit-plan.md`
- `docs/sero.md`
- `docs/specs/sero-cli-tool-spec.md`
- `docs/specs/subagents.md`
- `docs/tasks/pr-147-kanban-contract-extraction.md`
- `docs/testing/container-tools-tests.md`
- `docs/testing/e2e-subagent-testing.md`
- `docs/testing/eval-guide.md`
- `docs/testing/promptfoo-eval-plan.md`
- `docs/themes/README.md`
- `docs/themes/plan.md`

### Current curated public/docs-site surface

`docs/README.md` says curated public docs are `README.md`, root project governance files, and `apps/docs-site/docs/**`; root `docs/**` remains canonical source material and deeper reference while migration is in progress.

Existing docs-site paths checked for IA fit:

- `apps/docs-site/docs/index.md`
- `apps/docs-site/docs/guide/overview.md`
- `apps/docs-site/docs/guide/getting-started.md`
- `apps/docs-site/docs/guide/installation-requirements.md`
- `apps/docs-site/docs/guide/development-setup.md`
- `apps/docs-site/docs/reference/support-scope.md`
- `apps/docs-site/docs/reference/known-limitations.md`
- `apps/docs-site/docs/reference/troubleshooting.md`
- `apps/docs-site/docs/reference/security-privacy.md`
- `apps/docs-site/docs/reference/architecture.md`
- `apps/docs-site/docs/reference/plugins.md`
- `apps/docs-site/docs/reference/plugin-quickstart.md`
- `apps/docs-site/docs/reference/plugin-end-to-end-example.md`
- `apps/docs-site/docs/reference/testing-evals.md`

### Alpha/support constraints that must stay visible

From `README.md` and `apps/docs-site/docs/reference/support-scope.md`:

- Sero is a **source-only OSS alpha**.
- Current supported platform is **macOS on Apple Silicon**.
- Distribution is **build from source only**; no official public binaries are promised.
- Preferred runtime is Apple container-backed workspaces.
- Host mode is a supported fallback with reduced capabilities, not feature parity.
- Linux and Windows are out of current alpha support scope.
- Internal plugin/runtime APIs may evolve during alpha.
- There is no hardened multi-tenant security boundary or support SLA promised.

## IA Principles

1. **Separate canonical docs from copy surfaces.** Root `docs/**` and `apps/docs-site/docs/**` should carry durable facts. Website/homepage, onboarding, and release notes should consume those facts but not become the source of truth.
2. **Use existing locations.** Prefer updating, splitting, or linking existing `docs/**` and docs-site pages before proposing new trees.
3. **Keep audience tracks visible.** General users, power users/developers, admins/support, and plugin authors need different entry points even when they link to the same canonical references.
4. **Keep support scope attached to every entry path.** First-use, feature, plugin, runtime, and marketing surfaces should link or repeat the alpha caveats where needed.
5. **Do not promote external/local plugins as bundled features.** External integrations can appear in examples/catalogs only with support/status caveats.

## Proposed Top-Level Docs Tracks

### 1. Use Sero

**Primary audience:** General users, plugin users, power users starting with the product.  
**Canonical destinations:** `apps/docs-site/docs/guide/**` for curated getting-started paths; root `docs/features/**` as deeper feature references where appropriate.

Concrete sections:

- **Overview and support scope**
  - Keep/update: `apps/docs-site/docs/guide/overview.md`, `apps/docs-site/docs/reference/support-scope.md`, `apps/docs-site/docs/reference/known-limitations.md`.
  - Link candidates: `README.md`, `docs/sero.md`.
- **Getting started / first workspace**
  - Update candidate: `apps/docs-site/docs/guide/getting-started.md`.
  - Link candidates: `docs/reference/state-and-folders.md`, `docs/features/profiles.md`.
  - Backlog source: Core workspace and global chat getting-started guide.
- **Desktop shell and global chat**
  - Update/split candidate: use docs-site getting started for user flow; keep `docs/architecture.md` as deeper architecture reference.
  - Backlog source: Core workspace and global chat getting-started guide.
- **Memory and context**
  - Split candidate: keep `docs/features/memory.md` as canonical detailed reference; create/update a docs-site user guide that distills behavior and links back.
  - Backlog source: Memory persistent context user guide.
- **Automations and reminders**
  - New canonical feature candidate under existing feature/docs-site patterns: root `docs/features/**` for source-grounded reference; docs-site guide page for user flow after runtime screenshots.
  - Backlog source: Automations scheduler and reminders guide.
- **Web access**
  - New canonical feature candidate under existing feature/docs-site patterns; link provider/config caveats and state storage reference.
  - Backlog source: Web access search/fetch/bookmarks guide.
- **Optional remote access**
  - Keep as support/user guide, not homepage primary feature, until runtime pairing/security scope is verified.
  - Link candidates: `docs/security/gateway.md`, `docs/reference/state-and-folders.md`, `apps/docs-site/docs/reference/security-privacy.md`.

### 2. Build with Sero

**Primary audience:** Plugin authors, developers, advanced users building local integrations.  
**Canonical destinations:** `docs/plugins/**`, `packages/app-runtime/README.md` as source reference, and docs-site plugin reference pages.

Concrete sections:

- **Plugin quickstart**
  - Keep/update: `docs/plugins/quickstart.md`, `apps/docs-site/docs/reference/plugin-quickstart.md`.
  - Backlog source: Plugin author quick path and app-runtime API guide.
- **Plugin author guide / distribution model**
  - Keep/update/split: `docs/plugins/guide.md` stays canonical long-form; docs-site page should link a shorter quick path and not duplicate install/build details.
  - Backlog sources: Plugin author quick path; App Store, favorites, and installed plugins user guide.
- **App runtime hooks and host capabilities**
  - Update/link candidate: `packages/app-runtime/README.md` for API source; `docs/plugins/technical.md` for host internals.
  - Caveat: runtime contracts may evolve during alpha.
- **Tool/command bridge and Pi extension integration**
  - Keep/link: `docs/plugins/end-to-end-example.md`, `docs/plugins/technical.md`.
  - Future split candidate: user-safe examples vs implementation internals.
- **Local plugin development**
  - Keep/update: `docs/features/local-plugin-development.md`, `docs/plugins/host-compatibility.md`.
- **External/local plugin examples catalog**
  - New examples/catalog candidate only after product support decision.
  - Must label every entry external/local and link plugin READMEs.
  - Backlog source: External/local plugin examples catalog.

### 3. Develop in Sero

**Primary audience:** Power users and developers using Sero for coding workflows, not necessarily authoring plugins.  
**Canonical destinations:** `apps/docs-site/docs/guide/**` for workflow guides; root `docs/guides/**`, `docs/features/**`, and `docs/reference/**` for source-grounded details.

Concrete sections:

- **Explorer workspace basics**
  - Update/create candidate: a user/developer workflow page that links `docs/architecture.md` and `docs/guides/version-control-user-flow.md`.
  - Backlog source: Explorer workspace basics and dev-server surfaces.
- **Git Manager vs Explorer Source Control**
  - Keep: `docs/guides/version-control-user-flow.md` for JJ-backed Explorer Source Control.
  - New/split candidate: separate Git Manager guide; cross-link with a “which tool to use” note.
  - Backlog source: Git Manager visual and agent-assisted workflow guide.
- **Containers, terminals, and dev servers**
  - Keep/update: `docs/guides/macos-containers.md`, `docs/node-pty-setup.md`, `docs/guides/native-modules.md`.
  - Link support caveats: `apps/docs-site/docs/reference/support-scope.md`.
  - Backlog source: Containers and host-mode runtime guide; Explorer dev-server surfaces.
- **Model/provider setup for developer workflows**
  - Link/update candidate: `docs/guides/combined-model-selection.md`; provider-specific docs only after verification.

### 4. Administer / Troubleshoot Sero

**Primary audience:** Admins, support, power users debugging local installs.  
**Canonical destinations:** `apps/docs-site/docs/reference/**`, `docs/reference/**`, `docs/security/**`, support policy files.

Concrete sections:

- **Support scope and known limitations**
  - Keep authoritative: `apps/docs-site/docs/reference/support-scope.md`.
  - Link/update: `README.md`, `apps/docs-site/docs/reference/known-limitations.md`.
- **State, folders, profiles, and storage**
  - Keep/update: `docs/reference/state-and-folders.md` as canonical detailed map.
  - Link candidates: `docs/features/profiles.md`, docs-site troubleshooting/security pages.
  - Backlog source: State, folders, profiles, and storage map updates.
- **Installation/runtime troubleshooting**
  - Keep/update: `apps/docs-site/docs/guide/installation-requirements.md`, `apps/docs-site/docs/reference/troubleshooting.md`, `docs/guides/macos-containers.md`, `docs/node-pty-setup.md`, `docs/guides/native-modules.md`.
- **Security and privacy**
  - Keep/update/link: `SECURITY.md`, `docs/security/gateway.md`, `apps/docs-site/docs/reference/security-privacy.md`, `docs/security/hardening-plan.md` only as internal/source material where appropriate.
  - Backlog source: Security, permissions, and sensitive-action prompts reference.
- **Admin app operations**
  - New support/admin guide candidate after UI verification.
  - Link storage/security references rather than duplicating sensitive path guidance.
  - Backlog source: Admin app operational guide.

### 5. Public Website / Onboarding Inputs

**Primary audience:** Prospective early adopters, new alpha users, contributors.  
**Destinations:** Website/homepage sections, README excerpts, onboarding screens, screenshot/demo scripts. These are not canonical docs.

Concrete sections:

- **Product pillars**
  - Source from: Core workspace, global chat, plugin ecosystem, memory, Git, web access, automations.
  - Must include: source-only OSS alpha, macOS Apple Silicon, build from source, reduced host mode caveat.
  - Backlog source: Website/README feature pillars update brief.
- **First-run onboarding flow**
  - Source from: Core workspace/global chat guide, memory guide, support scope.
  - Must avoid: unverified attachment/slash-command/provider claims.
- **Demo flows and screenshots**
  - Source from: verified inventory rows and runtime screenshots only.
  - Candidate demos: shell overview, memory context, Git Manager, web search, Scheduler.
- **Release-note inputs**
  - Source from: release-note candidate backlog only after verification and product release decision.
  - Must not announce external/local integrations as bundled features.

## Backlog Category to IA Mapping

| Backlog category/item | Canonical docs destination | Public/onboarding/release surface | Existing docs action | Notes/caveats |
|---|---|---|---|---|
| Memory: persistent context user guide | User guide in docs-site plus `docs/features/memory.md` as detailed reference | Onboarding memory step; website proof point after copy review | **Split/link:** keep `docs/features/memory.md`; create/update shorter user-facing page | Do not promise perfect recall or always-available QMD. |
| Core workspace and global chat getting-started guide | `apps/docs-site/docs/guide/getting-started.md`; link `docs/architecture.md` | Website shell overview; onboarding first workspace | **Update/link:** README and getting-started; link architecture/state docs | Include alpha support scope and source-only setup. |
| Web access guide | New feature/user guide under existing docs-site/root feature patterns | Website feature proof point only with provider caveats | **Create/link:** no existing checked Web guide; link state folders if storage mentioned | Provider availability depends on credentials/config/sign-in. |
| Automations scheduler/reminders guide | New feature/user guide under existing docs-site/root feature patterns | Onboarding example; release note candidate | **Create/link:** no existing checked Cron guide | Runtime notifications/missed runs need verification before examples. |
| Optional web remote access guide | Support/user guide linked from security/troubleshooting | Not a homepage primary pillar until runtime/security review | **Link/update:** `docs/security/gateway.md`, state folders, support scope | Gateway is optional/token-gated, not always-on hosted remote access. |
| Git Manager workflow guide | New Git Manager guide; cross-link `docs/guides/version-control-user-flow.md` | Developer onboarding/demo; website proof point after UI/runtime verification | **Split/link:** keep Explorer/JJ source-control guide separate | Mutating actions affect real repos; do not imply every tool action has polished UI. |
| Explorer basics and dev-server surfaces | Workflow guide; link architecture, containers, source-control guide | Developer onboarding | **Create/update/link:** README screenshot, architecture, version-control guide | Avoid IDE parity and auto-dev-server claims until tested. |
| Containers and host-mode runtime guide | `docs/guides/macos-containers.md`, docs-site support/runtime pages | Onboarding requirements; support triage snippets | **Update/link:** support scope, macOS containers, node-pty/native modules | Host mode is reduced, not feature-equivalent. |
| App Store/favorites/installed plugins user guide | User-facing plugin management page; link `docs/plugins/guide.md` | Onboarding plugin install/favorites step | **Split/link:** keep author-heavy guide; add shorter user path | Clarify built-in vs installed external plugins and trust caveats. |
| Plugin author quick path/app-runtime API | `docs/plugins/quickstart.md`, `docs/plugins/guide.md`, app-runtime README, docs-site plugin refs | Contributor/developer website path | **Update/split/link:** quick path plus canonical long-form | Plugin/runtime APIs may evolve during alpha. |
| External/local plugin examples catalog | Examples catalog only if product approves support status | Website ecosystem proof points only as examples, not bundled features | **Create/link later:** link external READMEs | Every entry must say external/local and list prerequisites/support status. |
| State/folders/profiles/storage map | `docs/reference/state-and-folders.md`; docs-site troubleshooting/security refs | Support/onboarding links only | **Keep/update/link:** canonical storage map | Redact tokens/private paths/auth files in support docs. |
| Security/permissions/sensitive prompts | `SECURITY.md`, `docs/security/**`, docs-site security/privacy | Trust/support page snippets | **Update/link:** review existing security docs first | Specific dangerous bash approval only; no universal permission claim. |
| Admin app operational guide | New admin/support guide after UI review; link storage/security | Support runbook snippets | **Create/link later:** no checked Admin UI doc | Sensitive surfaces; do not imply agent can directly operate Admin UI. |
| Website/README feature pillars brief | No canonical destination; consume inventory/docs links | Website/README copy brief | **Update existing README/website only after FI-010** | Keep alpha constraints visible. |
| Release-note candidates | No canonical destination; consume finished docs and verified inventory | Changelog/release process | **Defer:** final notes after product release decision | Do not announce partially verified or external/local features as shipped core. |

## Existing Docs: Keep / Update / Split / Link Candidates

### Keep as canonical or strong source references

- `docs/README.md` — documentation model and public/internal boundary.
- `docs/architecture.md` — shell and subsystem overview.
- `docs/decisions.md` — durable architecture decisions.
- `docs/reference/state-and-folders.md` — canonical profile/state/storage map.
- `docs/features/memory.md` — detailed memory reference.
- `docs/plugins/guide.md` — long-form plugin guide.
- `docs/plugins/quickstart.md` — minimal plugin starter path.
- `docs/plugins/technical.md` — plugin system internals.
- `docs/guides/macos-containers.md` — Apple container setup.
- `docs/node-pty-setup.md` and `docs/guides/native-modules.md` — native module/runtime troubleshooting.
- `docs/security/gateway.md` and `SECURITY.md` — security/gateway support references.
- `apps/docs-site/docs/reference/support-scope.md` — canonical alpha support matrix.

### Update candidates

- `apps/docs-site/docs/guide/getting-started.md` — align with core workspace/global chat/onboarding backlog and current screenshots.
- `apps/docs-site/docs/guide/installation-requirements.md` — ensure support-scope/runtime caveats are linked from first-use paths.
- `apps/docs-site/docs/reference/troubleshooting.md` — link state/folders, containers, node-pty/native modules, gateway/security where relevant.
- `apps/docs-site/docs/reference/security-privacy.md` — align with sensitive action prompts and gateway/security references after verification.
- `apps/docs-site/docs/reference/plugins.md` — clarify built-in vs external/local plugins and link author vs user paths.
- `README.md` — update only from FI-010 copy briefs and preserve source-only alpha posture.

### Split candidates

- `docs/features/memory.md` — keep detailed reference; split/distill a shorter user guide for docs-site.
- `docs/plugins/guide.md` — keep comprehensive author/install/distribution doc; split a shorter plugin-user management path and plugin-author quick path if needed.
- `docs/guides/version-control-user-flow.md` — keep Explorer/JJ Source Control guide; create/link separate Git Manager guide.
- `docs/architecture.md` — keep architecture reference; avoid using it as the user-facing shell guide.

### Link-only or source-material candidates

- `docs/analysis/**`, `docs/plans/**`, `docs/deslopify/**`, `docs/tasks/**`, `docs/checklists/**` — internal/transient source material, not public docs by default.
- `docs/security/hardening-plan.md`, `docs/security/outstanding-hardening.md`, `docs/security/security-audit-plan.md` — useful for security work, but not public-facing canonical user docs without review.
- `docs/ideas/**` and `docs/specs/**` — future/spec material; link only when a feature is verified and shipped.
- External/local plugin README paths — examples/integration support only, never bundled-feature canon.

## Canonical Docs vs Website / Onboarding / Release Notes

### Canonical docs

Canonical docs should answer “what is true, supported, and how do I use/troubleshoot it?” Candidate locations:

- Curated public docs: `apps/docs-site/docs/**`.
- Source/deep references during migration: root `docs/**` files listed above.
- Project support/governance: `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md` where appropriate.

Rules:

- Must cite or align with verified inventory/source paths.
- Must link support scope when a feature depends on platform, runtime mode, or alpha contracts.
- Must distinguish built-in/core, built-in/plugin, external/local, experimental, and placeholder statuses.

### Website / homepage / README feature surfaces

These should consume canonical docs and FI-010 copy briefs. They may summarize product pillars but should not introduce unsupported facts.

Allowed inputs:

- Verified inventory rows.
- Finished or approved docs-site/root docs.
- Current README/support-scope alpha language.

Not allowed:

- Claims of Linux/Windows support, public binaries, stable plugin API, host/container parity, or bundled external integrations.

### In-app onboarding

Onboarding should be task-first and short. It should link to canonical docs for details.

Candidate modules:

- First workspace/profile setup.
- Shell tour: sidebar, active app, chat panel.
- Memory basics.
- Container/runtime status.
- Optional plugin discovery/favorites.

Guardrails:

- Avoid detailed provider/plugin claims unless runtime-tested.
- Include source-only alpha/reduced host-mode caveats in setup-adjacent flows.

### Release-note surfaces

Release notes should be generated only after product/release decision and final verification.

Candidate sources:

- FI-010 release-note briefs.
- Finished docs and changelog/release process.
- Verified inventory rows with no unresolved public-copy blockers.

Guardrails:

- Do not announce external/local plugins as bundled releases.
- Do not turn partially verified features into availability promises.
- Link final docs once available.

## Open Decisions / Follow-up for Future Tasks

- Decide exact docs-site page names/routes for new Memory, Web, Cron, Git Manager, Explorer, and Admin pages.
- Decide whether external/local plugin examples belong in public docs-site during alpha or remain linked from plugin-author docs only.
- Runtime-test partial items before converting IA/backlog entries into polished docs.
- Confirm product positioning before README/homepage updates.
- Keep `apps/docs-site/docs/reference/support-scope.md` as the source of truth for alpha support until product changes it.
