# Repo hygiene report — sero-labs/sero

Task 1.6 of the growth campaign. Draft-only pass on branch `feat/sero-marketing-strategy`; nothing pushed, nothing changed on GitHub.

## What already existed (no action needed)

| Item | Status |
| --- | --- |
| `LICENSE` (repo root) | Apache-2.0, full text. GitHub API confirms `license: Apache-2.0` detected. |
| `NOTICE` | Present. |
| `CONTRIBUTING.md` | Present and strong: dev setup (`pnpm install` / `dev` / `build` / `typecheck`), typecheck-before-PR rule, Conventional Commits, plugin guide link, support scope, security pointer. Left as-is. |
| `SECURITY.md` | Present. Supported-versions matrix, private reporting channels, beta targets. |
| `CODE_OF_CONDUCT.md` | Present (128 lines). |
| `.github/ISSUE_TEMPLATE/` | Already had `bug-report.yml`, `feature-request.yml`, `support-question.yml`, `config.yml` (YAML forms). |
| `.github/pull_request_template.md`, `CODEOWNERS` | Present. |
| CI | `.github/workflows/test.yml` — "Test" workflow, runs on push/PR to `main`, typecheck + tests via Turbo. Meaningful badge target. |
| GitHub Discussions | Enabled (`has_discussions: true` via read-only API check). |

## What I changed (working tree only)

1. `.github/ISSUE_TEMPLATE/bug-report.yml`
   - Added a **Model provider** input (Anthropic / OpenAI / local OpenAI-compatible server).
   - Added the logs location hint: logs live in `~/.sero-ui/logs/`.
   - Fixed stale copy: platform field said "alpha, macOS Apple Silicon only" — now matches the beta support matrix (macOS AS, Linux x64/arm64, Windows x64).
   - Renamed version field to "Sero version or commit".
2. `.github/ISSUE_TEMPLATE/support-question.yml`
   - Fixed stale "OSS alpha" wording to "public beta".
   - Added the `~/.sero-ui/logs/` hint to the extra-context field.
3. `.github/ISSUE_TEMPLATE/config.yml`
   - Added a **GitHub Discussions** contact link (Discussions is confirmed enabled).
   - Flipped `blank_issues_enabled` from `false` to `true` per the campaign spec (lower friction for drive-by reporters during launch). **Deliberate change from the previous choice — revert this one line if the team prefers forcing templates.**

All four templates re-validated as parseable YAML.

## CI badge line for the README owner

Do not add this yourself if you are not the README owner — paste-ready line:

```markdown
[![Test](https://github.com/sero-labs/sero/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/sero-labs/sero/actions/workflows/test.yml)
```

## Recommendations (not done, out of scope)

- **CONTRIBUTING.md vs Discussions**: CONTRIBUTING says support is "Issues and Pull Requests" only, but Discussions is enabled and now linked from the issue chooser. Decide the channel story once and align both (and the growth strategy's Discord plans).
- **Discord**: the growth strategy references Discord posts, but no Discord invite URL exists anywhere in the repo. Do not link one until it exists; when it does, add it to `config.yml` contact links and CONTRIBUTING.
- **Support-question template overlap**: with Discussions enabled, consider retiring `support-question.yml` and routing setup questions to Discussions Q&A to keep the issue tracker signal-heavy.
- **SECURITY.md** mentions private vulnerability reporting "if enabled for the repository" — verify it actually is enabled in repo settings before launch.
- Repo About description/topics (strategy "Current conversion leaks" item 1) are a GitHub-settings change, not a repo file — handled outside this task.
