# OSS-0105 Legal / License / Distribution Audit

## Executive summary
- The repo currently has **no top-level LICENSE / NOTICE / THIRD_PARTY_NOTICES file**; public OSS release work is not yet license-complete.
- The project posture is **macOS-first, Apple Silicon-only, Electron desktop app** with a **strongly recommended container runtime** but a documented **host-mode fallback**.
- Distribution scripts already assume **local DMG/ZIP builds**, optional **code signing**, and optional **notarization inputs** via `electron-builder` and `build-release.sh`.
- The app ships with **castlabs Electron** (`electron-releases#v33.4.11+wvcus`) and a separate **Widevine VMP signing** step; that is a notable binary-distribution caveat.
- Spotify support is hard-coded into CSP and release scripts, so any public OSS narrative should avoid implying “fully open redistribution of DRM-enabled binaries” without checking castlabs/Widevine terms.
- The repo already includes `.github/workflows/test.yml`, but I found **no community governance surfaces** such as CODE_OF_CONDUCT / CONTRIBUTING / SECURITY / support policy files.
- Plugin docs already describe **npm bundle** and **git/local source** plugin distribution, plus a `preBuilt` flag and `sero.providers` metadata; those docs imply a fairly explicit plugin distribution contract.
- Because this is a discovery-only lane, the key output is a **practical decision memo**: choose a permissive license, add OSS governance files, and separate source licensing from third-party binary constraints.

## Scope covered
- Root repo metadata and package manifests
- Desktop build/release docs and scripts
- Electron build config and signing/VMP notes
- Plugin distribution/technical docs
- GitHub workflow surface
- References to Spotify / Widevine / castlabs / notarization / packaging
- Presence/absence of license and notices artifacts in repo root and top-level tree

## License and governance options table
| topic | options / findings | recommendation | notes |
|---|---|---|---|
| Project source license | No LICENSE file found at repo root; code appears unpublished from a licensing standpoint. | Pick a permissive OSS license before public alpha, preferably **Apache-2.0**. | Apache-2.0 gives a patent grant and is usually safer for an agent/tooling platform than MIT alone. If the team wants maximum simplicity, MIT is viable, but patent coverage is weaker. |
| Trademark / branding | No trademark policy found. Repo/product name “Sero” is used in app title, docs, and packaging. | Add a short trademark/branding note later. | Not legal counsel, but OSS launch should avoid implying trademark rights are granted with source code rights. |
| Contributor governance | No CONTRIBUTING, CODE_OF_CONDUCT, or SECURITY policy files found at root/.github. | Add standard OSS governance files before wider public launch. | For public alpha, at minimum: contribution guide, code of conduct, security contact/reporting path, and issue/PR templates if desired. |
| Patent / redistribution risk | Castlabs Electron and DRM-related functionality increase release complexity. | Keep core source license separate from binary release terms and third-party notices. | Source can be OSS-licensed even if some shipping binaries are controlled by third-party licenses or build prerequisites. |
| Plugin ecosystem licensing | Plugin docs allow npm bundle, git source, and local installs; plugins can ship code, prompts, skills, and UI remotes. | Require each plugin distribution to carry its own license/notice artifacts. | Especially important if you publish plugins independently or accept third-party plugins in a registry. |
| Third-party code in repo | Templates already contain Apache/MIT example licenses; no top-level aggregated notice file exists. | Add a generated THIRD_PARTY_NOTICES / NOTICE strategy for released artifacts. | The repo contains many dependencies and bundled assets; notice aggregation should be packaging-aware, not just source-tree-based. |

## Distribution and third-party constraints table
| surface | constraint / question | impact on alpha | recommended later action |
|---|---|---|---|
| `apps/desktop/package.json` | Uses `electron: github:castlabs/electron-releases#v33.4.11+wvcus`. | Binary distribution may depend on castlabs terms and availability; not a plain stock Electron story. | Confirm redistribution rights, attribution requirements, and whether the chosen OSS license needs extra binary notices. |
| `apps/desktop/scripts/sign-vmp.sh` | Requires `castlabs-evs` / `evs-vmp` to VMP-sign the Electron binary for Widevine DRM. | DRM playback likely fails without VMP signing; release pipeline is not fully self-contained. | Decide whether public alpha ships with DRM support, is “best effort,” or omits Spotify/DRM from promises entirely. |
| `apps/desktop/scripts/build-release.sh` | Release build supports unsigned and signed outputs; notes `CSC_LINK`, `CSC_KEY_PASSWORD`, Apple ID/notarization env vars. | Public alpha can ship unsigned local builds, but consumer-facing distribution will need signing/notarization guidance. | Document the exact supported release posture: local dev build, signed developer build, notarized release build. |
| `apps/desktop/electron-builder.yml` | macOS target is DMG + ZIP, arm64 only, hardened runtime enabled, `gatekeeperAssess: false`. | Distribution is macOS-specific and Apple Silicon-only; not a cross-platform OSS desktop story. | State platform support explicitly in OSS README/release docs. |
| `docs/sero.md` / `docs/guides/macos-containers.md` | Containers are strongly recommended but host mode is supported fallback. | Open-source readers may assume containers are mandatory; they are not. | Clarify container requirement vs. reduced host mode in release notes and alpha FAQ. |
| `docs/plugins/guide.md` / `technical.md` | Plugins are installed from npm/git/local source; git/local installs may execute build code. | Plugin install docs already warn about trust boundaries; public alpha must surface this risk clearly. | Keep trust warning prominent; consider a “only install from trusted repos” note in release-facing docs. |
| `docs/plugins/guide.md` | Plugin bundles may include `dist/ui`, `extension`, `shared`, prompts, and skills. | Third-party plugin distribution may need its own per-plugin license/notice set. | Define a plugin packaging requirement: every distributable plugin includes license + third-party notices if needed. |
| `.github/workflows/test.yml` | CI exists for test/typecheck/build only. | No release governance or signed artifact automation is visible. | Add separate release workflow later if public artifacts are intended. |
| Root tree / `.github` | No CODE_OF_CONDUCT, SECURITY, CONTRIBUTING, support policy, or issue templates found. | Public OSS alpha will feel incomplete without community surfaces. | Add minimal governance set before opening broader contributions. |
| Bundled assets / dependencies | Release bundle includes Electron, node-pty, better-sqlite3, Pi SDK packages, Discord.js, Google GenAI, Spotify-related assets. | Redistribution obligations may vary by dependency and bundled binary. | Generate a packaging-time notices file and verify dependency licenses before public release. |

## `NOTICE` / third-party notices recommendation
- Create a release-time **NOTICE** or **THIRD_PARTY_NOTICES** artifact for packaged outputs, not just source tree docs.
- Include at least:
  - project copyright/license statement
  - castlabs Electron attribution / redistribution terms if required
  - any dependency notices required by bundled runtime components
  - explicit mention of third-party trademarks/services integrated at runtime (Spotify, Google, etc.) if product docs promise them
- For the source repo itself, a top-level **LICENSE** plus a short **NOTICE** is enough to start; for packaged apps, generate a fuller third-party notices file from the actual artifact graph.

## Recommended alpha distribution posture
- Ship the alpha as **source-available OSS with macOS-only binary releases**.
- Promise **local DMG/ZIP builds** and, if ready, **signed/notarized release builds**; do **not** overpromise DRM/Spotify support until castlabs/VMP/legal checks are complete.
- Position containers as **recommended for the full experience**, with **host mode supported** for reduced functionality.
- Keep plugin distribution as **trusted-source only** for alpha; third-party plugin publishing should wait until license/notice conventions are standardized.
- Prefer a conservative public statement: “core source is OSS; binaries may depend on third-party components and platform-specific signing/DRM requirements.”

## Recommended G1 decisions
1. **Select the project license**: Apache-2.0 recommended; MIT only if the team explicitly wants minimal text and accepts weaker patent coverage.
2. **Add governance files**: LICENSE, NOTICE/THIRD_PARTY_NOTICES strategy, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY policy.
3. **Define binary-release boundaries**: signed vs unsigned, notarized vs local, and whether DRM/Spotify is in scope for public alpha.
4. **Confirm castlabs/Widevine obligations**: redistribution rights, attribution, and any required user-facing disclaimers.
5. **Standardize plugin release requirements**: each distributable plugin needs clear license/notice metadata.
6. **Document platform support clearly**: macOS arm64, container recommended, host mode fallback.

## Blockers / open questions
- What exact license should cover the repo source: Apache-2.0, MIT, or something more restrictive?
- Are castlabs Electron and Widevine-supported binaries allowed to be redistributed in the intended public alpha form?
- Do you want OSS source release and binary release to be coupled, or can the alpha be source-first with limited binaries?
- Should Spotify/DRM support be treated as a beta-capability with no release guarantee?
- Will third-party plugins be accepted/published in the OSS alpha, and if so what license/notice minimums are required?
- Who owns trademark/brand guidance for “Sero” and any logo/wordmark usage?
