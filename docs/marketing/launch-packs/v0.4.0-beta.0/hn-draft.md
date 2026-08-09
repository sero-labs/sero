<!-- DRAFT — never posted by this loop. -->

Recommendation: do NOT post this release to HN

Reason: v0.4.0-beta.0 has useful user-facing improvements, especially Caveman onboarding and shared theme customisation, but it is not a fresh public launch or a strong new proof of Sero's core agent-workspace idea.

# Draft HN post

## Title

Sero Desktop v0.4 beta adds Caveman onboarding mode and shared themes

## URL

https://github.com/sero-labs/sero/releases/tag/v0.4.0-beta.0

## Body

Sero is an open-source, local-first desktop workspace for AI agents. It brings chat, files, terminals, browser previews, plugins, project memory, and long-running agent workflows into one app, so an agent can work with more of the project context on your machine.

This v0.4.0 beta release is mostly about making the app easier to set up and shape around the user:

- Caveman mode is now part of onboarding. Users can choose Lite, Full, or Ultra, and Sero stores the preference in the managed User profile so future agent context uses that communication style.
- Shared theme customisation now applies common theme tokens across the desktop app, shared UI package, plugins, templates, docs, and a new styleguide app. The theme editor also persists auto-save and has clearer close behaviour.
- Empty local workspaces connected to an existing remote origin now import the remote files, while non-empty workspaces only connect the origin.
- MCP setup is less noisy: starter presets moved into the normal Add server flow, and validation waits until save.
- Host-workspace setup, plugin tool resolution, managed toolchains, Windows tool resolution, and release asset verification were hardened.

The honest caveats: Sero is still beta software for early adopters and contributors. It does not bundle a model; you bring a hosted API key or a local OpenAI-compatible server such as Ollama, LM Studio, or vLLM. Plugin and runtime APIs are not stable yet. Some UX is still rough. Host mode is useful but reduced compared with container-backed workspaces. macOS Apple Silicon is the maintainer-validated baseline; Windows and Linux builds are available for supported targets, but Windows may still show SmartScreen prompts during the beta.

Install path: download the v0.4.0-beta.0 build for your platform from GitHub Releases, open Sero, connect a model during setup, then open a project folder as a workspace.

Release: https://github.com/sero-labs/sero/releases/tag/v0.4.0-beta.0

Architecture docs: https://github.com/sero-labs/sero/blob/main/docs/architecture.md

## Likely HN questions and honest answers

**Is this just another chat wrapper?**

No. Sero is a desktop workspace around the agent: files, terminals, previews, browser flows, plugins, memory, and orchestrated workflows are part of the same local app. The v0.4.0 release itself does not add a new core workspace surface; it improves onboarding, theme customisation, setup, and reliability.

**Why would Caveman mode be worth a release?**

It is a small but visible personalisation feature. The practical point is that communication preferences are captured during onboarding and written into managed profile state, instead of relying on users to hand-edit prompt or memory files.

**Does Sero run fully locally?**

The app, workspace state, memory, plugin state, and logs live locally. Model calls go to the provider the user configures, unless they use a local OpenAI-compatible server. Optional integrations only talk out when enabled.

**Does it include a model?**

No. Users need to bring a hosted provider key or connect a local OpenAI-compatible server such as Ollama, LM Studio, or vLLM.

**Which platforms are supported?**

Packaged beta builds are available for macOS Apple Silicon, Linux x64/arm64, and Windows x64. macOS Intel and Windows arm64 are not packaged for this beta support matrix.

**How production-ready is it?**

It is not production-polished software yet. It is an open-source public beta. Internal APIs, plugin contracts, runtime behaviour, and UI details may change.

**What changed in this release besides onboarding?**

Shared theme customisation, safer profile updates, better empty-workspace remote import behaviour, simpler MCP setup, host tool resolution improvements, managed toolchain hardening, Windows build/tool fixes, and several React/accessibility cleanup passes.

**Why not post this on HN now?**

Because this is better framed as an incremental beta release than a broad public launch. A stronger HN post should probably wait for a demoable proof moment of Sero's core promise, such as an agent building, reviewing, and running a useful plugin inside Sero.
