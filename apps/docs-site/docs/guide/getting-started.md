# Get Sero Running

Install the packaged desktop app, complete setup, and open a workspace. If you
want to change Sero itself, use [Development Setup](/guide/development-setup)
instead.

## Prerequisites

Before you start, make sure you have:

- a platform covered by [Support Scope](/reference/support-scope)
- access to the current Sero release assets on [GitHub Releases](https://github.com/sero-labs/sero/releases)
- optional container tools if you plan to use a container runtime

## 1. Download Sero

Open [GitHub Releases](https://github.com/sero-labs/sero/releases). Download the
current installer for your platform.

Expected result: you have the current Sero installer or package for your OS. The
release page contains the exact filename to use.

If your platform is not listed in [Support Scope](/reference/support-scope), do
not assume another artifact will work.

## 2. Install and open Sero

Install Sero using the normal installer flow for your operating system, then open
the desktop app.

Expected result: the Sero window opens. On Windows, SmartScreen / unknown-publisher
prompts can appear if the release is not signed.

If the app does not open, keep any installer or launch error output and check
[Troubleshooting](/reference/troubleshooting).

## 3. Complete first-run setup

In the Sero window, create a profile. Connect a model provider and select the
LOW, MED, and HIGH defaults. GitHub setup is optional.

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

Next, learn the main workspace surfaces in [Workspace and Chat](/guide/workspace-and-chat).
For package and platform details, see [Install Sero](/guide/installation-requirements).
