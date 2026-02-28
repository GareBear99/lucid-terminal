#!/usr/bin/env python3
"""
Test Azazel Boss Battle
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.physics_combat_engine import PhysicsCombatEngine, run_physics_battle
from core.soul_system_v2 import Soul, CELESTIAL_SOULS, DEMONIC_SOULS

def create_soul(entity_key: str, rarity: str, level: int) -> Soul:
    """Create a soul for testing."""
    soul = Soul(
        soul_id=f"test_{entity_key}",
        entity_key=entity_key,
        rarity=rarity,
        obtained_event='test',
        obtained_date='2024-01-01',
        verified_hash=f"test_{entity_key}"
    )
    soul.level = level
    return soul


if __name__ == "__main__":
    print("\n" + "═" * 80)
    print("✨ AZAZEL BOSS BATTLE ✨".center(80))
    print("═" * 80)
    print("\nAzazel (Celestial) with Divine weapons")
    print("Current emoji: ✨")
    print("\nWould you like to test Azazel as:")
    print("  1. Celestial (current - ✨ emoji, Divine weapons)")
    print("  2. Demonic version (would need to add to DEMONIC_SOULS)")
    print()
    
    choice = input("Enter choice (1 or 2): ").strip()
    
    if choice == "1":
        # Test as Celestial
        print("\n🎮 Testing Azazel (Celestial) vs Thor...")
        azazel = create_soul('azazel', 'celestial', 100)
        thor = create_soul('thor', 'celestial', 100)
        
        winner = run_physics_battle(azazel, thor)
        
    elif choice == "2":
        print("\n⚠️  Azazel is not yet in DEMONIC_SOULS")
        print("To add Azazel as a Demonic soul, we need to:")
        print("  1. Add to DEMONIC_SOULS in soul_system_v2.py")
        print("  2. Assign a sin type (pride, wrath, etc.)")
        print("  3. Give it your boss sprite's emoji")
        print()
        add = input("Add Azazel as Demonic now? (y/n): ").strip().lower()
        
        if add == 'y':
            print("\n📝 What should demonic Azazel's sin be?")
            print("  1. Pride")
            print("  2. Wrath")
            print("  3. Envy")
            print("  4. Lust")
            print("  5. Greed")
            print("  6. Gluttony")
            print("  7. Sloth")
            
            sin_choice = input("Enter number: ").strip()
            sin_map = {
                '1': 'pride',
                '2': 'wrath',
                '3': 'envy',
                '4': 'lust',
                '5': 'greed',
                '6': 'gluttony',
                '7': 'sloth'
            }
            
            sin = sin_map.get(sin_choice, 'pride')
            
            print(f"\n✅ Azazel will be added as Demonic with sin: {sin}")
            print("📝 You'll need to manually add this to soul_system_v2.py DEMONIC_SOULS:")
            print(f"    'azazel_demon': {{'emoji': '👹', 'name': 'Azazel', 'sin': '{sin}', 'traits': ['corrupted', 'fallen', 'powerful', 'tempting']}},")
    else:
        print("\n❌ Invalid choice")
