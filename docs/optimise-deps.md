Sero Desktop — Release Packaging Continuation

I'm picking up after a session that fixed a broken v0.2.0-beta.0 macOS DMG (it installed but did nothing on launch). The fix shipped as v0.2.1-beta.0 (now Latest). I want you to dig deeper on further bundle-size reduction — but first, here's what's already been done and verified so you don't re-litigate it.

Repo

  - /Users/danielcarter/Documents/Dev/projects/sero/sero — pnpm monorepo (pinned pnpm@10.33.4), Electron desktop app in apps/desktop.
  - Renderer: vite + module-federation, fully bundled. Main: esbuild bundled with a small external set declared in apps/desktop/scripts/build-electron.mjs: external: ['electron', 'node-pty', 'esbuild', '@earendil-works/*', 'typebox', '@google/genai', 'ws', 'discord.js']
  - Release entry: apps/desktop/scripts/build-release.sh, config: apps/desktop/electron-builder.yml, CI: .github/workflows/release.yml.

  Root cause that was fixed (don't re-investigate)

  b9ef7e095 bumped the pi SDK catalog ^0.72.1 → ^0.73.1. pi-ai's deps are byte-identical between those versions, but the lockfile rewrite/peer-hash change moved pi-ai's transitive runtime closure (partial-json, openai, @anthropic-ai/sdk, @aws-sdk/client-bedrock-runtime, @mistralai/mistralai, proxy-agent, zod-to-json-schema) into a nested .pnpm location that the old electron-builder files allowlist silently stopped collecting. Result: ERR_MODULE_NOT_FOUND at startup, window never shows. The recurring chalk/ansi-styles/cli-highlight allowlist entries in old configs were the same bug being whack-a-moled.

  Fix that shipped (treat as load-bearing — don't undo)

  1. Package from pnpm deploy bundle (build-release.sh): hoisted pnpm deploy --prod into .package-deploy/ with
  NPM_CONFIG_INJECT_WORKSPACE_PACKAGES=true, rebuild natives there, run electron-builder --projectDir <bundle> with a pinned electronVersion (since electron is
  a stripped devDep). HUSKY=0 keeps the deploy from re-running git-hook setup. Do not use --legacy: pnpm v10's legacy deploy path ignores the workspace
  lockfile and can package newer semver-compatible runtime deps than the tested frozen install.
  2. Removed the node_modules/* allowlist from electron-builder.yml and the workspace/cli-highlight materialization hacks from prepare-packaging.mjs. The flat
  deploy resolves per-consumer versions correctly (pi-ai gets its declared nested chalk@5.6.2; cli-highlight gets nested chalk@4.1.2). Never reintroduce that
  allowlist — it short-circuits transitive collection in pnpm's isolated layout.
  3. Reclassified renderer/build-only packages as devDependencies in apps/desktop/package.json, leaving only the esbuild externals + a few small runtime modules
  as dependencies. Adding a renderer/build package back to dependencies regresses the size (monaco-editor 98M + mermaid 76M + lucide-react 44M +
  @module-federation→@rspack/tsx).

  Memory: ~/.claude/projects/-Users-danielcarter-Documents-Dev-projects-sero-sero/memory/release-packaging-pnpm-deploy.md has the rule.

  Verified current state (v0.2.1-beta.0, signed/notarized, installs + launches on macOS arm64)

  ┌────────────────────────┬───────────────────────────┬────────────────────────┐
  │                        │ Old broken (0.2.0-beta.0) │ Current (0.2.1-beta.0) │
  ├────────────────────────┼───────────────────────────┼────────────────────────┤
  │ app.asar               │ 264 M                     │ 152 M                  │
  ├────────────────────────┼───────────────────────────┼────────────────────────┤
  │ app.asar.unpacked      │ 91 M                      │ 54 M                   │
  ├────────────────────────┼───────────────────────────┼────────────────────────┤
  │ mac DMG                │ 202 M (crashed)           │ 157 M (launches)       │
  ├────────────────────────┼───────────────────────────┼────────────────────────┤
  │ Pi SDK runtime closure │ ❌ missing                │ ✅ complete            │
  └────────────────────────┴───────────────────────────┴────────────────────────┘

  Lean deploy bundle node_modules is 311 M (down from 790 M pre-reclassification).

  Top remaining size in the lean deploy node_modules — investigate these

   62M  node-pty               # native; ships prebuilds for win32-x64, win32-arm64, darwin-x64, darwin-arm64
   25M  @earendil-works        # pi SDK; .ts sources retained ("loaded via jiti at runtime" per electron-builder.yml comment)
   22M  @mistralai/mistralai   } the pi-ai provider SDKs — all four
   13M  openai                 } are listed unconditionally as
  6.6M  @aws-sdk/*             } pi-ai dependencies and pi-ai is
  6.4M  @anthropic-ai/sdk      } external, so esbuild can't tree-shake them
   10M  esbuild + @esbuild/darwin-arm64   # runtime external (plugin transpilation)
  8.7M  web-streams-polyfill   # large; check transitive origin
  6.4M  discord-api-types      # transitive of discord.js
  6.3M  zod                    # check for duplicates / peer dedup
  5.8M  typebox                # runtime external
  5.8M  @modelcontextprotocol/sdk

  Concrete things to investigate (ordered by likely payoff)

  1. Strip cross-platform prebuilds. node-pty carries prebuilds for all four OS/arch combos. On a macOS-arm64 build, ~75% of node-pty's 62 M is
   dead weight (win32 + darwin-x64). Investigate electron-builder's mac/linux/win prebuild handling, or add an afterPack step that deletes non-target prebuilds/* under app.asar.unpacked/node_modules/node-pty/. Same for any other native module that ships fat prebuilds.
  2. Provider SDK reduction. pi-ai 0.73.1 declares all four provider SDKs (@aws-sdk/client-bedrock-runtime, @mistralai/mistralai, openai, @anthropic-ai/sdk) as hard dependencies (~48 M combined). Two angles:
    - Check if pi-ai upstream supports optional/peer provider deps; if so, omit unused ones.
    - If pi-ai must keep them, see whether @aws-sdk/client-bedrock-runtime can be replaced with the lighter aws4/raw HTTPS path (the AWS SDK has huge @smithy/*
  transitives).
  3. @earendil-works 25 M includes .ts sources. electron-builder.yml keeps .ts because Pi extensions are loaded via jiti at runtime under dist/electron/builtin/.
  Verify whether the external @earendil-works/* packages in node_modules also need their .ts retained, or if only the dist/electron/builtin/** staged copies do — if
   the latter, the node_modules .ts files can be excluded.
  4. asar.unpacked is 54 M — audit what's in it. Currently only node-pty is unpacked. Confirm nothing else got unpacked accidentally and that node-pty's unpack is
   darwin-arm64-only.
  6. Per-plugin better-sqlite3 situation. It's a per-plugin runtime external staged under
  dist/electron/builtin/plugins/sero-web-plugin/node_modules/better-sqlite3 (via stagePluginRuntimeDependencies in build-electron.mjs). Its .node lives inside the
   asar — asarUnpack doesn't currently cover that path. This is pre-existing (the broken release had the same issue), and out of scope for the size fix, but worth
   a follow-up to confirm sqlite-using plugins actually work in the packaged app.
  7. web-streams-polyfill and discord-api-types — large transitives. If they're only needed by a non-essential code path, see if the path itself can be removed or
   lazy-loaded.

  Useful local commands

  # Reproduce the deploy bundle locally to size-audit (don't commit anything from this)
  HUSKY=0 NPM_CONFIG_NODE_LINKER=hoisted NPM_CONFIG_INJECT_WORKSPACE_PACKAGES=true \
    pnpm --filter @sero/desktop deploy --prod /tmp/audit-deploy
  du -sh /tmp/audit-deploy/node_modules/* | sort -rh | head -30

  # Full release build (mac, unsigned, --dir for fast iteration)
  pnpm --filter @sero/desktop pack:mac

  # Why is package X in the prod tree?
  pnpm --filter @sero/desktop why <package>

  Caveats / env quirks (don't get bitten)

  - Volta shadows the pinned pnpm. Interactive shells get pnpm 10.33.4 via corepack; background processes have picked up volta's 10.14.0, which previously
  corrupted package.json (overwrote it with ansi-styles' contents) and rewrote pnpm-lock.yaml. Verify pnpm --version is 10.33.4 before any install/release
  operation. Memory: ~/.claude/projects/.../memory/local-pnpm-volta-shadow.md.
  - The v0.2.1-beta.0 tag sits on the original fix-branch lineage (53edbc065), not on main's squash-merge commit (72184f04c). Functionally identical content; the
  user accepted this. Don't try to "fix" the history.
  - Don't run pnpm install non-frozen unless you know why — frozen-lockfile is what keeps the build deterministic.

  Start by reproducing the lean deploy locally, then dig into items 1–3 above (prebuild stripping is the most mechanical win; provider SDK reduction is the most
  upstream and likely the highest payoff if pi-ai can be persuaded to make providers optional).

## Monaco is bundled, not CDN-loaded (Jul 2026)

`@monaco-editor/react` used to fetch Monaco from jsdelivr at runtime, so the
code editor needed a network connection and its version was chosen by a
transitive dependency (`@monaco-editor/loader` pins the CDN URL). Both are now
fixed: `src/components/apps/explorer/editor/monaco-setup.ts` calls
`loader.config({ monaco })` with the bundled copy and wires the language workers
through `MonacoEnvironment`.

`monaco-editor` stays a **devDependency** — Vite inlines it into the renderer at
build time, so it must not move to `dependencies` (see point 3 above). The cost
is ~13 MB in `dist/renderer` (a lazy Monaco chunk plus five language workers),
loaded only when a file is opened. `e2e/monaco-bundled.workflow.spec.ts` fails if
a CDN fetch or a broken worker ever comes back.

**Do not drop the TypeScript worker to save its 6.7 MB.** It looks unused
because `monaco-setup`'s sibling `useEditorMonacoState` turns Monaco's TS
diagnostics off, but that only suppresses *squiggles* — the worker still powers
type-aware completions. Verified by probe: opening a `.ts` file spawns
`ts.worker` immediately, and completing on a typed value returns
`(property) User.name: string`. Red squiggles in `.ts` files come from the real
TypeScript LSP instead (marker owner `lsp`, see `src/lsp/diagnostics.ts`), which
is why Monaco's own tsconfig-less diagnostics are switched off.
