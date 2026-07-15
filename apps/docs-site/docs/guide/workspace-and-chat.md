# Workspace and Chat

Sero opens into a persistent desktop workspace: a left navigation sidebar, a
central app surface, and a global chat panel that can stay available while you
move between apps.

This guide explains the basic mental model. For the detailed chat composer,
attachments, context editor, slash commands, steering, queued follow-ups, and
voice input, see [Agent Sessions and Context](/guide/agent-sessions-and-context).

![Workspace desktop shell overview](../assets/images/explorer-view.jpg)

## Beta expectations

Sero is currently a **public beta** for **macOS Apple Silicon, Linux x64/arm64, and Windows x64**. Packaged beta installers are available from [GitHub Releases](https://github.com/sero-labs/sero/releases); developers and contributors can still build from source.
Host is the default workspace runtime on supported platforms. Apple Container
and Docker / Podman are explicit container choices when you want container
isolation, image-provided tools, or container networking behavior.

For the current support matrix, see [Support Scope](/reference/support-scope).
For the high-level implementation model, see [Architecture](/reference/architecture).

## First run and profiles

On first launch, Sero asks you to create or choose a profile before entering the
workspace. A profile owns its own `<SERO_HOME>` and profile-scoped
`<SERO_HOME>/agent/` directory for settings, auth, workspaces, layout, sessions,
and local model configuration.

Use profiles to separate local working environments such as Work and Personal.
They are useful separation, not a cryptographic security boundary, and exact
onboarding screens may change during beta.

For the complete profile flow, custom locations, restart-on-switch behavior,
transferable credentials, deletion semantics, and redaction checklist, see
[Profiles and Onboarding](/guide/profiles-and-onboarding).

![Create profile dialog](../assets/images/create-profile.jpg)

![Profile selection dialog](../assets/images/create-profile-2.jpg)

After the profile exists, onboarding checks whether at least one model provider
is available, then asks you to choose LOW, MED, and HIGH model defaults. For the
provider catalog and tier behavior, see [Models and Providers](/guide/models-and-providers).

![Provider authentication](../assets/images/provider-list.jpg)

![Model tier defaults](../assets/images/model-tiers.jpg)

GitHub connection is optional during onboarding, but recommended if you work
with repositories. Connecting it enables repository workflows such as clone,
fetch, push, and pull-request-related actions from Sero.

![GitHub onboarding connection](../assets/images/github-connect.jpg)

GitHub uses a browser-based device login. Copy or open the one-time code flow,
finish authorization in GitHub, and return to Sero; the connection completes
automatically when the device flow succeeds.

![GitHub device login](../assets/images/github-connect-2.jpg)

## Shell regions

The desktop shell has a few stable regions:

![Sero desktop shell regions](../assets/generated/img2.jpg)


- **Title bar** — window controls, back/forward navigation, current app
  context, pinned app shortcuts, and shell actions.
- **Main sidebar** — app switching plus workspace and session navigation.
- **Active app area** — the central surface for Dashboard, Explorer, and other
  app UIs.
- **Global chat panel** — the right-side Pi-backed agent conversation for the
  focused session.
- **Status bar** — current workspace/runtime state, related status, and zoom.

The sidebar and chat panel can be collapsed. Use `Ctrl+B` to hide or show the
main sidebar, and use `Ctrl+L` to hide or show the chat panel. Panel sizes and
open/closed state are restored between launches for the active profile.

The title bar and status bar stay a fixed size on screen no matter how far you
zoom the app content in or out.

### Back and forward

Use the back and forward buttons in the title bar, or `⌘[` / `⌘]` (`Ctrl+[` /
`Ctrl+]` on other platforms), to move through recently visited apps.

### Pinned shortcuts

Star an app from the title bar breadcrumb to pin it as an icon shortcut in the
title bar, up to 8 at a time. Click the star again, or use the command menu,
to unpin it.

### Zoom

Use `⌘+` / `⌘-` / `⌘0` (`Ctrl+` equivalents elsewhere) or the zoom control in
the status bar to zoom the active app in, out, or back to 100%. The title bar
and status bar stay the same physical size at any zoom level.

## Apps: Dashboard and Explorer

Sero starts with core built-in apps:

- **Dashboard** — a home surface for workspace/app summaries and widgets. See
  [Dashboard and Widgets](/guide/dashboard-widgets) for adding, moving, and
  resizing widgets.
- **Explorer** — the project workspace surface for files, editors, previews,
  diffs, and terminal-related work.

Use the sidebar to switch between built-in apps and pinned or discovered apps.
Explorer is central to development workflows, but this page only covers the
workspace mental model. For file tree, editor, terminal, browser, and dev-server
surfaces, see [Explorer Workspace](/guide/explorer-workspace).

## Workspaces and sessions

Workspaces are the main organizing unit for project work. The sidebar shows
registered workspaces and the sessions that belong to them.

In the session tree you can expect to:

- return to a registered workspace
- create or resume agent sessions under that workspace
- search sessions by session name or first message
- keep project conversations separate instead of mixing all history together

The workspace registry is profile-scoped local state. It is not browser storage
and it is restored when you relaunch Sero with that profile.

![Workspace sessions](../assets/images/workspace-sessions.jpg)

### Adding a workspace

The **+** button next to the workspace list offers three ways to start:

- **Create New** — makes an empty workspace. After it is created, Sero offers to
  link it to a Git repository (create a new one on GitHub, or connect an
  existing one).
- **Clone Repository** — paste a Git URL and Sero creates a workspace and pulls
  the repository's files into it in one step. The workspace name is filled in
  from the URL and can be edited. Private repositories need GitHub sign-in; if a
  clone fails for that reason, Sero offers to sign in and retry.
- **Import Existing** — register a folder that already exists on your machine.

### Linking a repository to an existing workspace

Open a workspace's Git action (the branch icon on hover) to link it to a
repository:

- If the workspace is **empty**, its files are fetched and checked out
  automatically.
- If the workspace **already has files**, Sero does not overwrite them silently.
  It tells you nothing was imported and offers a choice: **Import files**
  (Sero proceeds only when it can preserve existing files and Git history) or
  **Just link** (record the remote only).

## Global chat mental model

The chat panel is global to the shell, not tied to one app view. You can switch
from Dashboard to Explorer or another app while keeping the focused agent
session available on the right.

A session is the unit of agent history and lifecycle. When you select a session,
Sero opens or focuses the Pi-backed agent session, loads history when available,
and keeps new prompts associated with that session.

Useful habits:

- Create separate sessions for separate tasks.
- Resume an existing session when the history matters.
- Press `Ctrl+L` to collapse the chat panel when you need more room for the active app.
- Keep important current context in the prompt; memory and history are helpful,
  but not a guarantee that every detail is included in every turn.

For detailed attachment behavior, model controls, prompt steering, abort states,
queued follow-ups, context presets, workspace snapshots, slash commands, and
voice input, see [Agent Sessions and Context](/guide/agent-sessions-and-context).

The chat panel stays available across app switches so the current agent session
can remain in view while you inspect files, plugins, or settings.

![Chat panel](../assets/images/chat.jpg)

The chat menu collects session-level actions and controls that do not need to be
visible in the main composer all the time.

![Chat menu](../assets/images/chat-menu.jpg)

## Command menu

Use the command menu as a quick navigation and shell-actions palette. The
current public-safe mental model is:

- open registered apps
- connect a remote device when that workflow is enabled
- browse or adjust theme actions

On macOS, the usual shortcut is `⌘K`; on other keyboard layouts or environments
it may appear as `Ctrl+K`. Do not treat the command menu as a complete catalog
of agent slash commands or every possible action in Sero.

![Command Menu](../assets/images/command-menu.jpg)

## Layout persistence

Sero saves shell preferences to profile-scoped local files. The restored state
can include things like:

- sidebar and chat open/closed state
- sidebar and chat panel sizes
- active app, workspace, and session
- theme-related choices
- dashboard widget layout and browser-related layout state

This is meant to make restarts feel continuous. If a layout looks wrong during
beta, try switching apps, collapsing/reopening panels, or restarting from the
same profile before filing an issue.

## What to read next

- [Start Here](/guide/overview)
- [Profiles and Onboarding](/guide/profiles-and-onboarding)
- [Models and Providers](/guide/models-and-providers)
- [Agent Sessions and Context](/guide/agent-sessions-and-context)
- [Dashboard and Widgets](/guide/dashboard-widgets)
- [Explorer Workspace](/guide/explorer-workspace)
- [Memory](/guide/memory)
- [Support Scope](/reference/support-scope)
- [Architecture](/reference/architecture)
