# Context for: repo-wide emoji-to-Lucide icon consistency initiative

## Relevant Files
- `plugins/sero-admin-plugin/ui/components/SkillEditor.tsx` — current user-facing `🗑 Delete` / `💾 Save` labels; explicitly called out by user.
- `plugins/sero-admin-plugin/ui/components/PromptEditor.tsx` — same delete/save emoji pattern as SkillEditor.
- `plugins/sero-admin-plugin/ui/components/AgentEditor.tsx` — same delete/save emoji pattern; likely part of the same worker cluster.
- `plugins/sero-admin-plugin/ui/components/plugins/PluginDevSessionCard.tsx` — already uses Lucide `RefreshCw`, `Trash2`, `Loader2`, helpful as a style reference for destructive / loading actions.
- `plugins/sero-admin-plugin/ui/components/plugins/InstalledPluginsSection.tsx` — Lucide `Trash2` / `FolderOpen` / `PackagePlus` pattern reference.
- `plugins/sero-web-plugin/ui/components/*` — Lucide-heavy surface; useful reference for consistent icon sizing and status coloring.
- `apps/desktop/src/components/layout/**` and `apps/desktop/src/components/apps/**` — main desktop UI surfaces with the highest volume of icons and several remaining emoji literals.
- `packages/ui/src/components/ui/button.tsx` — button primitive enforces icon/text spacing (`gap-2`, svg sizing rules, `has-[>svg]` padding); important for migration behavior.
- `apps/desktop/src/components/ui/IconAction.tsx` — reusable icon-only action wrapper that can inform destructive action styling.
- `apps/desktop/src/lib/app-icons.ts` — centralized app icon registry; not action icons, but demonstrates the repo’s preference for centralized mapping.
- `apps/desktop/src/components/layout/collaboration-chat-feed.ts` / `apps/desktop/src/components/layout/collaboration-visuals.tsx` — centralized Lucide mappings for collaboration phases/roles.
- `apps/desktop/src/components/apps/explorer/orchestration/SubagentCard.tsx` — representative mixed pattern: Lucide status icons but emoji-based tool icons, which may be out of scope unless the initiative expands beyond button/actions.

## Project Structure
- The repo is a monorepo with the most relevant React/UI surfaces in:
  - `apps/desktop/src/components/**` — desktop shell and app panels.
  - `packages/ui/src/components/**` — shared UI primitives and ai-elements.
  - `plugins/sero-*-plugin/ui/**` — plugin-specific web UIs.
- Built-in plugins are where the emoji cleanup is most visible. `sero-admin-plugin` has the clearest low-risk scope because the same header action pattern repeats across several editor forms.
- `packages/ui` already leans heavily on Lucide icons, especially in shared controls like `button`, `command`, `dialog`, `select`, `combobox`, etc.

## Conventions
- Lucide is the dominant icon system in UI code. Imports are usually from `lucide-react` with direct component usage (`<Trash2 className="size-3" />`).
- Standard sizing conventions are consistent:
  - `size-3` / `size-3.5` for dense buttons and list items.
  - `size-4` for typical command/dialog icons.
  - `size-5` and larger for empty states and prominent banners.
- Status colors are encoded with semantic CSS tokens rather than hardcoded hex values, e.g. `text-[var(--status-success)]`, `text-destructive`, `text-[var(--banner-primary)]`.
- Buttons generally rely on the shared `Button` primitive from `@sero-ai/ui/components/ui/button`, which already handles SVG spacing and sizing. That means most migrations should be simple icon swaps, not layout rewrites.
- Some areas already use centralized icon maps instead of inline icon selection (`app-icons`, collaboration role visuals, phase banners), which suggests a good precedent for any future action-icon registry.

## Current Emoji-Based UI Usage Inventory
Representative UI-facing emoji literals found in source (not docs/tests/build output):
- `plugins/sero-admin-plugin/ui/components/SkillEditor.tsx` — `🗑 Delete`, `💾 Save`
- `plugins/sero-admin-plugin/ui/components/PromptEditor.tsx` — `🗑 Delete`, `💾 Save`
- `plugins/sero-admin-plugin/ui/components/AgentEditor.tsx` — `🗑 Delete`, `💾 Save`
- `plugins/sero-admin-plugin/ui/components/ConfigPanel.tsx` — `⚠ Contains sensitive data` (status/warning badge; likely migrate if treated as UI iconography)
- `plugins/sero-cron-plugin/ui/components/ReminderForm.tsx` — `🕐 One-time`, `🔄 Recurring`
- `plugins/sero-cron-plugin/ui/components/ReminderCard.tsx` — `✅ Done`, `🔄 Recurring`
- `apps/desktop/src/components/layout/shell/CommandMenu.tsx` — `🎨 Browse Themes`, `✏️ Edit Current Theme`, `◑ Toggle Light / Dark / System`
- `apps/desktop/src/components/apps/explorer/orchestration/SubagentCard.tsx` — tool icons map includes `📖`, `📂`, `✏️`, `📁`, `🔍`, `🔎`, `🔧`
- `apps/desktop/src/components/layout/CollaborationLiveActivity.tsx` — tool icons map uses `✏️`, `📁`, `🔍`
- `apps/desktop/electron/platform/desktop/notifications.ts` — emoji mapping for notification types (`ℹ️`, `⚠️`, `❌`) in a non-React layer; likely out of scope unless the initiative explicitly includes notification UI.
- Several shell scripts / Python utilities and logs include emoji status markers (`✅`, `❌`, `⚠️`, `🔍`) but are operational output rather than UI surfaces; likely out of scope.

## Existing Lucide Usage Patterns
- Destructive actions are already frequently represented with `Trash2` across desktop and plugin UIs:
  - `SessionBadge`, `WorkspaceNode`, `DiscoverPluginCard`, `ProviderListView`, `InstalledPluginsSection`, `PluginDevSessionCard`, `SearchHistory`, `DownloadsList`, etc.
- Save actions already use `Save` in some places, e.g. `apps/desktop/src/components/layout/context-editor/PresetBar.tsx`; in other places the text-only `Save` label remains.
- Add/create actions commonly use `Plus`, `PlusCircle`, `PackagePlus`, `FolderPlus`, `MessageSquarePlus`, `Grid2x2Plus`.
- Search actions commonly use `Search` / `SearchIcon`.
- Refresh/retry actions commonly use `RefreshCw` or `RotateCcw` depending on semantics.
- External navigation uses `ExternalLink` consistently in desktop/plugin UI and shared ai-elements.
- Success/error/warning states frequently use `Check`, `CheckCircle2`, `X`, `XCircle`, `AlertCircle`, `AlertTriangle`, and `Loader2`.

## Key Findings
- The most obvious low-risk win is `sero-admin-plugin` editor headers: three sibling files share the same `🗑 Delete` and `💾 Save` pattern, so they can be migrated together with minimal conflict.
- The repo already has a de facto semantic icon vocabulary; the work is mostly normalization and replacing emoji literals with existing Lucide components rather than inventing new patterns.
- Inconsistent semantics already exist for similar actions:
  - delete is usually `Trash2`, but some areas may use `Trash` or text-only labels.
  - edit sometimes uses `Pencil`, sometimes `Edit`, and some areas still use `✏️`.
  - refresh sometimes uses `RefreshCw` and sometimes `RotateCcw` depending on whether the action is "reload" or "undo/retry".
- A centralized action-icon map does not appear to exist yet. The closest precedents are app icon registries and collaboration role/phase icon tables.
- Several emoji usages are non-button/status shorthand inside tool feeds or notifications. Those should probably be excluded from a first pass unless the scope is broadened, because they are more about compact log-like telemetry than direct UI controls.

## Gotchas
- Button spacing and icon sizing can drift if icons are inserted ad hoc without using the shared `Button` primitive; the primitive already applies `gap-2` / SVG sizing rules, but dense custom buttons may still need manual `gap-1.5` or explicit `size-*` classes.
- Lucide icon choice consistency matters as much as replacing emoji. Example: if delete becomes `Trash2` in one place, it should likely be `Trash2` everywhere unless a stronger semantic distinction is intended.
- Some current UI text uses emoji as part of compact list labels (`One-time`, `Recurring`, theme menu options). Migrating these may require layout tweaks for line height, truncation, and alignment.
- Accessibility: emoji-only or emoji-leading affordances often lack strong semantics. Swapping to icons should preserve or improve accessible names via button text or `aria-label` if the icon becomes standalone.
- Import churn: many files currently import a single icon inline. A broad sweep may create noisy diffs unless grouped by folder and aligned to existing import style.
- There are multiple file clusters under `apps/desktop/src/components/layout/**`; avoid cross-cutting edits in the same files when possible so workers can split by subdirectory without conflicts.
- `apps/desktop/src/components/apps/explorer/orchestration/SubagentCard.tsx` and similar telemetry-style feeds use emoji in tool-type maps. Those are likely better handled separately from core action icon standardization to avoid scope creep.

## Proposed First-Pass Action/Icon Consistency Table
Based on existing repo patterns:

| Action / Meaning | Preferred Lucide icon | Notes |
| --- | --- | --- |
| Delete / remove / uninstall | `Trash2` | Already the most common destructive icon in the repo. |
| Save / persist | `Save` | Already used in `PresetBar`; better than a floppy emoji. |
| Add / create / new | `Plus` or `PlusCircle` | `Plus` for compact buttons, `PlusCircle` for more prominent create actions. |
| Edit / rename | `Pencil` or `PencilLine` | Prefer one icon family consistently; `Pencil` is already common. |
| Search / find | `Search` | Standard across command bars and search fields. |
| Refresh / reload | `RefreshCw` | Use `RotateCcw` only when the action is semantically undo/restore/retry. |
| Warning / caution | `AlertTriangle` for strong warnings, `AlertCircle` for softer info/warning states | Match existing token colors. |
| Success / done / complete | `CheckCircle2` for status badges, `Check` for inline actions | Repo uses both; distinguish status vs action. |
| Error / failure / close | `XCircle` for status, `X` for dismiss/close | Consistent with dialog and status surfaces. |
| Open folder / browse local files | `FolderOpen` | Already common in file/workspace/plugin UIs. |
| External link / open in browser | `ExternalLink` | Strong existing precedent. |
| Save as / duplicate | `Save` + text, or `Copy` / `Files` depending on behavior | Needs semantic clarity per use case. |
| Loading / in progress | `Loader2` | Already the repo standard; keep spinning class usage consistent. |
| Settings / configure | `Settings2` | Common in model/context editors. |
| Theme / appearance | `Palette` or `Sparkles` depending on meaning | Current theme menu emoji is a likely candidate for `Palette` if it means theme browsing, and `Sun/Moon/Monitor` for mode toggles. |
| One-time / scheduled time | `Clock` / `Clock3` / `CalendarClock`-style alternative if available | For cron/reminder UI, use a time-based icon instead of `🕐`. |
| Recurring / repeat | `RefreshCw` or `Repeat` | Semantically better than `🔄` in user-facing labels. |

## Suggested Concurrent Work Clusters
1. **Admin plugin editors**: `SkillEditor.tsx`, `PromptEditor.tsx`, `AgentEditor.tsx`, and possibly `ModelPanel.tsx` / `ConfigPanel.tsx` for warning/save affordances.
2. **Desktop shell & command palette**: `shell/CommandMenu.tsx`, `theme/*`, `AppStoreDialog.tsx`, `MainSidebar.tsx`, `StatusBar.tsx`, `SessionBadge.tsx`, `ChatPromptArea.tsx`, `ErrorSurface.tsx`.
3. **Workspace/explorer actions**: `workspace/*`, `apps/explorer/*`, especially delete/add/refresh/open-folder actions.
4. **Plugin UIs**: `sero-web-plugin/ui/*`, `sero-cron-plugin/ui/*`, `sero-git-plugin/ui/*`, each mostly self-contained and low-conflict.
5. **Shared UI cleanup**: `packages/ui/src/components/ui/*` and `packages/ui/src/components/ai-elements/*` if the initiative expands to shared primitives or icon-only components.
