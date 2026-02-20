#!/usr/bin/env node

/**
 * IronClaw Supreme Version Monitor - Setup Script
 * Installs cron job and configures the monitoring system
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
    SKILL_NAME: 'ironclaw-version-monitor',
    CRON_JOB_ID: 'ironclaw_system_monitoring_checkin',
    DEFAULT_SCHEDULE: '0 4 * * *', // Daily at 4 AM UTC
    LOG_DIR: '/home/node/.openclaw/logs',
    WORKSPACE_DIR: '/home/node/.openclaw/workspace',
    SKILL_DIR: path.join(__dirname)
};

/**
 * Log setup messages
 */
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'SUCCESS' ? '✅' : '📝';
    console.log(`${prefix} [${level}] ${message}`);
}

/**
 * Execute command safely
 */
function execSafe(command, options = {}) {
    try {
        const result = execSync(command, { 
            encoding: 'utf8', 
            cwd: CONFIG.WORKSPACE_DIR,
            ...options 
        });
        return result.trim();
    } catch (error) {
        throw new Error(`Command failed: ${command}\\nError: ${error.message}`);
    }
}

/**
 * Check if running in IronClaw Supreme environment
 */
function validateEnvironment() {
    log('Validating IronClaw Supreme environment...');
    
    // Check if we're in the right directory
    if (!fs.existsSync(CONFIG.WORKSPACE_DIR)) {
        throw new Error('Not running in IronClaw Supreme workspace environment');
    }
    
    // Check if git is available and configured
    try {
        execSafe('git --version');
        execSafe('git status');
    } catch (error) {
        throw new Error('Git is not available or repository is not configured');
    }
    
    // Check for upstream remote
    try {
        const remotes = execSafe('git remote -v');
        if (!remotes.includes('upstream')) {
            log('Adding upstream remote to OpenClaw repository...', 'WARN');
            execSafe('git remote add upstream https://github.com/openclaw/openclaw.git');
        }
    } catch (error) {
        log('Could not verify git remotes, will configure during first run', 'WARN');
    }
    
    log('Environment validation successful', 'SUCCESS');
}

/**
 * Create necessary directories
 */
function createDirectories() {
    log('Creating necessary directories...');
    
    // Ensure log directory exists
    if (!fs.existsSync(CONFIG.LOG_DIR)) {
        fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
        log(`Created log directory: ${CONFIG.LOG_DIR}`);
    }
    
    // Make scripts executable
    const scriptsToMakeExecutable = [
        path.join(CONFIG.SKILL_DIR, 'version-checker.js'),
        path.join(CONFIG.SKILL_DIR, 'telegram-notifier.js'),
        path.join(CONFIG.SKILL_DIR, 'setup.js')
    ];
    
    for (const script of scriptsToMakeExecutable) {
        if (fs.existsSync(script)) {
            try {
                fs.chmodSync(script, '755');
                log(`Made executable: ${path.basename(script)}`);
            } catch (error) {
                log(`Could not make executable: ${path.basename(script)}`, 'WARN');
            }
        }
    }
    
    log('Directory setup completed', 'SUCCESS');
}

/**
 * Create the cron job using IronClaw Supreme's cron system
 */
function createCronJob(force = false) {
    log('Setting up IronClaw Supreme cron job...');
    
    const schedule = process.env.VERSION_CHECK_SCHEDULE || CONFIG.DEFAULT_SCHEDULE;
    const versionCheckScript = path.join(CONFIG.SKILL_DIR, 'version-checker.js');
    
    // Create the cron job payload
    const cronJob = {
        name: 'IronClaw Supreme Version Monitor',
        schedule: {
            kind: 'cron',
            expr: schedule,
            tz: 'UTC'
        },
        payload: {
            kind: 'systemEvent',
            text: `Running IronClaw Supreme version check via ${versionCheckScript}`
        },
        delivery: {
            mode: 'none' // We handle notifications via Telegram directly
        },
        sessionTarget: 'main',
        enabled: true
    };
    
    // Save cron job configuration for reference
    const cronConfigPath = path.join(CONFIG.SKILL_DIR, 'cron-job-config.json');
    fs.writeFileSync(cronConfigPath, JSON.stringify(cronJob, null, 2));
    
    log(`Cron job configuration saved to ${cronConfigPath}`);
    log(`Schedule: ${schedule} (${cronJob.schedule.tz})`);
    
    // Instructions for manual cron job creation
    log('', 'INFO');
    log('MANUAL CRON JOB SETUP REQUIRED:', 'WARN');
    log('To complete the installation, run this command in IronClaw Supreme:', 'WARN');
    log('', 'INFO');
    log(`cron add --json '${JSON.stringify(cronJob)}'`, 'INFO');
    log('', 'INFO');
    log('Or use the web interface to create a cron job with:', 'INFO');
    log(`• Name: ${cronJob.name}`, 'INFO');
    log(`• Schedule: ${schedule}`, 'INFO');
    log(`• Command: node ${versionCheckScript}`, 'INFO');
    log(`• Session Target: main`, 'INFO');
    log('', 'INFO');
    
    return cronJob;
}

/**
 * Test the monitoring system
 */
async function testSystem() {
    log('Testing version monitoring system...');
    
    // Test version checker
    try {
        log('Testing version checker...');
        const versionChecker = require('./version-checker.js');
        
        // Run a test check (this might take a moment)
        log('Running test version check (this may take 30-60 seconds)...');
        const report = await versionChecker.checkVersion();
        
        log(`Test completed - ${report.difference.commitsBehind} commits behind upstream`, 'SUCCESS');
        
        // Test Telegram notifications if configured
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
            log('Testing Telegram notifications...');
            const telegramNotifier = require('./telegram-notifier.js');
            await telegramNotifier.sendTestMessage();
            log('Telegram test message sent successfully', 'SUCCESS');
        } else {
            log('Telegram not configured - skipping notification test', 'WARN');
            log('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable notifications', 'WARN');
        }
        
    } catch (error) {
        log(`System test failed: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Display setup completion instructions
 */
function showCompletionInstructions(cronJob) {
    log('', 'INFO');
    log('🎉 IRONCLAW SUPREME VERSION MONITOR SETUP COMPLETE!', 'SUCCESS');
    log('', 'INFO');
    log('📋 NEXT STEPS:', 'INFO');
    log('', 'INFO');
    
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
        log('1. SET UP TELEGRAM NOTIFICATIONS:', 'WARN');
        log('   • Create a Telegram bot via @BotFather', 'INFO');
        log('   • Get your chat ID (send a message, then check bot API)', 'INFO');
        log('   • Set environment variables:', 'INFO');
        log('     export TELEGRAM_BOT_TOKEN="your_bot_token"', 'INFO');
        log('     export TELEGRAM_CHAT_ID="your_chat_id"', 'INFO');
        log('', 'INFO');
    }
    
    log('2. CREATE THE CRON JOB:', 'WARN');
    log('   Run this command in IronClaw Supreme:', 'INFO');
    log(`   cron add --name "${cronJob.name}" --schedule "${cronJob.schedule.expr}" --command "cd ${CONFIG.SKILL_DIR} && node version-checker.js"`, 'INFO');
    log('', 'INFO');
    
    log('3. VERIFY INSTALLATION:', 'INFO');
    log('   • Check cron jobs: cron list', 'INFO');
    log('   • Test manually: cd skills/ironclaw-version-monitor && node version-checker.js --now', 'INFO');
    log('   • Test Telegram: node telegram-notifier.js --test', 'INFO');
    log('', 'INFO');
    
    log('4. MONITORING STATUS:', 'INFO');
    log('   • Logs: tail -f /home/node/.openclaw/logs/version-monitor.log', 'INFO');
    log('   • Config: skills/ironclaw-version-monitor/cron-job-config.json', 'INFO');
    log('   • Cache: /home/node/.openclaw/.version-cache.json', 'INFO');
    log('', 'INFO');
    
    log('📱 The system will now monitor IronClaw Supreme vs upstream OpenClaw', 'SUCCESS');
    log('🚨 You will receive Telegram alerts when updates are available', 'SUCCESS');
    log('⚙️  Updates are manual-only - the system never auto-updates', 'SUCCESS');
    log('', 'INFO');
}

/**
 * Main setup function
 */
async function setup() {
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    
    try {
        log('🚀 Setting up IronClaw Supreme Version Monitor...', 'INFO');
        log('', 'INFO');
        
        // Step 1: Validate environment
        validateEnvironment();
        
        // Step 2: Create directories
        createDirectories();
        
        // Step 3: Set up cron job
        const cronJob = createCronJob(force);
        
        // Step 4: Test system
        if (!args.includes('--skip-test')) {
            await testSystem();
        } else {
            log('Skipping system tests (--skip-test flag)', 'WARN');
        }
        
        // Step 5: Show completion instructions
        showCompletionInstructions(cronJob);
        
        log('Setup completed successfully! 🎉', 'SUCCESS');
        
    } catch (error) {
        log(`Setup failed: ${error.message}`, 'ERROR');
        log('', 'INFO');
        log('TROUBLESHOOTING:', 'WARN');
        log('• Ensure you are running this in the IronClaw Supreme workspace', 'INFO');
        log('• Check that git is configured and working', 'INFO');
        log('• Verify network connectivity for upstream checks', 'INFO');
        log('• For Telegram issues, verify bot token and chat ID', 'INFO');
        process.exit(1);
    }
}

// CLI execution
if (require.main === module) {
    console.log('IronClaw Supreme Version Monitor Setup');
    console.log('=====================================');
    console.log('');
    
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log('Usage: node setup.js [options]');
        console.log('');
        console.log('Options:');
        console.log('  --force       Force reinstall even if already configured');
        console.log('  --skip-test   Skip system testing during setup');
        console.log('  --help, -h    Show this help message');
        console.log('');
        console.log('Environment Variables:');
        console.log('  TELEGRAM_BOT_TOKEN    - Your Telegram bot token (required for notifications)');
        console.log('  TELEGRAM_CHAT_ID      - Your Telegram chat ID (required for notifications)');
        console.log('  VERSION_CHECK_SCHEDULE - Cron schedule (default: "0 4 * * *")');
        console.log('  MIN_COMMITS_FOR_ALERT - Minimum commits behind to trigger alert (default: 100)');
        process.exit(0);
    }
    
    setup().catch(() => process.exit(1));
}

module.exports = { setup, CONFIG };