# ⚔️ Advanced Soul Combat Mechanics

Complete spatial combat system with projectile physics, charge times, and realistic battle positioning.

## 🗺️ Battle Map System

### Map Dimensions (Brawlhalla-style)
- **Map Width**: 100 units (similar to Brawlhalla platform fighting games)
- **Starting Positions**: 
  - Fighter 1 (Blue): Position 20 (left side)
  - Fighter 2 (Red): Position 80 (right side)
  - Starting Distance: 60 units apart

### Distance Categories
- **Melee Range**: 0-5 units (close combat)
- **Short Range**: 5-20 units (fast projectiles effective)
- **Medium Range**: 20-50 units (standard projectiles)
- **Long Range**: 50-80 units (slow projectiles, charge attacks)
- **Max Range**: 80-100 units (extreme distance)

## ⏱️ Timing Mechanics

### Charge Times (seconds)
Weapons have charge-up time before attack:

**Fast Weapons (0.1-0.3s charge):**
- Archery, Gun, Wings, Laser
- Chaos Blades, Scorpion Chain, Apollo's Bow

**Medium Weapons (0.3-0.5s charge):**
- Flight, Durandal, Ares's Blade
- Poseidon's Trident, Artemis's Bow

**Slow Weapons (0.5-1.0s charge):**
- Holy/Unholy Halo, Leviathan Axe, Mjolnir
- Excalibur, Gungnir, Celestial Lance

**Very Slow (1.0-2.0s charge):**
- Zeus's Bolt, Hephaestus's Hammer
- Blade of Olympus, Spear of Destiny, Surtr's Sword
- Medusa's Gaze (petrification charge)

### Projectile Travel Times

**Formula**: `travel_time = distance / projectile_speed`

**Projectile Speeds (units/second):**
- **Instant**: Melee weapons (0 travel time in melee range)
- **Very Fast** (200 u/s): Laser, Gun, Zeus's Bolt
- **Fast** (150 u/s): Archery, Apollo's Bow, Artemis's Bow
- **Medium** (100 u/s): Wings, Scorpion Chain, Chaos Blades
- **Slow** (75 u/s): Axes, Hammers, Tridents
- **Very Slow** (50 u/s): Surtr's Sword (fire projectile), Medusa's Gaze

## 🎯 Attack Sequence

### Complete Attack Timeline

1. **Charge Phase**: Weapon charges up (charge_time)
2. **Launch Phase**: Attack is launched (instant)
3. **Travel Phase**: Projectile travels to target (distance / speed)
4. **Impact Phase**: Damage is dealt (instant)
5. **Recovery Phase**: Before next attack can start (cooldown)

**Total Attack Time** = charge_time + travel_time + recovery_time

### Example: Zeus's Bolt at 60 units
```
1. Charge: 1.5s (very slow charge)
2. Launch: instant
3. Travel: 60 units / 200 u/s = 0.3s
4. Impact: 8.0 damage dealt
5. Recovery: 0.2s
Total: 2.0s per attack
```

### Example: Chaos Blades at 10 units
```
1. Charge: 0.2s (fast)
2. Launch: instant
3. Travel: 10 units / 100 u/s = 0.1s
4. Impact: 6.5 damage dealt
5. Recovery: 0.1s
Total: 0.4s per attack (2.5 attacks/second)
```

## 🏃 Movement System

### Fighter Movement
- **Base Speed**: 20 units/second
- **Speed Stat Modifier**: +2 units/s per point of Speed stat
- **Max Speed**: 40 units/second (at 10.0 Speed)

### Movement Strategies
1. **Rushing**: Move toward opponent (close distance)
2. **Retreating**: Move away from opponent (create distance)
3. **Strafing**: Dodge projectiles (50% dodge chance if moving)
4. **Standing**: No movement (100% hit chance from projectiles)

### AI Movement Logic
- **Melee weapons**: Rush to close distance
- **Ranged weapons**: Maintain optimal range
- **Low HP**: Retreat to create distance
- **Projectile incoming**: Strafe to dodge

## 🎮 Combat Simulation Flow

### Turn-Based with Time Tracking

```python
current_time = 0.0  # seconds
fighter1_next_attack = 0.0
fighter2_next_attack = 0.0
fighter1_pos = 20
fighter2_pos = 80

while both_alive:
    # Calculate distance
    distance = abs(fighter2_pos - fighter1_pos)
    
    # Check if Fighter 1 can attack
    if current_time >= fighter1_next_attack:
        # Calculate attack time
        charge = get_charge_time(fighter1_weapon)
        travel = distance / get_projectile_speed(fighter1_weapon)
        
        # Schedule attack
        impact_time = current_time + charge + travel
        fighter1_next_attack = impact_time + recovery_time
        
        # Deal damage at impact
        schedule_damage(fighter2, damage, impact_time)
    
    # Same for Fighter 2
    
    # Advance time to next event
    next_event = min(fighter1_next_attack, fighter2_next_attack, scheduled_damages)
    current_time = next_event
```

## 📊 Weapon Profiles

### Complete Weapon Data Structure

```json
{
    "chaos_blades": {
        "emoji": "🌊",
        "name": "Chaos Blades",
        "type": "melee_ranged",
        "base_damage": 6.5,
        "attack_speed": 2.5,
        "charge_time": 0.2,
        "projectile_speed": 100,
        "recovery_time": 0.1,
        "optimal_range": 15,
        "max_range": 30,
        "dps": 16.25
    }
}
```

## 🎯 Weapon Categorization

### Melee Weapons (0-5 range)
- Holy/Unholy Halo
- Instant damage in melee range
- Must close distance first

### Melee-Ranged (5-30 range)
- Chaos Blades, Scorpion Chain
- Can throw/extend weapons
- Effective at short-medium range

### Projectile Weapons (10-80 range)
- Archery, Gun, Zeus's Bolt
- Fire projectiles with travel time
- Most effective at range

### Charge Weapons (20-100 range)
- Medusa's Gaze, Hephaestus's Hammer
- Long charge, high damage
- Best at long range

## 🏆 Advanced DPS Calculation

### Real DPS with Timing

**Formula:**
```
Real DPS = base_damage / (charge_time + travel_time + recovery_time)
```

This varies based on distance!

**Example: Gun at Different Distances**
- At 10 units: 4.0 / (0.2 + 0.05 + 0.1) = 11.4 DPS
- At 50 units: 4.0 / (0.2 + 0.25 + 0.1) = 7.3 DPS
- At 80 units: 4.0 / (0.2 + 0.40 + 0.1) = 5.7 DPS

Distance matters!

## 🎪 Visual Display Updates

### Battle Map Display
```
╔════════════════════════════════════════════════════════════════════════╗
║ 🔵 Creative Soul [████████████░] 85 HP    🔴 Dark Soul [███████░░░] 60 HP ║
║                                                                        ║
║ ├─────────────────────────────────────────────────────────────────┤   ║
║ 🔵 (charging...)               [60 units]                    🔴      ║
║                      →→→→→→→→→→                                     ║
║                  (projectile traveling)                              ║
╚════════════════════════════════════════════════════════════════════════╝
```

### Attack Annotations
```
⚔️  Round 5.2s: 🔵 Creative Soul charges Zeus's Bolt (1.5s charge)
⚔️  Round 6.7s: ⚡ Projectile launched! (traveling 60 units at 200u/s)
⚔️  Round 7.0s: 💥 Impact! 8.0 damage dealt to Dark Soul!
```

## 🔄 Future Enhancements

1. **Dodge Mechanics**: Active dodging based on Speed stat
2. **Critical Hits**: Random chance based on Attack stat
3. **Combos**: Chain attacks for bonus damage
4. **Special Moves**: Ultimate abilities at low HP
5. **Environmental Hazards**: Map obstacles and power-ups
6. **Stamina System**: Limit rushing/dodging
7. **Blocking**: Reduce damage with Defense stat

## 💾 Implementation Files

- `core/soul_system_v3.py` - Advanced combat with spatial mechanics
- `core/weapon_physics.py` - Projectile and timing calculations
- `core/battle_map.py` - Spatial positioning system
- `core/combat_ai.py` - Movement and strategy AI

---

**Status**: Design Complete - Ready for Implementation
**Complexity**: High - Requires significant refactoring
**Estimated LOC**: ~1000-1500 lines
**Dependencies**: Current soul_system_v2.py as foundation
