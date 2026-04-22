# Troubleshooting Coverage Review

Status: Completed
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `apps/docs-site/docs/reference/troubleshooting.md`
- `docs/node-pty-setup.md`
- `docs/guides/native-modules.md`
- `docs/guides/macos-containers.md`

## Goal

Close the OSS alpha checklist item for documenting common troubleshooting flows
in the public docs.

## Gap before this wave

The docs-site troubleshooting page existed, but it was still too thin. It named
native modules and containers as categories, but it did not yet give users a
clear first-pass flow for:
- repair-hook / ABI mismatch failures
- dev launcher startup failures
- container runtime recovery
- understanding when host mode is the wrong runtime for the workflow

## Resolution

Expanded `apps/docs-site/docs/reference/troubleshooting.md` to cover:
- native-module repair commands for `node-pty` and `better-sqlite3`
- canonical startup commands and cleanup steps for stale Vite/Electron processes
- concrete runtime log locations under `/tmp/`
- Apple container CLI verification and recovery steps
- explicit host-mode expectation setting
- a minimal baseline command set to run before filing an issue

## Current assessment

The docs-site now has a practical public troubleshooting page that points users
at the right recovery flow before they file a support issue. It is sufficient to
mark the checklist item complete.
