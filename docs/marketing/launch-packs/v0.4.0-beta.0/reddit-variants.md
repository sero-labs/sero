<!-- DRAFT — nothing is posted by this loop; the maintainer publishes by hand, one subreddit at a time. -->

# Reddit variants for Sero Desktop v0.4.0-beta.0

## r/LocalLLaMA

### Title
Sero Desktop v0.4 beta with local OpenAI-compatible model support and onboarding changes

### Body
Sero is a local-first desktop workspace for coding agents. The model layer is not bundled: you bring either a hosted provider key or a local OpenAI-compatible server. The current quick start documents presets for Ollama, LM Studio, and vLLM, so a fully local model path is available if you already run one of those.

The new v0.4.0-beta.0 release is not a model-quality announcement. It is mostly about making the desktop app easier to personalise and less brittle during setup.

Concrete changes in this release:

- Added Caveman mode to onboarding. It has Lite, Full, and Ultra levels, writes the setting into the managed User profile, and the memory plugin turns that preference into prompt instructions for later agent sessions.
- Added shared theme customisation. The same theme tokens now apply across the desktop app, shared UI package, plugins, templates, docs, and a new styleguide app.
- Improved the MCP setup screen by removing the always-visible first-run wizard, moving starter presets into the normal Add server flow, and delaying validation errors until save.
- Fixed empty local workspaces connected to an existing remote origin: empty folders now import files, while non-empty folders only connect the origin.
- Fixed managed profile field updates so existing unmatched profile content is preserved instead of being dropped.

The local-model angle is simple: Sero can point at a local OpenAI-compatible endpoint, and the rest of the workspace state — workspaces, sessions, memory, plugin state, and logs — lives in a local profile directory. If you choose a hosted model, prompts and selected workspace context go to that provider. If you choose Ollama, LM Studio, or vLLM locally, those calls stay on that local model path.

This is still a beta desktop app. I would not present it as a replacement for the lightweight terminal agents many people here already use. The interesting part, if you care about local models, is that the app is trying to make model-provider choice a first-class setup path rather than assuming one hosted API.

Release: v0.4.0-beta.0

## r/selfhosted

### Title
Sero Desktop v0.4 beta keeps agent workspace state local and improves host setup

### Body
Sero is a desktop app for running coding-agent workflows with local workspaces, terminals, browser surfaces, plugins, memory, and longer-running loops in one place.

The self-hosted part is not a server you deploy. It is local-control desktop software:

- The app runs on your machine.
- Workspaces point at local project folders.
- Agent sessions, memory, plugin state, logs, and settings live in the local Sero profile directory.
- Provider keys are stored under the local profile's agent directory.
- There is no telemetry backend collecting sessions.
- Remote control through the gateway is off by default.

What leaves the machine depends on what you enable. If you use a hosted model provider, prompts and relevant workspace context go to that provider. If you use a local OpenAI-compatible server such as Ollama, LM Studio, or vLLM, the model call path can stay local. Optional integrations such as GitHub, plugin installs, Discord, or Tailscale only talk out when configured.

The v0.4.0-beta.0 release changes a few setup and control surfaces:

- Onboarding can now check core development tools and install managed host tools for host workspaces.
- Plugin install, build, dev-server, and native-dependency repair paths now use the host tool resolver instead of assuming a useful raw PATH.
- Managed npm toolchains, Windows tool resolution, Windows release builds, and toolchain staging were hardened.
- Empty local workspaces connected to an existing remote origin now import files; non-empty workspaces only connect the origin.
- Profile field updates now preserve existing unmatched profile content.
- Caveman mode was added as an onboarding preference for communication style, written to the managed User profile rather than stored in browser local storage.

For a self-hosted audience, the main trade-off is worth stating plainly: Sero gives you local ownership of the workspace state and runtime surfaces, but it is still an agent app. Any model provider or integration you enable gets the data needed for that action. If your requirement is “no project context leaves this machine”, use a local model endpoint and leave optional network integrations disabled.

Release: v0.4.0-beta.0

## r/electronjs

### Title
Sero Desktop v0.4 beta: Electron plugin UI, Module Federation, and shared theme tokens

### Body
Sero is an Electron + React desktop shell around the Pi coding-agent SDK. The desktop app hosts chat, files, terminals, previews, browser flows, workspace runtime state, and plugin UIs in one local workspace.

The plugin architecture is the part that may be interesting here. A Sero plugin can include:

- a Pi extension for tools and slash commands,
- an optional React UI loaded into the desktop shell through Module Federation,
- optional widgets,
- optional background jobs,
- provider or runtime integrations.

Built-in plugins live in `plugins/sero-*-plugin/`, and plugin UI dev servers are opt-in for live reload during development. The release work around v0.4.0-beta.0 touched both product UI and the plugin/dev flow rather than only app copy.

Engineering changes in this release range include:

- Shared theme customisation across the Electron desktop app, the shared `@sero-ai/ui` package, plugins, templates, docs, and a new styleguide app.
- Theme editor close handling and persisted auto-save.
- The Explorer editor now applies the configured theme monospace font.
- MCP setup was simplified by removing the persistent first-run wizard, moving starter presets into the Add server flow, and delaying validation errors until save.
- Isolated source-development launch guidance was added so source builds and the packaged app do not share profiles, settings, auth, or plugin paths.
- Loopback plugin-development remotes were allowed, and invalid IPv6 CSP sources were removed.
- Plugin install, build, dev-server, and native-dependency repair paths now resolve host tools through the host tool resolver instead of depending on whatever PATH the packaged app inherited.
- Several React 19 and React Doctor cleanups landed: reduced-motion handling, stable keys, hook cleanup, accessibility labels, explicit button types, async parallelisation, and deprecated context API updates.

The practical story is that v0.4.0-beta.0 continues moving Sero towards a plugin-first Electron app where agent capabilities can ship as real software surfaces: extension code for the agent, federated React UI for the user, and background/runtime pieces where needed.

Release: v0.4.0-beta.0
