#!/bin/bash
# Installs what `npm run check` needs, so a web session can verify a change in
# the browser without setting anything up first. The site itself has no build
# step and no runtime dependencies — this is only the check harness.
set -euo pipefail

# Local machines already have whatever the developer set up; only the ephemeral
# web container starts from nothing.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# The sandbox ships Chromium at /opt/pw-browsers and playwright's postinstall
# must not try to fetch its own.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

if [ ! -d node_modules/playwright ]; then
  npm install --no-fund --no-audit --silent
fi
