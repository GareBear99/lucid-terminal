#!/usr/bin/env python3
"""
Fighting Game Style Display for Soul Combat
Mirrored health bars like Mortal Kombat/Street Fighter
"""
import os
import sys
import time

def clear_screen():
    """Clear the terminal screen."""
    os.system('clear' if os.name != 'nt' else 'cls')

def move_cursor_up(lines):
    """Move cursor up n lines."""
    sys.stdout.write(f'\033[{lines}A')
    sys.stdout.flush()

def clear_line():
    """Clear current line."""
    sys.stdout.write('\033[2K')
    sys.stdout.flush()

def draw_health_bar_left(current_hp, max_hp, width=30):
    """Draw health bar filling left to right."""
    percentage = max(0, min(1, current_hp / max_hp))
    filled = int(width * percentage)
    empty = width - filled
    
    bar = "█" * filled + "░" * empty
    hp_text = f"{int(max(0, current_hp))}/{int(max_hp)} HP"
    
    return f"[{bar}] {hp_text}"

def draw_health_bar_right(current_hp, max_hp, width=30):
    """Draw health bar filling right to left (mirrored)."""
    percentage = max(0, min(1, current_hp / max_hp))
    filled = int(width * percentage)
    empty = width - filled
    
    bar = "░" * empty + "█" * filled
    hp_text = f"HP {int(max(0, current_hp))}/{int(max_hp)}"
    
    return f"{hp_text} [{bar}]"

def draw_battle_hud(soul1, hp1, max_hp1, soul2, hp2, max_hp2, time_elapsed=0.0):
    """Draw the complete battle HUD with mirrored health bars."""
    
    # Calculate percentages for color coding
    hp1_pct = (hp1 / max_hp1) * 100
    hp2_pct = (hp2 / max_hp2) * 100
    
    width = 80
    bar_width = 25
    
    print("╔" + "═" * (width - 2) + "╗")
    print("║" + " " * (width - 2) + "║")
    
    # Fighter names and emojis
    name1 = f"🔵 {soul1.entity['name']}"
    name2 = f"{soul2.entity['name']} 🔴"
    spacing = width - 2 - len(name1) - len(name2)
    print(f"║ {name1}{' ' * spacing}{name2} ║")
    
    # Health bars (mirrored)
    hb1 = draw_health_bar_left(hp1, max_hp1, bar_width)
    hb2 = draw_health_bar_right(hp2, max_hp2, bar_width)
    
    # Center the bars
    total_bar_len = len(hb1) + len(hb2) + 4
    left_pad = (width - 2 - total_bar_len) // 2
    print(f"║{' ' * left_pad} {hb1}    {hb2} {' ' * (width - 2 - left_pad - total_bar_len)}║")
    
    print("║" + " " * (width - 2) + "║")
    
    # Time and VS
    time_str = f"TIME: {time_elapsed:.1f}s"
    vs_str = "⚔️  VS  ⚔️"
    print(f"║{time_str.center(width - 2)}║")
    print(f"║{vs_str.center(width - 2)}║")
    
    print("║" + " " * (width - 2) + "║")
    print("╚" + "═" * (width - 2) + "╝")
    print()

def draw_static_hud_area():
    """Reserve space for HUD that will be updated in place."""
    for _ in range(10):
        print()

if __name__ == "__main__":
    # Test the display
    from soul_system_v2 import Soul
    import uuid
    
    soul1 = Soul(str(uuid.uuid4()), 'creative', 'common', 'Test', '2024-01-01', 'hash')
    soul1.level = 50
    soul2 = Soul(str(uuid.uuid4()), 'dark', 'common', 'Test', '2024-01-01', 'hash')
    soul2.level = 50
    
    hp1 = soul1.calculate_max_health()
    hp2 = soul2.calculate_max_health()
    max_hp1 = hp1
    max_hp2 = hp2
    
    clear_screen()
    print("\n" * 5)
    
    # Simulate battle
    time_elapsed = 0.0
    while hp1 > 0 and hp2 > 0:
        # Draw HUD
        move_cursor_up(12)
        draw_battle_hud(soul1, hp1, max_hp1, soul2, hp2, max_hp2, time_elapsed)
        
        # Simulate damage
        hp2 -= 0.62
        time_elapsed += 0.1
        time.sleep(0.1)
        
        if hp2 <= 0:
            break
        
        hp1 -= 0.62
        time_elapsed += 0.1
        time.sleep(0.1)
    
    # Final display
    move_cursor_up(12)
    draw_battle_hud(soul1, hp1, max_hp1, soul2, hp2, max_hp2, time_elapsed)
    
    print("\n")
    if hp1 > 0:
        print(f"🏆 WINNER: 🔵 {soul1.entity['name']} with {int(hp1)} HP remaining!")
    else:
        print(f"🏆 WINNER: 🔴 {soul2.entity['name']} with {int(hp2)} HP remaining!")
