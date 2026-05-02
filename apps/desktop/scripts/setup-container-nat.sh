#!/bin/bash
# scripts/setup-container-nat.sh
#
# Enables internet access for Apple Container VMs by setting up
# IP forwarding and pf NAT rules on macOS.
#
# The container "default" network uses mode:nat with subnet 192.168.64.0/24,
# but macOS doesn't automatically enable forwarding or NAT rules.
# This script bridges that gap.
#
# Usage: sudo ./scripts/setup-container-nat.sh
#
# To undo: sudo ./scripts/setup-container-nat.sh --teardown

set -euo pipefail

SUBNET="192.168.64.0/24"
ANCHOR_NAME="sero-container-nat"
PF_ANCHOR_FILE="/etc/pf.anchors/${ANCHOR_NAME}"

# Detect the default outbound interface (usually en0)
OUT_IF=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
if [ -z "$OUT_IF" ]; then
  echo "❌ Could not detect default network interface. Are you connected to the internet?"
  exit 1
fi

teardown() {
  echo "🧹 Tearing down container NAT..."

  # Disable IP forwarding
  sysctl -w net.inet.ip.forwarding=0 >/dev/null 2>&1 || true
  echo "   ✓ IP forwarding disabled"

  # Remove anchor file
  if [ -f "$PF_ANCHOR_FILE" ]; then
    rm -f "$PF_ANCHOR_FILE"
    echo "   ✓ Removed pf anchor file"
  fi

  # Flush the anchor rules
  pfctl -a "$ANCHOR_NAME" -F all 2>/dev/null || true
  echo "   ✓ Flushed pf anchor rules"

  echo "✅ Container NAT torn down"
}

setup() {
  echo "🔧 Setting up container NAT for Apple Containers..."
  echo "   Subnet:    $SUBNET"
  echo "   Interface: $OUT_IF"
  echo ""

  # 1. Enable IP forwarding
  sysctl -w net.inet.ip.forwarding=1 >/dev/null
  echo "   ✓ IP forwarding enabled"

  # 2. Write the NAT anchor file
  cat > "$PF_ANCHOR_FILE" <<EOF
# NAT rule for Apple Container VMs (Sero)
# Masquerade container subnet through the default interface
nat on $OUT_IF from $SUBNET to any -> ($OUT_IF)
EOF
  echo "   ✓ Written pf anchor: $PF_ANCHOR_FILE"

  # 3. Ensure the anchor is referenced in pf.conf (idempotent)
  if ! grep -q "anchor \"${ANCHOR_NAME}\"" /etc/pf.conf 2>/dev/null; then
    # Add before the last line (or at end)
    echo "" >> /etc/pf.conf
    echo "# Sero container NAT" >> /etc/pf.conf
    echo "nat-anchor \"${ANCHOR_NAME}\"" >> /etc/pf.conf
    echo "anchor \"${ANCHOR_NAME}\"" >> /etc/pf.conf
    echo "load anchor \"${ANCHOR_NAME}\" from \"${PF_ANCHOR_FILE}\"" >> /etc/pf.conf
    echo "   ✓ Added anchor to /etc/pf.conf"
  else
    echo "   ✓ Anchor already in /etc/pf.conf"
  fi

  # 4. Load the rules
  pfctl -f /etc/pf.conf 2>/dev/null || true
  pfctl -E 2>/dev/null || true
  echo "   ✓ pf rules loaded and enabled"

  echo ""
  echo "✅ Container NAT is active!"
  echo "   Containers on $SUBNET can now reach the internet via $OUT_IF"
  echo ""
  echo "   Note: IP forwarding resets on reboot. To persist, add to a login item or LaunchDaemon."
  echo "   To undo: sudo $0 --teardown"
}

# Require root
if [ "$(id -u)" -ne 0 ]; then
  echo "❌ This script must be run with sudo"
  echo "   Usage: sudo $0"
  exit 1
fi

if [ "${1:-}" = "--teardown" ]; then
  teardown
else
  setup
fi
