#!/usr/bin/env python3
"""
🔬 Weapon Mechanics Test Suite
Tests all weapon types: Melee, Ranged, Boomerang, Hybrid
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.physics_combat_engine import (
    PhysicsCombatEngine, 
    WEAPON_MECHANICS, 
    WeaponType,
    run_physics_battle
)
from core.soul_system_v2 import Soul

def create_test_soul(entity_key: str, rarity: str, level: int) -> Soul:
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


def test_weapon_type(weapon_type: WeaponType, weapon_name: str):
    """Test a specific weapon type."""
    print(f"\n{'═' * 80}")
    print(f"Testing {weapon_type.name}: {weapon_name}")
    print(f"{'═' * 80}")
    
    # Get weapons of this type
    weapons_of_type = [
        (key, data) for key, data in WEAPON_MECHANICS.items()
        if data.get('type') == weapon_type
    ]
    
    if not weapons_of_type:
        print(f"❌ No weapons found for type {weapon_type.name}")
        return
    
    print(f"✅ Found {len(weapons_of_type)} {weapon_type.name} weapons:")
    for key, data in weapons_of_type:
        print(f"  - {key}: {data.get('projectile', 'N/A')}")
    
    return len(weapons_of_type)


def run_weapon_tests():
    """Run comprehensive weapon tests."""
    print("\n" + "⚔" * 40)
    print("⚔️  WEAPON MECHANICS TEST SUITE  ⚔️".center(80))
    print("⚔" * 40)
    
    # Test each weapon type
    print("\n" + "═" * 80)
    print("WEAPON TYPE CLASSIFICATION TEST")
    print("═" * 80)
    
    melee_count = test_weapon_type(WeaponType.MELEE, "Melee")
    ranged_count = test_weapon_type(WeaponType.RANGED, "Ranged")
    boomerang_count = test_weapon_type(WeaponType.BOOMERANG, "Boomerang")
    hybrid_count = test_weapon_type(WeaponType.HYBRID, "Hybrid")
    
    total = melee_count + ranged_count + boomerang_count + hybrid_count
    print(f"\n{'═' * 80}")
    print(f"TOTAL WEAPONS CLASSIFIED: {total}")
    print(f"  - Melee: {melee_count}")
    print(f"  - Ranged: {ranged_count}")
    print(f"  - Boomerang: {boomerang_count}")
    print(f"  - Hybrid: {hybrid_count}")
    print(f"{'═' * 80}")
    
    # Test boomerang mechanics specifically
    print("\n" + "═" * 80)
    print("BOOMERANG MECHANICS TEST")
    print("═" * 80)
    print("\nBoomerang weapons should:")
    print("  ✅ Throw toward enemy")
    print("  ✅ Hit and deal damage")
    print("  ✅ Return to owner")
    print("  ✅ Require catch before next throw")
    
    boomerang_weapons = [
        (key, data) for key, data in WEAPON_MECHANICS.items()
        if data.get('type') == WeaponType.BOOMERANG
    ]
    
    print(f"\nBoomerang weapons found:")
    for key, data in boomerang_weapons:
        projectile = data.get('projectile', '?')
        print(f"  🪃 {key}: Projectile '{projectile}'")
    
    # Test battle with boomerang weapon
    print("\n" + "═" * 80)
    print("LIVE BATTLE TEST - Thor (Mjolnir) vs Apollo")
    print("═" * 80)
    print("\nThor should have Mjolnir (boomerang weapon)")
    print("Watch for:")
    print("  - Projectile throws (⚡ or 🔨)")
    print("  - Return mechanics")
    print("  - Attack cooldowns")
    
    input("\nPress ENTER to start test battle...")
    
    thor = create_test_soul('thor', 'celestial', 50)
    apollo = create_test_soul('apollo', 'celestial', 50)
    
    print(f"\nThor's weapons:")
    for weapon_key, weapon_data in thor.weapons.items():
        mechanics = WEAPON_MECHANICS.get(weapon_key, {})
        weapon_type = mechanics.get('type', 'Unknown')
        print(f"  - {weapon_data['name']} ({weapon_type.name if hasattr(weapon_type, 'name') else weapon_type})")
    
    print(f"\nApollo's weapons:")
    for weapon_key, weapon_data in apollo.weapons.items():
        mechanics = WEAPON_MECHANICS.get(weapon_key, {})
        weapon_type = mechanics.get('type', 'Unknown')
        print(f"  - {weapon_data['name']} ({weapon_type.name if hasattr(weapon_type, 'name') else weapon_type})")
    
    print("\n" + "═" * 80)
    winner = run_physics_battle(thor, apollo)
    
    print("\n" + "═" * 80)
    print("TEST COMPLETE")
    print("═" * 80)
    print("\n✅ Check the logs/ directory for detailed battle log")
    print("✅ Verify weapon mechanics worked correctly")
    print("✅ Confirm projectiles, boomerangs, and damage calculations")


if __name__ == "__main__":
    try:
        run_weapon_tests()
    except KeyboardInterrupt:
        print("\n\n👋 Test interrupted!")
    except Exception as e:
        print(f"\n\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
