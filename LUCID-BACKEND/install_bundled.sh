#!/bin/bash
# Auto-install script for bundled models
# This runs automatically when package is installed/cloned

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LUCIFERAI_DIR="$SCRIPT_DIR/.luciferai"
BIN_DIR="$LUCIFERAI_DIR/bin"
MODELS_DIR="$LUCIFERAI_DIR/models"

GREEN='\033[32m'
CYAN='\033[36m'
YELLOW='\033[33m'
RESET='\033[0m'

echo -e "${CYAN}🔧 Setting up LuciferAI bundled models...${RESET}\n"

# Create directories
mkdir -p "$BIN_DIR"
mkdir -p "$MODELS_DIR"

# Check if llamafile already exists
if [ ! -f "$BIN_DIR/llamafile" ]; then
    echo -e "${YELLOW}⬇️  Downloading llamafile...${RESET}"
    
    OS="$(uname -s)"
    case "$OS" in
        Darwin*)
            URL="https://github.com/Mozilla-Ocho/llamafile/releases/download/0.8.6/llamafile-0.8.6"
            ;;
        Linux*)
            URL="https://github.com/Mozilla-Ocho/llamafile/releases/download/0.8.6/llamafile-0.8.6"
            ;;
        *)
            echo "Unsupported OS: $OS"
            exit 1
            ;;
    esac
    
    if command -v curl &> /dev/null; then
        curl -sL -o "$BIN_DIR/llamafile" "$URL"
    elif command -v wget &> /dev/null; then
        wget -q -O "$BIN_DIR/llamafile" "$URL"
    else
        echo "Neither curl nor wget found. Please install one."
        exit 1
    fi
    
    chmod +x "$BIN_DIR/llamafile"
    echo -e "${GREEN}✅ llamafile installed${RESET}"
else
    echo -e "${GREEN}✅ llamafile already present${RESET}"
fi

# Check if TinyLlama exists
if [ ! -f "$MODELS_DIR/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" ]; then
    echo -e "${YELLOW}⬇️  Downloading TinyLlama model (~600MB)...${RESET}"
    
    URL="https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
    
    if command -v curl &> /dev/null; then
        curl -sL -o "$MODELS_DIR/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" "$URL"
    elif command -v wget &> /dev/null; then
        wget -q -O "$MODELS_DIR/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" "$URL"
    fi
    
    echo -e "${GREEN}✅ TinyLlama installed${RESET}"
else
    echo -e "${GREEN}✅ TinyLlama already present${RESET}"
fi

echo -e "\n${GREEN}✅ Bundled models ready!${RESET}\n"
