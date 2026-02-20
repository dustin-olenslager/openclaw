#!/usr/bin/env node

/**
 * IronClaw Supreme Version Monitor - Main Version Checker
 * Compares current IronClaw Supreme version with upstream OpenClaw
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    UPSTREAM_REMOTE: 'upstream',
    UPSTREAM_URL: 'https://github.com/openclaw/openclaw.git',
    WORKSPACE_DIR: '/home/node/.openclaw/workspace',
    LOG_FILE: '/home/node/.openclaw/logs/version-monitor.log',
    MIN_COMMITS_FOR_ALERT: parseInt(process.env.MIN_COMMITS_FOR_ALERT) || 100,
    CACHE_FILE: '/home/node/.openclaw/.version-cache.json'
};

// Ensure log directory exists
const logDir = path.dirname(CONFIG.LOG_FILE);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Log messages with timestamps
 */
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    console.log(logMessage);
    
    // Append to log file
    fs.appendFileSync(CONFIG.LOG_FILE, logMessage + '\\n');
}

/**
 * Execute shell command and return promise
 */
function execAsync(command, options = {}) {
    return new Promise((resolve, reject) => {
        if (process.env.DEBUG) {
            log(`Executing: ${command}`, 'DEBUG');
        }
        
        exec(command, { 
            cwd: CONFIG.WORKSPACE_DIR,
            timeout: 60000, // 60 second timeout
            ...options 
        }, (error, stdout, stderr) => {
            if (error) {
                log(`Command failed: ${command}`, 'ERROR');
                log(`Error: ${error.message}`, 'ERROR');
                reject(error);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

/**
 * Ensure upstream remote is configured
 */
async function ensureUpstreamRemote() {
    try {
        // Check if upstream remote exists
        const remotes = await execAsync('git remote -v');
        
        if (!remotes.includes(CONFIG.UPSTREAM_REMOTE)) {
            log('Adding upstream remote...');
            await execAsync(`git remote add ${CONFIG.UPSTREAM_REMOTE} ${CONFIG.UPSTREAM_URL}`);
        }
        
        // Fetch latest upstream data
        log('Fetching upstream data...');
        await execAsync(`git fetch ${CONFIG.UPSTREAM_REMOTE} --tags --quiet`);
        
        return true;
    } catch (error) {
        log(`Failed to configure upstream remote: ${error.message}`, 'ERROR');
        return false;
    }
}

/**
 * Get current IronClaw Supreme version info
 */
async function getCurrentVersionInfo() {
    try {
        const currentCommit = await execAsync('git rev-parse HEAD');
        const currentBranch = await execAsync('git branch --show-current');
        const currentShort = currentCommit.substring(0, 8);
        
        // Try to get a version tag if it exists
        let versionTag = null;
        try {
            versionTag = await execAsync('git describe --tags --exact-match HEAD 2>/dev/null');
        } catch (e) {
            // No tag on current commit, that's fine
        }
        
        return {
            commit: currentCommit,
            commitShort: currentShort,
            branch: currentBranch,
            versionTag: versionTag,
            description: versionTag || `${currentBranch}@${currentShort}`
        };
    } catch (error) {
        log(`Failed to get current version info: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Get latest upstream OpenClaw version info
 */
async function getUpstreamVersionInfo() {
    try {
        // Get latest upstream commit
        const upstreamCommit = await execAsync(`git rev-parse ${CONFIG.UPSTREAM_REMOTE}/main`);
        const upstreamShort = upstreamCommit.substring(0, 8);
        
        // Get latest release tag
        let latestTag = null;
        let tagDate = null;
        try {
            const tags = await execAsync(`git tag --sort=-version:refname --list "v*" --merged ${CONFIG.UPSTREAM_REMOTE}/main`);
            const tagList = tags.split('\\n').filter(t => t.trim());
            if (tagList.length > 0) {
                latestTag = tagList[0];
                tagDate = await execAsync(`git log -1 --format=%ci ${latestTag}`);
            }
        } catch (e) {
            log('Could not fetch release tags', 'WARN');
        }
        
        // Get commit date
        const commitDate = await execAsync(`git log -1 --format=%ci ${CONFIG.UPSTREAM_REMOTE}/main`);
        
        return {
            commit: upstreamCommit,
            commitShort: upstreamShort,
            latestTag: latestTag,
            tagDate: tagDate,
            commitDate: commitDate,
            description: latestTag || `main@${upstreamShort}`
        };
    } catch (error) {
        log(`Failed to get upstream version info: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Calculate version difference
 */
async function calculateVersionDifference(current, upstream) {
    try {
        // Count commits behind
        const behindOutput = await execAsync(`git rev-list --count ${current.commit}..${CONFIG.UPSTREAM_REMOTE}/main`);
        const commitsBehind = parseInt(behindOutput) || 0;
        
        // Count commits ahead (our custom changes)
        const aheadOutput = await execAsync(`git rev-list --count ${CONFIG.UPSTREAM_REMOTE}/main..${current.commit}`);
        const commitsAhead = parseInt(aheadOutput) || 0;
        
        // Get recent upstream commits for summary
        let recentCommits = [];
        if (commitsBehind > 0) {
            const recentOutput = await execAsync(`git log --oneline ${current.commit}..${CONFIG.UPSTREAM_REMOTE}/main | head -10`);
            recentCommits = recentOutput.split('\\n').filter(line => line.trim());
        }
        
        return {
            commitsBehind,
            commitsAhead,
            recentCommits,
            isOutdated: commitsBehind > 0,
            isSignificant: commitsBehind >= CONFIG.MIN_COMMITS_FOR_ALERT
        };
    } catch (error) {
        log(`Failed to calculate version difference: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Analyze upstream commits for important changes
 */
function analyzeCommitImportance(commits) {
    const analysis = {
        security: [],
        features: [],
        fixes: [],
        breaking: [],
        other: []
    };
    
    const patterns = {
        security: /\\b(security|auth|oauth|csrf|xss|vulnerability|cve)\\b/i,
        features: /\\b(feat|feature|add|new)\\b/i,
        fixes: /\\b(fix|bug|issue|patch|resolve)\\b/i,
        breaking: /\\b(break|breaking|major|deprecated)\\b/i
    };
    
    for (const commit of commits) {
        let categorized = false;
        
        for (const [category, pattern] of Object.entries(patterns)) {
            if (pattern.test(commit)) {
                analysis[category].push(commit);
                categorized = true;
                break;
            }
        }
        
        if (!categorized) {
            analysis.other.push(commit);
        }
    }
    
    return analysis;
}

/**
 * Generate version report
 */
function generateReport(current, upstream, difference, analysis) {
    const report = {
        timestamp: new Date().toISOString(),
        current: current,
        upstream: upstream,
        difference: difference,
        analysis: analysis,
        needsAlert: difference.isSignificant,
        summary: {
            status: difference.commitsBehind === 0 ? 'current' : 'outdated',
            message: difference.commitsBehind === 0 
                ? 'IronClaw Supreme is current with upstream OpenClaw'
                : `IronClaw Supreme is ${difference.commitsBehind} commits behind upstream`,
            action: difference.isSignificant ? 'Update recommended' : 'No action needed'
        }
    };
    
    return report;
}

/**
 * Cache report to avoid duplicate notifications
 */
function cacheReport(report) {
    try {
        const cacheData = {
            lastCheck: report.timestamp,
            commitsBehind: report.difference.commitsBehind,
            upstreamCommit: report.upstream.commit,
            lastAlert: report.needsAlert ? report.timestamp : null
        };
        
        fs.writeFileSync(CONFIG.CACHE_FILE, JSON.stringify(cacheData, null, 2));
    } catch (error) {
        log(`Failed to cache report: ${error.message}`, 'WARN');
    }
}

/**
 * Check if we should send an alert (avoid spam)
 */
function shouldSendAlert(report) {
    if (!report.needsAlert) {
        return false;
    }
    
    try {
        if (!fs.existsSync(CONFIG.CACHE_FILE)) {
            return true; // First time
        }
        
        const cache = JSON.parse(fs.readFileSync(CONFIG.CACHE_FILE, 'utf8'));
        
        // Don't alert if upstream commit is the same as last alert
        if (cache.lastAlert && cache.upstreamCommit === report.upstream.commit) {
            log('Skipping alert - same upstream commit as last alert');
            return false;
        }
        
        // Don't alert more than once per day
        if (cache.lastAlert) {
            const lastAlertTime = new Date(cache.lastAlert);
            const hoursSinceLastAlert = (Date.now() - lastAlertTime.getTime()) / (1000 * 60 * 60);
            
            if (hoursSinceLastAlert < 24) {
                log(`Skipping alert - last alert was ${hoursSinceLastAlert.toFixed(1)} hours ago`);
                return false;
            }
        }
        
        return true;
    } catch (error) {
        log(`Error checking alert status: ${error.message}`, 'WARN');
        return true; // Default to sending alert on error
    }
}

/**
 * Main version check function
 */
async function checkVersion() {
    try {
        log('🚀 Starting IronClaw Supreme version check...');
        
        // Ensure we have upstream configured
        const upstreamOk = await ensureUpstreamRemote();
        if (!upstreamOk) {
            throw new Error('Failed to configure upstream remote');
        }
        
        // Get version information
        log('Getting current IronClaw Supreme version...');
        const current = await getCurrentVersionInfo();
        
        log('Getting upstream OpenClaw version...');
        const upstream = await getUpstreamVersionInfo();
        
        // Calculate differences
        log('Calculating version differences...');
        const difference = await calculateVersionDifference(current, upstream);
        
        // Analyze commit importance
        const analysis = analyzeCommitImportance(difference.recentCommits);
        
        // Generate report
        const report = generateReport(current, upstream, difference, analysis);
        
        // Log results
        log(`📊 Version Check Results:`);
        log(`   Current: ${current.description}`);
        log(`   Upstream: ${upstream.description}`);
        log(`   Behind: ${difference.commitsBehind} commits`);
        log(`   Ahead: ${difference.commitsAhead} commits (custom changes)`);
        log(`   Status: ${report.summary.status}`);
        
        // Cache results
        cacheReport(report);
        
        // Check if we should send alert
        if (shouldSendAlert(report)) {
            log('🚨 Alert threshold reached - triggering notification');
            
            // Send Telegram notification
            try {
                const TelegramNotifier = require('./telegram-notifier.js');
                await TelegramNotifier.sendVersionAlert(report);
                log('✅ Telegram alert sent successfully');
                
                // Update cache with alert timestamp
                const cache = JSON.parse(fs.readFileSync(CONFIG.CACHE_FILE, 'utf8'));
                cache.lastAlert = report.timestamp;
                fs.writeFileSync(CONFIG.CACHE_FILE, JSON.stringify(cache, null, 2));
                
            } catch (error) {
                log(`Failed to send Telegram alert: ${error.message}`, 'ERROR');
            }
        } else {
            log('📱 No alert needed - within thresholds or recently alerted');
        }
        
        log('✅ Version check completed successfully');
        
        // Return report for CLI usage
        if (process.argv.includes('--now') || process.env.DEBUG) {
            console.log('\\n' + JSON.stringify(report, null, 2));
        }
        
        return report;
        
    } catch (error) {
        log(`❌ Version check failed: ${error.message}`, 'ERROR');
        
        // Try to send error notification
        try {
            const TelegramNotifier = require('./telegram-notifier.js');
            await TelegramNotifier.sendErrorAlert(error.message);
        } catch (notifError) {
            log(`Failed to send error notification: ${notifError.message}`, 'ERROR');
        }
        
        throw error;
    }
}

// CLI execution
if (require.main === module) {
    checkVersion()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { checkVersion, CONFIG };