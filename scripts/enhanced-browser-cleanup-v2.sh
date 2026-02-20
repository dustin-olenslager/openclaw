#!/bin/bash
# Enhanced OpenClaw browser cleanup script v2
# Now includes Chrome process proliferation prevention and limiting

set -e

PROFILE_DIR="/home/node/.openclaw/browser/openclaw/user-data"
CDP_PORT=18800
LOGFILE="/home/node/.openclaw/workspace/logs/browser-cleanup.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROCESS_LIMITER="$SCRIPT_DIR/chrome-process-limiter.sh"

# Create log directory
mkdir -p "$(dirname "$LOGFILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOGFILE"
}

cleanup_chrome_processes() {
    log "Checking for Chrome processes..."
    
    # Get current process count before cleanup
    local process_count_before=$(ps aux | grep "[c]hrome.*${PROFILE_DIR}" | wc -l || echo "0")
    log "Found $process_count_before Chrome processes before cleanup"
    
    # Find and kill any Chrome processes using the OpenClaw profile
    local pids=$(ps aux | grep "[c]hrome.*${PROFILE_DIR}" | awk '{print $2}' | tr '\n' ' ' || echo "")
    if [ -n "$pids" ] && [ "$pids" != " " ]; then
        log "Chrome processes to terminate: $pids"
        
        # First try graceful termination
        kill -TERM $pids 2>/dev/null || true
        sleep 3
        
        # Check if processes are still running
        local remaining=$(ps aux | grep "[c]hrome.*${PROFILE_DIR}" | awk '{print $2}' | tr '\n' ' ' || echo "")
        if [ -n "$remaining" ] && [ "$remaining" != " " ]; then
            log "Force killing remaining processes: $remaining"
            kill -KILL $remaining 2>/dev/null || true
        fi
        log "Chrome processes terminated"
    else
        log "No Chrome processes found using OpenClaw profile"
    fi
    
    # Clean up any zombie Chrome processes
    local zombies=$(ps aux | awk '$8 ~ /^Z/ && $11 ~ /chrome/ {print $2}' | tr '\n' ' ' || echo "")
    if [ -n "$zombies" ] && [ "$zombies" != " " ]; then
        log "Found zombie Chrome processes: $zombies"
        ps aux | awk '$8 ~ /^Z/ && $11 ~ /chrome/ {print "Zombie process:", $2, $11}' | while read line; do
            log "$line"
        done
    fi
}

cleanup_lock_files() {
    log "Cleaning up Chrome lock files..."
    if [ -d "$PROFILE_DIR" ]; then
        local removed_files=""
        for file in SingletonLock SingletonCookie SingletonSocket; do
            if [ -e "$PROFILE_DIR/$file" ]; then
                rm -f "$PROFILE_DIR/$file" 2>/dev/null || true
                removed_files="$removed_files $file"
            fi
        done
        if [ -n "$removed_files" ]; then
            log "Removed lock files:$removed_files"
        else
            log "No lock files found to remove"
        fi
    else
        log "Profile directory $PROFILE_DIR does not exist"
    fi
}

cleanup_temp_files() {
    log "Cleaning up temporary Chrome files..."
    # Clean up Chrome temporary files that may cause issues
    find /tmp -name "org.chromium.Chromium.*" -type d -exec rm -rf {} + 2>/dev/null || true
    find /tmp -name ".org.chromium.*" -type f -delete 2>/dev/null || true
    find /tmp -name "*chrome*" -type f -mtime +1 -delete 2>/dev/null || true
    log "Temporary files cleaned"
}

cleanup_shared_memory() {
    log "Cleaning up Chrome shared memory segments..."
    # Clean up any orphaned shared memory segments
    if command -v ipcs >/dev/null 2>&1; then
        # Remove shared memory segments owned by current user that might be from Chrome
        ipcs -m | awk '/node/ {print $2}' | while read shmid; do
            ipcrm -m "$shmid" 2>/dev/null || true
        done
    fi
    
    # Clean up /dev/shm entries
    find /dev/shm -name "*chrome*" -type f 2>/dev/null | while read file; do
        rm -f "$file" 2>/dev/null || true
    done
    log "Shared memory cleanup completed"
}

apply_process_limits() {
    log "Applying Chrome process limits..."
    
    if [ -x "$PROCESS_LIMITER" ]; then
        # Run process limiter to enforce limits
        "$PROCESS_LIMITER" monitor
        log "Process limiting applied"
    else
        log "WARNING: Chrome process limiter not found or not executable"
    fi
}

check_port_availability() {
    log "Checking CDP port $CDP_PORT availability..."
    # Test if port is responding
    if timeout 3 bash -c ">/dev/tcp/127.0.0.1/$CDP_PORT" 2>/dev/null; then
        log "Port $CDP_PORT is responsive"
        return 0
    else
        log "Port $CDP_PORT is not accessible"
        return 1
    fi
}

check_system_resources() {
    log "Checking system resources..."
    
    # Check memory usage
    local mem_usage=$(free | awk '/^Mem/ {printf "%.1f", $3/$2*100}')
    log "Memory usage: ${mem_usage}%"
    
    # Check if we're running out of memory
    if [ "${mem_usage%.*}" -gt 90 ]; then
        log "WARNING: High memory usage detected (${mem_usage}%)"
    fi
    
    # Count total Chrome processes system-wide
    local chrome_processes=$(ps aux | grep -c "[c]hrome" || echo "0")
    log "Total Chrome processes system-wide: $chrome_processes"
    
    # Check for core dumps
    local core_dumps=$(find /home/node/.openclaw -name "core.*" -o -name "*.dmp" 2>/dev/null | wc -l)
    if [ "$core_dumps" -gt 0 ]; then
        log "Found $core_dumps core dump files"
    fi
    
    # Check for excessive process counts
    if [ "$chrome_processes" -gt 20 ]; then
        log "WARNING: Excessive Chrome process count ($chrome_processes). This indicates process proliferation."
    fi
}

generate_optimized_chrome_flags() {
    log "Generating optimized Chrome startup flags..."
    
    if [ -x "$PROCESS_LIMITER" ]; then
        local flags=$("$PROCESS_LIMITER" flags)
        echo "# Optimized Chrome flags for OpenClaw headless container operation" > /tmp/chrome-flags.txt
        echo "# Generated on $(date)" >> /tmp/chrome-flags.txt
        echo "$flags" >> /tmp/chrome-flags.txt
        log "Chrome flags generated: /tmp/chrome-flags.txt"
        log "Recommended flags: $flags"
    fi
}

implement_dormant_mode() {
    log "Implementing Chrome dormant mode configuration..."
    
    # Create a preferences file that minimizes Chrome's background activity
    local prefs_file="$PROFILE_DIR/Default/Preferences"
    local prefs_dir="$(dirname "$prefs_file")"
    
    if [ ! -d "$prefs_dir" ]; then
        mkdir -p "$prefs_dir"
    fi
    
    # Create minimal preferences to reduce background processes
    cat > "$prefs_file" <<EOF
{
   "background_mode": {
      "enabled": false
   },
   "bookmark_bar": {
      "show_on_all_tabs": false
   },
   "default_search_provider_data": {
      "template_url_data": {
         "short_name": "Google",
         "keyword": "google.com",
         "url": "https://www.google.com/search?q={searchTerms}",
         "suggestions_url": "https://www.google.com/complete/search?output=chrome&q={searchTerms}"
      }
   },
   "extensions": {
      "settings": {},
      "toolbar": []
   },
   "homepage": "about:blank",
   "homepage_is_newtabpage": false,
   "plugins": {
      "always_open_pdf_externally": true,
      "enabled_internal_pdf3": false
   },
   "profile": {
      "default_content_setting_values": {
         "notifications": 2
      }
   },
   "session": {
      "restore_on_startup": 5,
      "startup_urls": [ "about:blank" ]
   }
}
EOF
    
    log "Dormant mode preferences configured"
}

# Main cleanup sequence
main() {
    log "Starting enhanced browser cleanup v2 (PID: $$)"
    
    # Check system state first
    check_system_resources
    
    # Perform comprehensive cleanup steps
    cleanup_chrome_processes
    cleanup_lock_files
    cleanup_temp_files
    cleanup_shared_memory
    
    # Implement process proliferation prevention
    implement_dormant_mode
    apply_process_limits
    
    # Generate optimized configuration
    generate_optimized_chrome_flags
    
    # Brief pause to let the system settle
    sleep 2
    
    # Final verification and status
    local final_processes=$(ps aux | grep "[c]hrome.*${PROFILE_DIR}" | wc -l || echo "0")
    log "Chrome processes remaining after cleanup: $final_processes"
    
    if ! check_port_availability; then
        log "Port check failed - Chrome may need manual restart by OpenClaw service"
    fi
    
    # Final resource check
    local final_memory=$(free | awk '/^Mem/ {printf "%.1f", $3/$2*100}')
    log "Final memory usage: ${final_memory}%"
    
    log "Enhanced browser cleanup v2 completed successfully"
}

# Run cleanup if called directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi