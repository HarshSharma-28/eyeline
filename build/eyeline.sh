#!/bin/sh
# Starts Eyeline. Falls back to running without Chromium's sandbox on distributions
# that block it (Eyeline only shows its own local pages, never websites).
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$(mktemp)"
"$DIR/Eyeline" --ozone-platform=x11 "$@" 2>"$LOG"
CODE=$?
if [ $CODE -ne 0 ] && grep -qi "sandbox" "$LOG"; then
  rm -f "$LOG"
  exec "$DIR/Eyeline" --ozone-platform=x11 --no-sandbox "$@"
fi
cat "$LOG" >&2; rm -f "$LOG"
exit $CODE
