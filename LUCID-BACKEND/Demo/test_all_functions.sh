#!/bin/bash
# 🧪 LuciferAI - Comprehensive Test Suite
# Tests all components: auth, fixnet, dictionary, agent, tools

PURPLE="\033[35m"
GREEN="\033[32m"
RED="\033[31m"
GOLD="\033[33m"
BLUE="\033[34m"
RESET="\033[0m"

echo -e "${PURPLE}╔════════════════════════════════════════════════════════╗${RESET}"
echo -e "${PURPLE}║  👾 LuciferAI - Complete System Test Suite            ║${RESET}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════╝${RESET}\n"

PASSED=0
FAILED=0

# Test function
test_component() {
    local name=$1
    local script=$2
    
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${PURPLE}Testing: $name${RESET}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
    
    if python3 "$script" 2>&1; then
        echo -e "\n${GREEN}✅ $name: PASSED${RESET}"
        ((PASSED++))
    else
        echo -e "\n${RED}❌ $name: FAILED${RESET}"
        ((FAILED++))
    fi
}

# Create test broken script
echo -e "${GOLD}Creating test scripts...${RESET}"

cat > /tmp/test_broken.py << 'EOF'
# Test script with NameError
print(json.dumps({"test": "data"}))
EOF

cat > /tmp/test_working.py << 'EOF'
# Test script that works
print("Hello from LuciferAI!")
EOF

echo -e "${GREEN}✅ Test scripts created${RESET}\n"

# Run all tests
cd ~/Desktop/Projects/LuciferAI_Local

echo -e "${PURPLE}[1/6] Testing File Tools...${RESET}"
test_component "File Tools" "tools/file_tools.py"

echo -e "\n${PURPLE}[2/6] Testing Command Tools...${RESET}"
test_component "Command Tools" "tools/command_tools.py"

echo -e "\n${PURPLE}[3/6] Testing Authentication...${RESET}"
test_component "Authentication System" "core/lucifer_auth.py"

echo -e "\n${PURPLE}[4/6] Testing FixNet Uploader...${RESET}"
test_component "FixNet Uploader" "core/fixnet_uploader.py"

echo -e "\n${PURPLE}[5/6] Testing Relevance Dictionary...${RESET}"
test_component "Relevance Dictionary" "core/relevance_dictionary.py"

echo -e "\n${PURPLE}[6/6] Testing Enhanced Agent...${RESET}"
test_component "Enhanced Agent" "core/enhanced_agent.py"

# Summary
echo -e "\n\n${PURPLE}╔════════════════════════════════════════════════════════╗${RESET}"
echo -e "${PURPLE}║                   TEST SUMMARY                         ║${RESET}"
echo -e "${PURPLE}╚════════════════════════════════════════════════════════╝${RESET}\n"

echo -e "${GREEN}✅ Passed: $PASSED${RESET}"
echo -e "${RED}❌ Failed: $FAILED${RESET}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! System is fully operational.${RESET}\n"
    
    echo -e "${PURPLE}Next Steps:${RESET}"
    echo -e "  1. ${GOLD}Configure GitHub:${RESET} See QUICKSTART.md"
    echo -e "  2. ${GOLD}Launch:${RESET} ./lucifer.py"
    echo -e "  3. ${GOLD}Test auto-fix:${RESET} run /tmp/test_broken.py\n"
else
    echo -e "${RED}⚠️  Some tests failed. Check output above.${RESET}\n"
fi

echo -e "${BLUE}Full documentation:${RESET}"
echo -e "  • README.md - Overview"
echo -e "  • QUICKSTART.md - Setup guide"
echo -e "  • FIXNET_GUIDE.md - Complete system details\n"
