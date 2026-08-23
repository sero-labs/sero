#!/usr/bin/env bash
set -euo pipefail

IMAGE_REF="${1:-ghcr.io/sero-labs/sero-node:latest}"
OUT_DIR="${2:-/tmp/sero-security-scans/sero-node-current}"
TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:latest}"

mkdir -p "$OUT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not available" >&2
  exit 1
fi

safe_name=$(echo "$IMAGE_REF" | tr '/:@' '____')
prefix="$OUT_DIR/$safe_name"

run_trivy() {
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$PWD/$OUT_DIR:/out" \
    "$TRIVY_IMAGE" "$@"
}

echo "Validating $IMAGE_REF"

echo "Writing runtime inventory..."
docker run --rm "$IMAGE_REF" sh -lc '
set -eu
printf "image=%s\n" "'"$IMAGE_REF"'"
printf "os=%s\n" "$(. /etc/os-release && printf "%s %s" "$ID" "$VERSION_ID")"
printf "arch=%s\n" "$(uname -m)"
printf "node=%s\n" "$(node --version)"
printf "npm=%s\n" "$(npm --version)"
printf "pnpm=%s\n" "$(pnpm --version)"
printf "git=%s\n" "$(git --version)"
printf "python=%s\n" "$(python3 --version)"
printf "gh=%s\n" "$(gh --version | head -1)"
printf "agent-browser=%s\n" "$(agent-browser --version 2>/dev/null || true)"
printf "chromium=%s\n" "$(find /ms-playwright -path "*/chrome-linux/chrome" -type f -perm -111 -print -quit)"
printf "ffmpeg=%s\n" "$(find /ms-playwright -path "*/ffmpeg-linux" -type f -perm -111 -print -quit)"
' > "${prefix}-runtime-inventory.txt"

if docker image inspect "$IMAGE_REF" >/dev/null 2>&1; then
  docker image inspect "$IMAGE_REF" > "${prefix}-inspect.json"
  docker history --no-trunc "$IMAGE_REF" > "${prefix}-history.txt" || true
fi

echo "Running Trivy full JSON scan..."
run_trivy image --format json --output "/out/$(basename "${prefix}-trivy-full.json")" "$IMAGE_REF"

echo "Running Trivy HIGH/CRITICAL table..."
run_trivy image --severity HIGH,CRITICAL --output "/out/$(basename "${prefix}-trivy-high-critical.txt")" "$IMAGE_REF"

echo "Running Trivy fixable HIGH/CRITICAL table..."
run_trivy image --severity HIGH,CRITICAL --ignore-unfixed --output "/out/$(basename "${prefix}-trivy-fixable-high-critical.txt")" "$IMAGE_REF"

node - "${prefix}-trivy-full.json" "${prefix}-trivy-counts.txt" <<'NODE'
const fs = require('node:fs');
const [input, output] = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(input, 'utf8'));
const counts = { total: 0, critical: 0, high: 0, fixableCritical: 0, fixableHigh: 0 };
for (const result of report.Results ?? []) {
  for (const vuln of result.Vulnerabilities ?? []) {
    counts.total += 1;
    const severity = vuln.Severity;
    const fixed = Array.isArray(vuln.FixedVersion)
      ? vuln.FixedVersion.length > 0
      : Boolean(String(vuln.FixedVersion ?? '').trim());
    if (severity === 'CRITICAL') {
      counts.critical += 1;
      if (fixed) counts.fixableCritical += 1;
    }
    if (severity === 'HIGH') {
      counts.high += 1;
      if (fixed) counts.fixableHigh += 1;
    }
  }
}
const lines = [
  `TOTAL=${counts.total}`,
  `CRITICAL=${counts.critical}`,
  `HIGH=${counts.high}`,
  `FIXABLE_CRITICAL=${counts.fixableCritical}`,
  `FIXABLE_HIGH=${counts.fixableHigh}`,
  '',
];
fs.writeFileSync(output, lines.join('\n'));
console.log(lines.join('\n'));
if (counts.critical !== 0 || counts.high !== 0 || counts.fixableCritical !== 0 || counts.fixableHigh !== 0) {
  process.exitCode = 1;
}
NODE

echo "Validation artifacts written to $OUT_DIR"
