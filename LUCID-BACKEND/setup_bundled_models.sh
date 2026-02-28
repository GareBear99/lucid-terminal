#!/bin/bash
# Setup script for LuciferAI bundled models
# Creates directory structure and downloads bundled components

set -e

PURPLE='\033[35m'
GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
LUCIFERAI_DIR="$PROJECT_ROOT/.luciferai"
BIN_DIR="$LUCIFERAI_DIR/bin"
MODELS_DIR="$LUCIFERAI_DIR/models"

echo -e "\n${PURPLE}════════════════════════════════════════════════════════${RESET}"
echo -e "${PURPLE}║  🩸 LuciferAI Bundled Models Setup                    ║${RESET}"
echo -e "${PURPLE}════════════════════════════════════════════════════════${RESET}\n"

# Create directories
echo -e "${CYAN}📁 Creating directory structure...${RESET}"
mkdir -p "$BIN_DIR"
mkdir -p "$MODELS_DIR"
echo -e "${GREEN}✅ Directories created${RESET}\n"

# Check if llamafile already exists
if [ -f "$BIN_DIR/llamafile" ]; then
    echo -e "${YELLOW}⚠️  llamafile already exists${RESET}"
    echo -e "${CYAN}   Location: $BIN_DIR/llamafile${RESET}\n"
else
    # Detect OS
    OS="$(uname -s)"
    case "$OS" in
        Darwin*)
            LLAMAFILE_URL="https://github.com/Mozilla-Ocho/llamafile/releases/download/0.8.6/llamafile-0.8.6"
            echo -e "${CYAN}🍎 Detected macOS${RESET}"
            ;;
        Linux*)
            LLAMAFILE_URL="https://github.com/Mozilla-Ocho/llamafile/releases/download/0.8.6/llamafile-0.8.6"
            echo -e "${CYAN}🐧 Detected Linux${RESET}"
            ;;
        *)
            echo -e "${RED}❌ Unsupported OS: $OS${RESET}"
            exit 1
            ;;
    esac
    
    echo -e "${CYAN}⬇️  Downloading llamafile (~34MB)...${RESET}"
    if command -v curl &> /dev/null; then
        curl -L -o "$BIN_DIR/llamafile" "$LLAMAFILE_URL" --progress-bar
    elif command -v wget &> /dev/null; then
        wget -O "$BIN_DIR/llamafile" "$LLAMAFILE_URL" --show-progress
    else
        echo -e "${RED}❌ Neither curl nor wget found${RESET}"
        exit 1
    fi
    
    # Make executable
    chmod +x "$BIN_DIR/llamafile"
    echo -e "${GREEN}✅ llamafile installed${RESET}\n"
fi

# Check if TinyLlama already exists
if [ -f "$MODELS_DIR/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" ]; then
    echo -e "${YELLOW}⚠️  TinyLlama already exists${RESET}"
    echo -e "${CYAN}   Location: $MODELS_DIR/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf${RESET}\n"
else
    TINYLLAMA_URL="https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
    
    echo -e "${CYAN}⬇️  Downloading TinyLlama model (~600MB)...${RESET}"
    echo -e "${YELLOW}   This may take a few minutes${RESET}\n"
    
    if command -v curl &> /dev/null; then
        curl -L -o "$MODELS_DIR/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" "$TINYLLAMA_URL" --progress-bar
    elif command -v wget &> /dev/null; then
        wget -O "$MODELS_DIR/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" "$TINYLLAMA_URL" --show-progress
    else
        echo -e "${RED}❌ Neither curl nor wget found${RESET}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ TinyLlama model downloaded${RESET}\n"
fi

# Summary
echo -e "${PURPLE}════════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}✅ Setup complete!${RESET}\n"

echo -e "${CYAN}📦 Bundled Components:${RESET}"
echo -e "   ${GREEN}✓${RESET} llamafile: $BIN_DIR/llamafile"
echo -e "   ${GREEN}✓${RESET} TinyLlama: $MODELS_DIR/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf\n"

echo -e "${CYAN}🚀 Quick Start:${RESET}"
echo -e "   $BIN_DIR/llamafile -m $MODELS_DIR/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf --interactive\n"

echo -e "${CYAN}💡 Usage in LuciferAI:${RESET}"
echo -e "   Run: ${YELLOW}python3 lucifer.py${RESET}"
echo -e "   The banner will automatically detect bundled models\n"

echo -e "${PURPLE}════════════════════════════════════════════════════════${RESET}\n"
