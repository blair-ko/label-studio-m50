#!/bin/zsh
set -eu
cd -- "${0:A:h}"
if curl -fsS --max-time 1 http://127.0.0.1:8785/api/bridge >/dev/null 2>&1; then
  open http://127.0.0.1:8785/
  exit
fi
if [[ -z "${LABEL_STUDIO_PRINTER_NAME:-}" && -r mac/printer-name.local ]]; then
  export LABEL_STUDIO_PRINTER_NAME="$(< mac/printer-name.local)"
fi
studio_tmp="$(mktemp -d "${TMPDIR:-/tmp}/label-studio-m50.XXXXXX")"
cleanup() {
  if [[ -n "${studio_pid:-}" ]]; then kill "$studio_pid" 2>/dev/null || true; fi
  rm -f -- "$studio_tmp/M50Bridge"
  rmdir -- "$studio_tmp"
}
trap cleanup EXIT
trap 'exit 0' INT TERM
clang -fobjc-arc mac/M50Bridge.m -framework Foundation -framework CoreBluetooth \
  "-Wl,-sectcreate,__TEXT,__info_plist,$PWD/mac/Info.plist" -o "$studio_tmp/M50Bridge"
python3 mac/serve.py --bridge "$studio_tmp/M50Bridge" &
studio_pid=$!
for attempt in {1..30}; do
  if curl -fsS --max-time 1 http://127.0.0.1:8785/api/bridge >/dev/null 2>&1; then
    open http://127.0.0.1:8785/
    wait "$studio_pid"
    exit
  fi
  kill -0 "$studio_pid" 2>/dev/null || break
  sleep .1
done
print -u2 '無法啟動 Label Studio。請確認 8785 埠未被其他程式使用。'
exit 1
