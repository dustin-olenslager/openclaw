#!/usr/bin/env node

/**
 * IronClaw Supreme Version Monitor - Telegram Notifications
 * Sends version update alerts via Telegram
 */

const https = require('https');
const fs = require('fs');

// Configuration
const CONFIG = {
    BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    LOG_FILE: '/home/node/.openclaw/logs/version-monitor.log',
    MAX_MESSAGE_LENGTH: 4096, // Telegram limit
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 5000 // 5 seconds
};

/**
 * Log messages with timestamps
 */
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [TELEGRAM] [${level}] ${message}`;
    
    console.log(logMessage);
    
    // Append to log file if it exists
    try {
        if (fs.existsSync(CONFIG.LOG_FILE)) {
            fs.appendFileSync(CONFIG.LOG_FILE, logMessage + '\\n');
        }
    } catch (e) {
        // Ignore log file errors
    }
}

/**
 * Validate Telegram configuration
 */
function validateConfig() {
    if (!CONFIG.BOT_TOKEN) {
        throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
    }
    
    if (!CONFIG.CHAT_ID) {
        throw new Error('TELEGRAM_CHAT_ID environment variable is required');
    }
    
    // Validate token format
    if (!CONFIG.BOT_TOKEN.match(/^\\d+:[A-Za-z0-9_-]{35}$/)) {
        throw new Error('TELEGRAM_BOT_TOKEN format appears invalid');
    }
    
    log('Telegram configuration validated');
}

/**
 * Send message to Telegram with retry logic
 */
function sendTelegramMessage(message, options = {}) {
    return new Promise((resolve, reject) => {
        const payload = {
            chat_id: CONFIG.CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...options
        };
        
        const data = JSON.stringify(payload);
        const maxLength = CONFIG.MAX_MESSAGE_LENGTH;
        
        // Truncate if message is too long
        if (message.length > maxLength) {
            log(`Message truncated from ${message.length} to ${maxLength} characters`, 'WARN');
            payload.text = message.substring(0, maxLength - 50) + '\\n\\n... (message truncated)';
        }
        
        const requestOptions = {
            hostname: 'api.telegram.org',
            path: `/bot${CONFIG.BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            timeout: 10000
        };
        
        function attemptSend(retryCount = 0) {
            const req = https.request(requestOptions, (res) => {
                let body = '';
                
                res.on('data', (chunk) => {
                    body += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(body);
                        
                        if (response.ok) {
                            log(`Message sent successfully (message_id: ${response.result.message_id})`);
                            resolve(response);
                        } else {
                            const errorMsg = `Telegram API error: ${response.description}`;
                            log(errorMsg, 'ERROR');
                            
                            // Retry on certain errors
                            if (retryCount < CONFIG.RETRY_ATTEMPTS && response.error_code >= 500) {
                                log(`Retrying in ${CONFIG.RETRY_DELAY}ms (attempt ${retryCount + 1}/${CONFIG.RETRY_ATTEMPTS})`, 'WARN');
                                setTimeout(() => attemptSend(retryCount + 1), CONFIG.RETRY_DELAY);
                            } else {
                                reject(new Error(errorMsg));
                            }
                        }
                    } catch (parseError) {
                        const errorMsg = `Failed to parse Telegram response: ${parseError.message}`;
                        log(errorMsg, 'ERROR');
                        reject(new Error(errorMsg));
                    }
                });
            });
            
            req.on('error', (error) => {
                const errorMsg = `Request error: ${error.message}`;
                log(errorMsg, 'ERROR');
                
                if (retryCount < CONFIG.RETRY_ATTEMPTS) {
                    log(`Retrying in ${CONFIG.RETRY_DELAY}ms (attempt ${retryCount + 1}/${CONFIG.RETRY_ATTEMPTS})`, 'WARN');
                    setTimeout(() => attemptSend(retryCount + 1), CONFIG.RETRY_DELAY);
                } else {
                    reject(new Error(errorMsg));
                }
            });
            
            req.on('timeout', () => {
                req.destroy();
                const errorMsg = 'Request timeout';
                log(errorMsg, 'ERROR');
                
                if (retryCount < CONFIG.RETRY_ATTEMPTS) {
                    log(`Retrying in ${CONFIG.RETRY_DELAY}ms (attempt ${retryCount + 1}/${CONFIG.RETRY_ATTEMPTS})`, 'WARN');
                    setTimeout(() => attemptSend(retryCount + 1), CONFIG.RETRY_DELAY);
                } else {
                    reject(new Error(errorMsg));
                }
            });
            
            req.write(data);
            req.end();
        }
        
        attemptSend();
    });
}

/**
 * Format version report as readable Telegram message
 */
function formatVersionAlert(report) {
    const { current, upstream, difference, analysis } = report;
    
    let message = `🚨 **IronClaw Supreme Update Available**\\n\\n`;
    
    // Version summary
    message += `📊 **Version Status:**\\n`;
    message += `• Current: \`${current.description}\`\\n`;
    message += `• Latest OpenClaw: \`${upstream.description}\`\\n`;
    message += `• Commits Behind: **${difference.commitsBehind}**\\n`;
    message += `• Custom Changes: ${difference.commitsAhead} commits\\n\\n`;
    
    // Recent changes summary
    if (analysis.security.length > 0) {
        message += `🔒 **Security Updates:**\\n`;
        analysis.security.slice(0, 3).forEach(commit => {
            message += `• ${commit}\\n`;
        });
        message += '\\n';
    }
    
    if (analysis.features.length > 0) {
        message += `🆕 **New Features:**\\n`;
        analysis.features.slice(0, 3).forEach(commit => {
            message += `• ${commit}\\n`;
        });
        message += '\\n';
    }
    
    if (analysis.fixes.length > 0) {
        message += `🐛 **Bug Fixes:**\\n`;
        analysis.fixes.slice(0, 3).forEach(commit => {
            message += `• ${commit}\\n`;
        });
        message += '\\n';
    }
    
    // Action required
    message += `⚡ **Action Required:**\\n`;
    message += `Send update request to Antigravity for deployment\\n\\n`;
    
    // Recent commits preview
    if (difference.recentCommits.length > 0) {
        message += `📝 **Recent Upstream Changes:**\\n`;
        difference.recentCommits.slice(0, 5).forEach(commit => {
            message += `\`${commit}\`\\n`;
        });
        if (difference.recentCommits.length > 5) {
            message += `... and ${difference.recentCommits.length - 5} more\\n`;
        }
        message += '\\n';
    }
    
    // Quick commands
    message += `🎯 **Quick Commands:**\\n`;
    message += `• \`/status\` - Check IronClaw Supreme status\\n`;
    message += `• \`/version-check\` - Run manual version check\\n`;
    message += `• \`/silence-updates 7d\` - Silence alerts for 7 days\\n\\n`;
    
    // Timestamp
    message += `🕐 Checked: ${new Date(report.timestamp).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;
    
    return message;
}

/**
 * Format error alert for Telegram
 */
function formatErrorAlert(errorMessage) {
    let message = `❌ **IronClaw Supreme Version Check Failed**\\n\\n`;
    message += `🔧 **Error Details:**\\n`;
    message += `\`${errorMessage}\`\\n\\n`;
    message += `📋 **Possible Causes:**\\n`;
    message += `• Git upstream configuration issue\\n`;
    message += `• Network connectivity problem\\n`;
    message += `• Repository access permissions\\n\\n`;
    message += `🎯 **Next Steps:**\\n`;
    message += `• Check \`git remote -v\` for upstream config\\n`;
    message += `• Verify network connectivity\\n`;
    message += `• Review logs: \`tail -f /home/node/.openclaw/logs/version-monitor.log\`\\n\\n`;
    message += `🕐 Failed: ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;
    
    return message;
}

/**
 * Send version update alert
 */
async function sendVersionAlert(report) {
    try {
        validateConfig();
        
        log(`Sending version alert for ${report.difference.commitsBehind} commits behind`);
        
        const message = formatVersionAlert(report);
        const response = await sendTelegramMessage(message);
        
        log(`Version alert sent successfully (${message.length} characters)`);
        return response;
        
    } catch (error) {
        log(`Failed to send version alert: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Send error alert
 */
async function sendErrorAlert(errorMessage) {
    try {
        validateConfig();
        
        log('Sending error alert');
        
        const message = formatErrorAlert(errorMessage);
        const response = await sendTelegramMessage(message);
        
        log('Error alert sent successfully');
        return response;
        
    } catch (error) {
        log(`Failed to send error alert: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Send test message
 */
async function sendTestMessage() {
    try {
        validateConfig();
        
        log('Sending test message');
        
        const message = `🧪 **IronClaw Supreme Test Message**\\n\\n`;
        const testMessage = message +
            `✅ Telegram notifications are working correctly!\\n\\n` +
            `🔧 **Configuration:**\\n` +
            `• Bot Token: \`${CONFIG.BOT_TOKEN.substring(0, 10)}...\`\\n` +
            `• Chat ID: \`${CONFIG.CHAT_ID}\`\\n\\n` +
            `🕐 Test sent: ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;
        
        const response = await sendTelegramMessage(testMessage);
        
        log('Test message sent successfully');
        return response;
        
    } catch (error) {
        log(`Failed to send test message: ${error.message}`, 'ERROR');
        throw error;
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--test')) {
        sendTestMessage()
            .then(() => {
                console.log('✅ Test message sent successfully!');
                process.exit(0);
            })
            .catch((error) => {
                console.error('❌ Test message failed:', error.message);
                process.exit(1);
            });
    } else {
        console.log('Usage: node telegram-notifier.js --test');
        console.log('');
        console.log('Environment variables required:');
        console.log('  TELEGRAM_BOT_TOKEN - Your Telegram bot token');
        console.log('  TELEGRAM_CHAT_ID   - Your Telegram chat ID');
        process.exit(1);
    }
}

module.exports = {
    sendVersionAlert,
    sendErrorAlert,
    sendTestMessage,
    validateConfig
};