## Why

Sero pins `pnpm@10.34.5`. pnpm 11 and later ignore the `pnpm` field in the root
`package.json`, so a contributor or CI job that runs a newer pnpm silently drops
Sero's eleven security overrides and fails frozen installs. pnpm 12 is the
current major release. One direct migration from v10 to v12 removes the risk and
keeps the repository on a supported line (issue #490).

## What Changes

- Contributors: replace the exact root `packageManager` pin with a pnpm 12
  version range (`>=12.0.0 <13.0.0`) given as guidance. Any pnpm 12 release can
  install the repository, and the lockfile stays the same whichever 12.x
  release wrote it. pnpm does not enforce the range.
- Packaged runtime tools: pin one exact, stable pnpm 12 release that has passed
  Sero's seven-day observation window in
  `apps/desktop/runtime-tools/package.json`, its npm lockfile, and `pins.json`.
- CI: install that same exact packaged version, so CI stays reproducible. The
  pin validator checks that every CI pnpm setup step matches `pins.json`. It no
  longer requires a root `packageManager` field.
- Move the root `pnpm.overrides` block into `pnpm-workspace.yaml` unchanged.
  Remove the `pnpm` field from the root `package.json`.
- Replace `onlyBuiltDependencies` with `allowBuilds`. Allow the same five build
  dependencies (`bun`, `electron`, `esbuild`, `node-pty`, `sharp`). Explicitly
  deny the eighteen dependencies whose build scripts pnpm 10 skips today,
  because pnpm 12 fails an install when a build script has no decision.
- Release packaging: rename the `NPM_CONFIG_*` variables passed to
  `pnpm deploy` to `pnpm_config_*`. pnpm 12 no longer reads `npm_config_*`.
- Regenerate `pnpm-lock.yaml` with the new version. Accept only format and
  pnpm-driven changes, not dependency upgrades.
- Move every CI workflow to `pnpm/action-setup` v6.1.0, the first release that
  supports pnpm 12, with an explicit exact `version`.
- `sero-node` image: pnpm 12 is a native program in a per-platform package.
  Link the container's `pnpm` command to that native binary, which the npm
  lockfile installs with a checked integrity. Rebuild the image and recreate
  affected workspace containers.
- Update contributor docs (README, docs-site development setup and
  installation requirements) to state pnpm 12.
- **BREAKING** for contributors: use pnpm 12. Older pnpm releases are not
  blocked, but they are not supported. The security overrides still apply on
  them.
- **BREAKING** for container workspaces: the `sero-node` image ships pnpm 12
  instead of pnpm 10. A user project that keeps settings in its own
  `package.json#pnpm` field, without a pnpm pin, loses those settings inside the
  container.

## Capabilities

### New Capabilities

- `package-manager-pin`: the pnpm 12 range contributors may use, the one exact
  pnpm version that CI and the packaged runtime tools share, and what a clean
  frozen install must guarantee (security overrides applied, every build script
  decided, approved builds run, no unrecognized settings).

### Modified Capabilities

None.

## Impact

- Root config: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`.
- Runtime tools: `apps/desktop/runtime-tools/{package.json,package-lock.json,pins.json}`,
  the pin validator and updater in
  `apps/desktop/scripts/runtime-tools/update-runtime-tools.mjs` and its test,
  and the `sero-node` image built from `apps/desktop/images/Dockerfile.sero-node`.
- Release: `apps/desktop/scripts/build-release.sh` (deploy bundle step).
- CI: the 14 `pnpm/action-setup` steps in seven workflows under
  `.github/workflows/`, and the smoke test and changed-file list in
  `runtime-tool-updates.yml`.
- Docs: `README.md`, `apps/docs-site/docs/guide/development-setup.md`,
  `apps/docs-site/docs/guide/installation-requirements.md`.
- Not affected: the published managed host toolchain artifacts
  (`generated-artifacts.json`), which stay unchanged until a separate rebuild,
  and the scripts that read `node_modules/.pnpm` (pnpm 12 keeps that layout).
- Non-goals: unrelated dependency upgrades, dropping any security override,
  switching CI to `pnpm/setup`, and changing a contributor's global pnpm.
