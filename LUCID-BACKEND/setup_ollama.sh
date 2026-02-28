#!/bin/bash
# Quick setup for Ollama AI agent

PURPLE='\033[0;35m'
GREEN='\033[0;32m'
GOLD='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${PURPLE}╔════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║  🤖 Ollama AI Agent Setup             ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════╝${NC}\n"

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo -e "${GOLD}📦 Ollama not found. Installing...${NC}\n"
    
    # Install Ollama for macOS
    curl -fsSL https://ollama.ai/install.sh | sh
    
    if [ $? -ne 0 ]; then
        echo -e "${GOLD}⚠️  Automatic install failed.${NC}"
        echo -e "${BLUE}Please install manually from: https://ollama.ai${NC}\n"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Ollama installed${NC}\n"

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "${BLUE}🚀 Starting Ollama...${NC}"
    
    # Start Ollama in background
    ollama serve > /dev/null 2>&1 &
    OLLAMA_PID=$!
    
    # Wait for it to start
    sleep 3
    
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Ollama running (PID: $OLLAMA_PID)${NC}\n"
    else
        echo -e "${GOLD}⚠️  Ollama didn't start properly${NC}"
        echo -e "${BLUE}Try running manually: ollama serve${NC}\n"
    fi
else
    echo -e "${GREEN}✅ Ollama already running${NC}\n"
fi

# Pull recommended model
echo -e "${BLUE}📥 Pulling recommended model (llama3.2)...${NC}"
echo -e "${GOLD}This may take a few minutes...${NC}\n"

ollama pull llama3.2

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ Model downloaded${NC}\n"
else
    echo -e "\n${GOLD}⚠️  Model download failed${NC}"
    echo -e "${BLUE}Available models: llama3.2, mistral, codellama, etc.${NC}"
    echo -e "${BLUE}Pull manually with: ollama pull <model>${NC}\n"
fi

# Install Python dependencies
echo -e "${BLUE}📦 Installing Python dependencies...${NC}"
pip3 install requests > /dev/null 2>&1

echo -e "${GREEN}✅ Dependencies installed${NC}\n"

# Test the setup
echo -e "${PURPLE}═══════════════════════════════════════${NC}"
echo -e "${PURPLE}🧪 Testing setup...${NC}"
echo -e "${PURPLE}═══════════════════════════════════════${NC}\n"

cd "$(dirname "$0")"
python3 core/ollama_agent.py "hello" 2>&1 | head -20

echo -e "\n${GREEN}✨ Setup complete!${NC}\n"

echo -e "${PURPLE}Next steps:${NC}"
echo -e "  ${BLUE}1.${NC} Run: ${GOLD}python3 lucifer.py${NC}"
echo -e "  ${BLUE}2.${NC} LuciferAI will auto-detect Ollama"
echo -e "  ${BLUE}3.${NC} Ask: ${GOLD}'Find a fix for NameError'${NC}"
echo -e "  ${BLUE}4.${NC} Or: ${GOLD}'Create a Python script that...'${NC}\n"

echo -e "${PURPLE}═══════════════════════════════════════${NC}\n"
