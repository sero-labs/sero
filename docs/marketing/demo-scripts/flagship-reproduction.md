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

That last sentence prevents workspace dependencies that the plugin manager
cannot install.

## Current recording status

The one-prompt build is proven by the dry-run.

It creates a standalone `sero.app` package in `release-checklist-plugin/`.

The App Store has a visible **Install from folder** action.

That action opens a folder picker and installs the selected package.

The installed panel opens inside Sero and generates a real report.

This path was verified by hand from end to end.

The recording is automated by
[`apps/desktop/e2e/flagship-demo.agent.spec.ts`](../../../apps/desktop/e2e/flagship-demo.agent.spec.ts).

### What the video may claim

The video may show and claim these steps:

1. One prompt describes the plugin.
2. Sero builds the plugin.
3. A person installs it from its folder.
4. The panel opens inside Sero.
5. `Generate report` produces a real report.

### What the video must not claim

Do not claim an approval gate.

Sero has no documented setting that forces an approval card before writes or
commands.

No repeatable approval prompt was observed during these runs.

Do not call the installation one click. The person selects the folder.

## Timing note for the recording

The build turn is minutes, not seconds.

If the recording is sped up, label the timelapse with the real duration.
