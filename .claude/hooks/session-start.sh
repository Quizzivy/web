#!/bin/bash
# Session start for Claude Code cloud containers; never fails the session.
# The web needs only its dependencies. @quizzivy/sdk comes from GitHub
# Packages, which needs a token with read:packages even to read
# (NODE_AUTH_TOKEN, README.md "Install"); without one the install is skipped.
# A live E2E also needs the API from Quizzivy/api (docs/ci.md).

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

set -uo pipefail

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
LOG="${QUIZZIVY_SESSION_START_LOG:-/tmp/quizzivy-session-start.log}"

echo '{"async": true, "asyncTimeout": 600000}'

exec >>"$LOG" 2>&1
cd "$REPO/web" || exit 0

echo "$(date -u +%FT%TZ) session start hook begins in $REPO"
if [ -f node_modules/.modules.yaml ]; then
  echo "web dependencies: already installed"
elif [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  echo "web dependencies: skipped, NODE_AUTH_TOKEN is not set (README.md, \"Install\")"
else
  pnpm install --frozen-lockfile && echo "web dependencies: ok" || echo "web dependencies: FAILED"
fi
echo "$(date -u +%FT%TZ) session start hook ends"
exit 0
