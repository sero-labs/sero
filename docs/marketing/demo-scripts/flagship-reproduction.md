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

The full claim is not ready to record.

The dry-run installs that folder with the private automation call
`window.sero.plugins.install(path)`.

That call is not a person-facing Sero control.

The App Store currently has no verified **Install from folder** action.

The dry-run also received zero approval prompts.

There is no documented Sero setting that forces an approval card before writes
or commands.

Do not claim that the plugin was installed, opened, or approved on camera.

The current video script is in
[restart-checklist.md](../restart-checklist.md).

The full flagship recording needs both of these product capabilities:

1. A visible **Install from folder** action.
2. A repeatable user-controlled approval gate.

## Timing note for the recording

The build turn is minutes, not seconds.

If the recording is sped up, label the timelapse with the real duration.
