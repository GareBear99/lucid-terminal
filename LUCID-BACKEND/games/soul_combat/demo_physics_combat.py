#!/usr/bin/env python3
"""
🎮 Physics Combat System Demo
Interactive demonstration of the complete soul combat system with:
- Moving fighters
- Projectile physics
- Weapon mechanics (melee, ranged, boomerang, hybrid)
- Gun ammo and reload system
- Real-time 19-row arena display
"""
import sys
import os
from pathlib import Path

# Add parent directory to path to access core modules
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from core.physics_combat_engine import PhysicsCombatEngine, run_physics_battle
from core.soul_system_v2 import Soul, CELESTIAL_SOULS, DEMONIC_SOULS, ANGELIC_SOULS


def create_test_soul(entity_key: str, rarity: str, level: int) -> Soul:
    """Helper to create a soul for testing."""
    soul = Soul(
        soul_id=f"demo_{entity_key}",
        entity_key=entity_key,
        rarity=rarity,
        obtained_event='demo',
        obtained_date='2024-01-01',
        verified_hash=f"demo_{entity_key}"
    )
    soul.level = level
    return soul


def demo_menu():
    """Display battle selection menu."""
    print("\n" + "═" * 80)
    print("⚔️  PHYSICS COMBAT SYSTEM - DEMO MENU  ⚔️".center(80))
    print("═" * 80)
    print("\nSelect a battle to watch:\n")
    print("  1. Thor vs Apollo (Celestial) - Boomerang vs Ranged")
    print("  2. Kratos vs Asmodeus (Demonic) - Hybrid vs Ranged")
    print("  3. Phoenix vs Cerberus (Angelic) - Flight vs Melee")
    print("  4. Custom Battle (choose your fighters)")
    print("  0. Exit\n")
    
    choice = input("Enter choice: ").strip()
    return choice


def run_preset_battle(battle_num: int):
    """Run one of the preset battles."""
    if battle_num == 1:
        # Thor (Mjolnir - boomerang) vs Apollo (bow - ranged)
        print("\n🔨 THOR with Mjolnir (Boomerang)")
        print("🏹 APOLLO with Bow (Ranged)")
        
        thor = create_test_soul('thor', 'celestial', 50)
        apollo = create_test_soul('apollo', 'celestial', 50)
        run_physics_battle(thor, apollo)
        
    elif battle_num == 2:
        # Kratos (Chaos Blades - hybrid) vs Asmodeus (Zeus Bolt - ranged)
        print("\n⚔️ ASMODEUS with Zeus Bolt (Ranged)")
        print("🔥 ASMODEUS (Wrath Demon)")
        
        # Note: Since weapon assignment is random, we can't guarantee specific weapons
        # But we can show the system working with demonic souls
        soul1 = create_test_soul('asmodeus', 'demonic', 100)
        soul2 = create_test_soul('baal', 'demonic', 100)
        run_physics_battle(soul1, soul2)
        
    elif battle_num == 3:
        # Phoenix vs Cerberus
        print("\n🔥 PHOENIX (Flight - hybrid)")
        print("🐉 CERBERUS (Guardian)")
        
        phoenix = create_test_soul('phoenix', 'angelic', 100)
        cerberus = create_test_soul('cerberus', 'angelic', 100)
        run_physics_battle(phoenix, cerberus)


def list_available_souls():
    """List all available souls for custom battles."""
    print("\n" + "═" * 80)
    print("AVAILABLE SOULS".center(80))
    print("═" * 80)
    
    print("\nCELESTIAL (Level cap: 9999):")
    for i, (key, data) in enumerate(CELESTIAL_SOULS.items(), 1):
        print(f"  {i:2d}. {data['emoji']} {data['name']:20s} (key: {key})")
    
    print("\nDEMONIC (Level cap: 999):")
    for i, (key, data) in enumerate(DEMONIC_SOULS.items(), 1):
        sin = data.get('sin', 'unknown')
        print(f"  {i:2d}. {data['emoji']} {data['name']:20s} - {sin:10s} (key: {key})")
    
    print("\nANGELIC (Level cap: 256):")
    for i, (key, data) in enumerate(ANGELIC_SOULS.items(), 1):
        print(f"  {i:2d}. {data['emoji']} {data['name']:20s} (key: {key})")


def custom_battle():
    """Set up a custom battle."""
    list_available_souls()
    
    print("\n" + "═" * 80)
    print("CUSTOM BATTLE SETUP".center(80))
    print("═" * 80)
    
    # Fighter 1
    print("\n🔵 FIGHTER 1:")
    entity_key1 = input("  Enter entity key (e.g. 'thor'): ").strip().lower()
    rarity1 = input("  Enter rarity (celestial/demonic/angelic): ").strip().lower()
    level1 = int(input("  Enter level: ").strip())
    
    # Fighter 2
    print("\n🔴 FIGHTER 2:")
    entity_key2 = input("  Enter entity key: ").strip().lower()
    rarity2 = input("  Enter rarity (celestial/demonic/angelic): ").strip().lower()
    level2 = int(input("  Enter level: ").strip())
    
    # Create and battle
    try:
        soul1 = create_test_soul(entity_key1, rarity1, level1)
        soul2 = create_test_soul(entity_key2, rarity2, level2)
        run_physics_battle(soul1, soul2)
    except Exception as e:
        print(f"\n❌ Error creating battle: {e}")
        input("\nPress ENTER to return to menu...")


def main(return_to_lucifer=False):
    """Main demo loop.
    
    Args:
        return_to_lucifer: If True, returns to LuciferAI main menu instead of exiting
    """
    print("\n" + "⚔" * 40)
    print("⚔️  WELCOME TO THE PHYSICS COMBAT SYSTEM  ⚔️".center(80))
    print("⚔" * 40)
    print("\nFeatures:")
    print("  ✅ Moving fighters with AI positioning")
    print("  ✅ Projectile physics with travel time")
    print("  ✅ Melee, ranged, boomerang, and hybrid weapons")
    print("  ✅ Gun ammo system with 6 rounds and 3x reload time")
    print("  ✅ Boomerang weapons (throw → hit → return → reload)")
    print("  ✅ Real-time battle arena with grid coordinates")
    print("  ✅ Continuous combat (no rounds)")
    
    while True:
        choice = demo_menu()
        
        if choice == '0':
            if return_to_lucifer:
                print("\n👋 Returning to LuciferAI main menu...")
                return
            else:
                print("\n👋 Thanks for watching! May the best soul win!")
                break
        elif choice in ['1', '2', '3']:
            run_preset_battle(int(choice))
            input("\n\nPress ENTER to return to menu...")
        elif choice == '4':
            custom_battle()
        else:
            print("\n❌ Invalid choice. Try again.")
            input("Press ENTER to continue...")


def run_tournament():
    """Entry point for running from LuciferAI."""
    try:
        main(return_to_lucifer=True)
    except KeyboardInterrupt:
        print("\n\n👋 Interrupted! Returning to LuciferAI...")
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        input("\nPress ENTER to return to LuciferAI...")


if __name__ == "__main__":
    try:
        main(return_to_lucifer=False)
    except KeyboardInterrupt:
        print("\n\n👋 Interrupted! Exiting...")
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
