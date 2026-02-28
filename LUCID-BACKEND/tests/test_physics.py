#!/usr/local/opt/python@3.10/bin/python3.10
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.physics_combat_engine import PhysicsCombatEngine
from core.soul_system_v2 import Soul

def create_soul(entity_key: str, rarity: str, level: int) -> Soul:
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

print("Creating souls...")
thor = create_soul('thor', 'celestial', 50)
krampus = create_soul('krampus', 'demonic', 50)

print(f"Thor: {thor.entity['name']} {thor.entity['emoji']}")
print(f"Krampus: {krampus.entity['name']} {krampus.entity['emoji']}")

print("\nCreating physics engine...")
engine = PhysicsCombatEngine(thor, krampus)

print(f"Arena width (screen resolution): {engine.screen_width}")
print(f"Fighter 1 starting position: {engine.fighter1.position}")
print(f"Fighter 2 starting position: {engine.fighter2.position}")

print("\nRunning 10 frames of physics...")
for i in range(10):
    engine.move_fighter(engine.fighter1, engine.fighter2)
    engine.move_fighter(engine.fighter2, engine.fighter1)
    engine.attempt_attack(engine.fighter1, engine.fighter2, 1)
    engine.attempt_attack(engine.fighter2, engine.fighter1, 2)
    engine.update_projectiles()
    engine.time += engine.dt
    print(f"Frame {i+1}: F1@{engine.fighter1.position:.1f} F2@{engine.fighter2.position:.1f} Projectiles:{len(engine.projectiles)}")

print("\n✅ Physics engine working!")
