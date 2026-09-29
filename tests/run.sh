#!/bin/sh
# Runs every suite against a throwaway server. Needs playwright-core and a
# Chromium at $CHROME (the default is where the cloud sandbox keeps one).
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --silent playwright-core
python3 -m http.server 8321 --directory .. >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1.5
fails=0
for f in *.test.js; do
  printf '%-16s ' "${f%.test.js}"
  out=$(node "$f" 2>&1) || fails=$((fails+1))
  echo "$out" | grep -E 'PASSED|FAILURES' | tail -1
  echo "$out" | grep ' FAIL ' || true
done
[ "$fails" -eq 0 ] && echo "ALL SUITES PASSED" || echo "$fails SUITE(S) FAILED"
exit $fails
