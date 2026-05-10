# macOS Containers Setup

Sero works best with Apple's `container` runtime on Apple Silicon Macs. Containers are **strongly recommended**, but Sero can still continue in a reduced host mode if they are unavailable.

## What containers unlock

With containers configured, Sero can provide:
- containerized workspace execution
- containerized language servers and tooling
- managed preview / dev-server automation with better Linux parity
- browser automation and related sandboxed workflows

Without containers, Sero still supports core chat, file access, and host-mode workflows, but some automation is reduced or unavailable.

## Requirements

- Apple Silicon Mac
- A supported macOS release for Apple's container tooling
- Apple's `container` CLI installed at `/usr/local/bin/container`

## Install the container CLI

Follow Apple's installation instructions for the `container` command-line tools.

After installation, verify the binary exists:

```bash
/usr/local/bin/container --help
```

If that path does not exist, Sero will treat containers as unavailable and continue in host mode.

## Start and verify the container system

Check status:

```bash
/usr/local/bin/container system status
```

If the system is not running, start it:

```bash
/usr/local/bin/container system start
```

Verify it reports `running` before retrying container-backed workflows in Sero.

## Verify Sero's image

Sero defaults to the public workspace image:

```text
ghcr.io/sero-labs/sero-node:latest
```

Sero pulls this image automatically when it is missing locally. For local development, build the same tag with:

```bash
cd apps/desktop
pnpm container:build-image
```

Public releases publish the same Dockerfile to GitHub Container Registry as:

```text
ghcr.io/sero-labs/sero-node:latest
ghcr.io/sero-labs/sero-node:<version>
ghcr.io/sero-labs/sero-node:sha-<git-sha>
```

If you changed `apps/desktop/images/Dockerfile.sero-node` or container-installed tools, rebuild the image and recreate affected workspace containers. See [runtime images](../reference/runtime-images.md) for pinned release tags, the `:latest` development fallback, and image bump behavior.

## Common problems

### `container` command missing

Symptom:
- onboarding warns that containers are unavailable

Fix:
- install Apple's container CLI
- confirm `/usr/local/bin/container` exists

### `container system status` is unavailable or shows connection errors

Symptom:
- onboarding warns that the container system is unavailable
- commands may mention XPC or startup failures

Fix:
- run `container system start`
- retry after the system reports `running`
- if necessary, restart the container system

### Existing workspace container still behaves incorrectly

Fix:
- recreate the affected workspace container after fixing the runtime
- if you changed the base image, rebuild `ghcr.io/sero-labs/sero-node:latest` first

## What still works in host mode

Host mode can still be used for:
- onboarding and provider setup
- core chat
- file reads/writes that already support host fallback
- general local development tasks outside the managed container runtime

## Host-mode limitations

Expect reduced functionality for:
- browser automation
- containerized language servers
- managed preview / dev-server automation
- Linux/container parity and container networking semantics

If onboarding shows a container warning, you can continue now and configure containers later.
