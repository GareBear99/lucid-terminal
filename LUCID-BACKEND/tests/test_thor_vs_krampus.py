#!/usr/bin/env python3
"""
⚡ Thor (Celestial) vs 👹 Krampus (Demonic) Boss Battle
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
    print("⚡ THOR vs KRAMPUS 👹".center(80))
    print("═" * 80)
    print()
    print("⚡ THOR - Celestial God of Thunder")
    print("   Emoji: ⚡")
    print("   Level Cap: 9999")
    print("   Weapons: 2-3 Divine weapons (Mjolnir likely!)")
    print("   Traits: brave, thunderous, protective, boisterous")
    print()
    print("👹 KRAMPUS - Demonic Christmas Punisher")
    print("   Emoji: 👹")
    print("   Level Cap: 999")
    print("   Sin: Wrath")
    print("   Weapons: 1 Rare + 1 Legendary")
    print("   Traits: punishing, festive, terrifying, judgmental")
    print()
    print("═" * 80)
    
    level = input("\nEnter battle level (1-999): ").strip()
    try:
        level = int(level)
        level = max(1, min(999, level))
    except:
        level = 100
        print(f"Invalid input, using level {level}")
    
    print(f"\n🎮 Starting battle at level {level}...")
    print("\n⚡ Thor will likely have MJOLNIR (boomerang weapon!)")
    print("👹 Krampus gets random Rare + Legendary weapons")
    print()
    
    input("Press ENTER to start battle...")
    
    # Create fighters
    thor = create_soul('thor', 'celestial', level)
    krampus = create_soul('krampus', 'demonic', level)
    
    # Run battle with screen resolution mapping
    winner = run_physics_battle(thor, krampus)
    
    print("\n" + "═" * 80)
    if winner == 1:
        print("⚡ THOR WINS! Thunder conquers wrath! ⚡")
    else:
        print("👹 KRAMPUS WINS! The punisher prevails! 👹")
    print("═" * 80)
    print(f"\n📁 Battle log saved to logs/")
