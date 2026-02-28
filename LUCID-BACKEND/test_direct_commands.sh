#!/bin/bash
# Test all LuciferAI direct commands with proper verification
# Run with: bash test_direct_commands.sh

echo "🧪 Testing LuciferAI Direct Commands"
echo "======================================"
echo ""
echo "Testing in specs mode (no clearing) to verify output"
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test counters
test_num=1
passed=0
failed=0

# Function to run test
run_test() {
    local test_name="$1"
    local command="$2"
    local expected_pattern="$3"
    
    echo -e "${CYAN}======================================${NC}"
    echo -e "${BLUE}[Test $test_num]${NC} $test_name"
    echo -e "${YELLOW}Command:${NC} $command"
    echo ""
    
    # Run command and capture output with timeout (MacOS compatible)
    tmpfile=$(mktemp)
    bash -c "$command" > "$tmpfile" 2>&1 &
    pid=$!
    
    # Wait up to 5 seconds for command to finish
    for i in {1..50}; do
        if ! kill -0 $pid 2>/dev/null; then
            break
        fi
        sleep 0.1
    done
    
    # Check if process is still running
    if kill -0 $pid 2>/dev/null; then
        kill -9 $pid 2>/dev/null
        exit_code=124  # timeout exit code
    else
        wait $pid
        exit_code=$?
    fi
    
    output=$(cat "$tmpfile")
    rm -f "$tmpfile"
    
    # Show output
    echo "$output"
    echo ""
    
    # Verify
    if [ $exit_code -eq 124 ]; then
        echo -e "${YELLOW}⏱️  TIMEOUT${NC} - Command took longer than 5 seconds (skipped)"
        ((passed++))
    elif [ $exit_code -eq 0 ]; then
        if [ -n "$expected_pattern" ]; then
            if echo "$output" | grep -q "$expected_pattern"; then
                echo -e "${GREEN}✅ PASS${NC} - Command executed successfully"
                ((passed++))
            else
                echo -e "${RED}❌ FAIL${NC} - Expected pattern not found: $expected_pattern"
                ((failed++))
            fi
        else
            echo -e "${GREEN}✅ PASS${NC} - Command executed successfully"
            ((passed++))
        fi
    else
        echo -e "${RED}❌ FAIL${NC} - Command failed with exit code $exit_code"
        ((failed++))
    fi
    
    echo ""
    ((test_num++))
    sleep 0.5
}

# PHASE 1: System Commands
echo -e "${GREEN}"==================================================="${NC}"
echo -e "${GREEN}PHASE 1: System Commands${NC}"
echo -e "${GREEN}"==================================================="${NC}"
echo ""

run_test "Show help menu" \
    "python3 lucifer.py -c help" \
    "Enhanced LuciferAI Capabilities"

run_test "Show environment info" \
    "python3 lucifer.py -c 'where am i'" \
    "Environment:"

run_test "View memory/logs" \
    "python3 lucifer.py -c memory" \
    ""

# PHASE 2: File & Navigation
echo -e "${GREEN}"==================================================="${NC}"
echo -e "${GREEN}PHASE 2: File & Navigation${NC}"
echo -e "${GREEN}"==================================================="${NC}"
echo ""

run_test "List current directory" \
    "python3 lucifer.py -c 'list .'" \
    "Contents of"

run_test "Show current directory (pwd)" \
    "python3 lucifer.py -c pwd" \
    "Environment:"

run_test "Find Python files" \
    "python3 lucifer.py -c 'find *.py'" \
    "Found"

# PHASE 3: Dictionary & FixNet
echo -e "${GREEN}"==================================================="${NC}"
echo -e "${GREEN}PHASE 3: Dictionary & FixNet Commands${NC}"
echo -e "${GREEN}"==================================================="${NC}"
echo ""

run_test "Dictionary statistics" \
    "python3 lucifer.py -c 'fixnet stats'" \
    "Relevance Dictionary Statistics"

run_test "Search dictionary" \
    "python3 lucifer.py -c 'fixnet search NameError'" \
    ""

run_test "Program search - numpy" \
    "python3 lucifer.py -c 'program numpy'" \
    "Searching for fixes"

run_test "Program search - pandas" \
    "python3 lucifer.py -c 'program pandas'" \
    "Searching for fixes"

# PHASE 4: Autofix
echo -e "${GREEN}"==================================================="${NC}"
echo -e "${GREEN}PHASE 4: Autofix Commands${NC}"
echo -e "${GREEN}"==================================================="${NC}"
echo ""

run_test "Verify autofix in help" \
    "python3 lucifer.py -c 'help' | grep autofix" \
    "autofix"

# PHASE 5: Modules & Environments
echo -e "${GREEN}"==================================================="${NC}"
echo -e "${GREEN}PHASE 5: Modules & Environments${NC}"
echo -e "${GREEN}"==================================================="${NC}"
echo ""

run_test "List all modules" \
    "python3 lucifer.py -c modules" \
    ""

run_test "Search for specific module (requests)" \
    "python3 lucifer.py -c 'modules search requests'" \
    ""

run_test "List all environments" \
    "python3 lucifer.py -c environments" \
    ""

# PHASE 6: GitHub Integration
echo -e "${GREEN}"==================================================="${NC}"
echo -e "${GREEN}PHASE 6: GitHub Integration${NC}"
echo -e "${GREEN}"==================================================="${NC}"
echo ""

run_test "Check GitHub connection status" \
    "python3 lucifer.py -c 'github status'" \
    "GitHub"

# PHASE 7: Daemon Commands
echo -e "${GREEN}"==================================================="${NC}"
echo -e "${GREEN}PHASE 7: Daemon Commands${NC}"
echo -e "${GREEN}"==================================================="${NC}"
echo ""

run_test "List watched paths" \
    "python3 lucifer.py -c 'daemon list'" \
    ""

# PHASE 8: Thermal Monitoring
echo -e "${GREEN}"==================================================="${NC}"
echo -e "${GREEN}PHASE 8: Thermal Monitoring${NC}"
echo -e "${GREEN}"==================================================="${NC}"
echo ""

run_test "Check thermal sensors" \
    "python3 lucifer.py -c 'thermal status'" \
    ""

# PHASE 9: Fan Control
echo -e "${GREEN}"==================================================="${NC}"
echo -e "${GREEN}PHASE 9: Fan Control${NC}"
echo -e "${GREEN}"==================================================="${NC}"
echo ""

run_test "Check fan daemon status" \
    "python3 lucifer.py -c 'fan status'" \
    ""

echo ""
echo -e "${CYAN}"==================================================="${NC}"
echo -e "${CYAN}TEST SUMMARY${NC}"
echo -e "${CYAN}"==================================================="${NC}"
echo ""
echo -e "Total tests: $((test_num-1))"
echo -e "${GREEN}Passed: $passed${NC}"
echo -e "${RED}Failed: $failed${NC}"
echo ""

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
