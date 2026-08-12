# Making the plugin installable

Sero installs a plugin from a folder, a git repo, or npm. The checks below run
on every install. A plugin that fails one is refused.

## Requirements

- `sero.plugin.runtimeAbi` must be `2` when the plugin ships a UI. Without it
  Sero refuses the plugin instead of crashing on a shared-React mismatch.
- Dependencies must use published versions. `workspace:` and `catalog:` specs
  are rejected — vendor or pin them first.
- A source plugin that declares `sero.app.ui` needs a `build` script. Sero runs
  it during install and expects `dist/ui/remoteEntry.js` afterwards.
- Set `sero.plugin.preBuilt: true` only when `dist/ui/` is already in the
  package. npm packages must always ship it pre-built.
- `packageManager` may be `pnpm` or `npm`. Yarn is not supported.
- Declare every host capability the plugin calls in
  `sero.plugin.requiredHostCapabilities`, for example `appAgent.invokeTool`.

## When an install fails

| Message | Cause |
|---|---|
| Built for an older version of Sero | `runtimeAbi` is missing |
| Built for a different version of Sero | `runtimeAbi` does not match the host |
| unsupported dependency spec | a `workspace:` or `catalog:` dependency |
| declares a UI but has no build script | add `build` to `scripts` |
| dist/ui/remoteEntry.js is missing | the build ran but produced no entry |
| npm packages must ship pre-built UI artifacts | publish `dist/ui/` |
| Requires host capability `x` | this Sero build does not provide it |
