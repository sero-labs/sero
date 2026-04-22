# Launch Copy & Links Review

Date: 2026-04-22
Branch: `feat/release-prep`

## Scope

Tighten the final public-facing launch surface after the screenshot wave by
making the key support/contribution/security paths easier to reach from the
published docs and README.

## Changes made

### README

Updated the public support surface bullets to use direct GitHub links:
- issue entry: `https://github.com/monobyte/sero/issues/new/choose`
- pull request list: `https://github.com/monobyte/sero/pulls`

### Docs-site homepage

Added a small **Start here** section to `apps/docs-site/docs/index.md` linking
readers directly to:
- Getting Started
- Support Scope
- Architecture
- Contributing
- Security Policy
- Open an Issue

### Docs-site deep-link cleanup

Converted previously non-clickable root/source-material references into actual
GitHub links in these pages:
- `apps/docs-site/docs/guide/overview.md`
- `apps/docs-site/docs/guide/development-setup.md`
- `apps/docs-site/docs/reference/architecture.md`
- `apps/docs-site/docs/reference/plugins.md`
- `apps/docs-site/docs/reference/testing-evals.md`
- `apps/docs-site/docs/reference/plugin-quickstart.md`
- `apps/docs-site/docs/reference/troubleshooting.md`
- `apps/docs-site/docs/reference/security-privacy.md`

## Why this was needed

The alpha copy was already mostly ready, but several docs-site pages still
mentioned repo-root files and source-material docs as plain code spans rather
than links. That made the deployed docs more self-contained in wording than in
navigation.

This pass keeps the launch surface narrow while making the public journey more
usable:
- discover product → docs home
- confirm support scope → support page
- learn setup → getting started / development setup
- report problems → issue entry
- understand contribution/security policy → root OSS files

## Validation

- `pnpm --filter @sero/docs-site build` ✅
- `pnpm typecheck` ✅

## Result

For the current alpha scope, launch copy and links are now in a reasonable
public-ready state.
