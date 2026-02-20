#!/bin/bash
# OpenClaw browser health monitor
# Detects and fixes common browser issues

PROFILE_DIR="/home/node/.openclaw/browser/openclaw/user-data"
CLEANUP_SCRIPT="/home/node/.openclaw/workspace/scripts/enhanced-browser-cleanup.sh"
LOGFILE="/home/node/.openclaw/workspace/logs/browser-health.log"
CDP_PORT=18800

# Create log directory
mkdir -p "$(dirname "$LOGFILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOGFILE"
}

check_zombie_processes() {
    local zombie_count=$(ps aux | awk '$8 ~ /^Z/ && $11 ~ /chrome/' | wc -l)
    if [ "$zombie_count" -gt 0 ]; then
        log "WARNING: Found $zombie_count zombie Chrome processes"
        ps aux | awk '$8 ~ /^Z/ && $11 ~ /chrome/ {print "  Zombie:", $2, $11}' >> "$LOGFILE"
        return 1
    fi
    return 0
}

check_stale_lock_files() {
    if [ -L "$PROFILE_DIR/SingletonLock" ]; then
        # Check if lock file is older than 1 hour
        local lock_age=$(find "$PROFILE_DIR/SingletonLock" -mmin +60 | wc -l)
        if [ "$lock_age" -gt 0 ]; then
            log "WARNING: Lock file older than 1 hour, likely stale"
            ls -la "$PROFILE_DIR/SingletonLock" >> "$LOGFILE" 2>/dev/null || true
            return 1
        fi
        
        # Check if the process referenced by the lock file actually exists
        local lock_target=$(readlink "$PROFILE_DIR/SingletonLock" 2>/dev/null || echo "")
        if [ -n "$lock_target" ]; then
            local pid=$(echo "$lock_target" | grep -o '[0-9]*$' || echo "")
            if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
                log "WARNING: Lock file references non-existent process $pid"
                return 1
            fi
        fi
    fi
    return 0
}

check_chrome_process_count() {
    local chrome_count=$(ps aux | grep "[c]hrome.*${PROFILE_DIR}" | wc -l)
    log "Active Chrome processes: $chrome_count"
    
    # Too many processes might indicate issues
    if [ "$chrome_count" -gt 20 ]; then
        log "WARNING: Unusually high number of Chrome processes ($chrome_count)"
        return 1
    fi
    
    return 0
}

check_cdp_connectivity() {
    if timeout 5 bash -c ">/dev/tcp/127.0.0.1/$CDP_PORT" 2>/dev/null; then
        # Port is reachable, try to get a response
        local response=$(curl -s --max-time 3 "http://127.0.0.1:$CDP_PORT/json" 2>/dev/null || echo "")
        if [ -n "$response" ] && echo "$response" | grep -q "webSocketDebuggerUrl"; then
            log "CDP service is healthy"
            return 0
        else
            log "WARNING: CDP port accessible but not responding correctly"
            return 1
        fi
    else
        log "WARNING: CDP port $CDP_PORT is not accessible"
        return 1
    fi
}

check_memory_usage() {
    # Check Chrome memory usage specifically
    local chrome_mem=$(ps aux | grep "[c]hrome.*${PROFILE_DIR}" | awk '{sum+=$6} END {print int(sum/1024)}' || echo "0")
    log "Chrome memory usage: ${chrome_mem}MB"
    
    # Check system memory
    local sys_mem=$(free | awk '/^Mem/ {printf "%.1f", $3/$2*100}')
    log "System memory usage: ${sys_mem}%"
    
    # Warning if Chrome is using too much memory
    if [ "$chrome_mem" -gt 1024 ]; then
        log "WARNING: Chrome using excessive memory (${chrome_mem}MB)"
        return 1
    fi
    
    # Warning if system memory is high
    if [ "${sys_mem%.*}" -gt 85 ]; then
        log "WARNING: High system memory usage (${sys_mem}%)"
        return 1
    fi
    
    return 0
}

check_recent_crashes() {
    # Look for crash indicators in the Chrome profile
    local crash_files=""
    if [ -d "$PROFILE_DIR" ]; then
        crash_files=$(find "$PROFILE_DIR" -name "Crash*" -newer "$PROFILE_DIR/../last_health_check" 2>/dev/null | wc -l || echo "0")
    fi
    
    if [ "$crash_files" -gt 0 ]; then
        log "WARNING: Found $crash_files new crash files since last check"
        return 1
    fi
    
    return 0
}

run_health_checks() {
    log "Starting browser health check..."
    local issues=0
    
    # Run all health checks
    check_zombie_processes || ((issues++))
    check_stale_lock_files || ((issues++))
    check_chrome_process_count || ((issues++))
    check_cdp_connectivity || ((issues++))
    check_memory_usage || ((issues++))
    check_recent_crashes || ((issues++))
    
    # Update timestamp for crash detection
    touch "$PROFILE_DIR/../last_health_check" 2>/dev/null || true
    
    log "Health check completed. Issues found: $issues"
    return $issues
}

trigger_cleanup() {
    log "Health issues detected, triggering cleanup..."
    if [ -x "$CLEANUP_SCRIPT" ]; then
        "$CLEANUP_SCRIPT"
        log "Cleanup script executed"
        
        # Wait a moment and re-check critical issues
        sleep 5
        if check_cdp_connectivity; then
            log "CDP connectivity restored after cleanup"
        else
            log "WARNING: CDP connectivity still problematic after cleanup"
        fi
    else
        log "ERROR: Cleanup script not found or not executable: $CLEANUP_SCRIPT"
    fi
}

# Main execution
main() {
    # Ensure we don't run multiple instances
    local lockfile="/tmp/browser-health-monitor.lock"
    exec 200>"$lockfile"
    if ! flock -n 200; then
        log "Another instance is already running, exiting"
        exit 0
    fi
    
    log "Browser health monitor started (PID: $$)"
    
    if ! run_health_checks; then
        trigger_cleanup
    else
        log "Browser health check passed"
    fi
    
    log "Browser health monitor completed"
}

# Run if called directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi