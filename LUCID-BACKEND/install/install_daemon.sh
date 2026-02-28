#!/bin/bash
# Install FixNet Auto-Sync Daemon

PURPLE='\033[0;35m'
GREEN='\033[0;32m'
RED='\033[0;31m'
GOLD='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${PURPLE}╔════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║  🔄 FixNet Daemon Installation        ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════╝${NC}\n"

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}❌ This installer is for macOS only${NC}"
    exit 1
fi

# Install schedule library
echo -e "${BLUE}📦 Installing dependencies...${NC}"
pip3 install schedule 2>/dev/null || {
    echo -e "${GOLD}⚠️  pip3 not found, trying pip...${NC}"
    pip install schedule
}

# Copy plist to LaunchAgents
PLIST_SOURCE="$(dirname "$0")/com.luciferai.fixnet.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.luciferai.fixnet.plist"

echo -e "${BLUE}📋 Installing LaunchAgent...${NC}"
mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SOURCE" "$PLIST_DEST"

# Update paths in plist to use actual home directory
sed -i '' "s|/Users/TheRustySpoon|$HOME|g" "$PLIST_DEST"

# Update daemon script path
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
sed -i '' "s|/Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local|$SCRIPT_DIR|g" "$PLIST_DEST"

echo -e "${BLUE}🔧 Configuration:${NC}"
echo -e "   Daemon script: ${GOLD}$SCRIPT_DIR/core/fixnet_daemon.py${NC}"
echo -e "   Config file: ${GOLD}~/.luciferai/data/daemon_config.json${NC}"
echo -e "   Log file: ${GOLD}~/.luciferai/logs/sync.log${NC}"

# Load the service
echo -e "\n${BLUE}🚀 Starting daemon...${NC}"
launchctl unload "$PLIST_DEST" 2>/dev/null  # Unload if already loaded
launchctl load "$PLIST_DEST"

# Check if loaded
sleep 2
if launchctl list | grep -q "com.luciferai.fixnet"; then
    echo -e "${GREEN}✅ Daemon installed and running!${NC}"
    echo -e "\n${PURPLE}Status commands:${NC}"
    echo -e "  ${GOLD}launchctl list | grep luciferai${NC}  # Check if running"
    echo -e "  ${GOLD}tail -f ~/.luciferai/logs/sync.log${NC}  # View logs"
    echo -e "  ${GOLD}launchctl unload ~/Library/LaunchAgents/com.luciferai.fixnet.plist${NC}  # Stop"
    echo -e "  ${GOLD}launchctl load ~/Library/LaunchAgents/com.luciferai.fixnet.plist${NC}  # Start"
    
    echo -e "\n${PURPLE}Configuration:${NC}"
    echo -e "  Edit ${GOLD}~/.luciferai/data/daemon_config.json${NC} to customize"
    echo -e "  Default: Pull every 15 min, Push every 30 min"
else
    echo -e "${RED}❌ Failed to start daemon${NC}"
    echo -e "Check logs at: ${GOLD}~/.luciferai/logs/daemon_error.log${NC}"
    exit 1
fi

echo -e "\n${GREEN}🎉 Installation complete!${NC}"
echo -e "${BLUE}Your fixes will now auto-sync to GitHub every 30 minutes.${NC}"
