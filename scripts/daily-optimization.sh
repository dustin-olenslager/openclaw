#!/bin/bash

# OpenClaw Daily Optimization Script

echo "🚀 Running OpenClaw daily optimizations..."

# 1. Clean up old media files (older than 7 days)
echo "📁 Cleaning old media files..."
find /home/node/.openclaw/media/inbound -name "*.ogg" -mtime +7 -delete 2>/dev/null
find /home/node/.openclaw/media/inbound -name "*.jpg" -mtime +7 -delete 2>/dev/null
find /home/node/.openclaw/media/inbound -name "*.png" -mtime +7 -delete 2>/dev/null

# 2. Rotate memory files (keep last 30 days)
echo "🧠 Managing memory files..."
cd /home/node/.openclaw/workspace/memory 2>/dev/null || mkdir -p /home/node/.openclaw/workspace/memory
find . -name "*.md" -mtime +30 -exec gzip {} \; 2>/dev/null

# 3. Check and clean browser locks
echo "🌐 Browser maintenance..."
cd /home/node/.openclaw/workspace
if [ -f "scripts/browser-cleanup.sh" ]; then
    ./scripts/browser-cleanup.sh
fi

# 4. Check API quota status
echo "🔑 API Status Check..."
if [ -n "$OPENAI_API_KEY" ]; then
    echo "  OpenAI: Configured"
fi
if [ -n "$DEEPGRAM_API_KEY" ]; then
    echo "  Deepgram: Configured ($200 free credits)"
fi
if [ -n "$GEMINI_API_KEY" ]; then
    echo "  Gemini: Configured"
fi

# 5. System resource check
echo "💾 Resource Usage:"
echo "  Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "  Disk: $(df -h /home/node/.openclaw | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"

# 6. Service health check
echo "⚙️ Service Status:"
if pgrep -f "openclaw-gateway" > /dev/null; then
    echo "  OpenClaw Gateway: ✅ Running"
else
    echo "  OpenClaw Gateway: ❌ Not running"
fi

echo "✅ Daily optimization complete"