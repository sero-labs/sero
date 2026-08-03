# Design Library first-release acceptance

**Date:** 2026-07-30

**Branch:** `feat/design-library-export-hardening`

**Result:** Pass

## Automated acceptance

- Plugin tests: 79 files and 721 tests passed.
- Plugin typecheck passed for UI, extension and runtime.
- Production UI build passed.
- Installable package build passed.
- Gallery export tests cover snapshot integrity, exact source copies, artwork, bundled fonts, effective Tweaks, metadata, both destinations, idempotent replay and standalone HTML and React.
- Reduced-motion tests cover preview and standalone document assembly. Prompt tests cover JavaScript motion.
- Request tests cover successful export, useful failure state and refusal of an unregistered workspace path.

## Manual acceptance

Test profile: `orchestratordemo`

Active workspace: `orchestrator-demo-1`

| Check | Result |
| --- | --- |
| Library loads existing references and analysis | Pass |
| Design surface loads existing generated work and preview | Pass |
| Gallery loads immutable families and PNG previews | Pass |
| Selected Gallery version exports to Downloads | Pass |
| Selected Gallery version exports to the active workspace root | Pass |
| Export includes exact source, artwork, selected Space Grotesk font, effective Tweaks and metadata | Pass |
| Exported `index.html` runs directly from `file://` with its local artwork | Pass |
| Exported page contains no Sero preview or Tweaks message runtime | Pass |
| Installable package installs through Sero as an external plugin | Pass |
| Installed external UI and runtime load existing profile data | Pass |
| Installed external plugin exports to the active workspace | Pass |
| External plugin uninstalls and the built-in source registration restores cleanly | Pass |

The external-install pass first caught a stale package built before the active-workspace fix. The package was rebuilt and the full install and export pass then succeeded. This proves the release package, not only the source checkout.

## Current storage model

The first-release entity summaries moved out of `state.json` in schema version 2. Items, Designs, Gallery families, jobs and exports now have compact `index.json` files beside their complete per-entity records. `state.json` contains only bounded settings, preferences, collections, revision data and the transient request queue.

An existing profile migrates automatically. Sero builds indexes from authoritative records, creates records for legacy exports, and keeps `state.json.pre-index-backup` before it writes version 2 control state. Media, generated files and Gallery snapshot paths do not move.
