#!/bin/bash
# ============================================================================
# IronClaw Supreme — Self-Update Script
# ============================================================================
#
# Pulls latest from dustin-olenslager/ironclaw-supreme and optionally restarts.
#
# Usage:
#   ./self-update.sh              # Pull only, no restart
#   ./self-update.sh --restart    # Pull + restart gateway
#   ./self-update.sh --check      # Dry run — show what would change
#   ./self-update.sh --help       # Show usage
#
# Exit codes:
#   0 — Success (updated or already current)
#   1 — Error (git failure, wrong remote, etc.)
#   2 — Up to date, nothing to do
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

IRONCLAW_REPO="https://github.com/dustin-olenslager/ironclaw-supreme.git"
IRONCLAW_REMOTE_NAME="origin"
IRONCLAW_BRANCH="main"
WORKSPACE_DIR="${IRONCLAW_WORKSPACE:-/home/node/.openclaw/workspace}"
LOG_FILE="${IRONCLAW_LOG_DIR:-/home/node/.openclaw/logs}/self-update.log"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
    local level="$1"; shift
    local msg="$*"
    local ts
    ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo "[$ts] [SELF-UPDATE] [$level] $msg" | tee -a "$LOG_FILE" 2>/dev/null || true
}

die() {
    log "ERROR" "$*"
    exit 1
}

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

preflight() {
    # Workspace exists
    if [ ! -d "$WORKSPACE_DIR" ]; then
        die "Workspace not found: $WORKSPACE_DIR"
    fi

    cd "$WORKSPACE_DIR"

    # Git available
    if ! command -v git &>/dev/null; then
        die "git not found in PATH"
    fi

    # Is a git repo
    if ! git rev-parse --git-dir &>/dev/null; then
        die "$WORKSPACE_DIR is not a git repository"
    fi

    # Verify origin points to ironclaw-supreme
    local origin_url
    origin_url="$(git remote get-url "$IRONCLAW_REMOTE_NAME" 2>/dev/null || true)"

    if [ -z "$origin_url" ]; then
        die "Remote '$IRONCLAW_REMOTE_NAME' not configured"
    fi

    if ! echo "$origin_url" | grep -qi "ironclaw-supreme"; then
        log "WARN" "Remote '$IRONCLAW_REMOTE_NAME' points to: $origin_url"
        log "WARN" "Expected: $IRONCLAW_REPO"
        log "INFO" "Fixing remote URL..."
        git remote set-url "$IRONCLAW_REMOTE_NAME" "$IRONCLAW_REPO"
        log "INFO" "Remote updated to $IRONCLAW_REPO"
    fi

    log "INFO" "Preflight checks passed"
}

# ---------------------------------------------------------------------------
# Check for updates (dry run)
# ---------------------------------------------------------------------------

check_updates() {
    cd "$WORKSPACE_DIR"

    log "INFO" "Fetching latest from $IRONCLAW_REMOTE_NAME..."
    git fetch "$IRONCLAW_REMOTE_NAME" "$IRONCLAW_BRANCH" --quiet

    local local_commit upstream_commit behind
    local_commit="$(git rev-parse HEAD)"
    upstream_commit="$(git rev-parse "$IRONCLAW_REMOTE_NAME/$IRONCLAW_BRANCH")"
    behind="$(git rev-list --count "HEAD..$IRONCLAW_REMOTE_NAME/$IRONCLAW_BRANCH")"

    if [ "$behind" -eq 0 ]; then
        log "INFO" "Already up to date at $(echo "$local_commit" | head -c 8)"
        echo "STATUS: UP_TO_DATE"
        echo "COMMIT: $(echo "$local_commit" | head -c 8)"
        return 2
    fi

    log "INFO" "$behind commit(s) behind $IRONCLAW_REMOTE_NAME/$IRONCLAW_BRANCH"

    echo "STATUS: UPDATE_AVAILABLE"
    echo "COMMITS_BEHIND: $behind"
    echo "LOCAL: $(echo "$local_commit" | head -c 8)"
    echo "REMOTE: $(echo "$upstream_commit" | head -c 8)"
    echo ""
    echo "CHANGES:"
    git log --oneline "HEAD..$IRONCLAW_REMOTE_NAME/$IRONCLAW_BRANCH"

    return 0
}

# ---------------------------------------------------------------------------
# Perform update
# ---------------------------------------------------------------------------

do_update() {
    cd "$WORKSPACE_DIR"

    log "INFO" "Fetching latest from $IRONCLAW_REMOTE_NAME..."
    git fetch "$IRONCLAW_REMOTE_NAME" "$IRONCLAW_BRANCH" --quiet

    local behind
    behind="$(git rev-list --count "HEAD..$IRONCLAW_REMOTE_NAME/$IRONCLAW_BRANCH")"

    if [ "$behind" -eq 0 ]; then
        log "INFO" "Already up to date — nothing to pull"
        echo "✅ Already up to date."
        return 2
    fi

    local before_commit
    before_commit="$(git rev-parse --short HEAD)"

    log "INFO" "Pulling $behind commit(s)..."

    # Stash any local changes (shouldn't be any, but just in case)
    local stashed=false
    if ! git diff --quiet HEAD 2>/dev/null; then
        log "WARN" "Local changes detected — stashing"
        git stash push -m "ironclaw-self-update-$(date +%Y%m%d-%H%M%S)"
        stashed=true
    fi

    # Pull
    if ! git pull "$IRONCLAW_REMOTE_NAME" "$IRONCLAW_BRANCH" --ff-only 2>&1; then
        log "ERROR" "Fast-forward pull failed — manual intervention needed"
        if [ "$stashed" = true ]; then
            git stash pop || true
        fi
        die "Pull failed. Run 'git status' to diagnose."
    fi

    local after_commit
    after_commit="$(git rev-parse --short HEAD)"

    # Restore stash if we made one
    if [ "$stashed" = true ]; then
        log "INFO" "Restoring stashed local changes..."
        git stash pop || log "WARN" "Stash pop had conflicts — check manually"
    fi

    log "INFO" "Updated: $before_commit → $after_commit ($behind commits)"

    echo "✅ Updated successfully!"
    echo "   Before: $before_commit"
    echo "   After:  $after_commit"
    echo "   Commits pulled: $behind"

    # Show what changed
    echo ""
    echo "📝 Changes:"
    git log --oneline "${before_commit}..${after_commit}"

    return 0
}

# ---------------------------------------------------------------------------
# Restart gateway
# ---------------------------------------------------------------------------

do_restart() {
    log "INFO" "Restarting gateway..."

    # Try systemctl first (if running as a service)
    if command -v systemctl &>/dev/null && systemctl is-active --quiet ironclaw-supreme 2>/dev/null; then
        log "INFO" "Restarting via systemctl..."
        systemctl restart ironclaw-supreme
        echo "🔄 Gateway restarted via systemctl"
        return 0
    fi

    # Try Docker restart
    local container_id
    container_id="$(docker ps --filter 'name=openclaw' --filter 'name=ironclaw' -q 2>/dev/null | head -1 || true)"
    if [ -n "$container_id" ]; then
        log "INFO" "Restarting Docker container $container_id..."
        docker restart "$container_id"
        echo "🔄 Gateway container restarted"
        return 0
    fi

    # Try pkill + restart
    if pgrep -f "openclaw" &>/dev/null; then
        log "INFO" "Stopping openclaw processes..."
        pkill -f "openclaw-gateway" || true
        sleep 2

        # Attempt restart via nohup
        if command -v openclaw &>/dev/null; then
            nohup openclaw gateway run --bind loopback --port 18789 --force > /tmp/openclaw-gateway.log 2>&1 &
            echo "🔄 Gateway restarted via nohup"
            return 0
        fi
    fi

    log "WARN" "Could not auto-restart — please restart manually"
    echo "⚠️  Could not detect gateway process. Please restart manually."
    return 1
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

    case "${1:-}" in
        --help|-h)
            echo "IronClaw Supreme Self-Update"
            echo ""
            echo "Usage:"
            echo "  self-update.sh              Pull latest, no restart"
            echo "  self-update.sh --restart    Pull latest + restart gateway"
            echo "  self-update.sh --check      Dry run — show available updates"
            echo "  self-update.sh --help       Show this help"
            echo ""
            echo "Environment Variables:"
            echo "  IRONCLAW_WORKSPACE    Override workspace directory"
            echo "  IRONCLAW_LOG_DIR      Override log directory"
            exit 0
            ;;
        --check)
            preflight
            check_updates
            exit $?
            ;;
        --restart)
            preflight
            do_update
            update_exit=$?
            if [ $update_exit -eq 0 ]; then
                echo ""
                do_restart
            elif [ $update_exit -eq 2 ]; then
                echo "No restart needed — already current."
            fi
            exit 0
            ;;
        "")
            preflight
            do_update
            exit $?
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run with --help for usage"
            exit 1
            ;;
    esac
}

main "$@"
