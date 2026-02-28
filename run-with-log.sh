#!/bin/bash

# Generate log filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="/Users/TheRustySpoon/Downloads/lucid-terminal_dev_log_${TIMESTAMP}.html"

# Create HTML header
cat > "$LOG_FILE" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Lucid Terminal Dev Server Log</title>
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
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Lucid Terminal - Dev Server Log</h1>
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
        if echo "$line" | grep -qi "error"; then
            echo "<div class='log-entry error'>$escaped</div>" >> "$LOG_FILE"
        elif echo "$line" | grep -qi "warning"; then
            echo "<div class='log-entry warning'>$escaped</div>" >> "$LOG_FILE"
        elif echo "$line" | grep -qi "compiled successfully\|ready\|success"; then
            echo "<div class='log-entry success'>$escaped</div>" >> "$LOG_FILE"
        else
            echo "<div class='log-entry'>$escaped</div>" >> "$LOG_FILE"
        fi
    done
}

# Run dev server and capture output
npm run dev 2>&1 | log_to_html

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
