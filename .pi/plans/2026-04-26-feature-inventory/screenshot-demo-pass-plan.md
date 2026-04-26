# Screenshot / Demo Pass Plan for Docs-Site Launch

## Scope
Planning only for the single synthetic-data screenshot/demo pass referenced by the docs launch checklist. No screenshots are captured in this task, and no app/source/docs-site files are modified here.

## Inputs Reviewed
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-checklist.md`
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-readiness-summary.md`
- `apps/docs-site/docs/index.md`
- `apps/docs-site/docs/guide/memory.md`
- Relevant guide pages: `workspace-and-chat`, `memory`, `web-access`, `scheduler-reminders`, `app-store-favorites`, `explorer-workspace`

## Screenshot Inventory Needed
1. **Desktop shell overview**
   - Shell chrome visible: left sidebar, central active app, right chat panel, status bar.
   - Best represented with Explorer Workspace active.
2. **Memory workflow screenshot**
   - Chat panel showing a synthetic memory task or memory command flow.
   - Prefer visible memory-context block if available in the UI.
3. **Web Access screenshot**
   - Web app showing History and Bookmarks.
   - Sources must be synthetic/non-sensitive.
4. **Scheduler app screenshot**
   - Main Scheduler app with Jobs, Reminders, and notification settings visible across the captured set.
   - Synthetic entries only.
5. **Scheduler dashboard widget screenshot**
   - Compact widget state, if the widget is available in the current build.
6. **App Store / Favorites screenshot**
   - Installed vs discovered apps visible, with a clear favorites state and built-in vs discovered distinction.
7. **Explorer Workspace detail shot**
   - If the shell overview does not already make Explorer legible enough, capture a closer Explorer view with file tree, editor/previews, and terminal panel.

## Synthetic Data Setup Requirements
- Use a dedicated demo profile/workspace with no real user data.
- Use synthetic project names, workspace names, and session titles only.
- Use harmless memory content such as preferences, demo notes, and scratchpad items; avoid secrets, credentials, customer names, or production paths.
- Use synthetic web sources/bookmarks that do not expose internal URLs, credentials, or private research.
- Use synthetic scheduler jobs/reminders such as daily review, demo inbox summary, or stretch break.
- Use synthetic app/plugin entries or a controlled built-in/discovered set for the App Store shot.
- Ensure notification/history state is populated enough to make the UI meaningful, but keep the content generic.
- Pre-stage any needed workspace/session state before capture so screenshots are stable and do not require interactive setup in-frame.

## Per-Shot Composition Notes
### 1) Desktop shell overview
- Frame should show the entire shell, not a cropped inner panel.
- Keep the sidebar expanded enough to show workspace/session navigation.
- Keep the chat panel open so the global agent model is obvious.
- Choose an active app whose layout looks intentional and readable.
- Status bar should be visible to ground the shell in a real runtime state.

### 2) Memory workflow
- Show a realistic prompt/result exchange around memory.
- If memory-context is available, expand it or ensure it is visible enough to read as context, not noise.
- Use concise memory items that make the purpose obvious at a glance.
- Avoid long prose that forces tiny unreadable text.

### 3) Web Access
- Show the Web app, not just a chat answer.
- Prefer a state with both recent history and saved bookmarks visible in the same shot or adjacent shots.
- Use safe, obviously synthetic source titles so the reader can see what the feature does without exposing real browsing history.
- If the layout needs multiple frames, prioritize one shot for history and one for bookmarks.

### 4) Scheduler app
- Capture the default/reminders-oriented view if that best shows the app’s entry state.
- Show at least one cron job and one reminder so the distinction is visible.
- Include notification settings if they are on the same screen or one adjacent shot.
- Use future-dated synthetic entries to avoid implying a real pending workflow.

### 5) Scheduler widget
- Keep the widget shot compact and legible.
- Include counts, upcoming item summary, or run-state indicators if present.
- Avoid showing extraneous desktop clutter around the widget.

### 6) App Store / Favorites
- Show installed apps and discovered apps distinctly.
- Make the favorites relationship obvious, ideally with one favorited item and one built-in item in the same view.
- If unsupported-state labeling is visible, ensure it is not confused with failure; it should read as a compatibility label.
- Avoid any marketplace-like language in the composition; the screenshot should feel like local app management.

### 7) Explorer Workspace
- If needed as a separate shot, include file tree + editor/preview + terminal panel.
- The shot should reinforce that Explorer is a workspace, not a full IDE promise.
- Prefer a project with visible, harmless files and a small terminal output.

## Privacy / Redaction Checklist
- No real names, emails, API keys, tokens, repo URLs, or customer identifiers.
- No private workspace paths beyond generic demo paths.
- No personal notes, customer notes, or internal incident details.
- No real web history, bookmarks, or search queries.
- No reminder titles that expose personal or operational schedules.
- No memory content that could be mistaken for private profile data.
- No notifications, logs, or debug panes showing credentials or raw environment values.
- Redact browser URLs if they reveal internal domains or query parameters.
- Redact OS username/profile identifiers if they appear in path bars or terminal prompts.
- Verify each frame for hidden sidebars, popovers, or tooltips that reveal sensitive state.

## Order of Capture
1. Prepare the synthetic demo profile/workspace and verify it is clean.
2. Capture the desktop shell overview first while the layout is stable.
3. Capture the Explorer Workspace detail shot if needed after the shell overview.
4. Capture the Memory workflow shot with the memory-context state staged.
5. Capture Web Access history/bookmarks shots.
6. Capture Scheduler app shots, then the Scheduler widget if available.
7. Capture the App Store / Favorites shot last, after app/plugin state is settled.
8. Do a final redaction pass over all candidate frames before selecting the launch set.

## Acceptance Criteria
- The final selected set covers every item listed in the screenshot inventory, or documents why a widget/shot was unavailable.
- Each shot is readable at the target publication size without requiring zoom.
- Synthetic data is consistent across frames and clearly non-sensitive.
- The shell overview clearly shows the desktop architecture described in the docs.
- The Memory, Web Access, Scheduler, and App Store screenshots each demonstrate the intended feature state rather than an empty or ambiguous UI.
- No screenshot reveals secrets, private history, personal data, or unsupported claims.
- The plan is executable as a single pass with minimal rework.

## Explicit Caveat
No screenshots are captured in this task. This document only defines the capture plan for the later synthetic-data demo pass.
