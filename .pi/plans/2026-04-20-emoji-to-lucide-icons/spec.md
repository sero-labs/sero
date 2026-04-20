# Sero Monorepo Icon Consistency Initiative

**Date:** 2026-04-20
**Status:** Draft
**Directory:** /Users/danielcarter/Documents/Dev/projects/sero/sero

## Intent
Standardize Sero’s user-facing UI iconography by removing repo-authored emoji from in-scope UI surfaces and replacing it with Lucide icons. The goal is a visually consistent product where recurring actions and concepts use the same icon everywhere practical, while preserving displayed user-provided or external content exactly as authored.

## User Story
As a Sero user, I want the app and built-in plugin UIs to use one consistent icon language, so that actions, statuses, and controls feel coherent and predictable instead of mixing emoji and Lucide icons.

## Behavior
Any repo-authored visual marker in in-scope UI should use Lucide rather than emoji. This applies to action buttons, menu items, labels, badges, tool/icon maps, status markers, theme and appearance controls, and similar UI chrome. When the same user-facing concept appears in multiple places, it should use the same Lucide icon wherever the semantics are the same. If an emoji currently acts only as decoration, it should still be replaced by the closest Lucide equivalent rather than silently dropped.

Rendered content that originates from users, external systems, logs, stored data, or other non-UI content sources is not normalized by this initiative. The cleanup targets repo-authored UI labels and visuals only.

### Happy Path
1. A user opens the desktop app or a built-in plugin UI.
2. Buttons, menus, cards, badges, and controls show Lucide icons instead of emoji.
3. Common actions such as save, delete, search, and refresh use the same icon family wherever the meaning is the same.
4. Theme and appearance controls use Lucide theme icons rather than emoji glyphs.
5. Tool/action maps and similar visual dictionaries also use Lucide icons.
6. Any user-provided or external content that contains emoji is displayed unchanged.

### Edge Cases & Error Handling
- **No exact emoji equivalent exists:** Use the closest Lucide icon rather than leaving emoji in place.
- **Decorative emoji with light semantic value:** Replace with the closest Lucide icon instead of removing the visual marker.
- **Same concept appears in multiple contexts:** Use one canonical Lucide icon when semantics match.
- **Context genuinely changes the meaning:** A different Lucide icon is allowed only when the semantic distinction is material to the user.
- **Existing Lucide drift already exists in an in-scope surface:** Normalize it during this initiative even if that specific UI did not previously use emoji.
- **UI renders external or user-authored content:** Do not rewrite emoji that are part of that content.

## Scope
### In Scope
- Repo-authored, user-facing UI iconography under:
  - `apps/desktop/src/components/**`
  - `packages/ui/src/components/**`
  - `plugins/sero-*-plugin/ui/**`
- All visual UI iconography in those surfaces, including:
  - action controls
  - menu items and command surfaces
  - status chips, badges, and labels
  - theme and appearance controls
  - tool/action icon maps
  - decorative UI markers in headers, cards, forms, and similar chrome
- Normalization of recurring Lucide icon drift across all in-scope UI surfaces.
- The explicitly identified admin editor patterns such as:
  - `plugins/sero-admin-plugin/ui/components/SkillEditor.tsx`
  - `plugins/sero-admin-plugin/ui/components/PromptEditor.tsx`
  - `plugins/sero-admin-plugin/ui/components/AgentEditor.tsx`
- Surface coverage that is clear enough for the planner to split by independent UI areas, including at minimum:
  - desktop shell, command, and theme/appearance UI
  - desktop workspace/explorer/orchestration UI
  - shared UI package components
  - admin plugin UI
  - cron plugin UI
  - other built-in plugin UIs under `plugins/sero-*-plugin/ui/**`

### Out of Scope
- Non-UI repo text such as docs, prompts, markdown, scripts, logs, tests, fixtures, config files, or developer-only console text.
- Vendor, generated, or third-party code.
- Copy rewrites unrelated to emoji/icon replacement.
- Redesigning interaction flows or layout beyond what is necessary to preserve clarity after icon replacement.
- Rewriting or sanitizing emoji that come from rendered user content, external systems, logs, or stored data.

## Canonical Consistency Expectations
At minimum, the initiative should preserve or enforce the repo’s dominant Lucide conventions for recurring user-facing concepts where semantics match:

- delete / remove / uninstall → `Trash2`
- save / persist → `Save`
- search / find → `Search`
- refresh / reload → `RefreshCw`
- external navigation → `ExternalLink`
- loading / in-progress → `Loader2`
- success / done status → a check-family Lucide icon used consistently
- error / failure status → an x-family Lucide icon used consistently
- warning / caution status → an alert-family Lucide icon used consistently
- theme / appearance controls → Lucide theme icons rather than emoji
- clock / schedule / one-time timing concepts → clock-family Lucide iconography
- recurring / repeat concepts → repeat or refresh-family Lucide iconography used consistently

For recurring concepts beyond the list above, the initiative should still converge on one canonical Lucide choice per concept wherever the semantics are the same.

## Effort & Quality
- **Level:** production
- **Tests:** none
- **Docs:** none

## Constraints
- Lucide is the required visual system for replacing in-scope emoji iconography.
- The initiative must preserve accessibility and legibility for dense controls, menus, and button labels.
- The initiative must avoid scope creep into non-UI repo text.
- The initiative must preserve displayed content fidelity when emoji belong to user-provided or external content.
- The initiative must remain focused on consistency and semantics, not on unrelated visual redesign.

## Success Metrics
- Zero repo-authored emoji iconography remains in the defined in-scope UI surfaces.
- Recurring user-facing concepts use consistent Lucide icons across in-scope surfaces when semantics match.
- Existing Lucide inconsistency in in-scope UI is reduced to deliberate, semantically justified differences only.
- Known hotspot patterns such as admin editor save/delete actions, cron reminder states, theme controls, and tool/icon maps conform to the consistency rules.
- Manual product review can move through representative in-scope surfaces without encountering mixed emoji/Lucide iconography in repo-authored UI chrome.

## Ideal State Criteria

### Core Functionality
- [ ] ISC-1: Desktop app UI contains no repo-authored emoji iconography.
- [ ] ISC-2: Shared UI package components contain no repo-authored emoji iconography.
- [ ] ISC-3: Built-in plugin UIs contain no repo-authored emoji iconography.
- [ ] ISC-4: Delete and remove actions use `Trash2` when semantics match.
- [ ] ISC-5: Save and persist actions use `Save` when semantics match.
- [ ] ISC-6: Search and find actions use `Search` when semantics match.
- [ ] ISC-7: Refresh and reload actions use `RefreshCw` when semantics match.
- [ ] ISC-8: Theme and appearance controls use Lucide theme icons.
- [ ] ISC-9: Tool and action icon maps use Lucide icons.
- [ ] ISC-10: Existing Lucide drift is normalized across all in-scope UI.

### Edge Cases
- [ ] ISC-11: Decorative emoji markers are replaced with Lucide equivalents.
- [ ] ISC-12: Closest Lucide matches are used when exact equivalents do not exist.
- [ ] ISC-13: Recurring UI concepts use one canonical Lucide choice.
- [ ] ISC-14: Context-specific icon variants appear only when semantics materially differ.

### Anti-Criteria
- [ ] ISC-A-1: User-provided or external content emoji are not rewritten.
- [ ] ISC-A-2: Non-UI repo text is not required to change.
- [ ] ISC-A-3: No new repo-authored UI emoji are introduced.
