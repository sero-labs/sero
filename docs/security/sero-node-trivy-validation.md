# Sero node image Trivy validation

Use this process whenever `apps/desktop/images/Dockerfile.sero-node`, the Node/npm/pnpm versions, browser assets, or any container-installed tool changes.

## Release gate

A Sero node image is release-ready only when Trivy reports:

```text
CRITICAL=0
HIGH=0
FIXABLE_CRITICAL=0
FIXABLE_HIGH=0
```

This is stricter than only checking fixable vulnerabilities. It prevents known HIGH/CRITICAL findings from accumulating in the runtime image and forces an explicit hardening/defer decision before publishing.

## Local validation script

From the monorepo root:

```bash
scripts/validate-sero-node-image.sh ghcr.io/sero-labs/sero-node:latest docs/security/scans/sero-node-current
```

The script writes:

- runtime inventory
- Docker inspect/history when the image is local
- full Trivy JSON
- HIGH/CRITICAL Trivy table
- fixable HIGH/CRITICAL Trivy table
- summarized counts

It exits non-zero if any HIGH/CRITICAL or fixable HIGH/CRITICAL finding remains.

## Build and validate before publishing

For a local single-architecture release candidate:

```bash
VERSION=0.1.0
SHA=$(git rev-parse --short=12 HEAD)
IMAGE=ghcr.io/sero-labs/sero-node

docker build \
  -t "$IMAGE:$VERSION" \
  -t "$IMAGE:sha-$SHA" \
  -t "$IMAGE:latest" \
  --build-arg "SERO_NODE_VERSION=$VERSION" \
  -f apps/desktop/images/Dockerfile.sero-node \
  .

scripts/validate-sero-node-image.sh "$IMAGE:$VERSION" "docs/security/scans/sero-node-$VERSION"
```

For a multi-platform release, validate platform candidates before pushing, then validate the pushed manifest/tag again:

```bash
VERSION=0.1.0
SHA=$(git rev-parse --short=12 HEAD)
IMAGE=ghcr.io/sero-labs/sero-node

# Optional but recommended: build and scan each platform candidate separately.
docker buildx build --platform linux/arm64 --load \
  -t "$IMAGE:$VERSION-arm64-validate" \
  --build-arg "SERO_NODE_VERSION=$VERSION" \
  -f apps/desktop/images/Dockerfile.sero-node .
scripts/validate-sero-node-image.sh "$IMAGE:$VERSION-arm64-validate" "docs/security/scans/sero-node-$VERSION-arm64"

docker buildx build --platform linux/amd64 --load \
  -t "$IMAGE:$VERSION-amd64-validate" \
  --build-arg "SERO_NODE_VERSION=$VERSION" \
  -f apps/desktop/images/Dockerfile.sero-node .
scripts/validate-sero-node-image.sh "$IMAGE:$VERSION-amd64-validate" "docs/security/scans/sero-node-$VERSION-amd64"

# Publish only after validation and explicit maintainer approval.
docker buildx build --platform linux/arm64,linux/amd64 --push \
  -t "$IMAGE:$VERSION" \
  -t "$IMAGE:sha-$SHA" \
  -t "$IMAGE:latest" \
  --build-arg "SERO_NODE_VERSION=$VERSION" \
  -f apps/desktop/images/Dockerfile.sero-node .

# Validate the published release tag.
scripts/validate-sero-node-image.sh "$IMAGE:$VERSION" "docs/security/scans/sero-node-$VERSION-published"
```

## Evidence expectations

For release PRs, include or link the count file and runtime inventory. The relevant files are usually:

```text
docs/security/scans/<run>/<image>-runtime-inventory.txt
docs/security/scans/<run>/<image>-trivy-counts.txt
docs/security/scans/<run>/<image>-trivy-high-critical.txt
docs/security/scans/<run>/<image>-trivy-fixable-high-critical.txt
```

If the gate fails, do not publish the tag. Either fix the image or document the blocked release decision in the PR/release-gate notes.
