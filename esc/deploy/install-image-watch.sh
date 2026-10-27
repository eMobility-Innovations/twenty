#!/usr/bin/env bash
# Run as root on CT175 from this checkout.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ "$(id -u)" -ne 0 ]; then
  echo 'Run this installer as root on CT175.' >&2
  exit 1
fi
DEST=/opt/twenty-esc-image-watch
install -d -m 755 "$DEST"
install -d -m 755 "$DEST/scripts" "$DEST/esc/deploy"
install -m 755 "$HERE/watch-esc-image.sh" "$DEST/watch-esc-image.sh"
# Preserve the verifier's existing ../esc/deploy probe lookup without modifying it.
install -m 755 "$HERE/../../scripts/verify-esc-image.sh" "$DEST/scripts/verify-esc-image.sh"
install -m 644 "$HERE/enterprise-behaviour-probe.cjs" "$DEST/esc/deploy/enterprise-behaviour-probe.cjs"
install -m 644 "$HERE/alert_client.py" "$DEST/alert_client.py"
install -m 644 "$HERE/systemd/twenty-esc-image-watch.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now twenty-esc-image-watch.service
rc=0
VERIFY="$DEST/scripts/verify-esc-image.sh" "$DEST/watch-esc-image.sh" --once || rc=$?
printf 'Running-image verification exit code: %s\n' "$rc"
exit "$rc"
