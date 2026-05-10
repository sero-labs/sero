# Runtime images

Sero uses the same `sero-node` Linux image for Apple Container and Docker runtimes so both backends expose the same toolchain on `linux/arm64` and `linux/amd64`.

## Image tags

- Development fallback: `ghcr.io/sero-labs/sero-node:latest`
- Release builds: `ghcr.io/sero-labs/sero-node:<version>`
- Traceability tags: `ghcr.io/sero-labs/sero-node:sha-<git-sha>`

Desktop releases should set `SERO_NODE_IMAGE_TAG=<version>` so the runtime uses the pinned release tag. If no tag is set, Sero falls back to `:latest` for development builds.

## Publishing

The GitHub workflow at `.github/workflows/container-image.yml` publishes multi-arch images for:

```text
linux/amd64,linux/arm64
```

Manual equivalent:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f apps/desktop/images/Dockerfile.sero-node \
  --build-arg SERO_NODE_VERSION=0.1.0 \
  -t ghcr.io/sero-labs/sero-node:0.1.0 \
  -t ghcr.io/sero-labs/sero-node:latest \
  --push apps/desktop/images
```

## Bumping the image

When changing `apps/desktop/images/Dockerfile.sero-node` or adding/removing container-installed tools:

1. Publish a new pinned tag.
2. Update release configuration to set `SERO_NODE_IMAGE_TAG` to that tag.
3. Rebuild `ghcr.io/sero-labs/sero-node:latest` if development builds should pick up the change.
4. Recreate affected workspace containers.

Sero labels managed containers with the requested image reference. On the next runtime ensure, Docker recreates a workspace container if the existing container's image label does not match the configured image. Users can also repair/recreate the runtime explicitly.

Local development still falls back to building `apps/desktop/images/Dockerfile.sero-node` when the configured image cannot be pulled.

## UID/GID runtime home

Docker runs container processes as the host UID/GID on Unix so bind-mounted files stay editable by the user. The image must keep `/tmp/sero-home` world-writable (`chmod 1777`) because arbitrary host users use it as `HOME` inside the runtime.
