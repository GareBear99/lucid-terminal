#!/usr/bin/env python3
"""
🩸 LuciferAI WiFi Manager Test
Test WiFi scanning and management across all platforms
"""
import sys
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from wifi_manager import wifi_scan, wifi_status

PURPLE = '\033[35m'
GREEN = '\033[32m'
YELLOW = '\033[33m'
RESET = '\033[0m'

print(f"""
{PURPLE}╔════════════════════════════════════════════════════════════╗
║         🩸 LuciferAI WiFi Manager Test                    ║
╚════════════════════════════════════════════════════════════╝{RESET}
""")

print(f"{YELLOW}Testing WiFi functionality...{RESET}\n")

# Test 1: Show current status
print(f"{PURPLE}[Test 1] Current WiFi Status{RESET}")
wifi_status()

# Test 2: Scan for networks
print(f"{PURPLE}[Test 2] Scanning for Networks{RESET}")
networks = wifi_scan()

print(f"\n{GREEN}✅ WiFi manager test complete!{RESET}")
print(f"{YELLOW}Found {len(networks)} networks{RESET}\n")

print(f"{PURPLE}{'='*60}{RESET}")
print(f"{GREEN}WiFi commands available in LuciferAI:{RESET}")
print(f"  {YELLOW}wifi scan{RESET}                  - Scan for networks")
print(f"  {YELLOW}wifi status{RESET}                - Show current connection")
print(f"  {YELLOW}wifi connect <ssid>{RESET}        - Connect to network")
print(f"  {YELLOW}wifi connect <ssid> <pass>{RESET} - Connect with password")
print(f"  {YELLOW}wifi disconnect{RESET}            - Disconnect from WiFi")
print(f"{PURPLE}{'='*60}{RESET}\n")
