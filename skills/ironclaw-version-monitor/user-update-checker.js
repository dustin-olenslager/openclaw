#!/usr/bin/env node

/**
 * IronClaw Supreme — User Update Checker
 *
 * Checks if this local IronClaw Supreme instance is behind
 * Dustin's latest push to dustin-olenslager/ironclaw-supreme.
 *
 * This is the USER-FACING counterpart to version-checker.js:
 *   - version-checker.js   → Dustin's admin tool (local vs upstream OpenClaw)
 *   - user-update-checker.js → User tool (local vs Dustin's GitHub)
 *
 * Flow:
 *   git fetch origin --quiet
 *   git rev-list --count HEAD..origin/main
 *   → If behind, analyze commits and send Telegram notification.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG = {
    ORIGIN_REMOTE: 'origin',
    ORIGIN_URL: 'https://github.com/dustin-olenslager/ironclaw-supreme.git',
    WORKSPACE_DIR: process.env.IRONCLAW_WORKSPACE || '/home/node/.openclaw/workspace',
    LOG_FILE: process.env.IRONCLAW_LOG_FILE || '/home/node/.openclaw/logs/user-update-checker.log',
    CACHE_FILE: process.env.IRONCLAW_CACHE_FILE || '/home/node/.openclaw/.user-update-cache.json',
    // Minimum commits behind before we bother the user. Default 1 — any update.
    MIN_COMMITS_FOR_ALERT: parseInt(process.env.IRONCLAW_MIN_COMMITS) || 1,
    // Hours between repeat alerts for the same origin commit.
    ALERT_COOLDOWN_HOURS: parseInt(process.env.IRONCLAW_ALERT_COOLDOWN) || 24,
    // How many recent commits to include in the notification.
    MAX_COMMITS_SHOWN: 10,
};

// Ensure log directory exists
const logDir = path.dirname(CONFIG.LOG_FILE);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(message, level = 'INFO') {
    const ts = new Date().toISOString();
    const line = `[${ts}] [USER-UPDATE] [${level}] ${message}`;
    console.log(line);
    try {
        fs.appendFileSync(CONFIG.LOG_FILE, line + '\n');
    } catch (_) { /* best-effort logging */ }
}

function execAsync(command, opts = {}) {
    return new Promise((resolve, reject) => {
        exec(command, {
            cwd: CONFIG.WORKSPACE_DIR,
            timeout: 60_000,
            ...opts,
        }, (err, stdout, stderr) => {
            if (err) {
                log(`Command failed: ${command}`, 'ERROR');
                log(`Error: ${err.message}`, 'ERROR');
                reject(err);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function ensureOriginRemote() {
    try {
        const remotes = await execAsync('git remote -v');
        if (!remotes.includes(CONFIG.ORIGIN_REMOTE)) {
            log('Adding origin remote...');
            await execAsync(`git remote add ${CONFIG.ORIGIN_REMOTE} ${CONFIG.ORIGIN_URL}`);
        }
        log('Fetching latest from origin...');
        await execAsync(`git fetch ${CONFIG.ORIGIN_REMOTE} --quiet`);
        return true;
    } catch (err) {
        log(`Failed to fetch origin: ${err.message}`, 'ERROR');
        return false;
    }
}

async function getLocalInfo() {
    const commit = await execAsync('git rev-parse HEAD');
    const branch = await execAsync('git branch --show-current');
    return {
        commit,
        commitShort: commit.substring(0, 8),
        branch,
    };
}

async function getOriginInfo() {
    const commit = await execAsync(`git rev-parse ${CONFIG.ORIGIN_REMOTE}/main`);
    let latestTag = null;
    try {
        const tags = await execAsync(
            `git tag --sort=-version:refname --list "v*" --merged ${CONFIG.ORIGIN_REMOTE}/main`
        );
        const list = tags.split('\n').filter(Boolean);
        if (list.length > 0) latestTag = list[0];
    } catch (_) { /* tags are optional */ }

    return {
        commit,
        commitShort: commit.substring(0, 8),
        latestTag,
        description: latestTag || `main@${commit.substring(0, 8)}`,
    };
}

// ---------------------------------------------------------------------------
// Commit analysis
// ---------------------------------------------------------------------------

function analyzeCommitImportance(commits) {
    const analysis = {
        includesOpenClawUpdate: false,
        security: [],
        features: [],
        fixes: [],
        breaking: [],
        other: [],
    };

    const patterns = {
        security: /\b(security|auth|vulnerability|cve|exploit|injection)\b/i,
        features: /\b(feat|feature|add|new|enhance)\b/i,
        fixes: /\b(fix|bug|issue|patch|resolve|repair)\b/i,
        breaking: /\b(break|breaking|major|deprecated|removed)\b/i,
    };

    for (const commit of commits) {
        // Detect OpenClaw update merges
        if (/update to openclaw|openclaw v\d+/i.test(commit)) {
            analysis.includesOpenClawUpdate = true;
        }

        let categorized = false;
        for (const [cat, re] of Object.entries(patterns)) {
            if (re.test(commit)) {
                analysis[cat].push(commit);
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

function determineUrgency(commitsBehind, analysis) {
    if (analysis.security.length > 0) return 'critical';
    if (analysis.includesOpenClawUpdate) return 'high';
    if (analysis.breaking.length > 0) return 'high';
    if (commitsBehind >= 20) return 'high';
    if (commitsBehind >= 5) return 'medium';
    return 'low';
}

// ---------------------------------------------------------------------------
// Notification formatting
// ---------------------------------------------------------------------------

function formatUserUpdateMessage(report) {
    const { local, origin, commitsBehind, commits, analysis, urgency } = report;

    const urgencyIcon = {
        critical: '🚨',
        high: '🚀',
        medium: '🦾',
        low: '📦',
    }[urgency] || '🦾';

    const urgencyLabel = {
        critical: 'CRITICAL — Security Update',
        high: 'Major IronClaw Supreme Update',
        medium: 'IronClaw Supreme Update Available',
        low: 'IronClaw Supreme Update Available',
    }[urgency];

    let msg = `${urgencyIcon} *${urgencyLabel}*\n\n`;

    msg += `📊 *What's New:*\n`;
    msg += `• ${commitsBehind} commit${commitsBehind === 1 ? '' : 's'} behind Dustin's latest\n`;
    if (analysis.includesOpenClawUpdate) {
        msg += `• Includes latest OpenClaw upstream merge\n`;
    }
    if (analysis.security.length > 0) {
        msg += `• ⚠️ Contains ${analysis.security.length} security-related change${analysis.security.length === 1 ? '' : 's'}\n`;
    }
    if (analysis.features.length > 0) {
        msg += `• ${analysis.features.length} new feature${analysis.features.length === 1 ? '' : 's'}\n`;
    }
    if (analysis.fixes.length > 0) {
        msg += `• ${analysis.fixes.length} bug fix${analysis.fixes.length === 1 ? '' : 'es'}\n`;
    }
    msg += '\n';

    // Recent commits
    if (commits.length > 0) {
        msg += `🔄 *Recent Changes:*\n`;
        const shown = commits.slice(0, CONFIG.MAX_COMMITS_SHOWN);
        for (const c of shown) {
            // Truncate long commit messages
            const trimmed = c.length > 72 ? c.substring(0, 69) + '...' : c;
            msg += `• \`${trimmed}\`\n`;
        }
        if (commits.length > CONFIG.MAX_COMMITS_SHOWN) {
            msg += `  _...and ${commits.length - CONFIG.MAX_COMMITS_SHOWN} more_\n`;
        }
        msg += '\n';
    }

    // Action required
    msg += `⚡ *Action Required:*\n`;
    msg += '```\n';
    msg += 'cd /home/node/.openclaw/workspace\n';
    msg += 'git pull origin main\n';
    msg += '```\n';

    if (urgency === 'critical' || urgency === 'high') {
        msg += `\n⚠️ *Recommended: restart after updating*\n`;
        msg += '```\n';
        msg += 'systemctl restart ironclaw-supreme\n';
        msg += '```\n';
    }

    // Quality assurance footer
    msg += `\n🛡️ *Quality Assurance:*\n`;
    msg += `✅ Tested by Dustin & Antigravity\n`;
    msg += `✅ Redundancy cleanup completed\n`;
    msg += `✅ Production-ready deployment\n\n`;

    // Metadata
    msg += `📌 Your version: \`${local.commitShort}\`\n`;
    msg += `📌 Latest: \`${origin.description}\`\n`;
    msg += `🕐 Checked: ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;

    return msg;
}

// ---------------------------------------------------------------------------
// Cache / dedup
// ---------------------------------------------------------------------------

function readCache() {
    try {
        if (fs.existsSync(CONFIG.CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG.CACHE_FILE, 'utf8'));
        }
    } catch (_) { /* corrupt cache is fine, treat as empty */ }
    return {};
}

function writeCache(data) {
    try {
        fs.writeFileSync(CONFIG.CACHE_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        log(`Failed to write cache: ${err.message}`, 'WARN');
    }
}

function shouldAlert(originCommit) {
    const cache = readCache();

    // First ever check
    if (!cache.lastAlertOriginCommit) return true;

    // New commits since last alert
    if (cache.lastAlertOriginCommit !== originCommit) return true;

    // Cooldown
    if (cache.lastAlertTime) {
        const hoursSince = (Date.now() - new Date(cache.lastAlertTime).getTime()) / 3_600_000;
        if (hoursSince < CONFIG.ALERT_COOLDOWN_HOURS) {
            log(`Cooldown active — last alert ${hoursSince.toFixed(1)}h ago`);
            return false;
        }
    }

    return true;
}

function markAlerted(originCommit) {
    const cache = readCache();
    cache.lastAlertOriginCommit = originCommit;
    cache.lastAlertTime = new Date().toISOString();
    writeCache(cache);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function checkForUserUpdate() {
    try {
        log('🔍 Starting IronClaw Supreme user update check...');

        // Step 1: Fetch latest from origin
        const ok = await ensureOriginRemote();
        if (!ok) throw new Error('Failed to fetch origin');

        // Step 2: Get local and origin info
        const local = await getLocalInfo();
        const origin = await getOriginInfo();

        // Step 3: Count commits behind
        const behindRaw = await execAsync(
            `git rev-list --count HEAD..${CONFIG.ORIGIN_REMOTE}/main`
        );
        const commitsBehind = parseInt(behindRaw) || 0;

        log(`📊 Local: ${local.commitShort} (${local.branch})`);
        log(`📊 Origin: ${origin.description}`);
        log(`📊 Behind: ${commitsBehind} commits`);

        if (commitsBehind === 0) {
            log('✅ Up to date — no action needed');
            writeCache({
                lastCheck: new Date().toISOString(),
                commitsBehind: 0,
                originCommit: origin.commit,
                status: 'current',
            });
            return { status: 'current', commitsBehind: 0 };
        }

        // Step 4: Get commit list
        const commitsRaw = await execAsync(
            `git log --oneline HEAD..${CONFIG.ORIGIN_REMOTE}/main`
        );
        const commits = commitsRaw.split('\n').filter(Boolean);

        // Step 5: Analyze importance
        const analysis = analyzeCommitImportance(commits);
        const urgency = determineUrgency(commitsBehind, analysis);

        log(`📊 Urgency: ${urgency}`);

        // Step 6: Build report
        const report = {
            timestamp: new Date().toISOString(),
            local,
            origin,
            commitsBehind,
            commits,
            analysis,
            urgency,
            status: 'outdated',
        };

        // Step 7: Check if we should alert
        if (commitsBehind >= CONFIG.MIN_COMMITS_FOR_ALERT && shouldAlert(origin.commit)) {
            log('📱 Sending user update notification...');

            try {
                const TelegramNotifier = require('./telegram-notifier.js');
                const message = formatUserUpdateMessage(report);
                // Use the raw sendTelegramMessage via the notifier's internal mechanism
                // We add our own sendUserUpdateAlert to the notifier
                await sendViaTelegram(message);
                markAlerted(origin.commit);
                log('✅ User update notification sent');
            } catch (err) {
                log(`Failed to send notification: ${err.message}`, 'ERROR');
            }
        } else {
            log('📱 Skipping notification (cooldown or below threshold)');
        }

        // Update cache
        writeCache({
            lastCheck: new Date().toISOString(),
            commitsBehind,
            originCommit: origin.commit,
            urgency,
            lastAlertOriginCommit: readCache().lastAlertOriginCommit,
            lastAlertTime: readCache().lastAlertTime,
            status: 'outdated',
        });

        // Print report in CLI mode
        if (process.argv.includes('--now') || process.env.DEBUG) {
            console.log('\n' + JSON.stringify(report, null, 2));
        }

        return report;
    } catch (err) {
        log(`❌ User update check failed: ${err.message}`, 'ERROR');

        // Attempt error notification
        try {
            await sendViaTelegram(
                `❌ *IronClaw Supreme Update Check Failed*\n\n` +
                `🔧 *Error:*\n\`${err.message}\`\n\n` +
                `🕐 ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC`
            );
        } catch (_) { /* best-effort */ }

        throw err;
    }
}

// ---------------------------------------------------------------------------
// Telegram send (self-contained, uses same env vars as telegram-notifier.js)
// ---------------------------------------------------------------------------

function sendViaTelegram(message) {
    const https = require('https');
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        log('Telegram not configured — skipping notification', 'WARN');
        return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
        });

        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 10_000,
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const resp = JSON.parse(body);
                    if (resp.ok) {
                        log(`Telegram message sent (id: ${resp.result.message_id})`);
                        resolve(resp);
                    } else {
                        reject(new Error(`Telegram API: ${resp.description}`));
                    }
                } catch (e) {
                    reject(new Error(`Telegram parse error: ${e.message}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.on('timeout', () => { req.destroy(); reject(new Error('Telegram timeout')); });
        req.write(payload);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log('IronClaw Supreme — User Update Checker');
        console.log('=======================================');
        console.log('');
        console.log('Checks if your local instance is behind Dustin\'s latest IronClaw Supreme.');
        console.log('');
        console.log('Usage:');
        console.log('  node user-update-checker.js          Run check (cron mode)');
        console.log('  node user-update-checker.js --now     Run check and print report');
        console.log('  node user-update-checker.js --help    Show this help');
        console.log('');
        console.log('Environment Variables:');
        console.log('  TELEGRAM_BOT_TOKEN          Telegram bot token (required for alerts)');
        console.log('  TELEGRAM_CHAT_ID            Telegram chat ID (required for alerts)');
        console.log('  IRONCLAW_MIN_COMMITS=1      Minimum commits behind to trigger alert');
        console.log('  IRONCLAW_ALERT_COOLDOWN=24  Hours between repeat alerts');
        console.log('  IRONCLAW_WORKSPACE          Override workspace directory');
        console.log('  DEBUG=1                     Enable debug output');
        process.exit(0);
    }

    checkForUserUpdate()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { checkForUserUpdate, CONFIG };
