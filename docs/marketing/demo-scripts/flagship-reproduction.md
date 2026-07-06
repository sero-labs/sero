# Flagship demo — reproduction steps

The flagship demo (strategy §Viral angle): *"I asked Sero to build a
release-checklist plugin, reviewed it, and ran it inside Sero."* These are the
exact steps to reproduce it live before recording (plan task 3.3). Backed by
the dry-run harness `apps/desktop/e2e/flagship-dryrun.agent.spec.ts`.

## Setup

- A Sero desktop build, signed macOS beta.
- A workspace pointed at a real repository (the dry-run uses a clone of
  `sero-labs/sero`; any repo with releases, open PRs, and issues works).
- A model connected (the dry-run uses the developer's own login; MED tier is
  enough for the build turn).

## The one prompt

Ask Sero, in the workspace chat:

> Build me a release-checklist plugin for this workspace and get it working
> inside Sero. It needs a UI panel called "Release Checklist" that produces a
> release readiness report for this repository — latest release tag and commits
> since it, whether the working tree is clean, open pull requests, and any
> release-blocking open issues — with a "Generate report" action that writes
> release-readiness.md and shows it in the panel.

## What happens (proven repeatable)

1. **Sero builds the plugin from the one prompt.** In the dry-run this took
   about **3 minutes** and produced a complete, valid `sero.app` package at
   `plugins/sero-release-checklist-plugin/` — `package.json` with a `sero.app`
   id, the extension, the UI panel, and a build script. This is the core proof
   moment and it is reliably repeatable.
2. **The review beat.** The agent stops for approval when it needs to change
   the workspace — attaching the new plugin folder to the workspace roots, and
   any gated command (build/typecheck) — showing the exact action before it
   runs. These pauses are the visible "human approves" beats the strategy asks
   for. Keep them in frame.
3. **Mounting it inside Sero.** A plugin sitting in the workspace's `plugins/`
   folder is not auto-discovered; you mount it by installing it from its local
   path through the plugin manager (App Store dialog → install the local
   package). That install builds the plugin and registers it, after which the
   **Release Checklist** panel opens like any other app.
4. **The result.** Open the panel and run **Generate report**; it writes
   `release-readiness.md` with real repo facts (latest tag `v0.4.0-beta.0`,
   commits since, working-tree state, open PRs, blocking issues).

## Two constraints to clear before recording (flagged to Dan)

**1. `workspace:*` dependencies block the local install.** The plugin the agent
built declared `@sero-ai/common` (and other `@sero-ai/*`) as `workspace:*`, and
the plugin manager rejected the install outright:

> Invalid plugin source package: unsupported dependency spec
> `dependencies.@sero-ai/common=workspace:*`. Git/local source installs must
> publish a standalone npm-installable repo with resolved versions and vendored
> workspace packages.

So an agent-built plugin that imports the shared Sero UI/runtime packages can be
*built* but not *installed from local* as-is. The agent reliably produces a
valid `sero.app` package; making an arbitrary self-built plugin *run live* is
the piece to confirm on the demo setup. Options: prompt the agent to keep the
plugin dependency-light (no `@sero-ai/*` imports, plain React), record the mount
from a monorepo-style workspace where the packages resolve, or add a
vendor/resolve step. Pick the demo environment before 3.3 so the "runs inside
Sero" beat is real, not staged.

**2. The approval beats are not automatic in a default session.** In the
dry-run the build turn completed with **zero** user-feedback prompts — the agent
worked in the already-attached workspace and its commands were not gated, so no
approval card appeared. The strategy's "human approves" beat needs the demo run
to actually hit a gate: run the session in a permission mode that gates writes
or commands, or have the agent perform an action that requires attaching a
folder / running a flagged command. Confirm the approval card shows on camera
before recording — do not imply an approval step the default flow skips.

## Timing note for the recording

The build turn is minutes, not seconds. If the recording is sped up, label the
timelapse with the real duration (strategy rule). The approval beats and the
final panel/report should run at real speed so nothing looks staged.
