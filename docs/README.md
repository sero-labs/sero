# Sero Documentation Model

This file explains where documentation belongs during the public beta docs effort.

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
reference set while public docs are curated and kept in sync with beta release
facts.

Some files under `docs/**` are strong canonical references already, especially:
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/reference/state-and-folders.md`
- `docs/plugins/guide.md`
- `docs/plugins/quickstart.md`
- `docs/plugins/technical.md`
- `docs/security/**`
- `docs/node-pty-setup.md`
- `docs/guides/macos-containers.md`

Other areas under `docs/**` are historical, internal, or transient and should
not be treated as curated public docs by default.

## Internal / transient surfaces

These surfaces are **not** part of the curated public docs set:
- `.pi/plans/**`
- `docs/plans/**`
- `docs/superpowers/**`
- `docs/deslopify/**`
- `AGENTS.md` (temporarily retained because current Pi CLI sessions still rely
  on it)

Legacy maintainer/agent scaffolding should stay out of curated docs. The
remaining internal or transient surfaces may still contain valuable facts, but
those facts should be harvested into canonical docs before any cleanup happens.

## Where durable facts should live

- **architecture decisions / durable policies** → `docs/decisions.md`
- **system layout / boundaries** → `docs/architecture.md`
- **product and feature behavior** → `docs/features/**` and curated docs-site pages
- **plugin guidance** → `docs/plugins/**`
- **security / privacy posture** → `SECURITY.md`, `docs/security/**`, curated docs-site security pages
- **release/process coordination** → local planning artifacts under `.pi/plans/**`; harvest durable facts into curated docs before linking publicly
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
Use current planning artifacts as source material only. Durable facts should be
moved into curated public docs or stable root references before pruning.
