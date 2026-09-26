## 1. Pin validator and updater

- [x] 1.1 In `update-runtime-tools.mjs`, replace the root `packageManager` check in `validateRuntimePins` with a check that every `pnpm/action-setup` step in `.github/workflows/*.yml` has a `version` equal to `pins.npm.pnpm.version`, and name the file and mismatch in the error. Keep the file at or below 500 LOC. Verify: the existing "validates exact package integrities" test still runs against the real repo.
- [x] 1.2 In `applyNpmUpdates`, rewrite those workflow `version` values instead of root `packageManager` when pnpm changes. Verify: a dry `--write --only pnpm` run on a scratch copy changes only runtime-tools files and workflow `version` lines.
- [x] 1.3 Add one case to `update-runtime-tools.test.ts`: a workflow whose pnpm `version` differs from `pins.json` fails validation. Verify: `pnpm --filter @sero/desktop exec vitest run electron/__tests__/scripts/runtime-tools/update-runtime-tools.test.ts` passes.
- [x] 1.4 In `runtime-tool-updates.yml`, stage `.github/workflows` instead of only `browser-pack-artifacts.yml`, and change the smoke test to run `node_modules/@pnpm/exe.linux-<runner arch>/pnpm --version`. Verify: `actionlint` (or a YAML parse) passes on the file.

## 2. Packaged pnpm version

- [x] 2.1 Choose the newest stable pnpm 12 release that is at least seven days old on the day of implementation (12.5.1 on 2026-09-26). Verify: `npm view pnpm time --json` shows the release date.
- [x] 2.2 Run `node apps/desktop/scripts/runtime-tools/update-runtime-tools.mjs --write --breaking --only pnpm` (or set the version by hand if the updater refuses the major step) to update `runtime-tools/package.json`, `package-lock.json` and `pins.json`. Verify: `package-lock.json` contains `node_modules/@pnpm/exe.linux-x64` and `node_modules/@pnpm/exe.linux-arm64` at the same version, and the validator passes except for workflows not yet updated.

## 3. Root configuration

- [x] 3.1 In root `package.json`, remove `packageManager` and the `pnpm` field, and add `devEngines.packageManager` `{ "name": "pnpm", "version": ">=12.0.0 <13.0.0", "onFail": "ignore" }`. Verify: `jq` shows no `pnpm` or `packageManager` key.
- [x] 3.2 In `pnpm-workspace.yaml`, add `overrides` with the 11 entries copied unchanged, and replace `onlyBuiltDependencies` with `allowBuilds`: the 5 approved packages `true`, the 18 packages listed in design.md `false`. Verify: `pnpm config list` under pnpm 12 prints no unrecognized-setting warning.
- [x] 3.3 With the pinned pnpm 12, run `pnpm install` and review the `pnpm-lock.yaml` diff. Reject any package version change; allow only pnpm-format changes. Verify: the diff has no `packageManagerDependencies` and no changed `version:` of a package.
- [x] 3.4 From a clean clone, run `pnpm install --frozen-lockfile` with the pinned pnpm 12. Verify: exit 0, and no unreviewed-build, ignored-setting or unrecognized-setting output; `node_modules/.pnpm/node-pty@*` and `electron` are built; `pnpm dev` starts the desktop app with a working terminal.
- [x] 3.5 Check every override in the resolved graph. Verify: for each override name, `pnpm why -r <name>` (or a lockfile search) shows only versions the override allows.
- [x] 3.6 With a second pnpm 12 release (for example 12.6.0), run `pnpm install --frozen-lockfile`. Verify: it succeeds with that release and `git diff --exit-code pnpm-lock.yaml` passes.

## 4. Release packaging

- [x] 4.1 In `build-release.sh`, rename `NPM_CONFIG_NODE_LINKER` to `pnpm_config_node_linker` and `NPM_CONFIG_INJECT_WORKSPACE_PACKAGES` to `pnpm_config_inject_workspace_packages`, and update the comment that cites pnpm v10. Verify: a local release build creates the deploy bundle, `partial-json` sits at `<deploy>/node_modules/partial-json`, and the packaged app starts.

## 5. CI workflows

- [x] 5.1 Move all 14 `pnpm/action-setup` steps to v6.1.0 (tag `@v6.1.0`, or `@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0` where the file pins SHAs) and add `version: <pins.json version>`. Verify: the pin validator passes on the repo.
- [ ] 5.2 Push the branch as a draft PR. Verify: Test, E2E contract, and E2E workflow jobs pass with `pnpm install --frozen-lockfile`, and the job logs print the pinned pnpm version.
- [ ] 5.3 Run the release workflow's build path (or `pnpm release:beta:dry` plus the release job on a test tag if the owner approves). Verify: the release build and packaging steps pass.

## 6. sero-node image

- [x] 6.1 In `Dockerfile.sero-node`, link `/usr/local/bin/pnpm` to `/opt/sero-runtime/node_modules/@pnpm/exe.linux-<arch>/pnpm`, mapping `dpkg --print-architecture` to `x64` or `arm64`, and fail the build if that file is missing. Verify: `docker build` of `sero-node:latest` succeeds.
- [ ] 6.2 Recreate the affected workspace containers. Verify: `pnpm --version` inside a container with no network prints the `pins.json` version, and `pnpm install` in a sample workspace completes; record where the pnpm store was created.

## 7. Contributor docs

- [x] 7.1 Change "pnpm 10" in `README.md` and `apps/docs-site/docs/guide/installation-requirements.md`, and "pnpm 10.33.4" in `apps/docs-site/docs/guide/development-setup.md`, to pnpm 12 with a link to pnpm's installation guide. Verify: `git grep -n "pnpm 10"` returns no contributor-doc hits.

## 8. Final checks

- [x] 8.1 Run `pnpm typecheck`, `pnpm test`, and `node apps/desktop/scripts/runtime-tools/update-runtime-tools.mjs`. Verify: all pass.
- [ ] 8.2 Write the PR description with the container behaviour change, the store-location result from 6.2, and a note to check the first Dependabot npm run after merge. Verify: the draft PR body links issue #490.
