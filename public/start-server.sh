#!/usr/bin/env bash

set -euo pipefail

site_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
server_port="${1:-4173}"

case "$server_port" in
  ''|*[!0-9]*)
    echo "Port must be a number between 1 and 65535." >&2
    exit 1
    ;;
esac

if ((server_port < 1 || server_port > 65535)); then
  echo "Port must be a number between 1 and 65535." >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  python_command=(python3)
elif command -v python >/dev/null 2>&1; then
  python_command=(python)
else
  echo "Python 3 is required to serve Specimen locally." >&2
  exit 1
fi

site_url="http://127.0.0.1:${server_port}/"

echo "Starting Specimen at $site_url"
echo "Press Ctrl+C to stop the server."

if [[ "${SPECIMEN_NO_BROWSER:-0}" != "1" ]]; then
  (
    sleep 1
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$site_url" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then
      open "$site_url" >/dev/null 2>&1 || true
    fi
  ) &
fi

exec "${python_command[@]}" -m http.server "$server_port" \
  --bind 127.0.0.1 \
  --directory "$site_directory"
