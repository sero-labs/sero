---
pageType: home

hero:
  name: Sero
  text: Local projects, AI coding, and plugins in one desktop app
  tagline: Build Sero from source today, open a workspace, and work with an AI agent alongside terminals, previews, files, and plugin tools.
  image:
    src: /assets/phoenix2.svg
    alt: Sero phoenix mark
  actions:
    - theme: brand
      text: Get Sero Running
      link: /guide/getting-started
    - theme: alt
      text: Start Here
      link: /guide/overview
    - theme: alt
      text: Check Support Scope
      link: /reference/support-scope

features:
  - title: For local project work
    details: Open a project workspace and keep chat, terminals, previews, files, source control, and context in one shell.
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15v9h-15z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 19h6M12 15.5V19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  - title: Source-only alpha
    details: Sero is currently for early adopters and contributors who are comfortable installing dependencies and running commands from the repo.
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.75 20.25 18H3.75z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 8.5v4.5M12 16.25h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  - title: Plugin-first workspace
    details: Built-in and external plugins can add UI, tools, commands, widgets, background jobs, and provider integrations.
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.75h8v4.5h3.25v5.5H16v4.5H8v-4.5H4.75v-5.5H8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
---

## Choose your next step

Sero is a **source-only OSS alpha**. There are no packaged installers yet, and
some workflows will change during alpha.

- [Get Sero Running](/guide/getting-started) — install dependencies, start the
  desktop app from source, and confirm it opens.
- [Start Here](/guide/overview) — learn what Sero is, who the alpha is for, and
  what to read next.
- [Support Scope](/reference/support-scope) — check the current platform,
  workspace runtime, browser automation, and issue-reporting support contract.
- [Choose a Workspace Runtime](/guide/choose-workspace-runtime) — decide where
  Sero should run commands for a workspace.
- [Plugin Catalog](/plugins/catalog) — see the bundled and local plugin surface.
- [Reference](/reference/) — look up exact behavior, state paths, security notes,
  troubleshooting, and architecture.

## Current alpha preview

These screenshots were captured from the current source-only alpha.

### Desktop shell overview

![Desktop shell overview](./assets/desktop-shell-overview.png)

*Explorer workspace in the main panel, the app/workspace sidebar on the left,
and the global agent chat on the right.*

### Example workflow

![Memory workflow in the chat panel](./assets/memory-workflow.png)

*Direct `sero memory` commands running inside a live session via the chat panel.*
