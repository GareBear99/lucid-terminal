# ⚔️ Soul Combat System

Complete RPG-style soul collection and battle system for LuciferAI.

## 🎭 Overview

The Soul Combat System adds a gamified RPG layer where users collect souls from special events, level them up through usage, and can battle them against each other.

## 📊 Rarity Tiers

### Common (5 souls)
- **Max Level**: 50
- **Base Health**: 100 HP (+2 per level)
- **Max Health**: 198 HP @ L50
- **Stats Cap**: 2.5/10.0
- **Traits**: 1
- **Weapons**: None
- **Examples**: Creative Soul, Dark Soul, Analytical Soul

### Uncommon (5 souls)
- **Max Level**: 99
- **Base Health**: 200 HP (+3 per level)
- **Max Health**: 494 HP @ L99
- **Stats Cap**: 5.0/10.0
- **Traits**: 2
- **Weapons**: None
- **Examples**: Imp, Nymph, Wisp, Shade, Echo

### Angelic (6 souls)
- **Max Level**: 256
- **Base Health**: 500 HP (+5 per level)
- **Max Health**: 1,775 HP @ L256
- **Stats Cap**: 10.0/10.0
- **Traits**: 3
- **Weapons**: 1 Rare weapon
- **Special**: Can roll Golden Notch Apple 🍎 (healing item)
- **Examples**: Phoenix, Fenrir, Nyx, Cerberus, Banshee, Icarus

### Demonic (14 souls)
- **Max Level**: 999 (stats cap @ L256)
- **Base Health**: 1,000 HP (+8 per level)
- **Max Health**: 8,984 HP @ L999
- **Stats Cap**: 10.0/10.0 @ L256
- **Traits**: 4 (1 Deadly Sin + 3 supporting)
- **Weapons**: 1 Rare + 1 Legendary
- **Examples**: Baal, Lucifer, Mammon, Asmodeus, Leviathan, Lilith, Succubus, Beelzebub, Belphegor, Krampus

### Celestial (12 souls)
- **Max Level**: 9,999 (stats cap @ L256)
- **Base Health**: 2,000 HP (+10 per level)
- **Max Health**: 101,980 HP @ L9999
- **Stats Cap**: 10.0/10.0 @ L256
- **Traits**: 4 (balanced good/evil)
- **Weapons**: 2-3 Divine weapons
- **Examples**: Azazel, Metatron, Thor, Athena, Apollo, Atlas, Prometheus, Groot

## ⚔️ Combat Stats

All souls have base stats that scale with level:
- **⚔️ Attack**: Offensive power
- **🛡️ Defense**: Defensive power
- **💥 Base Damage**: Core damage output
- **⚡ Speed**: Movement/reaction (Uncommon+)

**DPS Calculation**: Base DPS + Weapon DPS (scaled by stat level)

## 🗡️ Weapons

### Rare Weapons (Angelic)
- 🍎 **Golden Notch Apple**: Healing item (triggers @ 20% HP, once per battle)
- 🏹 **Archery**: 3.5 dmg, 1.8 spd (6.3 DPS)
- 🦅 **Flight**: 2.0 dmg, 3.0 spd (6.0 DPS)
- 🔫 **Gun**: 4.0 dmg, 2.5 spd (10.0 DPS)
- 👼 **Wings**: 2.5 dmg, 2.0 spd (5.0 DPS)
- 🔴 **Laser**: 5.0 dmg, 1.5 spd (7.5 DPS)
- 😇 **Holy Halo**: 4.5 dmg, 1.2 spd (5.4 DPS)
- 😈 **Unholy Halo**: 4.5 dmg, 1.2 spd (5.4 DPS)

### Legendary Weapons (Demonic)
- ⚡ **Zeus's Bolt**: 8.0 dmg, 0.8 spd (6.4 DPS)
- 🔱 **Poseidon's Trident**: 7.0 dmg, 1.2 spd (8.4 DPS)
- ⚒️ **Hephaestus's Hammer**: 9.0 dmg, 0.6 spd (5.4 DPS)
- 🏹 **Apollo's Bow**: 6.0 dmg, 2.0 spd (12.0 DPS)
- ⚔️ **Ares's Blade**: 7.5 dmg, 1.8 spd (13.5 DPS)
- 🌊 **Chaos Blades**: 6.5 dmg, 2.5 spd (16.25 DPS) ⭐ Best DPS
- 🪓 **Leviathan Axe**: 8.0 dmg, 1.0 spd (8.0 DPS)
- ⚡ **Mjolnir**: 8.5 dmg, 1.1 spd (9.35 DPS)
- 🔥 **Blades of Exile**: 7.0 dmg, 2.2 spd (15.4 DPS)
- 🗡️ **Blade of Olympus**: 10.0 dmg, 0.9 spd (9.0 DPS) ⭐ Max damage
- 🐍 **Medusa's Gaze**: 5.0 dmg, 1.5 spd (7.5 DPS)
- 🦂 **Scorpion Chain**: 6.0 dmg, 2.0 spd (12.0 DPS)

### Divine Weapons (Celestial)
- 🌟 **Excalibur**: 9.0 dmg, 1.5 spd (13.5 DPS)
- 👑 **Spear of Destiny**: 10.0 dmg, 1.0 spd (10.0 DPS)
- ✨ **Durandal**: 8.5 dmg, 1.8 spd (15.3 DPS)
- 🏛️ **Aegis Shield**: 4.0 dmg, 1.0 spd (4.0 DPS) ⭐ Defensive
- ⚡ **Gungnir**: 9.5 dmg, 1.3 spd (12.35 DPS)
- 🌙 **Artemis's Bow**: 7.0 dmg, 2.5 spd (17.5 DPS) ⭐ Highest DPS
- 🔥 **Surtr's Sword**: 11.0 dmg, 0.8 spd (8.8 DPS) ⭐ Max damage
- 💫 **Celestial Lance**: 8.0 dmg, 1.6 spd (12.8 DPS)

## 📈 Leveling System

### XP Gains
- **Processing requests**: 10 XP
- **Fixing scripts**: 50 XP
- **Using templates**: 25 XP
- **Uploading to FixNet**: 100 XP

### XP Per Level
- **Common**: 100 XP/level
- **Uncommon**: 150 XP/level
- **Angelic**: 200 XP/level
- **Demonic**: 500 XP/level
- **Celestial**: 1000 XP/level

### Stat Growth
All rarities grow at **+0.039 per level** to reach 10.0 @ L256
- Common caps at 2.5 @ L50
- Uncommon caps at 5.0 @ L99
- Angelic caps at 10.0 @ L256
- Demonic/Celestial cap at 10.0 @ L256, continue leveling for bonuses

## 🏆 Battle Results (Max Level)

| Battle | Fighter 1 | Fighter 2 | Winner | HP Remaining |
|--------|-----------|-----------|--------|--------------|
| 1 | Common L50 | Uncommon L99 | Uncommon | 440 HP |
| 2 | Uncommon L99 | Angelic L256 | Angelic | 1,651 HP |
| 3 | Angelic L256 | Demonic L999 | Demonic | 8,047 HP |
| 4 | Demonic L999 | Celestial L9999 | Celestial | 94,691 HP |

**Special**: Angelic (w/ Golden Apple) vs Celestial L1000
- Golden Apple triggers at 20% HP (355 HP)
- Fully heals once per battle
- Still loses to overwhelming Celestial power

## 🎮 Acquisition

Souls are obtained through:
- **Holiday Events**: Special calendar events grant souls
- **Online Verified**: Date/time verified from online source
- **Hash-Backed**: Each soul has unique verification hash
- **One-Time**: Each event soul is unique to that occurrence

## 📝 Soul Entities

### Common Souls
- 🎨 **Creative Soul**: imaginative
- 🌑 **Dark Soul**: cynical
- 🧮 **Analytical Soul**: logical
- 💝 **Empathetic Soul**: compassionate
- 😈 **Rebellious Soul**: daring

### Uncommon Souls
- 👿 **Imp**: mischievous, cunning
- 🧚 **Nymph**: whore, lustful
- 🌫️ **Wisp**: ethereal, elusive
- 🖤 **Shade**: dark, quiet
- 🔮 **Echo**: reflective, haunting

### Angelic Souls
- 🔥 **Phoenix**: reborn, fiery, majestic
- 🐺 **Fenrir**: savage, loyal, fierce
- 🌙 **Nyx**: mysterious, nocturnal, powerful
- 🐉 **Cerberus**: guardian, relentless, territorial
- 👻 **Banshee**: prophetic, mournful, piercing
- 🪶 **Icarus**: ambitious, reckless, soaring

### Demonic Souls (7 Deadly Sins + Others)
**Pride:**
- 😈 **Baal**: arrogant, superior, commanding, vain
- 👑 **Lucifer**: prideful, brilliant, charismatic, fallen

**Greed:**
- 💰 **Mammon**: greedy, materialistic, possessive, cunning

**Wrath:**
- 🔥 **Asmodeus**: wrathful, vengeful, destructive, furious
- 🔮 **Pazuzu**: chaotic, wind-born, plagued, malevolent
- 🕷️ **Aym**: calculating, three-headed, tactical, destructive
- 👹 **Krampus**: punishing, festive, terrifying, judgmental

**Envy:**
- 👀 **Leviathan**: envious, jealous, bitter, covetous

**Lust:**
- 💋 **Lilith**: seductive, passionate, tempting, alluring
- 😘 **Succubus**: sensual, draining, enchanting, nocturnal

**Gluttony:**
- 🍔 **Beelzebub**: gluttonous, insatiable, excessive, voracious

**Sloth:**
- 😴 **Belphegor**: lazy, apathetic, unmotivated, lethargic

**Others:**
- 🌊 **Dagon**: ancient, oceanic, primal, corrupting
- 🐐 **Baphomet**: occult, dualistic, mystical, forbidden

### Celestial Souls
- ✨ **Azazel**: virtuous, wise, sinful, tempting
- ⚖️ **Metatron**: just, authoritative, enigmatic, stern
- ⚡ **Thor**: brave, thunderous, protective, boisterous
- 🌟 **Athena**: wise, strategic, just, fierce
- 🏹 **Apollo**: radiant, artistic, precise, proud
- 🌍 **Atlas**: enduring, burdened, powerful, steadfast
- 🔥 **Prometheus**: rebellious, visionary, sacrificial, defiant
- ☀️ **Hyperion**: luminous, primordial, commanding, ancient
- 🌳 **Groot**: gentle, protective, nature-bound, resilient
- 🌊 **Gaia**: nurturing, primal, maternal, fierce
- 🦅 **Seraphim**: holy, zealous, purifying, devoted
- 🗡️ **Valkyrie**: honorable, warrior-hearted, chooser, noble

## 💾 File Location

- **Souls Data**: `~/.luciferai/data/souls.json`
- **System Code**: `core/soul_system_v2.py`

## 🎯 Future Integration

- Link to LLM usage for XP gains
- Holiday event detection and soul grants
- PvP battle system with wagering
- Soul trading/marketplace
- Prestige system for max-level souls
