#!/bin/bash

# Generate log filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="/Users/TheRustySpoon/Downloads/lucid_app_log_${TIMESTAMP}.txt"

echo "🚀 Running Built Lucid Terminal App"
echo "📝 Logging to: $LOG_FILE"
echo ""

# Set environment variables for debugging
export ELECTRON_ENABLE_LOGGING=1
export ELECTRON_LOG_FILE="$LOG_FILE"

# Trap Ctrl+C and cleanup
ELECTRON_PID=""
cleanup() {
    echo ""
    echo "⏹️  Stopping app..."
    if [ ! -z "$ELECTRON_PID" ]; then
        kill $ELECTRON_PID 2>/dev/null
        wait $ELECTRON_PID 2>/dev/null
    fi
    echo "✅ App closed. Log saved to: $LOG_FILE"
    exit 0
}
trap cleanup SIGINT SIGTERM

# Run electron with the built app
echo "▶️  Launching app..."
echo "Press Ctrl+C to stop"
echo ""

npx electron dist-electron/main.js 2>&1 | tee -a "$LOG_FILE" &
ELECTRON_PID=$!

# Wait for the process
wait $ELECTRON_PID
cleanup
