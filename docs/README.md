# Sero Documentation Model

This file explains where documentation belongs during the OSS alpha effort.

## Public vs internal docs

### Curated public docs surface

The curated public docs surface is:
- `README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `CHANGELOG.md`
- `apps/docs-site/docs/**`

These are the surfaces that should present current, intentional information to
external contributors and early adopters.

### Root `docs/**` during migration

The root `docs/**` tree remains the **source-material pool** and deeper
reference set while migration is in progress.

Some files under `docs/**` are strong canonical references already, especially:
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/plugins/guide.md`
- `docs/plugins/technical.md`
- `docs/security/**`
- `docs/node-pty-setup.md`
- `docs/guides/macos-containers.md`

Other areas under `docs/**` are historical, internal, or transient and should
not be treated as curated public docs by default.

## Internal / transient surfaces

These surfaces are **not** part of the curated public docs set, even if they
remain tracked temporarily during the preserve-before-prune phase:
- `.pi/plans/**`
- `docs/plans/**`
- `docs/superpowers/**`
- `docs/deslopify/**`
- `.claude/**`
- `AGENTS.md`
- `CLAUDE.md`

They may still contain valuable facts, but those facts should be harvested into
canonical docs before any cleanup happens.

## Where durable facts should live

- **architecture decisions / durable policies** → `docs/decisions.md`
- **system layout / boundaries** → `docs/architecture.md`
- **product and feature behavior** → `docs/features/**` and curated docs-site pages
- **plugin guidance** → `docs/plugins/**`
- **security / privacy posture** → `SECURITY.md`, `docs/security/**`, curated docs-site security pages
- **release/process coordination** → `.pi/plans/2026-04-22-oss-release/**` during alpha prep
- **review lineage / cleanup programs** → `docs/deslopify/**`

## Inline API documentation standard

Sero uses an **external-docs-first** model.

That means:
- add minimal TSDoc or inline API documentation for **public/exported APIs**
  where readers truly need it
- prefer external docs for guides, workflows, architecture, and concepts
- do not add broad inline prose requirements to internal implementation files
- do not inflate source files with large comment blocks just to satisfy docs
  goals

## File size rule still applies

The repo's 500 LOC source-file rule still applies.
Documentation work should not pressure implementation files to accumulate large
inline narratives when the better destination is external docs.

## Preserve before prune

Do not blindly delete or move transient/internal docs.
Use the OSS release plan artifacts under `.pi/plans/2026-04-22-oss-release/`
first, especially:
- `decision-log.md`
- `migration-map.md`
- `checklist.md`
