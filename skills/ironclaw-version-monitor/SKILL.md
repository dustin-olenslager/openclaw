# IronClaw Supreme Version Monitor

**Automated version checking and Telegram alerts for IronClaw Supreme**

## Overview

This skill monitors IronClaw Supreme against upstream OpenClaw releases and sends Telegram notifications when updates are available. Designed to keep IronClaw Supreme current while allowing manual update control.

## Features

- ✅ **Daily Version Checks** - Automatic comparison with upstream OpenClaw
- ✅ **Telegram Alerts** - Instant notifications when updates are available  
- ✅ **UI Integration** - Cron job visible in IronClaw Supreme interface
- ✅ **Smart Notifications** - Only alerts on significant version gaps
- ✅ **Manual Update Control** - Never auto-updates, just notifies
- ✅ **Detailed Reports** - Shows exactly what's new in upstream

## Installation

1. **Install the skill:**
```bash
cd skills/ironclaw-version-monitor
node setup.js
```

2. **Configure Telegram notifications:**
```bash
# Set your Telegram bot token and chat ID
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
export TELEGRAM_CHAT_ID="your_chat_id_here"
```

3. **Verify installation:**
```bash
# Check if cron job was created
ironclawsupreme cron list | grep version-monitor
```

## Configuration

### Environment Variables

```bash
# Required for Telegram notifications
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890

# Optional: Customize check frequency (default: daily at 4 AM UTC)
VERSION_CHECK_SCHEDULE="0 4 * * *"

# Optional: Minimum commits gap to trigger alert (default: 100)
MIN_COMMITS_FOR_ALERT=100
```

### Telegram Bot Setup

1. **Create a bot:** Message @BotFather on Telegram
2. **Get bot token:** Copy the token from BotFather
3. **Find chat ID:** 
   - Add bot to your chat
   - Send a message
   - Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Copy the chat ID from the response

## How It Works

### Version Check Process

1. **Fetch upstream** - Gets latest OpenClaw releases and commits
2. **Compare versions** - Calculates commits behind upstream
3. **Evaluate significance** - Determines if update is worth alerting
4. **Generate report** - Creates detailed summary of changes
5. **Send notification** - Alerts via Telegram if updates are needed

### Smart Alerting

The system only sends alerts when:
- Commits behind > minimum threshold (default: 100)
- New releases are available (major/minor versions)
- Security patches are detected in commit messages
- Critical bug fixes are identified

### Example Telegram Alert

```
🚨 IronClaw Supreme Update Available

Current Version: Based on old OpenClaw
Latest OpenClaw: v2026.2.19
Commits Behind: 12,818

🔥 Key Updates:
• Auth session fixes (security)
• WhatsApp messaging improvements  
• Anthropic API enhancements
• Token count caching (performance)

⚡ Action Required:
Contact Antigravity for update deployment

View details: /status
Silence for 7 days: /silence-updates
```

## Manual Commands

### Check Version Now
```bash
cd skills/ironclaw-version-monitor
node version-checker.js --now
```

### Send Test Notification
```bash
cd skills/ironclaw-version-monitor  
node telegram-notifier.js --test
```

### Update Cron Schedule
```bash
# Daily at 4 AM UTC (default)
ironclawsupreme cron update ironclaw-version-monitor --schedule "0 4 * * *"

# Every 6 hours
ironclawsupreme cron update ironclaw-version-monitor --schedule "0 */6 * * *"
```

## Troubleshooting

### Common Issues

**Cron job not visible in UI:**
```bash
# Check if job exists
ironclawsupreme cron list

# Recreate if missing
node setup.js --force
```

**Telegram notifications not working:**
```bash
# Test Telegram configuration
node telegram-notifier.js --test

# Check environment variables
echo $TELEGRAM_BOT_TOKEN
echo $TELEGRAM_CHAT_ID
```

**Version checks failing:**
```bash
# Manual check with debug info
node version-checker.js --debug

# Check git upstream configuration
git remote -v | grep upstream
```

### Debug Mode

Run with full debugging:
```bash
DEBUG=1 node version-checker.js --now
```

## Integration

This skill integrates with:
- **IronClaw Supreme cron system** - Scheduled execution
- **Telegram Bot API** - Push notifications  
- **Git upstream tracking** - Version comparison
- **OpenClaw release API** - Official version data

## Security

- ✅ **No auto-updates** - Only notification, never executes changes
- ✅ **Secure credentials** - Telegram tokens stored as environment variables
- ✅ **Audit logging** - All version checks logged for review
- ✅ **Rate limiting** - Prevents API spam

## Maintenance

### Log Management
```bash
# View recent logs
tail -f logs/version-monitor.log

# Rotate logs monthly
logrotate /home/node/.ironclaw/logs/version-monitor.log
```

### Updating the Skill
```bash
# Pull latest skill version
cd skills/ironclaw-version-monitor
git pull origin main

# Restart cron job
ironclawsupreme cron restart ironclaw-version-monitor
```

---

**Part of IronClaw Supreme Hardening System**  
*Keeping your production AI assistant current and secure*