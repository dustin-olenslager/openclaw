# HEARTBEAT.md

## Enhanced Browser Health Check
- Run `scripts/browser-health-monitor.sh` for comprehensive health monitoring
- If issues detected, monitor will auto-trigger cleanup
- Check browser status: `browser action=status profile=openclaw`
- If not running, cleanup runs automatically and starts: `browser action=start profile=openclaw`
- Enhanced system detects: zombie processes, lock files, memory issues, CDP port conflicts

## Audio Transcription Health Check
- If recent messages show `<media:audio>` without transcripts, audio transcription is broken
- Fix: `gateway action=restart note="Audio transcription pipeline reload"`
- This fixes OpenClaw bug #7899 where Telegram voice messages aren't processed
