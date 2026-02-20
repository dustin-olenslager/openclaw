#!/bin/bash
# Chrome Process Limiter for OpenClaw
# Enforces process limits and prevents Chrome process proliferation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="/home/node/.openclaw/workspace/config/chrome-process-limits.json"
LOGFILE="/home/node/.openclaw/workspace/logs/chrome-process-limiter.log"
PROFILE_DIR="/home/node/.openclaw/browser/openclaw/user-data"

# Create log directory
mkdir -p "$(dirname "$LOGFILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOGFILE"
}

# Load configuration using node since jq has permission issues
load_config() {
    node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
        console.log('MAX_PROCESSES=' + config.chrome_process_limits.max_processes);
        console.log('MAX_MEMORY_MB=' + config.chrome_process_limits.max_memory_mb);
        console.log('ENABLE_LIMITING=' + config.chrome_process_limits.enable_process_limiting);
        console.log('CHECK_INTERVAL=' + config.process_monitoring.check_interval_seconds);
        console.log('MAX_MEMORY_PER_PROCESS=' + config.process_monitoring.max_memory_per_process_mb);
        console.log('AGGRESSIVE_THRESHOLD=' + config.process_monitoring.aggressive_cleanup_threshold);
    "
}

# Get Chrome process information
get_chrome_processes() {
    ps aux | grep "[c]hrome.*${PROFILE_DIR}" | awk '{
        gsub(/[^0-9]/, "", $6);  # Extract numeric memory value
        print $2, $6, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
    }' 2>/dev/null || echo ""
}

# Count Chrome processes
count_chrome_processes() {
    get_chrome_processes | wc -l
}

# Calculate total memory usage
get_total_memory_usage() {
    get_chrome_processes | awk '{sum+=$2} END {print sum+0}'
}

# Identify excess processes for termination
identify_excess_processes() {
    local max_processes=$1
    local current_count=$(count_chrome_processes)
    
    if [ "$current_count" -le "$max_processes" ]; then
        return 0
    fi
    
    log "Found $current_count Chrome processes, limit is $max_processes"
    
    # Get process list sorted by memory usage (descending) and age (newer first)
    get_chrome_processes | sort -k2,2nr | tail -n +$((max_processes + 1)) | awk '{print $1}'
}

# Kill excess Chrome processes
kill_excess_processes() {
    local max_processes=$1
    local pids_to_kill=$(identify_excess_processes "$max_processes")
    
    if [ -z "$pids_to_kill" ]; then
        return 0
    fi
    
    log "Killing excess Chrome processes: $pids_to_kill"
    
    # Try graceful termination first
    for pid in $pids_to_kill; do
        if kill -0 "$pid" 2>/dev/null; then
            log "Terminating process $pid"
            kill -TERM "$pid" 2>/dev/null || true
        fi
    done
    
    # Wait a bit for graceful shutdown
    sleep 3
    
    # Force kill if still running
    for pid in $pids_to_kill; do
        if kill -0 "$pid" 2>/dev/null; then
            log "Force killing process $pid"
            kill -KILL "$pid" 2>/dev/null || true
        fi
    done
}

# Check individual process memory usage
check_memory_hogs() {
    local max_memory_per_process=$1
    local memory_hogs=""
    
    while IFS= read -r line; do
        if [ -n "$line" ]; then
            local pid=$(echo "$line" | awk '{print $1}')
            local memory_kb=$(echo "$line" | awk '{print $2}')
            local memory_mb=$((memory_kb / 1024))
            
            if [ "$memory_mb" -gt "$max_memory_per_process" ]; then
                log "Memory hog detected: PID $pid using ${memory_mb}MB (limit: ${max_memory_per_process}MB)"
                memory_hogs="$memory_hogs $pid"
            fi
        fi
    done <<< "$(get_chrome_processes)"
    
    if [ -n "$memory_hogs" ]; then
        log "Killing memory hogs: $memory_hogs"
        for pid in $memory_hogs; do
            kill -TERM "$pid" 2>/dev/null || true
        done
        sleep 2
        for pid in $memory_hogs; do
            if kill -0 "$pid" 2>/dev/null; then
                kill -KILL "$pid" 2>/dev/null || true
            fi
        done
    fi
}

# Main monitoring function
monitor_chrome_processes() {
    local config_output
    config_output=$(load_config)
    eval "$config_output"
    
    if [ "$ENABLE_LIMITING" != "true" ]; then
        log "Chrome process limiting is disabled in configuration"
        return 0
    fi
    
    local current_processes=$(count_chrome_processes)
    local current_memory=$(get_total_memory_usage)
    local current_memory_mb=$((current_memory / 1024))
    
    log "Chrome Status: $current_processes processes, ${current_memory_mb}MB total memory"
    
    # Check if we need aggressive cleanup
    if [ "$current_processes" -ge "$AGGRESSIVE_THRESHOLD" ]; then
        log "WARNING: Chrome process count ($current_processes) exceeds aggressive cleanup threshold ($AGGRESSIVE_THRESHOLD)"
        
        # Run enhanced cleanup first
        if [ -f "$SCRIPT_DIR/enhanced-browser-cleanup.sh" ]; then
            log "Running enhanced browser cleanup..."
            "$SCRIPT_DIR/enhanced-browser-cleanup.sh" || true
            sleep 5
            current_processes=$(count_chrome_processes)
        fi
    fi
    
    # Kill excess processes if over limit
    if [ "$current_processes" -gt "$MAX_PROCESSES" ]; then
        kill_excess_processes "$MAX_PROCESSES"
    fi
    
    # Check for memory hogs
    check_memory_hogs "$MAX_MEMORY_PER_PROCESS"
    
    # Final status check
    local final_processes=$(count_chrome_processes)
    local final_memory=$(get_total_memory_usage)
    local final_memory_mb=$((final_memory / 1024))
    
    if [ "$final_processes" -ne "$current_processes" ] || [ "$final_memory_mb" -ne "$current_memory_mb" ]; then
        log "After cleanup: $final_processes processes, ${final_memory_mb}MB total memory"
    fi
    
    # Alert if still over limits
    if [ "$final_processes" -gt "$MAX_PROCESSES" ]; then
        log "ERROR: Still have $final_processes processes (limit: $MAX_PROCESSES)"
    fi
    
    if [ "$final_memory_mb" -gt "$MAX_MEMORY_MB" ]; then
        log "ERROR: Still using ${final_memory_mb}MB memory (limit: ${MAX_MEMORY_MB}MB)"
    fi
}

# Generate Chrome flags for process limiting
generate_chrome_flags() {
    log "Generating optimized Chrome flags for process limiting..."
    
    node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
        const flags = [
            ...config.chrome_flags.process_limiting,
            ...config.chrome_flags.memory_optimization,
            ...config.chrome_flags.headless_container,
            ...config.chrome_flags.dormant_mode,
            ...config.chrome_flags.stability
        ];
        console.log(flags.join(' '));
    "
}

# Daemon mode - continuous monitoring
daemon_mode() {
    local config_output
    config_output=$(load_config)
    eval "$config_output"
    
    log "Starting Chrome process limiter daemon (interval: ${CHECK_INTERVAL}s)"
    
    while true; do
        monitor_chrome_processes
        sleep "$CHECK_INTERVAL"
    done
}

# Show current status
show_status() {
    local current_processes=$(count_chrome_processes)
    local current_memory=$(get_total_memory_usage)
    local current_memory_mb=$((current_memory / 1024))
    
    echo "Chrome Process Status:"
    echo "  Processes: $current_processes"
    echo "  Total Memory: ${current_memory_mb}MB"
    echo ""
    echo "Process Details:"
    get_chrome_processes | while IFS= read -r line; do
        if [ -n "$line" ]; then
            local pid=$(echo "$line" | awk '{print $1}')
            local memory_kb=$(echo "$line" | awk '{print $2}')
            local memory_mb=$((memory_kb / 1024))
            local process_type=$(echo "$line" | awk '{for(i=3;i<=NF;i++) if($i=="--type=") print $(i+1); if($3 !~ /--type=/) print "main"}' | head -1)
            echo "  PID $pid: ${memory_mb}MB ($process_type)"
        fi
    done
}

# Main script logic
main() {
    case "${1:-monitor}" in
        "monitor")
            monitor_chrome_processes
            ;;
        "daemon")
            daemon_mode
            ;;
        "status")
            show_status
            ;;
        "flags")
            generate_chrome_flags
            ;;
        "kill-excess")
            local config_output
            config_output=$(load_config)
            eval "$config_output"
            kill_excess_processes "$MAX_PROCESSES"
            ;;
        *)
            echo "Usage: $0 {monitor|daemon|status|flags|kill-excess}"
            echo "  monitor    - Run one-time process monitoring and cleanup"
            echo "  daemon     - Run continuous monitoring"  
            echo "  status     - Show current Chrome process status"
            echo "  flags      - Generate optimized Chrome flags"
            echo "  kill-excess - Kill excess processes above limit"
            exit 1
            ;;
    esac
}

# Run main function if called directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi