<!-- DRAFT — for the maintainer to review and paste into the GitHub release by hand. This loop never edits the release itself. -->

# Sero Desktop v0.4.0-beta.0

Sero Desktop v0.4.0-beta.0 makes the app easier to shape around the way people work and speak. The main user-facing change is Caveman mode in onboarding, backed by broader theme customisation, simpler MCP setup, safer workspace setup, and a set of reliability fixes for profiles, plugins, toolchains, and Windows builds.

## What changed

### Personalisation and onboarding

Caveman mode is now available during memory onboarding, with Lite, Full, and Ultra levels.

This matters because users can choose a more direct communication style from the start, without having to hand-edit profile files. Sero stores the preference as a managed User profile field and uses it when building future agent context.

Profile field updates are also safer. Managed memory and profile updates now preserve existing unmatched profile content instead of replacing or dropping it.

### Themes and visual customisation

This release adds shared theme customisation across the desktop app, shared UI package, plugins, templates, docs, and the new styleguide app.

This matters because visual choices can be applied more consistently across Sero instead of being limited to one part of the app. The theme editor also has clearer close behaviour and persisted auto-save, and the Explorer editor now uses the selected theme monospace font.

### Workspace setup and host runtime reliability

Connecting an empty local workspace to an existing remote origin now imports the remote files. If the local workspace is not empty, Sero only connects the origin.

This matters because setting up a workspace from an existing remote should leave users with the project files they expect, while avoiding unwanted imports into non-empty workspaces.

Onboarding now checks core development tools and can install managed host tools for host workspaces. Plugin install, build, dev server, and native dependency repair paths now use the host tool resolver instead of relying on raw PATH lookup.

This matters because setup and plugin workflows should work more reliably in packaged apps, sparse-PATH environments, and host workspaces.

Managed npm toolchains, Windows tool resolution, Windows release builds, and toolchain staging were also hardened.

### MCP setup and developer workflow

The MCP screen is simpler. The always-visible first-run wizard and large summary cards have been removed, starter presets now live in the normal Add server flow, and validation errors are delayed until save.

This matters because MCP setup is less noisy and users can add servers through one clearer path.

This release also adds isolated source-development launch guidance, so source builds and the packaged app do not share profiles, settings, authentication, or plugin paths. Loopback plugin development remotes are now allowed, and invalid IPv6 CSP sources were removed.

### Interface quality, accessibility, and React 19 cleanup

Several React Doctor passes reduced warnings across the app, including reduced-motion handling, direct imports, stable keys, hook cleanup, accessibility labels, explicit button types, async parallelisation, and React 19 API updates.

This matters because these changes reduce rough edges and improve maintainability without changing the core product flow.

Web remote image preview now uses a native image lightbox dialog.

### Release and security hardening

Managed host core tool metadata now points to GitHub Release asset URLs instead of downloads.sero.ai, with publication verification and release gates.

Toolchain publication verification now rejects unsafe tar symlinks and hardlinks.

This matters because release assets and managed toolchains are checked more carefully before users depend on them.

## Fixes worth mentioning

- Empty local workspaces now import files when connected to an existing remote origin.
- Managed memory and profile field updates now preserve existing unmatched profile content.
- Plugin host tool paths now resolve more reliably in the packaged app and sparse-PATH environments.
- Managed npm and toolchain archives, Windows tool resolution, and Windows release builds were hardened.
- MCP empty-server and setup states were simplified.

## Upgrading

No breaking changes were found in the release notes, pull request summaries, or commit subjects for this release range.

No manual upgrade action is required for normal users based on the gathered facts.

Users may see Sero check or install managed core development tools during onboarding or setup for host workspaces.

Developers who run source builds beside the packaged app should use the isolated dev launcher documented by this release, so development and packaged app profiles stay separate.
