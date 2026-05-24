# Changelog

All notable changes to Sero will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and beta release tags use a SemVer prerelease form.

## Unreleased

### Changed
- Public documentation now describes Sero as a public beta desktop release with
  packaged installers for supported targets, while keeping source builds as the
  developer/contributor path and preserving beta support caveats.
- Desktop builds now use stock Electron 41.6.1. Native modules are rebuilt for
  Electron ABI 145 so packaged terminals (`node-pty`) and local SQLite-backed
  features (`better-sqlite3`) keep working. Sero no longer ships the Castlabs
  Electron fork, Widevine/VMP signing support, or the DRM-dependent Spotify
  playback path.

### Added
- Public beta governance files (`LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, issue templates, PR template, `CODEOWNERS`)
- public `README.md` with beta release positioning
- root `pnpm test` and `pnpm test:ci` command surface
- `apps/docs-site/` RSPress docs-platform skeleton and beta IA pages
- PR-gate workflow alignment to the root `pnpm test:ci` entrypoint
- OSS hygiene scan and release coordination process for public beta readiness

### Notes
- During beta, exact installer filenames may change between releases. Use
  GitHub Releases as the source of truth for current desktop artifacts.
