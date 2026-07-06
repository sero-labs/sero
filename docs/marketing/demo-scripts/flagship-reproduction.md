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

> Build me a release-checklist plugin and get it working inside Sero. It needs
> a UI panel called "Release Checklist" that produces a release readiness report
> for this repository — latest release tag and commits since it, whether the
> working tree is clean, open pull requests, and any release-blocking open
> issues — with a "Generate report" action that writes release-readiness.md and
> shows it in the panel. Build it as a standalone, installable Sero plugin like
> the community plugin examples (self-contained package, plain-React UI, only
> published dependency versions — no monorepo workspace links), so it installs
> from its local folder through the plugin manager.

That last sentence matters — see constraint 1 below. Without it the agent
mimics the monorepo's own plugins and produces something that won't install.

## What happens (proven repeatable, full run green)

1. **Sero builds the plugin from the one prompt.** In the dry-run this took
   about **7 minutes** and produced a complete, standalone, installable
   `sero.app` package at `release-checklist-plugin/` — `package.json` with a
   `sero.app` id, the Pi extension, the module-federation UI panel, a build
   script, and only published dependency versions (no monorepo links).
2. **Mounting it inside Sero.** Install the plugin from its local folder through
   the plugin manager (App Store dialog → install the local package). That
   install builds it and registers it — verified green: it appears in the app
   list as `release-checklist` and the **Release Checklist** panel opens like
   any other app.
3. **The result.** Run **Generate report** in the panel; it writes
   `release-readiness.md` with real repo facts — verified output: latest tag
   `v0.4.0-beta.0`, 174 commits since, working-tree state, open PRs, and
   release-blocking issues.

## Two things to set up for the recording

**1. Build it standalone — resolved.** The first dry-run had the agent mimic the
monorepo's own plugins and declare `@sero-ai/* = workspace:*` deps, which the
plugin manager refuses on local install ("unsupported dependency spec …
workspace:*"). Adding "build it as a standalone, installable plugin like the
community examples — published versions only, plain-React UI, no workspace
links" to the prompt fixed it completely: the second dry-run built, installed,
mounted, and generated the report end-to-end. So keep that phrasing in the demo
ask. Reference pattern: the community `sero-calc-plugin` (Pi extension + plain
React UI with a local `cn()` helper, `@sero-ai/app-runtime` as a normal
versioned dep, Pi packages as peer deps).

**2. The approval beat is not automatic in a default session.** In the dry-run
the build turn completed with **zero** approval prompts — the agent worked in
the already-attached workspace and its commands were not gated, so no approval
card appeared. A visible approval is the typical, intended path and this demo
should show one, so set the recording up to actually hit a gate: run the session
in a permission mode that gates writes/commands, or have the agent perform an
action that requires attaching a folder or running a flagged command. Confirm
the approval card is on camera before recording — do not imply a gate the
default flow skips. (Where a workflow intentionally has no gate, that is a valid
choice — tell the honest control story instead; see the strategy's trust notes.)

## Timing note for the recording

The build turn is minutes, not seconds. If the recording is sped up, label the
timelapse with the real duration (strategy rule). The approval beats and the
final panel/report should run at real speed so nothing looks staged.
