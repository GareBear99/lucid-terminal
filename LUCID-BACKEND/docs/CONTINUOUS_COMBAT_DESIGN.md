# ⚔️ Continuous Real-Time Combat System

Real-time battle simulation where fighters attack continuously at their weapon's attack rate.

## 🎮 Core Concept

**No rounds** - fighters attack simultaneously based on their weapon attack speeds. The battle runs in continuous time until one fighter reaches 0 HP.

## ⏱️ Time-Based Combat

### Attack Timing
Each fighter attacks at their **attack rate** (attacks per second):
- Attack Rate = Average of all weapon attack speeds
- Time between attacks = 1.0 / attack_rate

**Example:**
- Chaos Blades: 2.5 attacks/second → attacks every 0.4 seconds
- Zeus's Bolt: 0.8 attacks/second → attacks every 1.25 seconds

### Continuous Timeline

```
Time 0.0s: Battle starts
Time 0.4s: Fighter 1 (Chaos Blades) attacks → 6.5 damage
Time 0.8s: Fighter 1 attacks again → 6.5 damage
Time 1.2s: Fighter 1 attacks → 6.5 damage
Time 1.25s: Fighter 2 (Zeus Bolt) attacks → 8.0 damage
Time 1.6s: Fighter 1 attacks → 6.5 damage
Time 2.0s: Fighter 1 attacks → 6.5 damage
Time 2.4s: Fighter 1 attacks → 6.5 damage
Time 2.5s: Fighter 2 attacks → 8.0 damage
...continues until KO
```

## 📊 Damage Calculation

### Per-Attack Damage
```
damage_per_attack = total_attack_power
```

Not DPS! Each attack deals the full attack power.

**Example:**
- Baal (Demonic L999):
  - Attack Power: 21.46
  - Attack Rate: 1.30 attacks/second
  - Each attack: 21.46 damage
  - Actual DPS: 21.46 × 1.30 = 27.9 DPS

## 🗺️ Spatial Combat (Simplified)

### Battle Map
- Map size: 100 units wide
- Fighter 1 starts at position 25
- Fighter 2 starts at position 75
- Starting distance: 50 units

### Distance-Based Mechanics

**Weapon Ranges:**
- **Melee** (0-10 units): Holy/Unholy Halo, Hammers
- **Short** (10-30 units): Chaos Blades, Archery, Wings
- **Medium** (30-60 units): Guns, Bows, Axes
- **Long** (60-100 units): Zeus's Bolt, Laser, Spears

### Projectile Travel Time

```
travel_time = distance / projectile_speed

Projectile Speeds:
- Instant: Melee weapons (in range)
- Fast (200 u/s): Guns, Lasers, Lightning
- Medium (150 u/s): Arrows, Chains
- Slow (100 u/s): Thrown weapons, Axes
```

**Attack lands at:** `attack_time + travel_time`

### Example Timeline with Travel
```
Time 0.0s: Battle starts (50 units apart)
Time 0.4s: F1 launches arrow (150 u/s) → arrives at 0.733s
Time 0.733s: Arrow hits F2 → 3.5 damage
Time 0.8s: F1 launches arrow → arrives at 1.133s
Time 1.133s: Arrow hits F2 → 3.5 damage
Time 1.25s: F2 launches Zeus Bolt (200 u/s) → arrives at 1.5s
Time 1.5s: Bolt hits F1 → 8.0 damage
```

## 🎯 Combat Simulation Algorithm

```python
def continuous_combat(soul1, soul2):
    # Initialize
    time = 0.0
    hp1 = soul1.max_hp
    hp2 = soul2.max_hp
    
    # Calculate attack intervals
    attack_rate1 = get_attack_rate(soul1)
    attack_rate2 = get_attack_rate(soul2)
    
    attack_interval1 = 1.0 / attack_rate1
    attack_interval2 = 1.0 / attack_rate2
    
    next_attack1 = attack_interval1
    next_attack2 = attack_interval2
    
    # Event queue for projectile hits
    hit_events = []
    
    # Battle loop
    while hp1 > 0 and hp2 > 0:
        # Find next event
        next_event = min(next_attack1, next_attack2, min(hit_events) if hit_events else inf)
        
        # Advance time
        time = next_event
        
        # Process event
        if time == next_attack1:
            # Fighter 1 attacks
            damage = soul1.attack_power
            travel_time = calculate_travel_time(soul1, distance)
            hit_time = time + travel_time
            hit_events.append((hit_time, 2, damage))  # hits fighter 2
            
            print(f"{time:.2f}s: {soul1.name} attacks! (→ hits at {hit_time:.2f}s)")
            next_attack1 = time + attack_interval1
        
        elif time == next_attack2:
            # Fighter 2 attacks
            damage = soul2.attack_power
            travel_time = calculate_travel_time(soul2, distance)
            hit_time = time + travel_time
            hit_events.append((hit_time, 1, damage))  # hits fighter 1
            
            print(f"{time:.2f}s: {soul2.name} attacks! (→ hits at {hit_time:.2f}s)")
            next_attack2 = time + attack_interval2
        
        else:
            # Process hit
            hit_time, target, damage = hit_events.pop(0)
            if target == 1:
                hp1 -= damage
                print(f"{time:.2f}s: 💥 {soul1.name} hit for {damage} damage! ({hp1}/{soul1.max_hp} HP)")
            else:
                hp2 -= damage
                print(f"{time:.2f}s: 💥 {soul2.name} hit for {damage} damage! ({hp2}/{soul2.max_hp} HP)")
            
            # Check Golden Apple
            if hp2 <= soul2.max_hp * 0.2 and not used_apple2:
                hp2 = soul2.max_hp
                print(f"{time:.2f}s: 🍎 {soul2.name} uses Golden Apple!")
        
        # Update display every 0.5s
        if int(time * 2) != int((time - 0.01) * 2):
            display_health_bars(hp1, hp2, soul1, soul2)
```

## 📺 Live Display

### Continuous Health Updates
```
Time: 2.35s
╔════════════════════════════════════════════════════════════════╗
║ 🔵 Creative Soul                 🔴 Dark Soul                 ║
║ [██████████████████░░] 175/198   [████████░░░░░] 142/198     ║
║                                                                ║
║  25 ←→→→→→→→→→→→→→→→→→→→→→→ 75                               ║
║  🔵 (cooldown: 0.15s)  (projectile)  🔴 (charging: 0.3s)     ║
╚════════════════════════════════════════════════════════════════╝

⚔️  2.35s: Creative Soul attacks! Arrow traveling...
⚔️  2.42s: 💥 Dark Soul hit for 3.5 damage!
```

### Attack Annotations
```
0.00s: 🔔 FIGHT!
0.40s: 🔵 Creative Soul fires arrow!
0.73s: 💥 Dark Soul hit for 3.5 damage! [194/198 HP]
0.80s: 🔵 Creative Soul fires arrow!
1.13s: 💥 Dark Soul hit for 3.5 damage! [191/198 HP]
1.25s: 🔴 Dark Soul launches Zeus's Bolt!
1.50s: 💥 Creative Soul hit for 8.0 damage! [190/198 HP]
```

## 🎯 Implementation Steps

1. **Calculate attack intervals** from weapon attack speeds
2. **Schedule attacks** in timeline based on intervals
3. **Calculate projectile travel times** based on distance
4. **Schedule damage** when projectiles land
5. **Process events** in chronological order
6. **Update display** at regular intervals (0.1-0.5s)
7. **Check win condition** after each damage event

## 📊 Sample Battle Analysis

### Baal vs Creative Soul

**Baal (Demonic L999):**
- Attack Power: 21.46
- Attack Rate: 1.30/s (every 0.77s)
- Weapons: Archery (1.8/s) + Hammer (0.6/s) = avg 1.2/s

**Creative Soul (Common L50):**
- Attack Power: 2.50
- Attack Rate: 1.0/s (every 1.0s)
- No weapons (base rate)

**Timeline:**
```
0.00s: START
0.77s: Baal attacks → 21.46 dmg lands at 1.10s
1.00s: Creative attacks → 2.50 dmg lands at 1.50s
1.10s: 💥 Creative hit [175.5/198 HP]
1.50s: 💥 Baal hit [9060/9082 HP]
1.54s: Baal attacks → lands at 1.87s
1.87s: 💥 Creative hit [154/198 HP]
2.00s: Creative attacks → lands at 2.50s
2.31s: Baal attacks → lands at 2.64s
...
Result: Baal wins easily (much higher DPS)
```

## 🏆 Victory Conditions

- Fighter reaches 0 HP
- Display winner with remaining HP
- Show battle duration in seconds
- Calculate average DPS delivered

---

**Implementation**: Update `soul_system_v2.py` battle_simulation()
**Complexity**: Medium - event-based timeline
**Key Feature**: Real-time continuous combat, no artificial rounds
