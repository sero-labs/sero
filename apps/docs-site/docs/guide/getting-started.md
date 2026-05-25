# Get Sero Running

In this tutorial, you will install the Sero public beta desktop app, complete
first-run setup, and open a project workspace.

Developers and contributors can use the source-build path later on this page.

## Prerequisites

Before you start, make sure you have:

- a platform covered by [Support Scope](/reference/support-scope)
- access to the current Sero release assets on [GitHub Releases](https://github.com/sero-labs/sero/releases)
- any runtime tools you plan to use after launch, such as Docker / Podman or
  Apple's `container` CLI where supported

Sero is a **public beta desktop release**. GitHub Releases is the source of
truth for exact current installer filenames. Beta caveats still apply: macOS
Intel/x64 and Windows arm64 are unsupported, plugin/runtime APIs may change,
updates are manual unless release notes say otherwise, and support is best
effort. See [Support Scope](/reference/support-scope) for the exact platform and
runtime contract.

## 1. Download the packaged beta

Open [GitHub Releases](https://github.com/sero-labs/sero/releases) and download
the current packaged artifact for your supported platform.

Expected result: you have the current Sero installer or package for your OS. The
release page contains the exact filename to use.

If your platform is not listed in [Support Scope](/reference/support-scope), do
not assume another artifact will work.

## 2. Install and open Sero

Install Sero using the normal installer flow for your operating system, then open
the desktop app.

On macOS, Sero beta builds are unsigned but ad-hoc signed. After dragging Sero to
Applications, open it with **Control-click / right-click → Open** the first time,
then confirm **Open**. This is the supported no-Apple-account beta flow.

Expected result: the Sero window opens. During beta, macOS Gatekeeper or Windows
SmartScreen / unknown-publisher prompts may appear depending on the published
artifact and your system policy.

If the app does not open, keep any installer or launch error output and check
[Troubleshooting](/reference/troubleshooting).

## 3. Complete first-run setup

In the Sero window, follow the first-run prompts to create or select a profile
and configure the providers you want to use.

Expected result: you reach the desktop shell with the app/workspace sidebar,
main workspace area, and chat panel visible.

For more detail, read:

- [Profiles and Onboarding](/guide/profiles-and-onboarding)
- [Models and Providers](/guide/models-and-providers)

## 4. Open a project workspace

Open or create a workspace from the Sero desktop shell.

When Sero asks where to run commands for that workspace, keep the default if you
are unsure. Choose a container runtime only when you specifically want container
isolation, container-provided tools, or container networking behavior.

Expected result: the workspace opens and you can use the file view, terminal,
preview surfaces, and chat for that project.

For exact platform and runtime support facts, see [Support Scope](/reference/support-scope).
For help choosing later, see [Choose a Workspace Runtime](/guide/choose-workspace-runtime).

## Source-build path for developers

Developers and contributors can still run Sero from source on supported targets.
Use this path when you are changing Sero itself or need a local checkout.

Before you start, make sure you have Node.js 22, pnpm 10, Git, and a local clone
of the Sero repository:

```bash
git clone https://github.com/sero-labs/sero.git
cd sero
```

Then run:

```bash
node --version
pnpm --version
pnpm install
pnpm build
pnpm dev
```

Expected result: Node.js reports version 22.x, pnpm reports version 10.x, the
monorepo builds, development servers start, and the Sero desktop app opens.
Leave `pnpm dev` running while you use the source-built app.

If dependency installation fails with native module errors, keep the error output
and check [Troubleshooting](/reference/troubleshooting).

When you are finished, return to the terminal running `pnpm dev` and press
`Ctrl+C`. If a Vite or Electron process keeps running, stop it manually:

```bash
pkill -f "vite"
pkill -f "electron"
```

## What you accomplished

You installed the Sero public beta, completed the first-run path, and opened a
workspace. If you are developing Sero, you also know where to find the source
build workflow.

Next, learn the main workspace surfaces in [Workspace and Chat](/guide/workspace-and-chat)
or look up exact setup facts in [Installation / Requirements](/guide/installation-requirements).
