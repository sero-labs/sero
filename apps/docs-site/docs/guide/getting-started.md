# Get Sero Running

In this tutorial, you will install Sero's source dependencies, start the desktop
app, and confirm that the first window opens.

By the end, you should have a running Sero desktop app from your local checkout.

## Prerequisites

Before you start, make sure you have:

- a platform covered by [Support Scope](/reference/support-scope)
- Node.js 22
- pnpm 10
- Git
- a local clone of the Sero repository

Sero is currently a **source-only alpha**. This tutorial does not install a
packaged app.

If you have not cloned the repo yet:

```bash
git clone https://github.com/sero-labs/sero.git
cd sero
```

Expected result: your terminal is in the Sero monorepo root, where `package.json`
and `pnpm-workspace.yaml` exist.

## 1. Confirm your tools

From the repo root, check Node.js and pnpm:

```bash
node --version
pnpm --version
```

Expected result: Node.js reports version 22.x and pnpm reports version 10.x.

If either version is different, install the required version before continuing.
See [Installation / Requirements](/guide/installation-requirements) for setup
notes.

## 2. Install dependencies

Run:

```bash
pnpm install
```

Expected result: dependency installation completes successfully. The install flow
also runs native-module repair hooks for packages such as `node-pty` and
`better-sqlite3`.

If installation fails with native module errors, keep the error output and check
[Troubleshooting](/reference/troubleshooting).

## 3. Build the workspace packages

Run:

```bash
pnpm build
```

Expected result: the monorepo build completes without errors.

This step verifies that the source checkout can compile before you start the
desktop app.

## 4. Start Sero

Run:

```bash
pnpm dev
```

Expected result: the development servers start and the Sero desktop app opens.
Leave this command running while you use the app.

If the command starts logs but no window appears, check the terminal output and
see [Troubleshooting](/reference/troubleshooting).

## 5. Complete first-run setup

In the Sero window, follow the first-run prompts to create or select a profile
and configure the providers you want to use.

Expected result: you reach the desktop shell with the app/workspace sidebar,
main workspace area, and chat panel visible.

For more detail, read:

- [Profiles and Onboarding](/guide/profiles-and-onboarding)
- [Models and Providers](/guide/models-and-providers)

## 6. Open a project workspace

Open or create a workspace from the Sero desktop shell.

When Sero asks where to run commands for that workspace, keep the default if you
are unsure. Choose a container runtime only when you specifically want container
isolation, container-provided tools, or container networking behavior.

Expected result: the workspace opens and you can use the file view, terminal,
preview surfaces, and chat for that project.

For exact platform and runtime support facts, see [Support Scope](/reference/support-scope).
For help choosing later, see [Choose a Workspace Runtime](/guide/choose-workspace-runtime).

## 7. Stop the development app

When you are finished, return to the terminal running `pnpm dev` and press
`Ctrl+C`.

Expected result: the development servers stop and the desktop app closes or can
be closed normally.

If a Vite or Electron process keeps running, stop it manually:

```bash
pkill -f "vite"
pkill -f "electron"
```

## What you accomplished

You installed Sero from source, built the monorepo, launched the desktop app,
completed the first-run path, and opened a workspace.

Next, learn the main workspace surfaces in [Workspace and Chat](/guide/workspace-and-chat)
or look up exact setup facts in [Installation / Requirements](/guide/installation-requirements).
