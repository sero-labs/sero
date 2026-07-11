// Publish guard — this package MUST be published with `pnpm publish`.
//
// The `publishConfig` block swaps main/types/exports over to the built `dist/`
// at publish time. That override is a pnpm (and yarn) feature; plain npm
// IGNORES it and publishes the top-level fields, which point at `src/`. So
// `npm publish` here silently ships raw TypeScript source instead of the
// compiled package — exactly how 0.4.0 went out wrong.
//
// This runs from `prepublishOnly`, so it fires on every publish. It aborts
// unless the invoking package manager is pnpm.

const ua = process.env.npm_config_user_agent ?? "";

if (!ua.startsWith("pnpm")) {
  const tool = ua.split("/")[0] || "an unknown tool";
  console.error(
    `\n✖ @sero-ai/ui must be published with pnpm, but this ran under ${tool}.\n\n` +
      "  Plain npm ignores the publishConfig dist overrides and would ship raw\n" +
      "  TypeScript source instead of the built dist/. Use:\n\n" +
      "      pnpm publish   (from packages/ui)\n",
  );
  process.exit(1);
}
