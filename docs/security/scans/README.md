# Security scan artifacts

This tree keeps the curated outputs from Trivy and related scans for each `sero-node`
runtime image release. The committed artifacts intentionally include only the human-readable
TXT summaries and small JSON metadata so the git history stays tractable.

## What is tracked

For each release directory you should see:

- `*-trivy-counts.txt` — total finding counts by severity.
- `*-trivy-high-critical.txt` — HIGH and CRITICAL findings.
- `*-trivy-fixable-high-critical.txt` — HIGH/CRITICAL findings that have a fix version.
- `*-trivy-version.txt` — Trivy CLI version used.
- `*-inspect.json` — `docker inspect` metadata (small, no findings).
- `*-history.txt`, `*-runtime-inventory.txt`, etc. — build provenance and runtime checks.

## What is NOT tracked

The full Trivy JSON output (`*-trivy-full.json`) is excluded via `.gitignore`. Each file is
roughly 5 MB and quickly inflates the repo without adding actionable signal beyond what the
TXT summaries capture.

To regenerate a full report locally, run:

```bash
trivy image --format json --severity HIGH,CRITICAL \
  -o "<release-dir>/<image-tag>-trivy-full.json" \
  ghcr.io/sero-labs/sero-node:<tag>
```

Keep regenerated JSON outside of git or stash it in a release artifact store.
