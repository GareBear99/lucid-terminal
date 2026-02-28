#!/bin/bash
# 🩸 LuciferAI Universal Installer
# Install LuciferAI globally from any package manager

PURPLE='\033[35m'
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
BLUE='\033[34m'
RESET='\033[0m'

echo ""
echo -e "${PURPLE}╔════════════════════════════════════════════════════════╗${RESET}"
echo -e "${PURPLE}║         🩸 LuciferAI Universal Installer              ║${RESET}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════╝${RESET}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${YELLOW}Choose installation method:${RESET}"
echo ""
echo -e "  ${BLUE}1)${RESET} pip (Python package manager)"
echo -e "  ${BLUE}2)${RESET} pip --user (User installation, no sudo)"
echo -e "  ${BLUE}3)${RESET} pip -e (Development mode, editable)"
echo -e "  ${BLUE}4)${RESET} Homebrew (macOS)"
echo -e "  ${BLUE}5)${RESET} conda"
echo -e "  ${BLUE}6)${RESET} Luci Environment"
echo ""
read -p "Enter choice [1-6]: " choice

echo ""

case $choice in
    1)
        echo -e "${YELLOW}📦 Installing via pip...${RESET}"
        pip install "$SCRIPT_DIR"
        ;;
    2)
        echo -e "${YELLOW}📦 Installing via pip --user...${RESET}"
        pip install --user "$SCRIPT_DIR"
        ;;
    3)
        echo -e "${YELLOW}🔧 Installing in development mode...${RESET}"
        pip install -e "$SCRIPT_DIR"
        ;;
    4)
        echo -e "${YELLOW}🍺 Installing via Homebrew...${RESET}"
        echo -e "${RED}Note: Homebrew formula not yet published${RESET}"
        echo -e "${BLUE}Using pip instead...${RESET}"
        pip install "$SCRIPT_DIR"
        ;;
    5)
        echo -e "${YELLOW}🐍 Installing via conda...${RESET}"
        echo -e "${BLUE}Note: Installing with pip (conda-compatible)${RESET}"
        pip install "$SCRIPT_DIR"
        ;;
    6)
        echo -e "${YELLOW}🩸 Installing in Luci Environment...${RESET}"
        if command -v luci &> /dev/null; then
            # Check if a Luci env is active
            if [ -n "$LUCI_ENV_NAME" ]; then
                echo -e "${GREEN}Installing in active Luci environment: $LUCI_ENV_NAME${RESET}"
                pip install "$SCRIPT_DIR"
            else
                echo -e "${YELLOW}No Luci environment active${RESET}"
                echo -e "${BLUE}Creating 'luciferai' environment...${RESET}"
                luci create luciferai
                echo -e "${BLUE}Activate with: ${GREEN}source <(luci activate luciferai)${RESET}"
                echo -e "${BLUE}Then run: ${GREEN}pip install $SCRIPT_DIR${RESET}"
                exit 0
            fi
        else
            echo -e "${RED}Luci not installed${RESET}"
            echo -e "${BLUE}Install Luci first from Luci_Environments/${RESET}"
            exit 1
        fi
        ;;
    *)
        echo -e "${RED}Invalid choice${RESET}"
        exit 1
        ;;
esac

# Check if installation was successful
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ LuciferAI installed successfully!${RESET}"
    echo ""
    
    # Test the command
    if command -v LuciferAI &> /dev/null; then
        echo -e "${GREEN}✅ 'LuciferAI' command is now available globally!${RESET}"
        echo ""
        echo -e "${PURPLE}Quick Start:${RESET}"
        echo -e "  ${BLUE}LuciferAI${RESET}              # Start interactive mode"
        echo -e "  ${BLUE}LuciferAI install requests${RESET}  # Install package"
        echo -e "  ${BLUE}LuciferAI test${RESET}         # Run tests"
        echo ""
        echo -e "${YELLOW}Alternative commands:${RESET}"
        echo -e "  ${BLUE}luciferai${RESET}    # Lowercase version"
        echo -e "  ${BLUE}lucifer${RESET}      # Short version"
        echo ""
    else
        echo -e "${YELLOW}⚠️  Command not found in PATH${RESET}"
        echo -e "${BLUE}You may need to add pip's bin directory to your PATH${RESET}"
        echo ""
        echo -e "Add to ~/.bashrc or ~/.zshrc:"
        echo -e "${BLUE}export PATH=\"\$PATH:\$(python3 -m site --user-base)/bin\"${RESET}"
        echo ""
    fi
else
    echo ""
    echo -e "${RED}❌ Installation failed${RESET}"
    echo -e "${YELLOW}Try: pip install -e $SCRIPT_DIR${RESET}"
    exit 1
fi

echo -e "${PURPLE}════════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}Installation complete! Type 'LuciferAI' to start 🩸${RESET}"
echo -e "${PURPLE}════════════════════════════════════════════════════════${RESET}"
echo ""
