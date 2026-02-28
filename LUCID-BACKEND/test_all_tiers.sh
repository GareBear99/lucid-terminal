#!/bin/bash
# Test each LLM tier by temporarily disabling higher tiers
# This shows the actual output and code generation from each tier
# Executes through LuciferAI startup screen for authentic user experience

PROJECT_ROOT="/Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local"
LLM_STATE_FILE="$HOME/.luciferai/llm_state.json"
BACKUP_FILE="$HOME/.luciferai/llm_state.json.backup"

cd "$PROJECT_ROOT"

echo "======================================================================"
echo "LuciferAI - Multi-Tier LLM Testing (via Startup Screen)"
echo "======================================================================"
echo ""
echo "This script will test each tier by disabling higher tiers"
echo "Each command executes through the actual LuciferAI interface"
echo "You'll see the real startup screen, banner, and full workflow"
echo ""

# Backup current LLM state
if [ -f "$LLM_STATE_FILE" ]; then
    cp "$LLM_STATE_FILE" "$BACKUP_FILE"
    echo "✅ Backed up LLM state"
else
    echo "⚠️  No existing LLM state found"
fi

echo ""
echo "======================================================================"
echo "Test 1: Tier 4 - Llama3.1-70B (if available)"
echo "======================================================================"
echo ""

# Enable all models
cat > "$LLM_STATE_FILE" << 'EOF'
{
  "tinyllama": true,
  "llama3.2": true,
  "mistral": true,
  "deepseek-coder": true,
  "llama3.1-70b": true
}
EOF

echo "Executing: create me a script that opens the browser and save it to desktop in tier4_test folder"
echo ""

# Execute through actual LuciferAI startup with -c flag
python3 lucifer.py -c "create me a script that opens the browser and save it to desktop in tier4_test folder"

read -p "

Press Enter to continue to Tier 3 test..."

echo ""
echo "======================================================================"
echo "Test 2: Tier 3 - DeepSeek-Coder"
echo "======================================================================"
echo ""

# Disable Tier 4, enable others
cat > "$LLM_STATE_FILE" << 'EOF'
{
  "tinyllama": true,
  "llama3.2": true,
  "mistral": true,
  "deepseek-coder": true,
  "llama3.1-70b": false
}
EOF

echo "Executing: create me a script that opens the browser and save it to desktop in tier3_test folder"
echo ""

python3 lucifer.py -c "create me a script that opens the browser and save it to desktop in tier3_test folder"

read -p "

Press Enter to continue to Tier 2 test..."

echo ""
echo "======================================================================"
echo "Test 3: Tier 2 - Mistral"
echo "======================================================================"
echo ""

# Disable Tier 3-4, enable Tier 0-2
cat > "$LLM_STATE_FILE" << 'EOF'
{
  "tinyllama": true,
  "llama3.2": true,
  "mistral": true,
  "deepseek-coder": false,
  "llama3.1-70b": false
}
EOF

echo "Executing: create me a script that opens the browser and save it to desktop in tier2_test folder"
echo ""

python3 lucifer.py -c "create me a script that opens the browser and save it to desktop in tier2_test folder"

read -p "

Press Enter to continue to Tier 1 test..."

echo ""
echo "======================================================================"
echo "Test 4: Tier 1 - Llama3.2"
echo "======================================================================"
echo ""

# Disable Tier 2-4, enable Tier 0-1
cat > "$LLM_STATE_FILE" << 'EOF'
{
  "tinyllama": true,
  "llama3.2": true,
  "mistral": false,
  "deepseek-coder": false,
  "llama3.1-70b": false
}
EOF

echo "Executing: create me a script that opens the browser and save it to desktop in tier1_test folder"
echo ""

python3 lucifer.py -c "create me a script that opens the browser and save it to desktop in tier1_test folder"

read -p "

Press Enter to continue to Tier 0 test..."

echo ""
echo "======================================================================"
echo "Test 5: Tier 0 - TinyLlama (Template Fallback)"
echo "======================================================================"
echo ""

# Disable all but TinyLlama
cat > "$LLM_STATE_FILE" << 'EOF'
{
  "tinyllama": true,
  "llama3.2": false,
  "mistral": false,
  "deepseek-coder": false,
  "llama3.1-70b": false
}
EOF

echo "Executing: create me a script that opens the browser and save it to desktop in tier0_test folder"
echo ""

python3 lucifer.py -c "create me a script that opens the browser and save it to desktop in tier0_test folder"

echo ""
echo "======================================================================"
echo "Testing Complete!"
echo "======================================================================"
echo ""
echo "All tier tests completed. Check the desktop for the generated scripts:"
echo "  - tier4_test/open_browser.py"
echo "  - tier3_test/open_browser.py"
echo "  - tier2_test/open_browser.py"
echo "  - tier1_test/open_browser.py"
echo "  - tier0_test/open_browser.py"
echo ""

# Restore original LLM state
if [ -f "$BACKUP_FILE" ]; then
    mv "$BACKUP_FILE" "$LLM_STATE_FILE"
    echo "✅ Restored original LLM state"
else
    echo "⚠️  No backup to restore"
fi

echo ""
echo "You can now compare the code quality from each tier!"
