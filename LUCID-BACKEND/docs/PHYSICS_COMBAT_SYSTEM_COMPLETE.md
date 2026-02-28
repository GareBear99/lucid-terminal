# ⚔️ Physics Combat System v3 - Complete Documentation

## Overview

The Physics Combat System v3 is a fully implemented real-time soul battle simulator featuring projectile physics, weapon mechanics, AI movement, and continuous combat. This document describes the complete system as delivered.

## Architecture

### File Structure

```
core/
  ├── soul_system_v2.py           # Soul definitions, stats, leveling
  └── physics_combat_engine.py    # Physics engine (THIS FILE - ~770 lines)

demo_physics_combat.py             # Interactive demo
docs/
  └── PHYSICS_COMBAT_SYSTEM_COMPLETE.md  # This document
```

## Features Implemented ✅

### 1. Weapon Classification System

All 28 weapons are classified into 4 types:

- **MELEE** (7 weapons): Instant damage within range
  - Holy Halo, Unholy Halo, Ares Blade, Blade of Olympus, Excalibur, Durandal, Aegis Shield
  
- **RANGED** (13 weapons): Projectiles with travel time
  - Archery, Gun, Laser, Zeus Bolt, Apollo Bow, Artemis Bow, Medusa Gaze, Spear of Destiny, Gungnir, Surtr Sword, Celestial Lance
  
- **BOOMERANG** (3 weapons): Throw → Hit → Return → Reload cycle
  - Mjolnir, Leviathan Axe, Poseidon Trident, Hephaestus Hammer
  
- **HYBRID** (5 weapons): Both melee and ranged capabilities
  - Flight, Wings, Chaos Blades, Blades of Exile, Scorpion Chain

### 2. Projectile Physics System

**Projectile Class**
```python
@dataclass
class Projectile:
    char: str              # Visual character (→, ⚡, ~, etc.)
    pos: float            # Current position
    target_pos: float     # Destination
    speed: float          # Units per second
    damage: float         # Damage on hit
    owner: int            # 1 or 2
    is_boomerang: bool    # Returns to owner
    returning: bool       # Currently returning
    hit_target: bool      # Hit registered
```

**Projectile Speeds**:
- Fast: 200 u/s (guns, lasers, lightning)
- Medium: 150-170 u/s (arrows, spears)
- Slow: 80-120 u/s (thrown weapons, boomerangs)

**Projectile Characters**:
- `~` bullets (guns)
- `→` arrows (bows)
- `*` lasers
- `⚡` lightning bolts
- `🔱` trident
- `⚒️` hammers
- Custom emojis for unique weapons

### 3. Weapon Mechanics

#### Melee Weapons
- Range: 5-7 units
- Damage: Instant
- AI: Rush enemy if out of range

#### Ranged Weapons
- Range: (10-80) units
- Damage: On projectile hit
- AI: Maintain optimal distance (30-50 units)

#### Boomerang Weapons
- Range: (10-40) units
- Damage: On outbound hit
- Mechanics:
  1. Throw projectile
  2. Travel to target
  3. Hit and register damage
  4. Return to owner
  5. Weapon available after catch
  6. Attack speed cooldown applies

#### Hybrid Weapons
- Melee range: 0-6 units
- Ranged range: (5-30) units
- Uses melee if in close range, ranged otherwise

#### Gun Ammo System
- Ammo capacity: 6 rounds
- Reload time: `attack_speed × 3`
- Auto-reload when empty
- Example: Gun with 2.0 attack speed = 6 seconds reload

### 4. Fighter State Management

**FighterState Class**
```python
@dataclass
class FighterState:
    soul: Soul                    # Soul data
    position: float               # Arena position (0-76)
    hp: float                     # Current health
    max_hp: float                 # Maximum health
    current_weapon: str           # Equipped weapon key
    ammo: Dict[str, int]         # Ammo per weapon
    reloading_until: float        # Time when reload completes
    weapon_in_flight: bool        # Boomerang in air
    can_attack_at: float          # Next attack time
```

### 5. Battle Arena

**Dimensions**:
- Width: 80 characters (76 usable units)
- Height: 19 rows total
  - 2 rows: Header
  - 2 rows: Fighter names
  - 2 rows: Health bars
  - 2 rows: Time display
  - 11 rows: Combat zone
  - 2 rows: Footer

**Layout**:
```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║ 🔵 Thor                                                        Apollo 🔴    ║
║ [████████████░░░░░░░░░░] 245/418 HP        HP 312/418 [█████████████░░░░░░] ║
║                                                                              ║
║                            TIME: 5.2s                                        ║
║                                                                              ║
║ 🔵          →   →                                          🔴               ║
║                                                                              ║
║                              ⚔️  VS  ⚔️                                      ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

**Update Rate**: 20 FPS (50ms ticks), display refresh every 0.25s

### 6. AI Movement System

**Movement Speed**:
```python
base_speed = 20 units/second
speed_bonus = stats['speed'] × 2
total_speed = min(40, base_speed + speed_bonus)
```

**Movement Logic by Weapon Type**:

- **Melee**: Rush if distance > weapon range
- **Ranged/Boomerang**: Maintain optimal distance, back away if too close
- **Hybrid**: Prefer ranged distance, adaptable

**Bounds**: Fighters constrained to 0-76 position range

### 7. Combat Simulation Engine

**PhysicsCombatEngine Class**

Key methods:
- `select_best_weapon()`: Choose highest DPS weapon
- `get_distance()`: Calculate fighter separation
- `can_reach_target()`: Check if attack is possible
- `attempt_attack()`: Execute attack if conditions met
- `update_projectiles()`: Move projectiles and check hits
- `move_fighter()`: AI positioning logic
- `simulate_battle()`: Main game loop

**Battle Loop** (20 FPS):
1. Move both fighters based on AI
2. Attempt attacks for both fighters
3. Update all projectile positions
4. Check for hits and apply damage
5. Check for winner (HP <= 0)
6. Update display every 5 frames
7. Apply time.sleep(0.05) for real-time pacing

**Win Conditions**:
- HP reaches 0 → Opponent wins
- 60 second timeout → Higher HP wins
- Equal HP at timeout → Draw

### 8. Damage Calculation

```python
damage = attacker_stats['attack'] + weapon['base_damage']
```

All attacks use this formula, regardless of weapon type.

## Usage

### Quick Start

```python
from core.physics_combat_engine import PhysicsCombatEngine, run_physics_battle
from core.soul_system_v2 import Soul

# Create souls
thor = Soul(
    soul_id="thor_1",
    entity_key='thor',
    rarity='celestial',
    obtained_event='test',
    obtained_date='2024-01-01',
    verified_hash='hash123'
)
thor.level = 50

apollo = Soul(
    soul_id="apollo_1",
    entity_key='apollo',
    rarity='celestial',
    obtained_event='test',
    obtained_date='2024-01-01',
    verified_hash='hash456'
)
apollo.level = 50

# Run battle with full display
winner = run_physics_battle(thor, apollo)
```

### Headless Mode (No Display)

```python
engine = PhysicsCombatEngine(soul1, soul2)
winner = engine.simulate_battle(max_time=60.0, show_display=False)
# Returns: 1 (fighter1 wins), 2 (fighter2 wins), or 0 (draw)
```

### Interactive Demo

```bash
python3 demo_physics_combat.py
```

Provides:
- Preset battles showcasing different weapon types
- Custom battle builder
- Soul browser with all available entities

## Performance

- **Tick Rate**: 20 FPS (50ms per frame)
- **Display Refresh**: 4 FPS (0.25s per frame)
- **Max Battle Time**: 60 seconds (configurable)
- **Frame Budget**: ~1200 frames per 60s battle

## Technical Details

### Weapon Metadata Structure

```python
WEAPON_MECHANICS = {
    'mjolnir': {
        'type': WeaponType.BOOMERANG,
        'projectile': '⚒️',
        'projectile_speed': 100,
        'range': (10, 40)
    },
    'gun': {
        'type': WeaponType.RANGED,
        'projectile': '~',
        'projectile_speed': 200,
        'range': (10, 80),
        'ammo': 6,
        'reload_multiplier': 3
    },
    # ... 28 total weapons
}
```

### Display Functions

- `clear_screen()`: Clear terminal
- `move_cursor_up(n)`: ANSI escape for in-place updates
- `draw_health_bar_left()`: Left-to-right fill (Fighter 1)
- `draw_health_bar_right()`: Right-to-left fill (Fighter 2) - mirrored
- `draw_arena()`: Complete 19-row battle display

## Known Limitations

1. **Random Weapons**: Souls get random weapons based on rarity, cannot specify
2. **Single Weapon**: Fighter uses only highest DPS weapon
3. **No Dodging**: Projectiles always hit if in range
4. **No Defense Calculation**: Defense stat exists but not used in damage formula
5. **2D Only**: All combat on single horizontal line

## Future Enhancements (Not Implemented)

- Weapon switching mid-battle
- Defense reduces damage
- Critical hits based on stats
- Special abilities per soul
- Team battles (2v2, 3v3)
- Vertical arena dimension
- Replay system
- Battle statistics export

## Testing

Run the test suite:
```bash
python3 core/physics_combat_engine.py
```

Expected output:
```
⚔️ Physics Combat Engine v3 - COMPLETE
✅ 28 weapons classified
✅ Projectile physics system
✅ Ammo & reload mechanics
✅ Boomerang weapons (throw/return cycle)
✅ Movement AI
✅ Real-time combat simulation
✅ 19-row battle arena
...
✅ Thor wins in quick test!
✅ System fully operational!
```

## Code Statistics

- **Total Lines**: ~770
- **Classes**: 3 (Projectile, FighterState, PhysicsCombatEngine)
- **Weapon Definitions**: 28
- **Weapon Types**: 4 enums
- **Display Functions**: 5
- **Core Combat Methods**: 7

## Integration with Soul System v2

The physics engine fully integrates with `soul_system_v2.py`:

- Uses `Soul.calculate_max_health()` for HP
- Uses `Soul.calculate_current_stats()` for damage
- Uses `Soul.weapons` dictionary for equipment
- Uses `Soul.entity` for names and emojis
- Respects `Soul.rarity` for balancing

## Changelog

**v3.0** - Full Physics Implementation
- ✅ All 28 weapons classified
- ✅ Projectile physics with travel time
- ✅ Ammo and reload system
- ✅ Boomerang throw/return mechanics
- ✅ Hybrid weapon dual-mode
- ✅ AI movement system
- ✅ 19-row arena display
- ✅ Continuous combat (no rounds)
- ✅ Real-time animations

## Credits

Built for LuciferAI - The Agentic RPG Soul Combat System

---

**Status**: ✅ COMPLETE & OPERATIONAL
**Version**: 3.0
**Date**: 2024
