---
name: IronClaw Supreme Version Monitor
description: Dual-mode version monitoring — admin upstream checks and user update notifications via Telegram
---

# IronClaw Supreme Version Monitor

**Dual-mode version monitoring and Telegram notifications for IronClaw Supreme**

## Overview

This skill contains **two complementary checkers** that complete the IronClaw Supreme update chain:

| Checker | Audience | Compares |
|---------|----------|----------|
| `version-checker.js` | **Dustin (admin)** | Local IronClaw → upstream OpenClaw |
| `user-update-checker.js` | **Users** | Local clone → Dustin's GitHub |

### Update Flow

```
OpenClaw publishes update
    ↓
version-checker.js detects it → Telegram alert to Dustin
    ↓
Dustin + Antigravity review, merge, clean redundancies
    ↓
Dustin pushes to github.com/dustin-olenslager/ironclaw-supreme
    ↓
user-update-checker.js detects it → Telegram alert to users
    ↓
Users run: git pull origin main
```

## Features

- ✅ **User Update Notifications** — Alerts users when Dustin pushes new commits
- ✅ **Admin Upstream Checks** — Alerts Dustin when OpenClaw has new releases
- ✅ **Smart Urgency Detection** — critical / high / medium / low
- ✅ **OpenClaw Merge Detection** — Highlights when an update includes an upstream merge
- ✅ **Commit Categorization** — Security, features, fixes, breaking changes
- ✅ **Anti-Spam Dedup** — Won't re-alert for the same origin commit within cooldown
- ✅ **Daily Monitoring** — Checks daily at 4 AM UTC
- ✅ **Telegram Integration** — Rich notifications with actionable commands
- ✅ **Manual Control** — Never auto-updates, just notifies
- ✅ **Quality Controlled** — Every update tested by Dustin & Antigravity

## Installation

1. **Install the skill:**
```bash
cd skills/ironclaw-version-monitor
node setup.js
```

2. **Configure Telegram notifications:**
```bash
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
export TELEGRAM_CHAT_ID="your_chat_id_here"
```

3. **Verify:**
```bash
# Test Telegram connectivity
node telegram-notifier.js --test

# Run user update check
node user-update-checker.js --now
```

## Configuration

### Environment Variables

```bash
# Required for Telegram alerts
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890

# --- User Update Checker ---
IRONCLAW_MIN_COMMITS=1            # Alert on any update (default: 1)
IRONCLAW_ALERT_COOLDOWN=24        # Hours between repeat alerts (default: 24)
IRONCLAW_WORKSPACE=/path/to/ws    # Override workspace directory

# --- Admin Version Checker ---
VERSION_CHECK_SCHEDULE="0 4 * * *"  # Daily 4 AM UTC
MIN_COMMITS_FOR_ALERT=100           # Upstream commits threshold
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

### User Update Check (`user-update-checker.js`)

1. **Fetch origin** — `git fetch origin --quiet`
2. **Count commits behind** — `git rev-list --count HEAD..origin/main`
3. **Analyze commits** — Categorize by security/features/fixes/breaking
4. **Determine urgency** — Based on commit types and count
5. **Dedup check** — Skip if already alerted for this origin commit
6. **Send notification** — Telegram alert with update instructions

### Admin Version Check (`version-checker.js`)

1. **Fetch upstream** — Gets latest OpenClaw releases and commits
2. **Compare versions** — Calculates commits behind upstream
3. **Evaluate significance** — Alert if > threshold (default: 100)
4. **Generate report** — Detailed summary of upstream changes
5. **Send notification** — Alerts Dustin to start an update session

### Urgency Levels

| Level | Trigger | Icon |
|-------|---------|------|
| `critical` | Security-related commits detected | 🚨 |
| `high` | OpenClaw upstream merge or breaking changes | 🚀 |
| `medium` | 5+ commits behind | 🦾 |
| `low` | 1-4 commits behind | 📦 |

### Example User Notification

```
🚀 Major IronClaw Supreme Update

📊 What's New:
• 15 commits behind Dustin's latest
• Includes latest OpenClaw upstream merge
• 2 new features
• 3 bug fixes

🔄 Recent Changes:
• `feat: Update to OpenClaw v2026.2.19 with redundancy cleanup`
• `fix: Enhanced browser health monitoring thresholds`
• `feat: Community skills validator improvements`

⚡ Action Required:
cd /home/node/.openclaw/workspace
git pull origin main

⚠️ Recommended: restart after updating
systemctl restart ironclaw-supreme

🛡️ Quality Assurance:
✅ Tested by Dustin & Antigravity
✅ Redundancy cleanup completed
✅ Production-ready deployment

📌 Your version: `7cb3a01d`
📌 Latest: `main@a1b2c3d4`
🕐 Checked: 2/19/2026, 4:00:00 AM UTC
```

## Manual Commands

### User: Check for Updates
```bash
cd skills/ironclaw-version-monitor
node user-update-checker.js --now
```

### Admin: Check Upstream
```bash
cd skills/ironclaw-version-monitor
node version-checker.js --now
```

### Test Telegram Connection
```bash
cd skills/ironclaw-version-monitor
node telegram-notifier.js --test
```

### Debug Mode
```bash
DEBUG=1 node user-update-checker.js --now
```

## Cron Job Setup

### User Update Checker

Use `user-update-cron.json` — daily at 4 AM UTC:

```bash
# View the cron config
cat user-update-cron.json

# Add to your cron system
cron add --name "IronClaw User Update" --schedule "0 4 * * *" \
  --command "cd /home/node/.openclaw/workspace/skills/ironclaw-version-monitor && node user-update-checker.js"
```

### Admin Version Checker

Uses `cron-job-config.json` — same schedule but checks upstream.

## Troubleshooting

### Telegram notifications not working
```bash
# Test connection
node telegram-notifier.js --test

# Verify env vars
echo $TELEGRAM_BOT_TOKEN
echo $TELEGRAM_CHAT_ID
```

### User update check failing
```bash
# Check origin remote
git remote -v | grep origin

# Manual fetch
git fetch origin --verbose

# Debug mode
DEBUG=1 node user-update-checker.js --now
```

### Cache issues
```bash
# View cache
cat /home/node/.openclaw/.user-update-cache.json

# Clear cache to force re-alert
rm /home/node/.openclaw/.user-update-cache.json
```

## Files

| File | Purpose |
|------|---------|
| `user-update-checker.js` | User-facing: local vs Dustin's GitHub |
| `version-checker.js` | Admin: IronClaw vs upstream OpenClaw |
| `telegram-notifier.js` | Telegram alert system (shared) |
| `setup.js` | Installation script |
| `user-update-cron.json` | Cron config for user checker |
| `cron-job-config.json` | Cron config for admin checker |

## Logs

```bash
# User update checker
tail -f /home/node/.openclaw/logs/user-update-checker.log

# Admin version checker
tail -f /home/node/.openclaw/logs/version-monitor.log
```

## Security

- ✅ **No auto-updates** — Notification only, never executes changes
- ✅ **Secure credentials** — Telegram tokens in environment variables
- ✅ **Audit logging** — All checks logged with timestamps
- ✅ **Rate limiting** — Cooldown prevents notification spam
- ✅ **Quality gate** — Updates are tested before users receive them

---

**Part of IronClaw Supreme Hardening System**
*Keeping your production AI assistant current and secure*