# IronClaw Supreme Version Monitor

Automated monitoring system that checks IronClaw Supreme against upstream OpenClaw and sends Telegram alerts when updates are available.

## Quick Setup

```bash
# 1. Install the skill
cd skills/ironclaw-version-monitor
node setup.js

# 2. Configure Telegram (required for alerts)
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
export TELEGRAM_CHAT_ID="your_chat_id_here"

# 3. Test the system
node telegram-notifier.js --test
node version-checker.js --now
```

## Key Features

- ✅ **Daily Monitoring** - Checks version daily at 4 AM UTC
- ✅ **Smart Alerts** - Only notifies on significant updates (100+ commits)
- ✅ **Telegram Integration** - Instant notifications with detailed reports
- ✅ **Manual Control** - Never auto-updates, just notifies
- ✅ **UI Integration** - Cron job visible in IronClaw Supreme dashboard

## Commands

```bash
# Manual version check
node version-checker.js --now

# Test Telegram notifications
node telegram-notifier.js --test

# Reinstall/repair
node setup.js --force

# Debug mode
DEBUG=1 node version-checker.js --now
```

## Configuration

Set these environment variables:

```bash
# Required for Telegram alerts
export TELEGRAM_BOT_TOKEN="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
export TELEGRAM_CHAT_ID="-1001234567890"

# Optional customization
export VERSION_CHECK_SCHEDULE="0 4 * * *"  # Daily 4 AM UTC
export MIN_COMMITS_FOR_ALERT=100           # Alert threshold
```

## Files

- `SKILL.md` - Complete documentation
- `version-checker.js` - Main monitoring logic
- `telegram-notifier.js` - Telegram alert system
- `setup.js` - Installation script
- `cron-job-config.json` - Cron job configuration (created during setup)

## Logs

Monitor activity:
```bash
tail -f /home/node/.openclaw/logs/version-monitor.log
```

## Support

Part of the **IronClaw Supreme Hardening System** - keeping your production AI assistant current and secure.

For issues, check the main [IronClaw Supreme repository](https://github.com/dustin-olenslager/ironclaw-supreme).