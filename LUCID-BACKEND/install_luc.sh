#!/bin/bash
# 🩸 Luc! Installation Script
# Sets up the luc! command globally

PURPLE='\033[35m'
GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
CYAN='\033[36m'
RED='\033[31m'
RESET='\033[0m'

echo ""
echo -e "${PURPLE}╔═══════════════════════════════════════════╗${RESET}"
echo -e "${PURPLE}║  🩸 Luc! Installation                     ║${RESET}"
echo -e "${PURPLE}╚═══════════════════════════════════════════╝${RESET}"
echo ""

# Get absolute path to this script's directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LUC_PATH="$SCRIPT_DIR/luc"

echo -e "${CYAN}Installation Directory:${RESET} $SCRIPT_DIR"
echo ""

# Detect shell
if [ -n "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.bashrc"
    SHELL_NAME="bash"
elif [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
    SHELL_NAME="zsh"
else
    SHELL_RC="$HOME/.bashrc"
    SHELL_NAME="unknown"
fi

echo -e "${CYAN}Detected Shell:${RESET} $SHELL_NAME"
echo -e "${CYAN}Config File:${RESET} $SHELL_RC"
echo ""

# Create alias
ALIAS_LINE="alias luc!='$LUC_PATH'"
ALIAS_LINE_ALT="alias luc='$LUC_PATH'"

# Check if alias already exists
if grep -q "alias luc!" "$SHELL_RC" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Alias already exists in $SHELL_RC${RESET}"
    echo -e "${BLUE}Updating alias...${RESET}"
    # Remove old alias
    sed -i.bak '/alias luc!/d' "$SHELL_RC"
    sed -i.bak '/alias luc=/d' "$SHELL_RC"
fi

# Add aliases
echo "" >> "$SHELL_RC"
echo "# 🩸 Luc! - LuciferAI Package Manager" >> "$SHELL_RC"
echo "$ALIAS_LINE" >> "$SHELL_RC"
echo "$ALIAS_LINE_ALT" >> "$SHELL_RC"

echo -e "${GREEN}✅ Aliases added to $SHELL_RC${RESET}"
echo ""

# Show instructions
echo -e "${YELLOW}📝 To use immediately, run:${RESET}"
echo -e "${BLUE}   source $SHELL_RC${RESET}"
echo ""
echo -e "${YELLOW}Or open a new terminal${RESET}"
echo ""

# Test if it works
echo -e "${CYAN}Testing installation...${RESET}"
if [ -x "$LUC_PATH" ]; then
    echo -e "${GREEN}✅ Luc! CLI is executable${RESET}"
else
    echo -e "${RED}❌ Luc! CLI is not executable${RESET}"
    echo -e "${YELLOW}   Run: chmod +x $LUC_PATH${RESET}"
fi

echo ""
echo -e "${GREEN}🎉 Installation complete!${RESET}"
echo ""
echo -e "${CYAN}Usage:${RESET}"
echo -e "  ${BLUE}luc! install requests${RESET}       # Install package"
echo -e "  ${BLUE}luc! create myproject${RESET}       # Create environment"
echo -e "  ${BLUE}luc! list${RESET}                   # List environments"
echo -e "  ${BLUE}luc! help${RESET}                   # Show help"
echo ""
echo -e "${DIM}Note: Both 'luc!' and 'luc' work${RESET}"
echo ""
