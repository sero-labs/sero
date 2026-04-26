# Demo screenshot scenario prompts

**Demo profile:** `/Users/danielcarter/.sero-ui/profiles/serodemo`

Use this document to create interesting screenshot/demo workspaces from inside
Sero. The goal is to let the agent choose tasteful implementation details while
keeping all content synthetic, safe, and visually useful for docs screenshots.

## Ground rules for every scenario

Before starting, use a fresh workspace/session under the demo profile.

Use prompts that tell the agent:

- all data must be synthetic
- no real names, emails, tokens, customers, repo URLs, API keys, private paths,
  or personal notes
- prefer visually readable files, UI labels, and commit messages
- keep examples small enough to understand in screenshots
- choose frameworks/tools that make the UI look good in Sero screenshots
- avoid depending on paid credentials or real external services unless you
  explicitly choose to configure them
- write short README notes inside each workspace explaining what the demo shows

When a scenario is ready, capture screenshots according to:

```text
.pi/plans/2026-04-26-feature-inventory/screenshot-demo-pass-plan.md
```

---

# Scenario 1 — Desktop shell / Explorer overview

## Purpose

Create a workspace that makes the Sero shell look immediately understandable:
sidebar, Explorer file tree, editor/preview, terminal, and chat panel.

## Suggested session name

`Demo: Product Studio Workspace`

## Prompt to paste into Sero

```text
Create a polished synthetic demo workspace for screenshots of Sero's desktop shell and Explorer.

Please choose whatever lightweight framework, file layout, and content will make the screenshots look good. The workspace should feel like a small product studio or design/engineering project, but all content must be fake and safe to show publicly.

General goals:
- create a visually interesting but small project
- include a README that explains the demo project in a few lines
- include a few source files with readable names
- include at least one file that looks good open in the editor
- include a simple local preview or mock app if practical
- include a terminal-friendly command that prints a useful synthetic status summary
- keep everything deterministic and easy to inspect

Please avoid real company names, real customer data, real URLs, secrets, API keys, personal paths, or anything that looks private.

When done, summarize what files/views are best to open for screenshots: file tree, editor tab, preview/browser, terminal command, and chat prompt.
```

## Follow-up prompt after creation

```text
Prepare this workspace for a full-shell screenshot. Open or suggest the most visually useful file, the best preview surface if available, and a terminal command that produces short readable output. Keep the layout focused on showing Sero's sidebar, Explorer, terminal, and chat panel clearly.
```

## Screenshot targets

- Full shell with left sidebar, Explorer, terminal, right chat panel, status bar
- Optional tighter Explorer shot with file tree + editor/preview + terminal

---

# Scenario 2 — Memory workflow

## Purpose

Create synthetic memory/scratchpad content that demonstrates durable context
without exposing anything personal.

## Suggested session name

`Demo: Memory Workflow`

## Prompt to paste into Sero

```text
Create a synthetic memory demo for Sero documentation screenshots.

Please generate a small set of fake project preferences, working notes, and scratchpad items that would make sense for a demo product workspace. Use only fictional content. Do not include any real names, emails, tokens, URLs, customer details, personal facts, or private paths.

I want the screenshot to show how memory can help a future agent turn. Please:
- create a few concise synthetic memory items or scratchpad notes using the available Sero memory workflows/tools
- make the content visually readable in chat
- include one future prompt idea that should cause the agent to use or reference the stored context
- keep the memory content obviously fake and safe for public docs

When done, tell me exactly what prompt I should send next to produce a nice screenshot showing memory context or recall behavior, if that is available in the current build.
```

## Follow-up prompt for screenshot moment

```text
Using the synthetic demo memory we just created, help me produce a screenshot-friendly response that references the relevant saved context. Keep the answer concise and visually readable. If a memory-context block appears, make sure the content is safe and easy to understand.
```

## Screenshot targets

- Chat panel with memory write/read/search or memory-context behavior
- Optional visible memory context block if it appears naturally

---

# Scenario 3 — Web Access history/bookmarks

## Purpose

Populate Web Access with safe, synthetic-looking research activity and bookmarks.
Avoid depending on real private browsing history.

## Suggested session name

`Demo: Web Research Board`

## Prompt to paste into Sero

```text
Create a safe Web Access demo for screenshots.

Use public, harmless topics only. Pick a lightweight research theme that will look good in docs, such as comparing public design-system documentation, open-source release notes, or general web platform references. Avoid private URLs, accounts, credentials, customer data, personal searches, or anything sensitive.

Please use the available web/search/fetch/bookmark workflows to create a screenshot-friendly state if the configured providers allow it. If providers are unavailable, create a graceful fallback plan that still gives me a useful Web app screenshot without pretending provider setup works.

Goals:
- produce a few safe search/history entries
- save a few bookmarks with clean titles
- optionally fetch one or two public pages if available
- keep titles short and readable
- avoid controversial or personal topics

When done, summarize the best Web app views to open for screenshots, especially History, Bookmarks, and Downloads if populated.
```

## Follow-up prompt if providers fail

```text
The web provider path appears unavailable or partially configured. Please help me stage a safe screenshot plan that honestly shows the Web app surface without claiming provider success. Use only local/synthetic state if appropriate, and tell me which parts should not be represented as verified provider behavior.
```

## Screenshot targets

- Web app with History visible
- Web app with Bookmarks visible
- Optional Downloads/fetched content if naturally available

---

# Scenario 4 — Scheduler and reminders

## Purpose

Create synthetic jobs/reminders that make the Scheduler app legible.

## Suggested session name

`Demo: Scheduler Board`

## Prompt to paste into Sero

```text
Create a synthetic Scheduler and Reminders demo for screenshots.

All entries must be fake and safe to show publicly. Please create a small set of demo reminders and recurring jobs that look useful but do not imply real obligations, personal schedules, customers, incidents, or credentials.

Examples of acceptable themes:
- daily demo workspace review
- weekly synthetic project summary
- stretch break reminder
- check docs screenshot checklist
- summarize fake release notes

Please use the available Scheduler/cron/reminder workflows in the safest way. Keep scheduled times easy to understand and avoid creating noisy real notifications unless I explicitly ask.

Goals:
- create at least one reminder
- create at least one recurring job or scheduled agent task if supported
- include clear titles and short descriptions
- leave the Scheduler app in a screenshot-friendly state
- tell me what view/settings should be open for the screenshot

When done, summarize what was created and how to clean it up after screenshots.
```

## Follow-up prompt for notification/widget shot

```text
Prepare the Scheduler demo state for screenshots. If a dashboard widget or notification-related state is available, tell me the safest way to show it with synthetic data. Do not trigger repeated or noisy notifications unless I confirm.
```

## Screenshot targets

- Scheduler app with Jobs and Reminders
- Notification settings if visible
- Scheduler dashboard widget if available

---

# Scenario 5 — Git Manager with disposable repo

## Purpose

Create a synthetic Git repository with readable diffs/branches/commits for Git
Manager screenshots.

## Suggested session name

`Demo: Git Manager Repo`

## Prompt to paste into Sero

```text
Create a disposable synthetic Git demo repository for Sero Git Manager screenshots.

Please choose a small project theme and file layout that will produce readable Git status, branch, diff, and commit views. All content must be fake and safe to show publicly.

General goals:
- initialize or use a disposable Git repo only
- create a clean initial commit
- create one feature branch with a small readable change
- leave at least one staged or unstaged change that looks good in a diff
- use short synthetic commit messages
- avoid real remotes, real repo URLs, real customer names, secrets, or private paths
- include a README explaining this is a screenshot demo repo

Please be careful: do not mutate any real repository. If the workspace is not disposable, stop and ask me to create a disposable workspace first.

When done, tell me which Git Manager views are best for screenshots: status, branches, diff, log, or commit details.
```

## Follow-up prompt for screenshot moment

```text
Prepare the disposable repo for a Git Manager screenshot. I want a clean, readable state that shows branch context and a small diff without implying any real project. Recommend which Git Manager view to open first and what should be visible.
```

## Screenshot targets

- Git Manager status/changes
- Branch context
- Small readable diff
- Optional log/commit detail

---

# Scenario 6 — App Store and Favorites

## Purpose

Show the App Store/favorites/sidebar model without implying a stable marketplace
or reviewed plugin catalog.

## Suggested session name

`Demo: App Store Favorites`

## Prompt to paste into Sero

```text
Help me prepare a safe App Store and Favorites screenshot for Sero docs.

Please inspect the current App Store / plugin management UI state and recommend a screenshot composition that clearly shows:
- core shell apps vs plugin-backed apps where visible
- installed apps
- favorites/sidebar behavior
- any compatibility labels if present

Do not install untrusted plugins or make marketplace/support claims. If installing a plugin would improve the screenshot, suggest only a safe local or trusted demo option and ask for confirmation before installing anything.

All visible app/plugin names should be safe to show publicly. Avoid exposing local paths, private source locations, tokens, unsupported claims, or personal profile details.

When done, tell me which App Store tab/view and sidebar state would make the clearest screenshot.
```

## Follow-up prompt if a local demo plugin is needed

```text
If a local demo plugin would make the App Store screenshot clearer, propose a minimal safe approach first. Do not install or modify anything until I confirm. The goal is only to show installed/favorite/sidebar behavior, not to claim external plugin support.
```

## Screenshot targets

- App Store Installed tab
- Discover tab if safe and non-sensitive
- Sidebar with favorited plugin-backed apps

---

# Scenario 7 — Web Remote pairing

## Purpose

Optionally show Web Remote as an advanced/security-sensitive surface. Only do
this if you are comfortable enabling the gateway in the demo profile.

## Suggested session name

`Demo: Web Remote Pairing`

## Prompt to paste into Sero

```text
Help me plan a safe Web Remote screenshot using this demo profile.

Do not reveal or print gateway tokens, QR payloads, full login URLs, secrets, private workspace names, or real local paths. Treat Web Remote as optional and security-sensitive.

Please inspect what Web Remote / connect-device surfaces are available in the current build and recommend a screenshot composition that communicates pairing without exposing credentials. If the gateway is not enabled, explain the safe launch prerequisite but do not imply it is active.

The screenshot should make clear that this is an optional alpha feature, not a production remote-admin guarantee.
```

## Follow-up prompt after launching with `SERO_GATEWAY=1`

```text
The gateway is enabled for this demo profile. Help me stage a safe Web Remote pairing screenshot. Do not show raw tokens, full URLs, QR contents, or secrets. Recommend what to crop or hide, and include cleanup steps to revoke/disable access afterward.
```

## Screenshot targets

- Connect remote device dialog or pairing surface
- Optional paired web UI only if tokens/URLs can be safely hidden

---

# Scenario 8 — End-to-end launch-story workspace

## Purpose

Create one visually coherent workspace that can tie several screenshots together
with consistent fictional branding.

## Suggested session name

`Demo: Phoenix Launch Kit`

## Prompt to paste into Sero

```text
Create a cohesive synthetic demo workspace that can support multiple Sero docs screenshots.

Let the agent choose the framework and details that will look best. The workspace should feel like a small fictional product launch kit, with files, tasks, notes, and optional preview UI that are visually clear in screenshots.

Please create only fake/safe data. No real customers, companies, emails, secrets, tokens, private URLs, or personal paths.

Desired outputs:
- a small project structure with readable filenames
- a README describing the fictional project
- a simple app or preview if practical
- a few synthetic docs/notes that look good in Explorer
- a terminal command that prints a short project status
- suggested memory notes for this fictional project
- suggested scheduler reminders/jobs for this fictional project
- optional Git branch/change ideas for a disposable repo

Keep it compact and screenshot-friendly. When done, tell me how to use this one workspace across Shell, Explorer, Memory, Scheduler, Git, and Web screenshots.
```

## Follow-up prompt for staging all screenshots

```text
Using this synthetic launch-kit workspace, help me stage the next screenshot in the sequence. Choose the most visually useful Sero surface, explain what should be visible, and keep all content safe and fictional.
```

## Screenshot targets

- Can support Shell, Explorer, Memory, Scheduler, Git, and maybe Web screenshots
- Useful if you want consistent names/content across the whole docs launch set

---

# Recommended capture order using these scenarios

1. Create Scenario 8 first if you want a unified fictional theme.
2. Use Scenario 1 for the main shell/Explorer screenshot.
3. Use Scenario 5 for Git Manager if Git needs a richer disposable repo state.
4. Use Scenario 2 for Memory.
5. Use Scenario 4 for Scheduler.
6. Use Scenario 3 for Web Access.
7. Use Scenario 6 for App Store/Favorites.
8. Use Scenario 7 only if you intentionally want Web Remote screenshots and can keep credentials hidden.

# Cleanup prompts

Use these after screenshots to return the demo profile/workspaces to a clean
state.

```text
Review this demo workspace/profile state and list what synthetic data was created for screenshots. Suggest safe cleanup steps for reminders, scheduled jobs, temporary web bookmarks/history, demo plugin installs, gateway/web tokens, and disposable Git branches. Do not delete anything until I confirm.
```

```text
Proceed with the safe cleanup steps we just reviewed. Preserve only the files that are useful as reusable synthetic demo fixtures, and remove temporary reminders/jobs/tokens/history that should not persist.
```
