#!/usr/bin/env bash
set -euo pipefail

# IronClaw Supreme — Container Self-Update
# Pulls latest image from GHCR and recreates the container.
#
# Usage:
#   bash scripts/container-update.sh --check     Show current vs available
#   bash scripts/container-update.sh --update     Pull and recreate container
#   bash scripts/container-update.sh --help       Show help
#
# Modes:
#   1. Docker socket mode:  Container has /var/run/docker.sock mounted
#   2. Watchtower mode:     Watchtower sidecar handles pulls
#   3. Manual mode:         Prints instructions for user to run on host
#
# This script is designed to be called BY the AI (Jay/IronClaw) when
# a user says "update yourself" from the web interface or Telegram.

IMAGE="ghcr.io/dustin-olenslager/ironclaw-supreme:main"
COMPOSE_FILE=""
CONTAINER_NAME=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[IRONCLAW-UPDATE]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
ok() { echo -e "${GREEN}[OK]${NC} $*"; }

show_help() {
    cat <<'EOF'
IronClaw Supreme — Container Self-Update
=========================================

Usage:
  bash container-update.sh --check      Check for new image
  bash container-update.sh --update     Pull new image and recreate container
  bash container-update.sh --help       Show this help

Environment:
  IRONCLAW_IMAGE            Override image (default: ghcr.io/dustin-olenslager/ironclaw-supreme:main)
  IRONCLAW_COMPOSE_FILE     Path to docker-compose.yml
  IRONCLAW_CONTAINER        Container name override

Modes (auto-detected):
  Docker Socket  — /var/run/docker.sock mounted in container
  Watchtower     — Watchtower container detected
  Manual         — Prints commands for host execution
EOF
}

# ── Detect execution environment ──

detect_mode() {
    if [ -S /var/run/docker.sock ]; then
        echo "socket"
    elif docker ps --format '{{.Names}}' 2>/dev/null | grep -qi watchtower; then
        echo "watchtower"
    else
        echo "manual"
    fi
}

find_compose_file() {
    local search_dirs=(
        "/home/node/.openclaw/workspace"
        "/home/node/.openclaw"
        "/opt/openclaw"
        "/opt/ironclaw"
        "$HOME"
        "."
    )

    for dir in "${search_dirs[@]}"; do
        for name in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
            if [ -f "$dir/$name" ]; then
                echo "$dir/$name"
                return 0
            fi
        done
    done

    return 1
}

find_container() {
    # Find the running OpenClaw/IronClaw container
    docker ps --format '{{.Names}}' 2>/dev/null | grep -iE '(openclaw|ironclaw)' | head -1
}

# ── Get image digest ──

get_running_digest() {
    local container="$1"
    docker inspect --format='{{.Image}}' "$container" 2>/dev/null
}

get_remote_digest() {
    # Pull to get latest, compare digests
    docker pull "$IMAGE" 2>/dev/null | tail -1
    docker inspect --format='{{.Id}}' "$IMAGE" 2>/dev/null
}

# ── Check for updates ──

do_check() {
    log "Checking for IronClaw Supreme container updates..."
    log "Image: $IMAGE"
    echo ""

    local mode
    mode=$(detect_mode)
    log "Detected mode: $mode"

    if [ "$mode" = "manual" ]; then
        warn "No Docker socket access. Checking via registry API..."
        echo ""
        log "To check from the host, run:"
        echo "  docker pull $IMAGE"
        echo "  docker images --digests | grep ironclaw"
        return 0
    fi

    # Find running container
    CONTAINER_NAME=$(find_container)
    if [ -z "$CONTAINER_NAME" ]; then
        err "No running OpenClaw/IronClaw container found."
        return 1
    fi

    log "Running container: $CONTAINER_NAME"

    # Get current image
    local running_image
    running_image=$(docker inspect --format='{{.Config.Image}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")
    log "Current image: $running_image"

    # Get current digest
    local running_digest
    running_digest=$(get_running_digest "$CONTAINER_NAME")
    log "Running digest: ${running_digest:0:24}..."

    # Pull latest
    log "Pulling latest image..."
    docker pull "$IMAGE" --quiet >/dev/null 2>&1 || {
        err "Failed to pull $IMAGE"
        return 1
    }

    local remote_digest
    remote_digest=$(docker inspect --format='{{.Id}}' "$IMAGE" 2>/dev/null)
    log "Latest digest:  ${remote_digest:0:24}..."

    echo ""
    if [ "$running_digest" = "$remote_digest" ]; then
        ok "✅ Container is up to date."
        return 0
    else
        warn "🔄 Update available!"
        warn "Run with --update to apply."
        return 2  # Exit code 2 = update available
    fi
}

# ── Apply update ──

do_update() {
    log "Starting IronClaw Supreme container update..."
    echo ""

    local mode
    mode=$(detect_mode)
    log "Mode: $mode"

    case "$mode" in
        socket)
            do_update_socket
            ;;
        watchtower)
            do_update_watchtower
            ;;
        manual)
            do_update_manual
            ;;
    esac
}

do_update_socket() {
    log "Docker socket detected — performing direct update."

    # Find compose file
    COMPOSE_FILE=${IRONCLAW_COMPOSE_FILE:-$(find_compose_file || echo "")}
    if [ -z "$COMPOSE_FILE" ]; then
        warn "No docker-compose.yml found. Falling back to manual mode."
        do_update_manual
        return
    fi

    local compose_dir
    compose_dir=$(dirname "$COMPOSE_FILE")

    log "Compose file: $COMPOSE_FILE"
    log "Step 1/4: Pulling latest image..."
    docker pull "$IMAGE" --quiet

    log "Step 2/4: Checking health before update..."
    CONTAINER_NAME=$(find_container)
    if [ -n "$CONTAINER_NAME" ]; then
        local health
        health=$(docker inspect --format='{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")
        log "Container status: $health"
    fi

    log "Step 3/4: Recreating container with new image..."
    cd "$compose_dir"
    docker compose up -d --force-recreate --no-deps openclaw-gateway 2>/dev/null || \
    docker-compose up -d --force-recreate --no-deps openclaw-gateway 2>/dev/null || {
        err "Failed to recreate container. Trying full restart..."
        docker compose down && docker compose up -d 2>/dev/null || \
        docker-compose down && docker-compose up -d
    }

    log "Step 4/4: Verifying..."
    sleep 5

    CONTAINER_NAME=$(find_container)
    if [ -n "$CONTAINER_NAME" ]; then
        local status
        status=$(docker inspect --format='{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")
        if [ "$status" = "running" ]; then
            ok "✅ Container updated and running."
            ok "Image: $IMAGE"

            # Try health check
            if curl -sf http://localhost:18789/health >/dev/null 2>&1; then
                ok "✅ Gateway health check passed."
            else
                warn "Gateway health endpoint not responding yet (may still be starting)."
            fi
        else
            err "Container status: $status — may need attention."
            return 1
        fi
    else
        err "Container not found after update."
        return 1
    fi
}

do_update_watchtower() {
    log "Watchtower detected — triggering update check."

    # Signal Watchtower to check now
    local wt_container
    wt_container=$(docker ps --format '{{.Names}}' | grep -i watchtower | head -1)

    if [ -n "$wt_container" ]; then
        docker kill --signal=SIGHUP "$wt_container" 2>/dev/null || {
            warn "Could not signal Watchtower. Trying HTTP API..."
            curl -sf -X POST http://localhost:8080/v1/update 2>/dev/null || {
                warn "Watchtower API not available. It will check on its next schedule."
            }
        }
        ok "✅ Watchtower notified. It will pull and restart the container."
        log "Check Watchtower logs: docker logs $wt_container --tail 20"
    else
        warn "Watchtower container not found. Falling back to manual mode."
        do_update_manual
    fi
}

do_update_manual() {
    log "Manual mode — no Docker socket or Watchtower access."
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo " Run these commands on your HOST (not in container):"
    echo "═══════════════════════════════════════════════════"
    echo ""
    echo "  # Pull the latest image"
    echo "  docker pull $IMAGE"
    echo ""
    echo "  # Recreate the container"
    echo "  cd /path/to/your/docker-compose-dir"
    echo "  docker compose down"
    echo "  docker compose up -d"
    echo ""
    echo "  # Or if using Coolify, just redeploy from the dashboard."
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo ""
    warn "⚠️  This will end the current AI conversation."
    warn "    The AI will be available again once the new container starts."
}

# ── Main ──

# Override image if set
[ -n "${IRONCLAW_IMAGE:-}" ] && IMAGE="$IRONCLAW_IMAGE"

case "${1:-}" in
    --check)
        do_check
        ;;
    --update)
        do_update
        ;;
    --help|-h)
        show_help
        ;;
    *)
        show_help
        exit 1
        ;;
esac
