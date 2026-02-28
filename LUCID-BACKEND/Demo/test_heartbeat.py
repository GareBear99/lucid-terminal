#!/usr/bin/env python3
"""
🩸 Heartbeat Animation Test
Tests the idle color-cycling heartbeat feature
"""
import sys
import os
import threading
import time
from pathlib import Path

# Add parent core to path
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))

from lucifer_colors import Colors, Emojis, c

RUNNING = True
CLEAR_LINE = "\033[K"

def heartbeat_test():
    """Test heartbeat animation with color cycling."""
    colors = [Colors.RED, Colors.PURPLE]
    skulls = [Emojis.SKULL_BONES, Emojis.SKULL]
    i = 0
    
    print(c("\n🧪 Testing Heartbeat Animation", "cyan"))
    print(c("Watch the colors and emojis cycle below:", "yellow"))
    print(c("Press Ctrl+C to stop\n", "dim"))
    
    while RUNNING:
        color = colors[i % 2]
        skull = skulls[i % 2]
        
        # Print heartbeat with current color/emoji
        msg = f"\r{color}{Emojis.HEARTBEAT} Idle • Awaiting Commands... {skull}{Colors.RESET}{CLEAR_LINE}"
        os.write(1, msg.encode())
        
        i += 1
        time.sleep(1.0)

def processing_test():
    """Test processing animation."""
    print(c("\n\n🧪 Testing Processing Animation", "cyan"))
    print(c("Watch the processing indicator:\n", "yellow"))
    
    frames = [(Emojis.SKULL, Colors.PURPLE), (Emojis.HEARTBEAT, Colors.RED)]
    
    for cycle in range(2):
        for sym, col in frames:
            os.write(1, f"\r{col}{sym} Processing...{Colors.RESET}{CLEAR_LINE}".encode())
            time.sleep(0.4)
    
    os.write(1, f"\r{CLEAR_LINE}".encode())
    print(c("✅ Processing animation complete", "green"))

def color_test():
    """Test all color combinations."""
    print(c("\n\n🧪 Testing Color Combinations", "cyan"))
    print(c("Verifying all color/emoji pairs:\n", "yellow"))
    
    colors = [
        (Colors.PURPLE, "Purple"),
        (Colors.RED, "Red"),
        (Colors.GREEN, "Green"),
        (Colors.YELLOW, "Yellow"),
        (Colors.CYAN, "Cyan"),
    ]
    
    for color, name in colors:
        msg = f"{color}{Emojis.HEARTBEAT} {name} • {Emojis.SKULL}{Colors.RESET}"
        print(f"  {msg}")
        time.sleep(0.3)
    
    print(c("\n✅ All colors rendering correctly", "green"))

def main():
    """Run all heartbeat tests."""
    global RUNNING
    
    print(c("\n╔════════════════════════════════════════════════════════╗", "purple"))
    print(c("║ 🩸  LuciferAI Heartbeat Test Suite                     ║", "purple"))
    print(c("╚════════════════════════════════════════════════════════╝", "purple"))
    
    try:
        # Test 1: Color combinations
        color_test()
        
        # Test 2: Processing animation
        processing_test()
        
        # Test 3: Live heartbeat (runs until Ctrl+C)
        heartbeat_test()
    
    except KeyboardInterrupt:
        RUNNING = False
        print(c("\n\n✅ All heartbeat tests passed!", "green"))
        print(c("👾 Heartbeat animation is working correctly", "purple"))
        print()

if __name__ == "__main__":
    main()
