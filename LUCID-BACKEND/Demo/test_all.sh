#!/bin/bash
# 👾 LuciferAI - Test All Components

PURPLE="\033[35m"
GREEN="\033[32m"
RESET="\033[0m"

echo -e "${PURPLE}╔════════════════════════════════════════════════╗${RESET}"
echo -e "${PURPLE}║  👾 LuciferAI - Testing All Components        ║${RESET}"
echo -e "${PURPLE}╚════════════════════════════════════════════════╝${RESET}\n"

echo -e "${PURPLE}[1/3] Testing File Tools...${RESET}"
cd tools && python3 file_tools.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ File tools passed${RESET}\n"
else
    echo -e "\033[31m❌ File tools failed${RESET}\n"
    exit 1
fi

echo -e "${PURPLE}[2/3] Testing Command Tools...${RESET}"
python3 command_tools.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Command tools passed${RESET}\n"
else
    echo -e "\033[31m❌ Command tools failed${RESET}\n"
    exit 1
fi

cd ..
echo -e "${PURPLE}[3/3] Testing Agent...${RESET}"
cd core && python3 agent.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Agent tests passed${RESET}\n"
else
    echo -e "\033[31m❌ Agent tests failed${RESET}\n"
    exit 1
fi

cd ..
echo -e "${GREEN}╔════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}║  ✅ ALL TESTS PASSED!                          ║${RESET}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${RESET}\n"

echo -e "${PURPLE}🚀 Ready to run: ./lucifer.py${RESET}"
