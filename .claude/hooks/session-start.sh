#!/bin/bash
# Prepares a cloud session: land on the branch this site publishes from, and
# install what `npm run check` needs so a change can be verified in the browser
# without setting anything up first. The site itself has no build step and no
# runtime dependencies — playwright is only for the check harness.
set -euo pipefail

# Local machines already have whatever the developer set up; only the ephemeral
# cloud container starts from nothing.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# ── land on main ──────────────────────────────────────────────────────────
# The container checks out a per-session scratch branch (claude/…), but Pages
# publishes from main. A commit left on the scratch branch never reaches the
# site, and a restart silently redirects the next one, so move across when
# nothing would be lost. Anything unexpected — a dirty tree, or commits the
# scratch branch has and main does not — is left exactly as found and reported,
# because losing work is worse than starting on the wrong branch.
git fetch origin main --quiet 2>/dev/null || true

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
case "$branch" in
  claude/*)
    # Compare against local main, not origin/main: main is what survives the
    # switch, so it is what decides whether deleting the scratch branch would
    # drop a commit. Against origin/main an unpushed commit already on main
    # would read as scratch-only work and block the move.
    base=main
    git rev-parse --verify --quiet main >/dev/null 2>&1 || base=origin/main
    dirty=$(git status --porcelain 2>/dev/null || true)
    ahead=$(git log --oneline "$base..$branch" 2>/dev/null || true)
    if [ -n "$dirty" ]; then
      echo "session-start: staying on $branch — uncommitted changes present"
    elif [ -n "$ahead" ]; then
      echo "session-start: staying on $branch — it has commits main does not:"
      echo "$ahead" | sed 's/^/  /'
    else
      git checkout --quiet main 2>/dev/null || git checkout --quiet -b main origin/main
      git merge --ff-only origin/main --quiet 2>/dev/null || true
      git branch -D "$branch" >/dev/null 2>&1 || true
      echo "session-start: moved off $branch — committing to main, which Pages serves"
    fi
    ;;
esac

# ── check harness ─────────────────────────────────────────────────────────
# The sandbox ships Chromium at /opt/pw-browsers and playwright's postinstall
# must not try to fetch its own.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

if [ ! -d node_modules/playwright ]; then
  npm install --no-fund --no-audit --silent
fi
