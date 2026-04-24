# Public Docs Secret-Handling Review

Status: Completed
Date: 2026-04-22
Related:
- `.pi/plans/2026-04-22-oss-release/checklist.md`
- `.pi/plans/2026-04-22-oss-release/hygiene-scan.md`
- `docs/security/gateway.md`
- `apps/docs-site/docs/reference/security-privacy.md`

## Goal

Close the remaining OSS alpha checklist items for:
- sanitized public examples / config samples
- public docs not encouraging unsafe handling of secrets

## Review scope

Reviewed public-facing docs and examples including:
- `README.md`
- `docs/README.md`
- `docs/reference/state-and-folders.md`
- `docs/plugins/guide.md`
- `docs/plugins/quickstart.md`
- `docs/security/gateway.md`
- `apps/docs-site/docs/**` security / getting-started / plugin pages
- selected public plugin READMEs used as examples

## Findings

### Resolved in this wave

1. `docs/security/gateway.md` framed `?token=<token>` as a convenience path for
   web chat authentication.
2. `docs/security/gateway.md` modeled direct token-file reads in public
   verification examples.

## Resolution

`docs/security/gateway.md` was updated to:
- treat URL-token web chat auth as legacy / discouraged
- prefer the login prompt for browser access
- use a hidden shell prompt plus ephemeral `GATEWAY_TOKEN` env var for CLI
  verification examples
- explicitly tell users not to print tokens, store them in shell history, or
  share token URLs

## Current assessment

- No live secrets or credential values were found in the reviewed public docs.
- Public examples are now sanitized to use placeholders and ephemeral env-var
  handling rather than normalizing direct secret-file access.
- Public docs now consistently present gateway credentials as high-privilege
  secrets that should not be embedded in URLs, screenshots, issues, or logs.

## Caveat

This review covered the curated/public docs surface relevant to the alpha wave.
It did not attempt to sanitize every internal/transient planning document under
`.pi/plans/**`, `docs/plans/**`, or `docs/superpowers/**`, which remain under
preserve-before-prune handling.
