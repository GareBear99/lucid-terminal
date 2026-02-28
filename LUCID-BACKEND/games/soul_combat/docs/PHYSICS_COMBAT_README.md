# ⚔️ Physics Combat System v3 - Quick Start

## 🎮 What Is This?

A complete physics-based combat system for LuciferAI's Soul Collection game featuring:

- ✅ **28 Classified Weapons** (Melee, Ranged, Boomerang, Hybrid)
- ✅ **Projectile Physics** with travel time and animations
- ✅ **Gun Ammo System** (6 rounds, 3x reload time)
- ✅ **Boomerang Weapons** (throw → hit → return → reload)
- ✅ **AI Movement** based on weapon type
- ✅ **19-Row Battle Arena** with real-time updates
- ✅ **Continuous Combat** (no rounds, 20 FPS)

## 🚀 Quick Demo

Run the interactive demo:
```bash
python3 demo_physics_combat.py
```

This launches a menu with:
- Preset battles showcasing different weapon types
- Custom battle builder
- Complete soul browser

## 📁 Files

| File | Purpose | Lines |
|------|---------|-------|
| `core/physics_combat_engine.py` | Complete physics engine | ~770 |
| `demo_physics_combat.py` | Interactive demo | ~170 |
| `docs/PHYSICS_COMBAT_SYSTEM_COMPLETE.md` | Full documentation | - |
| `core/soul_system_v2.py` | Soul definitions (existing) | ~827 |

## 💻 Code Example

```python
from core.physics_combat_engine import run_physics_battle
from core.soul_system_v2 import Soul

# Create fighters
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

# Run battle with full visual display
winner = run_physics_battle(thor, apollo)
```

## 🎯 Weapon Types

### Melee (7 weapons)
Instant damage within range (5-7 units)
- Holy/Unholy Halo, Ares Blade, Blade of Olympus, Excalibur, Durandal, Aegis Shield

### Ranged (13 weapons)
Projectiles with travel time (10-80 unit range)
- Archery, Gun, Laser, Zeus Bolt, Apollo Bow, Artemis Bow, Medusa Gaze, etc.

### Boomerang (4 weapons)
Throw → Hit → Return → Reload cycle (10-40 unit range)
- **Mjolnir**, **Leviathan Axe**, Poseidon Trident, Hephaestus Hammer

### Hybrid (5 weapons)
Both melee AND ranged capabilities
- Flight, Wings, Chaos Blades, Blades of Exile, Scorpion Chain

## 🎨 Arena Display

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

Fighters move dynamically! Projectiles animate! Health bars drain in real-time!

## 🔬 Testing

Quick test (headless):
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

Running quick system test (no display)...
✅ Thor wins in quick test!

✅ System fully operational!
```

## 📊 System Specs

- **Update Rate**: 20 FPS (50ms ticks)
- **Display Refresh**: 4 FPS (0.25s per frame)
- **Arena Size**: 76 units wide × 11 rows tall
- **Max Battle Time**: 60 seconds
- **Projectile Speeds**: 80-200 units/second
- **Fighter Movement**: 20-40 units/second

## 🎲 Special Mechanics

### Gun Ammo
- 6 rounds per magazine
- Auto-reload when empty
- Reload time = attack_speed × 3
- No delay for regular projectiles!

### Boomerang Weapons
1. **Throw** - Projectile launches toward enemy
2. **Travel** - Moves at weapon speed
3. **Hit** - Damage applied on contact
4. **Return** - Automatically returns to owner
5. **Catch** - Weapon ready after return
6. **Cooldown** - Attack speed timer starts

### Hybrid Weapons
- Auto-switches between melee and ranged
- Uses melee if enemy within 5-6 units
- Uses ranged projectile otherwise
- Smart AI maintains optimal distance

## 🧠 AI Behavior

| Weapon Type | AI Strategy |
|-------------|-------------|
| Melee | Rush if out of range |
| Ranged | Maintain 30-50 unit distance |
| Boomerang | Stay at optimal range, wait for return |
| Hybrid | Prefer ranged, adapt to distance |

## 📖 Full Documentation

See `docs/PHYSICS_COMBAT_SYSTEM_COMPLETE.md` for:
- Complete API reference
- Technical architecture
- Performance analysis
- Integration guide
- Weapon metadata details

## 🎮 Souls Available

**CELESTIAL** (12): Thor, Apollo, Athena, Zeus, Metatron, Azazel, Atlas, Prometheus, Hyperion, Groot, Gaia, Seraphim, Valkyrie

**DEMONIC** (14): Lucifer, Baal, Mammon, Asmodeus, Leviathan, Lilith, Succubus, Beelzebub, Belphegor, Dagon, Baphomet, Pazuzu, Aym, Krampus

**ANGELIC** (6): Phoenix, Fenrir, Nyx, Cerberus, Banshee, Icarus

## 🗡️ Weapon Distribution System

### By Rarity Tier

| Rarity | Level Cap | Weapons Assigned |
|--------|-----------|------------------|
| Common | 50 | None (base stats only) |
| Uncommon | 99 | None (base stats only) |
| Angelic | 256 | 1 random **Rare** weapon |
| Demonic | 999 | 1 random **Rare** + 1 random **Legendary** weapon |
| Celestial | 9999 | 2-3 random **Divine** weapons |

### Weapon Pools

**Rare Weapons** (11):
- Archery 🏹, Gun 🔫, Laser ⚡, Holy Halo 😇, Unholy Halo 😈, Wings 🪽, Flight 🕊️

**Legendary Weapons** (12):
- Zeus's Bolt ⚡, Poseidon's Trident 🔱, Hephaestus's Hammer ⚒️, Apollo's Bow 🏹, Ares's Blade ⚔️, Chaos Blades 🌊, Leviathan Axe 🪓, **Mjolnir** ⚡, Blades of Exile 🔥, Blade of Olympus 🗡️, Medusa's Gaze 🐍, Scorpion Chain 🦂

**Divine Weapons** (8):
- Excalibur 🌟, Spear of Destiny 👑, Durandal ✨, Aegis Shield 🏛️, Gungnir ⚡, Artemis's Bow 🌙, Surtr's Sword 🔥, Celestial Lance 💫

### Random Assignment

- Weapons are **randomly assigned** when a soul is created
- Each battle can have different weapon matchups
- Weapon stats scale with soul level (0.0 to 10.0)
- DPS = Base DPS × (Weapon Level / 10.0)

## ✅ Status

**COMPLETE & OPERATIONAL** - All 7 TODO items finished!

1. ✅ Weapon classification (28/28)
2. ✅ Projectile & Fighter classes
3. ✅ Ammo & reload system
4. ✅ Boomerang mechanics
5. ✅ Arena display system
6. ✅ Real-time combat simulation
7. ✅ Testing & integration

## 🛠️ Integration

This system fully integrates with the existing `soul_system_v2.py`:
- Uses Soul.calculate_max_health() for HP
- Uses Soul.calculate_current_stats() for stats
- Uses Soul.weapons for equipment
- Respects Soul.rarity for balancing
- No modifications to existing files needed!

---

**Built for LuciferAI** - The Agentic RPG Soul Combat System

Version: 3.0 | Status: ✅ COMPLETE | Lines: ~770 | Weapons: 28
