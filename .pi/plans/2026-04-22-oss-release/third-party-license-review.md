# Third-Party Dependency License Review

Status: Completed
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/slices/05-legal-license-distribution-audit.md`
- `LICENSE`
- `NOTICE`

## Goal

Close the OSS alpha checklist item for reviewing third-party dependency
licenses with a narrow, evidence-backed inventory pass.

## Scope and method

Reviewed:
- root and workspace `package.json` manifests
- installed dependency graph via `pnpm licenses list --json`
- production dependency graph via `pnpm licenses list --json --prod`
- manual spot checks for dependencies reported as `Unknown`

Generated local artifacts:
- `/tmp/sero-licenses.json`
- `/tmp/sero-licenses-prod.json`

These raw JSON reports were not committed because they are large and are better
suited as ephemeral audit artifacts than repo documentation.

## Workspace manifest finding

Current repo state:
- repo root is Apache-2.0 licensed via the top-level `LICENSE`
- workspace `package.json` files currently do **not** declare their own
  `license` field

This is worth cleaning up later for package-level clarity, but it does not block
this source-only alpha review because the repo-level source license is already
present and explicit.

## Installed graph summary

### All installed dependencies

`pnpm licenses list --json`
- packages inventoried: `1792`
- distinct license expressions: `28`

Top license buckets:
- `MIT`: `1406`
- `Apache-2.0`: `167`
- `ISC`: `115`
- `BSD-3-Clause`: `37`
- `BSD-2-Clause`: `27`
- `BlueOak-1.0.0`: `13`

### Production dependency graph

`pnpm licenses list --json --prod`
- packages inventoried: `1094`
- distinct license expressions: `21`

Top license buckets:
- `MIT`: `821`
- `Apache-2.0`: `122`
- `ISC`: `74`
- `BSD-3-Clause`: `29`
- `BSD-2-Clause`: `18`
- `BlueOak-1.0.0`: `12`

## Risk screening result

### Good news

No `GPL`, `AGPL`, or `LGPL` license expressions were reported in the audited
installed graphs.

That means this alpha review did **not** uncover an obvious copyleft blocker in
current dependencies.

### Notable non-default / custom / ambiguous entries in the production graph

These are the main entries worth recording for later packaging/notices work:
- `@remixicon/react` → `Remix Icon License 1.0`
- `caniuse-lite` → `CC-BY-4.0`
- `highlightjs-vue` → `CC0-1.0`
- `dompurify` → `MPL-2.0 OR Apache-2.0`
- several dual-license expressions such as:
  - `MIT OR Apache`
  - `MIT OR Apache-2.0`
  - `Apache-2.0 AND BSD-3-Clause`
  - `BSD-2-Clause OR MIT OR Apache-2.0`

These are not immediate blockers for the current source-only alpha, but they
should be reflected in any future packaging-time notices generation.

## Manual clarification for `Unknown` entries

`pnpm licenses` reported two production dependencies as `Unknown`:
- `@mistralai/mistralai@1.14.1`
- `khroma@2.1.0`

Manual inspection of the installed package contents showed:
- `@mistralai/mistralai@1.14.1` includes an Apache-2.0 license file
- `khroma@2.1.0` includes an MIT license file

So the `Unknown` labels appear to be metadata-reporting gaps rather than actual
missing license texts.

## Current assessment

This review is sufficient to mark the checklist item complete:
- third-party dependency licenses have been reviewed for the current source-only
  OSS alpha posture

Current conclusion:
- **no obvious blocker** was found for the source-only alpha based on dependency
  license shape
- repo-level `LICENSE` + `NOTICE` remain sufficient for the current source-only
  release posture
- a fuller `THIRD_PARTY_NOTICES` artifact is still best deferred to the binary /
  packaging phase, where it can be generated from the actual shipped artifact
  graph instead of the raw development dependency graph

## Follow-ups to keep in mind

Later, but not required to close this review:
1. add explicit `license` fields to workspace `package.json` files
2. define a packaging-time `THIRD_PARTY_NOTICES` generation workflow if public
   binaries are ever shipped
3. carry forward the custom-license and dual-license entries above into that
   packaging review
