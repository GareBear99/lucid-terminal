#!/bin/bash
# Real System Test - Tests actual LuciferAI behavior with pre-input commands

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Real System Test - LuciferAI Quality Check          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

cd /Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local

# Clean up previous test files
echo "🧹 Cleaning previous test files..."
rm -f /Users/TheRustySpoon/Desktop/Projects/test_real_*.py
rm -f /Users/TheRustySpoon/Desktop/Projects/gary12345poo.py

# Create test input file with commands
cat > /tmp/luci_test_input.txt << 'EOF'
create a script called test_real_sqrt.py that calculates sqrt(25) without importing math
y
run test_real_sqrt.py
y
exit
EOF

echo ""
echo "========================================================================"
echo "TEST 1: Script with Missing Import"
echo "========================================================================"
echo "Expected:"
echo "  1. Create script using sqrt without math import"
echo "  2. Run script - should error on undefined 'sqrt'"
echo "  3. Show: 🎯 Targeting lines: X"
echo "  4. Apply actual fix (not TODO comment)"
echo "  5. Script should work after fix"
echo ""
echo "Running test..."
echo ""

# Run LuciferAI with pre-input commands
python3 lucifer.py < /tmp/luci_test_input.txt 2>&1 | tee /tmp/test_output.log

echo ""
echo "========================================================================"
echo "TEST RESULTS"
echo "========================================================================"
echo ""

# Analyze output
if grep -q "🎯 Targeting lines" /tmp/test_output.log; then
    echo "✅ PASS: Line detection message shown"
else
    echo "❌ FAIL: Line detection message NOT shown"
fi

if grep -q "TODO" /tmp/test_output.log; then
    echo "❌ FAIL: TODO comment was used as fix (invalid)"
else
    echo "✅ PASS: No TODO comments in fix"
fi

if grep -q "Analysis:" /tmp/test_output.log || grep -q "💡" /tmp/test_output.log; then
    echo "✅ PASS: Reasoning/analysis provided"
else
    echo "❌ FAIL: No reasoning provided"
fi

if grep -q "import math\|from math import" /tmp/test_output.log; then
    echo "✅ PASS: Proper import fix suggested"
else
    echo "❌ FAIL: No proper import fix"
fi

# Check if fixed script actually works
if [ -f "/Users/TheRustySpoon/Desktop/Projects/test_real_sqrt.py" ]; then
    echo ""
    echo "Checking fixed script..."
    python3 /Users/TheRustySpoon/Desktop/Projects/test_real_sqrt.py 2>&1 > /tmp/script_output.txt
    if [ $? -eq 0 ]; then
        echo "✅ PASS: Fixed script runs without errors"
        cat /tmp/script_output.txt
    else
        echo "❌ FAIL: Fixed script still has errors"
        cat /tmp/script_output.txt
    fi
    
    echo ""
    echo "Fixed script content:"
    cat /Users/TheRustySpoon/Desktop/Projects/test_real_sqrt.py
else
    echo "❌ FAIL: Test script was not created"
fi

echo ""
echo "========================================================================"
echo "Full output saved to: /tmp/test_output.log"
echo "========================================================================"
echo ""
echo "Summary:"
echo "  Review the PASS/FAIL results above"
echo "  Check /tmp/test_output.log for full details"
echo ""
