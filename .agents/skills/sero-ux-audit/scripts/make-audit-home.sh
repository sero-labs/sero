#!/bin/bash
# Build an isolated SERO_HOME copy for UX-audit screenshot capture.
# The source profile is read-only; nothing here writes back to ~/.sero-ui.
#
#   ./make-audit-home.sh <scratch-dir> <profile-name> [sero-home]
#
# Shared, heavy directories are symlinked rather than copied, so the capture
# home stays small and no toolchain is reinstalled.
set -euo pipefail

SCRATCH="${1:?usage: make-audit-home.sh <scratch-dir> <profile-name> [sero-home]}"
PROFILE="${2:?usage: make-audit-home.sh <scratch-dir> <profile-name> [sero-home]}"
SRC="${3:-$HOME/.sero-ui}"
AUDIT="$SCRATCH/audit-home"

rm -rf "$AUDIT"
mkdir -p "$AUDIT/profiles"

# Exclude the browser profile, logs and debug output: they are large, they are
# not rendered by any page, and they are the most likely place for a secret.
rsync -a \
  --exclude 'chromium-user-data' \
  --exclude 'logs' \
  --exclude 'debug' \
  --exclude '.DS_Store' \
  "$SRC/profiles/$PROFILE/" "$AUDIT/profiles/$PROFILE/"

for d in toolchains shared themes app-tools bin; do
  if [ -e "$SRC/$d" ]; then ln -s "$SRC/$d" "$AUDIT/$d"; fi
done

cp "$SRC/subagent-tools.json" "$AUDIT/subagent-tools.json" 2>/dev/null || true

# Point profiles.json at the copy and make it the only, active profile, so the
# app cannot open the real one by accident.
python3 - "$SRC/profiles.json" "$AUDIT/profiles.json" "$AUDIT" "$PROFILE" <<'PY'
import json, sys
src, dst, audit, profile = sys.argv[1:5]
d = json.load(open(src))
keep = [p for p in d['profiles'] if p['path'].endswith('/' + profile)]
if not keep:
    sys.exit(f'no profile named {profile} in {src}')
for p in keep:
    p['path'] = f'{audit}/profiles/{profile}'
d['profiles'] = keep
d['activeProfileId'] = keep[0]['id']
json.dump(d, open(dst, 'w'), indent=2)
print('active profile:', keep[0]['id'], keep[0]['path'])
PY

du -sh "$AUDIT"
echo "AUDIT_HOME=$AUDIT"
