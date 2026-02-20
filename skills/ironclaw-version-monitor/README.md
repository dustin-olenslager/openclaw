# IronClaw Supreme Version Monitor

Automated monitoring system with **two checkers**:

| Checker | Who uses it | What it checks |
|---------|-------------|----------------|
| `version-checker.js` | **Dustin (admin)** | Is IronClaw behind upstream OpenClaw? |
| `user-update-checker.js` | **Users** | Is my local clone behind Dustin's latest? |

Users get clean, tested, quality-controlled updates — never raw upstream merges.

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
node user-update-checker.js --now
```

## Key Features

- ✅ **User Update Notifications** — Alerts when Dustin pushes a new IronClaw Supreme version
- ✅ **Smart Urgency Detection** — Categorizes updates as critical/high/medium/low
- ✅ **OpenClaw Merge Detection** — Highlights when updates include upstream OpenClaw merges
- ✅ **Commit Categorization** — Security, features, fixes, breaking changes
- ✅ **Anti-Spam** — Dedup + cooldown prevents notification fatigue
- ✅ **Daily Monitoring** — Checks version daily at 4 AM UTC
- ✅ **Telegram Integration** — Instant notifications with actionable instructions
- ✅ **Manual Control** — Never auto-updates, just notifies
- ✅ **Quality Controlled** — Every update is tested by Dustin & Antigravity

## Commands

```bash
# Check if you're behind Dustin's latest (user mode)
node user-update-checker.js --now

# Admin: check if IronClaw is behind upstream OpenClaw
node version-checker.js --now

# Test Telegram notifications
node telegram-notifier.js --test

# Reinstall/repair
node setup.js --force

# Debug mode
DEBUG=1 node user-update-checker.js --now
```

## Configuration

Set these environment variables:

```bash
# Required for Telegram alerts
export TELEGRAM_BOT_TOKEN="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
export TELEGRAM_CHAT_ID="-1001234567890"

# User update checker options
export IRONCLAW_MIN_COMMITS=1            # Alert on any update (default)
export IRONCLAW_ALERT_COOLDOWN=24        # Hours between repeat alerts

# Admin version checker options
export VERSION_CHECK_SCHEDULE="0 4 * * *"  # Daily 4 AM UTC
export MIN_COMMITS_FOR_ALERT=100           # Upstream alert threshold
```

## How the Update Chain Works

```
OpenClaw Updates
    ↓
Dustin Gets Alert (version-checker.js)
    ↓
Manual Review with Antigravity
    ↓
IronClaw Supreme Updated (git push origin main)
    ↓
Users Get Notified (user-update-checker.js)
    ↓
Users Update (git pull origin main)
```

## Files

- `user-update-checker.js` - **User-facing**: checks if local is behind Dustin's GitHub
- `version-checker.js` - **Admin**: checks if IronClaw is behind upstream OpenClaw
- `telegram-notifier.js` - Telegram alert system (shared)
- `setup.js` - Installation script
- `cron-job-config.json` - Admin cron job configuration
- `user-update-cron.json` - User cron job configuration
- `SKILL.md` - Complete documentation

## Logs

```bash
# User update checker logs
tail -f /home/node/.openclaw/logs/user-update-checker.log

# Admin version checker logs
tail -f /home/node/.openclaw/logs/version-monitor.log
```

## Support

Part of the **IronClaw Supreme Hardening System** — keeping your production AI assistant current and secure.

For issues, check the main [IronClaw Supreme repository](https://github.com/dustin-olenslager/ironclaw-supreme).