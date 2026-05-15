# Changelog

All notable changes to Sero will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and alpha release tags use a SemVer prerelease form.

## Unreleased

### Changed
- Desktop builds now use stock Electron 33.4.11. Sero no longer ships the
  Castlabs Electron fork, Widevine/VMP signing support, or the DRM-dependent
  Spotify playback path. The external Spotify plugin documentation should be
  updated separately if maintained outside this repository.

### Added
- OSS alpha governance files (`LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, issue templates, PR template, `CODEOWNERS`)
- public `README.md` with source-only alpha positioning
- root `pnpm test` and `pnpm test:ci` command surface
- `apps/docs-site/` RSPress docs-platform skeleton and alpha IA pages
- PR-gate workflow alignment to the root `pnpm test:ci` entrypoint
- OSS hygiene scan artifacts and release coordination notes under
  `.pi/plans/2026-04-22-oss-release/`

### Notes
- Until the first tagged OSS alpha release, this changelog primarily tracks
  public-release preparation work.
