#!/bin/bash
set -e
REPO_DIR="$HOME/fresh-repo"
LOG_FILE="$HOME/auto-fix.log"
cd "$REPO_DIR" || exit
log() { echo "$(date) - $1" >> "$LOG_FILE"; }
check_site() { curl -s -o /dev/null -w "%{http_code}" "https://rose-city-resource-guide.onrender.com/health"; }
log "=== Auto‑fix bot started ==="
status_code=$(check_site)
if [ "$status_code" -ne 200 ]; then
    log "Site returned $status_code – attempting fix (npm install)..."
    npm install
    git add package.json package-lock.json
    git commit -m "auto: npm install after site failure" || true
    git push origin main
    log "Pushed fix."
else
    log "Site is healthy (200 OK)."
fi
log "=== Bot finished ==="
