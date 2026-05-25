# Changelog

All notable changes to Sero will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and beta release tags use a SemVer prerelease form.


## [0.1.2-beta.0](https://github.com/sero-labs/sero/compare/v0.1.1-beta...v0.1.2-beta.0) (2026-05-25)

### Bug Fixes

* **desktop:** skip source app watchers in packaged builds ([#188](https://github.com/sero-labs/sero/issues/188)) ([bae61e5](https://github.com/sero-labs/sero/commit/bae61e5a5ed73d1e505bb0594f74cd6c6c4fc606))
* **memory:** keep system prompt stable across turns for prompt caching ([#184](https://github.com/sero-labs/sero/issues/184)) ([0187ee7](https://github.com/sero-labs/sero/commit/0187ee704698006418610bfaf16a2b1f2ac8f936))

### Documentation

* align root beta governance docs ([3621275](https://github.com/sero-labs/sero/commit/362127549ecde5a9fb1e971e406d864e42dce07a))
* minor AGENT.md update about copy rules ([3d22b69](https://github.com/sero-labs/sero/commit/3d22b699518f7fe3858ce09584b76860f46512c5))
* minor copy changes ([cd19a40](https://github.com/sero-labs/sero/commit/cd19a403dfce4d9adc684e2ab7d9be35e65504b8))
* update public beta release messaging ([abb7afd](https://github.com/sero-labs/sero/commit/abb7afdfdb5ec6620e28d305bb32155f1f1c7041))

<!-- New release entries are prepended above this line by `pnpm release` -->

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
