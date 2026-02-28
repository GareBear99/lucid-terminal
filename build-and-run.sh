#!/bin/bash

# Generate log filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="/Users/TheRustySpoon/Downloads/lucid-terminal_prod_log_${TIMESTAMP}.html"

# Create HTML header
cat > "$LOG_FILE" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Lucid Terminal Production Build Log</title>
    <style>
        body {
            background: #1e1e1e;
            color: #d4d4d4;
            font-family: 'Consolas', 'Monaco', monospace;
            padding: 20px;
            margin: 0;
        }
        .header {
            background: #252526;
            padding: 15px;
            border-left: 4px solid #007acc;
            margin-bottom: 20px;
        }
        .log-entry {
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.4;
            padding: 2px 0;
        }
        .error { color: #f48771; }
        .warning { color: #dcdcaa; }
        .success { color: #4ec9b0; }
        .info { color: #9cdcfe; }
        .timestamp { color: #858585; }
        .phase {
            background: #264f78;
            padding: 10px;
            margin: 10px 0;
            border-left: 3px solid #4ec9b0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Lucid Terminal - Production Build & Run</h1>
        <p class="timestamp">Started: $(date)</p>
        <p>Working Directory: $(pwd)</p>
    </div>
    <div class="log-content">
EOF

echo "📝 Logging to: $LOG_FILE"
echo ""

# Function to append to HTML log
log_to_html() {
    while IFS= read -r line; do
        echo "$line"
        # Escape HTML special characters and colorize
        escaped=$(echo "$line" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')
        
        # Apply color classes based on content
        if echo "$line" | grep -qi "error\|failed"; then
            echo "<div class='log-entry error'>$escaped</div>" >> "$LOG_FILE"
        elif echo "$line" | grep -qi "warning\|warn"; then
            echo "<div class='log-entry warning'>$escaped</div>" >> "$LOG_FILE"
        elif echo "$line" | grep -qi "compiled successfully\|ready\|success\|done"; then
            echo "<div class='log-entry success'>$escaped</div>" >> "$LOG_FILE"
        else
            echo "<div class='log-entry'>$escaped</div>" >> "$LOG_FILE"
        fi
    done
}

# Phase 1: Build
echo "<div class='phase'><strong>📦 Phase 1: Building Production App...</strong></div>" >> "$LOG_FILE"
echo ""
echo "📦 Phase 1: Building production app..."
npm run build 2>&1 | log_to_html

BUILD_EXIT=$?
if [ $BUILD_EXIT -ne 0 ]; then
    echo ""
    echo "❌ Build failed with exit code $BUILD_EXIT"
    echo "<div class='log-entry error'>Build failed with exit code $BUILD_EXIT</div>" >> "$LOG_FILE"
    
    # Add HTML footer
    cat >> "$LOG_FILE" << EOF
    </div>
    <div class="header" style="margin-top: 20px; border-left-color: #f48771;">
        <p class="timestamp">Failed: $(date)</p>
        <p style="color: #f48771;">Build process failed. Check logs above.</p>
    </div>
</body>
</html>
EOF
    
    echo "✅ Log saved to: $LOG_FILE"
    open "$LOG_FILE"
    exit $BUILD_EXIT
fi

# Phase 2: Check if app was built
echo ""
echo "<div class='phase'><strong>🔍 Phase 2: Verifying Build Output...</strong></div>" >> "$LOG_FILE"
echo "🔍 Phase 2: Verifying build output..."

if [ -d "dist-electron" ] && [ -d "dist" ]; then
    echo "✅ Build artifacts found"
    echo "<div class='log-entry success'>✅ Build artifacts found (dist/ and dist-electron/)</div>" >> "$LOG_FILE"
else
    echo "❌ Build artifacts missing"
    echo "<div class='log-entry error'>❌ Build artifacts missing</div>" >> "$LOG_FILE"
fi

# Phase 3: Run the app
echo ""
echo "<div class='phase'><strong>▶️  Phase 3: Running Production App...</strong></div>" >> "$LOG_FILE"
echo "▶️  Phase 3: Running production app..."
echo "<div class='log-entry info'>Note: App will launch in separate window. Press Ctrl+C here to stop and save logs.</div>" >> "$LOG_FILE"

# Set environment variable to enable console logging
export ELECTRON_ENABLE_LOGGING=1

# Run the built app
npm run preview 2>&1 | log_to_html

# Add HTML footer
cat >> "$LOG_FILE" << EOF
    </div>
    <div class="header" style="margin-top: 20px;">
        <p class="timestamp">Ended: $(date)</p>
    </div>
</body>
</html>
EOF

echo ""
echo "✅ Log saved to: $LOG_FILE"
echo "📂 Opening log file..."
open "$LOG_FILE"
