#!/bin/bash
# Test each LLM tier with actual backend running
# Uses expect to send commands to interactive LuciferAI session

PROJECT_ROOT="/Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local"
LLM_STATE_FILE="$HOME/.luciferai/llm_state.json"
BACKUP_FILE="$HOME/.luciferai/llm_state.json.backup"

cd "$PROJECT_ROOT"

# Check if expect is installed
if ! command -v expect &> /dev/null; then
    echo "❌ 'expect' is not installed"
    echo "Install with: brew install expect"
    exit 1
fi

echo "======================================================================"
echo "LuciferAI - Interactive Multi-Tier LLM Testing"
echo "======================================================================"
echo ""
echo "This will test each tier with the LLM backend running"
echo "Each test starts LuciferAI, sends a command, and captures output"
echo ""

# Backup current LLM state
if [ -f "$LLM_STATE_FILE" ]; then
    cp "$LLM_STATE_FILE" "$BACKUP_FILE"
    echo "✅ Backed up LLM state"
else
    echo "⚠️  No existing LLM state found"
fi

# Function to test a tier
test_tier() {
    local tier_num=$1
    local tier_name=$2
    local llm_state=$3
    local folder_name=$4
    
    echo ""
    echo "======================================================================"
    echo "Test $tier_num: $tier_name"
    echo "======================================================================"
    echo ""
    
    # IMPORTANT: Update LLM state BEFORE starting LuciferAI
    # This ensures the target tier is actually used, not bypassed
    echo "Configuring LLM state for $tier_name..."
    echo "$llm_state" > "$LLM_STATE_FILE"
    echo "✅ LLM state configured"
    echo ""
    
    # Now start LuciferAI with the correct tier active
    # Create expect script
    expect << EOF
set timeout 120
log_user 1

spawn python3 lucifer.py

# Wait for prompt
expect "LuciferAI>"

# Send command
send "create me a script that opens the browser and save it to desktop in $folder_name folder\r"

# Wait for completion (look for idle state or prompt)
expect {
    "Idle" { }
    "LuciferAI>" { }
    timeout { puts "\n⚠️  Timeout waiting for response" }
}

# Give it a moment to finish
sleep 2

# Exit
send "exit\r"

expect eof
EOF
    
    echo ""
    echo "Test $tier_num complete!"
    echo ""
    
    # Show generated file
    if [ -f "$HOME/Desktop/$folder_name/open_browser.py" ]; then
        echo "✅ File created: ~/Desktop/$folder_name/open_browser.py"
        echo ""
        echo "Generated code preview:"
        echo "─────────────────────────────────────────────────"
        head -20 "$HOME/Desktop/$folder_name/open_browser.py"
        echo "─────────────────────────────────────────────────"
    else
        echo "❌ File not found: ~/Desktop/$folder_name/open_browser.py"
    fi
    
    read -p "

Press Enter to continue to next tier..."
}

# Test Tier 4 - Enable all models, llama3.1-70b will be used
test_tier 1 "Tier 4 - Llama3.1-70B (All models enabled)" '{
  "tinyllama": true,
  "llama3.2": true,
  "mistral": true,
  "deepseek-coder": true,
  "llama3.1-70b": true
}' "tier4_test"

# Test Tier 3 - Disable Tier 4, deepseek-coder will be highest
test_tier 2 "Tier 3 - DeepSeek-Coder (Tier 4 disabled)" '{
  "tinyllama": true,
  "llama3.2": true,
  "mistral": true,
  "deepseek-coder": true,
  "llama3.1-70b": false
}' "tier3_test"

# Test Tier 2 - Disable Tiers 3-4, mistral will be highest
test_tier 3 "Tier 2 - Mistral (Tiers 3-4 disabled)" '{
  "tinyllama": true,
  "llama3.2": true,
  "mistral": true,
  "deepseek-coder": false,
  "llama3.1-70b": false
}' "tier2_test"

# Test Tier 1 - Disable Tiers 2-4, llama3.2 will be highest
test_tier 4 "Tier 1 - Llama3.2 (Tiers 2-4 disabled)" '{
  "tinyllama": true,
  "llama3.2": true,
  "mistral": false,
  "deepseek-coder": false,
  "llama3.1-70b": false
}' "tier1_test"

# Test Tier 0 - Disable all higher tiers, tinyllama will be used
test_tier 5 "Tier 0 - TinyLlama (All higher tiers disabled)" '{
  "tinyllama": true,
  "llama3.2": false,
  "mistral": false,
  "deepseek-coder": false,
  "llama3.1-70b": false
}' "tier0_test"

echo ""
echo "======================================================================"
echo "All Tests Complete!"
echo "======================================================================"
echo ""
echo "Compare generated files:"
for tier in tier0_test tier1_test tier2_test tier3_test tier4_test; do
    if [ -f "$HOME/Desktop/$tier/open_browser.py" ]; then
        echo "  ✅ ~/Desktop/$tier/open_browser.py"
    else
        echo "  ❌ ~/Desktop/$tier/open_browser.py (not created)"
    fi
done

# Restore original LLM state
if [ -f "$BACKUP_FILE" ]; then
    mv "$BACKUP_FILE" "$LLM_STATE_FILE"
    echo ""
    echo "✅ Restored original LLM state"
fi

echo ""
echo "Done! You can now compare code quality across tiers."
