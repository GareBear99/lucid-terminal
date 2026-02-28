#!/usr/bin/env python3
"""
⚔️ LuciferAI Soul Combat System
Complete RPG-style soul system with leveling, combat stats, and weapon mechanics.
"""
import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import random

# Paths
LUCIFER_HOME = Path.home() / ".luciferai"
SOULS_FILE = LUCIFER_HOME / "data" / "souls.json"
SOULS_FILE.parent.mkdir(parents=True, exist_ok=True)

# ═══════════════════════════════════════════════════════════════════════════
# WEAPON DEFINITIONS WITH BASE DAMAGE & ATTACK SPEED
# ═══════════════════════════════════════════════════════════════════════════

# Rare Weapons (for Angelic souls)
RARE_WEAPONS = {
    'golden_apple': {
        'emoji': '🍎',
        'name': 'Golden Notch Apple',
        'base_damage': 0.0,  # Healing item
        'attack_speed': 0.0,  # Not an attack
        'dps': 0.0,
        'healing_item': True,  # Special flag
        'heal_trigger': 0.2  # Triggers at 20% HP
    },
    'archery': {
        'emoji': '🏹',
        'name': 'Archery',
        'base_damage': 3.5,  # Medium damage
        'attack_speed': 1.8,  # 1.8 attacks/sec
        'dps': 6.3  # 3.5 * 1.8
    },
    'flight': {
        'emoji': '🦅',
        'name': 'Flight',
        'base_damage': 2.0,  # Low damage (mobility skill)
        'attack_speed': 3.0,  # Fast
        'dps': 6.0
    },
    'gun': {
        'emoji': '🔫',
        'name': 'Gun',
        'base_damage': 4.0,  # High damage
        'attack_speed': 2.5,  # Fast fire rate
        'dps': 10.0
    },
    'wings': {
        'emoji': '👼',
        'name': 'Wings',
        'base_damage': 2.5,  # Low-medium damage
        'attack_speed': 2.0,
        'dps': 5.0
    },
    'laser': {
        'emoji': '🔴',
        'name': 'Laser',
        'base_damage': 5.0,  # Very high damage
        'attack_speed': 1.5,  # Slower charge
        'dps': 7.5
    },
    'holy_halo': {
        'emoji': '😇',
        'name': 'Holy Halo',
        'base_damage': 4.5,  # High holy damage
        'attack_speed': 1.2,  # Slow but powerful
        'dps': 5.4
    },
    'unholy_halo': {
        'emoji': '😈',
        'name': 'Unholy Halo',
        'base_damage': 4.5,  # High dark damage
        'attack_speed': 1.2,  # Slow but powerful
        'dps': 5.4
    }
}

# Legendary Weapons (for Demonic souls)
LEGENDARY_WEAPONS = {
    'zeus_bolt': {
        'emoji': '⚡',
        'name': "Zeus's Bolt",
        'base_damage': 8.0,  # Massive damage
        'attack_speed': 0.8,  # Very slow
        'dps': 6.4
    },
    'poseidon_trident': {
        'emoji': '🔱',
        'name': "Poseidon's Trident",
        'base_damage': 7.0,
        'attack_speed': 1.2,
        'dps': 8.4
    },
    'hephaestus_hammer': {
        'emoji': '⚒️',
        'name': "Hephaestus's Hammer",
        'base_damage': 9.0,  # Highest single hit
        'attack_speed': 0.6,  # Slowest
        'dps': 5.4
    },
    'apollo_bow': {
        'emoji': '🏹',
        'name': "Apollo's Bow",
        'base_damage': 6.0,
        'attack_speed': 2.0,
        'dps': 12.0  # Highest DPS legendary
    },
    'ares_blade': {
        'emoji': '⚔️',
        'name': "Ares's Blade",
        'base_damage': 7.5,
        'attack_speed': 1.8,
        'dps': 13.5  # Very high DPS
    },
    'chaos_blades': {
        'emoji': '🌊',
        'name': 'Chaos Blades',
        'base_damage': 6.5,
        'attack_speed': 2.5,  # Fast dual wield
        'dps': 16.25  # Excellent DPS
    },
    'leviathan_axe': {
        'emoji': '🪓',
        'name': 'Leviathan Axe',
        'base_damage': 8.0,
        'attack_speed': 1.0,
        'dps': 8.0
    },
    'mjolnir': {
        'emoji': '⚡',
        'name': 'Mjolnir',
        'base_damage': 8.5,
        'attack_speed': 1.1,
        'dps': 9.35
    },
    'blades_of_exile': {
        'emoji': '🔥',
        'name': 'Blades of Exile',
        'base_damage': 7.0,
        'attack_speed': 2.2,
        'dps': 15.4
    },
    'blade_of_olympus': {
        'emoji': '🗡️',
        'name': 'Blade of Olympus',
        'base_damage': 10.0,  # God-tier damage
        'attack_speed': 0.9,
        'dps': 9.0
    },
    'medusa_gaze': {
        'emoji': '🐍',
        'name': "Medusa's Gaze",
        'base_damage': 5.0,  # Lower damage, CC focus
        'attack_speed': 1.5,
        'dps': 7.5
    },
    'scorpion_chain': {
        'emoji': '🦂',
        'name': 'Scorpion Chain',
        'base_damage': 6.0,
        'attack_speed': 2.0,
        'dps': 12.0
    }
}

# Divine Weapons (for Celestial souls)
DIVINE_WEAPONS = {
    'excalibur': {
        'emoji': '🌟',
        'name': 'Excalibur',
        'base_damage': 9.0,
        'attack_speed': 1.5,
        'dps': 13.5
    },
    'spear_of_destiny': {
        'emoji': '👑',
        'name': 'Spear of Destiny',
        'base_damage': 10.0,  # Legendary damage
        'attack_speed': 1.0,
        'dps': 10.0
    },
    'durandal': {
        'emoji': '✨',
        'name': 'Durandal',
        'base_damage': 8.5,
        'attack_speed': 1.8,
        'dps': 15.3
    },
    'aegis_shield': {
        'emoji': '🏛️',
        'name': 'Aegis Shield',
        'base_damage': 4.0,  # Defensive weapon
        'attack_speed': 1.0,
        'dps': 4.0
    },
    'gungnir': {
        'emoji': '⚡',
        'name': 'Gungnir',
        'base_damage': 9.5,
        'attack_speed': 1.3,
        'dps': 12.35
    },
    'artemis_bow': {
        'emoji': '🌙',
        'name': "Artemis's Bow",
        'base_damage': 7.0,
        'attack_speed': 2.5,  # Very fast
        'dps': 17.5  # Highest celestial DPS
    },
    'surtr_sword': {
        'emoji': '🔥',
        'name': "Surtr's Sword",
        'base_damage': 11.0,  # Massive fire damage
        'attack_speed': 0.8,
        'dps': 8.8
    },
    'celestial_lance': {
        'emoji': '💫',
        'name': 'Celestial Lance',
        'base_damage': 8.0,
        'attack_speed': 1.6,
        'dps': 12.8
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# SOUL ENTITY DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════

COMMON_SOULS = {
    'creative': {'emoji': '🎨', 'name': 'Creative Soul', 'traits': ['imaginative']},
    'dark': {'emoji': '🌑', 'name': 'Dark Soul', 'traits': ['cynical']},
    'analytical': {'emoji': '🧮', 'name': 'Analytical Soul', 'traits': ['logical']},
    'empathetic': {'emoji': '💝', 'name': 'Empathetic Soul', 'traits': ['compassionate']},
    'rebellious': {'emoji': '😈', 'name': 'Rebellious Soul', 'traits': ['daring']}
}

UNCOMMON_SOULS = {
    'imp': {'emoji': '👿', 'name': 'Imp', 'traits': ['mischievous', 'cunning']},
    'nymph': {'emoji': '🧚', 'name': 'Nymph', 'traits': ['whore', 'lustful']},
    'wisp': {'emoji': '🌫️', 'name': 'Wisp', 'traits': ['ethereal', 'elusive']},
    'shade': {'emoji': '🖤', 'name': 'Shade', 'traits': ['dark', 'quiet']},
    'echo': {'emoji': '🔮', 'name': 'Echo', 'traits': ['reflective', 'haunting']}
}

ANGELIC_SOULS = {
    'phoenix': {'emoji': '🔥', 'name': 'Phoenix', 'traits': ['reborn', 'fiery', 'majestic']},
    'fenrir': {'emoji': '🐺', 'name': 'Fenrir', 'traits': ['savage', 'loyal', 'fierce']},
    'nyx': {'emoji': '🌙', 'name': 'Nyx', 'traits': ['mysterious', 'nocturnal', 'powerful']},
    'cerberus': {'emoji': '🐉', 'name': 'Cerberus', 'traits': ['guardian', 'relentless', 'territorial']},
    'banshee': {'emoji': '👻', 'name': 'Banshee', 'traits': ['prophetic', 'mournful', 'piercing']},
    'icarus': {'emoji': '🪶', 'name': 'Icarus', 'traits': ['ambitious', 'reckless', 'soaring']}
}

DEMONIC_SOULS = {
    # Pride
    'baal': {'emoji': '😈', 'name': 'Baal', 'sin': 'pride', 'traits': ['arrogant', 'superior', 'commanding', 'vain']},
    'lucifer': {'emoji': '👑', 'name': 'Lucifer', 'sin': 'pride', 'traits': ['prideful', 'brilliant', 'charismatic', 'fallen']},
    # Greed
    'mammon': {'emoji': '💰', 'name': 'Mammon', 'sin': 'greed', 'traits': ['greedy', 'materialistic', 'possessive', 'cunning']},
    # Wrath
    'asmodeus': {'emoji': '🔥', 'name': 'Asmodeus', 'sin': 'wrath', 'traits': ['wrathful', 'vengeful', 'destructive', 'furious']},
    # Envy
    'leviathan': {'emoji': '👀', 'name': 'Leviathan', 'sin': 'envy', 'traits': ['envious', 'jealous', 'bitter', 'covetous']},
    # Lust
    'lilith': {'emoji': '💋', 'name': 'Lilith', 'sin': 'lust', 'traits': ['seductive', 'passionate', 'tempting', 'alluring']},
    'succubus': {'emoji': '😘', 'name': 'Succubus', 'sin': 'lust', 'traits': ['sensual', 'draining', 'enchanting', 'nocturnal']},
    # Gluttony
    'beelzebub': {'emoji': '🍔', 'name': 'Beelzebub', 'sin': 'gluttony', 'traits': ['gluttonous', 'insatiable', 'excessive', 'voracious']},
    # Sloth
    'belphegor': {'emoji': '😴', 'name': 'Belphegor', 'sin': 'sloth', 'traits': ['lazy', 'apathetic', 'unmotivated', 'lethargic']},
    # Others
    'dagon': {'emoji': '🌊', 'name': 'Dagon', 'sin': 'pride', 'traits': ['ancient', 'oceanic', 'primal', 'corrupting']},
    'baphomet': {'emoji': '🐐', 'name': 'Baphomet', 'sin': 'pride', 'traits': ['occult', 'dualistic', 'mystical', 'forbidden']},
    'pazuzu': {'emoji': '🔮', 'name': 'Pazuzu', 'sin': 'wrath', 'traits': ['chaotic', 'wind-born', 'plagued', 'malevolent']},
    'aym': {'emoji': '🕷️', 'name': 'Aym', 'sin': 'wrath', 'traits': ['calculating', 'three-headed', 'tactical', 'destructive']},
    'krampus': {'emoji': '👹', 'name': 'Krampus', 'sin': 'wrath', 'traits': ['punishing', 'festive', 'terrifying', 'judgmental']}
}

CELESTIAL_SOULS = {
    'azazel': {'emoji': '✨', 'name': 'Azazel', 'traits': ['virtuous', 'wise', 'sinful', 'tempting']},
    'metatron': {'emoji': '⚖️', 'name': 'Metatron', 'traits': ['just', 'authoritative', 'enigmatic', 'stern']},
    'thor': {'emoji': '⚡', 'name': 'Thor', 'traits': ['brave', 'thunderous', 'protective', 'boisterous']},
    'athena': {'emoji': '🌟', 'name': 'Athena', 'traits': ['wise', 'strategic', 'just', 'fierce']},
    'apollo': {'emoji': '🏹', 'name': 'Apollo', 'traits': ['radiant', 'artistic', 'precise', 'proud']},
    'atlas': {'emoji': '🌍', 'name': 'Atlas', 'traits': ['enduring', 'burdened', 'powerful', 'steadfast']},
    'prometheus': {'emoji': '🔥', 'name': 'Prometheus', 'traits': ['rebellious', 'visionary', 'sacrificial', 'defiant']},
    'hyperion': {'emoji': '☀️', 'name': 'Hyperion', 'traits': ['luminous', 'primordial', 'commanding', 'ancient']},
    'groot': {'emoji': '🌳', 'name': 'Groot', 'traits': ['gentle', 'protective', 'nature-bound', 'resilient']},
    'gaia': {'emoji': '🌊', 'name': 'Gaia', 'traits': ['nurturing', 'primal', 'maternal', 'fierce']},
    'seraphim': {'emoji': '🦅', 'name': 'Seraphim', 'traits': ['holy', 'zealous', 'purifying', 'devoted']},
    'valkyrie': {'emoji': '🗡️', 'name': 'Valkyrie', 'traits': ['honorable', 'warrior-hearted', 'chooser', 'noble']}
}

# ═══════════════════════════════════════════════════════════════════════════
# LEVEL CAPS & STAT SCALING
# ═══════════════════════════════════════════════════════════════════════════

RARITY_CONFIG = {
    'common': {
        'max_level': 50,
        'stat_cap': 2.5,
        'stat_growth_per_level': 0.05,  # 2.5 / 50 = 0.05
        'xp_per_level': 100,
        'trait_count': 1,
        'base_health': 100,  # Base HP at level 1
        'health_per_level': 2  # HP gained per level
    },
    'uncommon': {
        'max_level': 99,
        'stat_cap': 5.0,
        'stat_growth_per_level': 0.0505,  # 5.0 / 99 ≈ 0.0505
        'xp_per_level': 150,
        'trait_count': 2,
        'base_health': 100,
        'health_per_level': 4
    },
    'angelic': {
        'max_level': 256,
        'stat_cap': 10.0,
        'stat_growth_per_level': 0.039,  # 10.0 / 256 ≈ 0.039
        'xp_per_level': 200,
        'trait_count': 3,
        'base_health': 100,
        'health_per_level': 6.5
    },
    'demonic': {
        'max_level': 999,
        'stat_cap': 10.0,  # Caps at L256
        'stat_cap_level': 256,
        'stat_growth_per_level': 0.039,
        'xp_per_level': 500,
        'trait_count': 4,
        'base_health': 100,
        'health_per_level': 9
    },
    'celestial': {
        'max_level': 9999,
        'stat_cap': 10.0,  # Caps at L256
        'stat_cap_level': 256,
        'stat_growth_per_level': 0.039,
        'xp_per_level': 1000,
        'trait_count': 4,
        'base_health': 100,
        'health_per_level': 10
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# SOUL CLASS
# ═══════════════════════════════════════════════════════════════════════════

class Soul:
    """Represents a combat soul with stats, weapons, and progression."""
    
    def __init__(self, soul_id: str, entity_key: str, rarity: str, obtained_event: str, 
                 obtained_date: str, verified_hash: str):
        self.id = soul_id
        self.entity_key = entity_key
        self.rarity = rarity
        self.level = 1
        self.xp = 0
        
        # Get entity definition
        self.entity = self._get_entity_definition()
        
        # Obtain info
        self.obtained_event = obtained_event
        self.obtained_date = obtained_date
        self.verified_hash = verified_hash
        
        # Base stats (all souls have these)
        self.stats = {
            'attack': 0.0,
            'defense': 0.0,
            'base_damage': 0.0
        }
        
        # Add Speed for uncommon+
        if rarity in ['uncommon', 'angelic', 'demonic', 'celestial']:
            self.stats['speed'] = 0.0
        
        # Randomly assign weapons based on rarity
        self.weapons = self._assign_random_weapons()
        
        # Memory & binding
        self.llm_binding = None
        self.memory = {
            'requests_processed': 0,
            'tokens_processed': 0,
            'scripts_fixed': 0,
            'templates_used': 0,
            'uploads_to_fixnet': 0,
            'last_used': None
        }
    
    def _get_entity_definition(self) -> Dict:
        """Get entity definition based on rarity."""
        if self.rarity == 'common':
            return COMMON_SOULS[self.entity_key]
        elif self.rarity == 'uncommon':
            return UNCOMMON_SOULS[self.entity_key]
        elif self.rarity == 'angelic':
            return ANGELIC_SOULS[self.entity_key]
        elif self.rarity == 'demonic':
            return DEMONIC_SOULS[self.entity_key]
        elif self.rarity == 'celestial':
            return CELESTIAL_SOULS[self.entity_key]
        return {}
    
    def _assign_random_weapons(self) -> Dict:
        """Assign random weapons based on rarity."""
        weapons = {}
        
        if self.rarity == 'angelic':
            # 1 random rare weapon
            weapon_key = random.choice(list(RARE_WEAPONS.keys()))
            weapons[weapon_key] = RARE_WEAPONS[weapon_key].copy()
            
        elif self.rarity == 'demonic':
            # 1 random rare + 1 random legendary
            rare_key = random.choice(list(RARE_WEAPONS.keys()))
            legendary_key = random.choice(list(LEGENDARY_WEAPONS.keys()))
            weapons[rare_key] = RARE_WEAPONS[rare_key].copy()
            weapons[legendary_key] = LEGENDARY_WEAPONS[legendary_key].copy()
            
        elif self.rarity == 'celestial':
            # 2-3 random divine weapons
            num_weapons = random.choice([2, 3])
            divine_keys = random.sample(list(DIVINE_WEAPONS.keys()), num_weapons)
            for key in divine_keys:
                weapons[key] = DIVINE_WEAPONS[key].copy()
        
        # Initialize weapon stat values to 0.0
        for weapon in weapons.values():
            weapon['current_value'] = 0.0
            weapon['speed_value'] = 0.0
        
        return weapons
    
    def calculate_current_stats(self) -> Dict:
        """Calculate current stat values based on level."""
        config = RARITY_CONFIG[self.rarity]
        
        # For demonic/celestial, cap stats at level 256
        effective_level = self.level
        if self.rarity in ['demonic', 'celestial'] and self.level > 256:
            effective_level = 256
        
        # Calculate base stats
        growth = config['stat_growth_per_level']
        current_value = min(effective_level * growth, config['stat_cap'])
        
        calculated_stats = {}
        for stat_name in self.stats.keys():
            calculated_stats[stat_name] = round(current_value, 2)
        
        # Calculate weapon stats
        for weapon_key, weapon in self.weapons.items():
            weapon['current_value'] = round(current_value, 2)
            weapon['speed_value'] = round(current_value, 2)
        
        return calculated_stats
    
    def calculate_max_health(self) -> int:
        """Calculate max health based on level and rarity."""
        config = RARITY_CONFIG[self.rarity]
        base_hp = config['base_health']
        hp_per_level = config['health_per_level']
        return base_hp + (self.level - 1) * hp_per_level
    
    def calculate_dps(self) -> float:
        """Calculate total DPS from base stats and weapons."""
        stats = self.calculate_current_stats()
        base_dps = stats.get('base_damage', 0.0) * stats.get('attack', 0.0) / 10.0
        
        # Add weapon DPS (scaled by weapon level)
        weapon_dps = 0.0
        for weapon in self.weapons.values():
            if weapon.get('healing_item'):
                continue  # Skip healing items
            weapon_scale = weapon['current_value'] / 10.0  # 0.0 to 1.0 multiplier
            weapon_dps += weapon['dps'] * weapon_scale
        
        return round(base_dps + weapon_dps, 2)
    
    def has_golden_apple(self) -> bool:
        """Check if soul has Golden Notch Apple."""
        return 'golden_apple' in self.weapons
    
    def add_xp(self, amount: int) -> bool:
        """Add XP and level up if threshold reached. Returns True if leveled up."""
        config = RARITY_CONFIG[self.rarity]
        
        if self.level >= config['max_level']:
            return False
        
        self.xp += amount
        xp_needed = config['xp_per_level']
        
        leveled_up = False
        while self.xp >= xp_needed and self.level < config['max_level']:
            self.xp -= xp_needed
            self.level += 1
            leveled_up = True
        
        if leveled_up:
            # Update stats
            self.stats = self.calculate_current_stats()
        
        return leveled_up
    
    def to_dict(self) -> Dict:
        """Serialize soul to dictionary."""
        return {
            'id': self.id,
            'entity_key': self.entity_key,
            'rarity': self.rarity,
            'level': self.level,
            'xp': self.xp,
            'entity': self.entity,
            'obtained_event': self.obtained_event,
            'obtained_date': self.obtained_date,
            'verified_hash': self.verified_hash,
            'stats': self.stats,
            'weapons': self.weapons,
            'llm_binding': self.llm_binding,
            'memory': self.memory
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'Soul':
        """Deserialize soul from dictionary."""
        soul = cls(
            soul_id=data['id'],
            entity_key=data['entity_key'],
            rarity=data['rarity'],
            obtained_event=data['obtained_event'],
            obtained_date=data['obtained_date'],
            verified_hash=data['verified_hash']
        )
        soul.level = data['level']
        soul.xp = data['xp']
        soul.stats = data['stats']
        soul.weapons = data['weapons']
        soul.llm_binding = data['llm_binding']
        soul.memory = data['memory']
        return soul


# ═══════════════════════════════════════════════════════════════════════════
# SOUL MANAGER
# ═══════════════════════════════════════════════════════════════════════════

class SoulManager:
    """Manages user's soul collection."""
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.souls = self._load_souls()
    
    def _load_souls(self) -> List[Soul]:
        """Load user's souls from file."""
        if not SOULS_FILE.exists():
            return []
        
        with open(SOULS_FILE, 'r') as f:
            all_data = json.load(f)
        
        user_data = all_data.get(self.user_id, {}).get('souls', [])
        return [Soul.from_dict(soul_data) for soul_data in user_data]
    
    def _save_souls(self):
        """Save user's souls to file."""
        all_data = {}
        if SOULS_FILE.exists():
            with open(SOULS_FILE, 'r') as f:
                all_data = json.load(f)
        
        all_data[self.user_id] = {
            'souls': [soul.to_dict() for soul in self.souls]
        }
        
        with open(SOULS_FILE, 'w') as f:
            json.dump(all_data, f, indent=2)
    
    def grant_soul(self, entity_key: str, rarity: str, event_name: str) -> Soul:
        """Grant a new soul to the user."""
        soul_id = str(uuid.uuid4())
        obtained_date = datetime.utcnow().isoformat() + 'Z'
        verified_hash = uuid.uuid4().hex[:16]
        
        soul = Soul(
            soul_id=soul_id,
            entity_key=entity_key,
            rarity=rarity,
            obtained_event=event_name,
            obtained_date=obtained_date,
            verified_hash=verified_hash
        )
        
        self.souls.append(soul)
        self._save_souls()
        return soul
    
    def get_soul(self, soul_id: str) -> Optional[Soul]:
        """Get soul by ID."""
        for soul in self.souls:
            if soul.id == soul_id:
                return soul
        return None
    
    def bind_soul_to_llm(self, soul_id: str, llm_name: str) -> bool:
        """Bind a soul to an LLM."""
        soul = self.get_soul(soul_id)
        if not soul:
            return False
        
        # Unbind any other soul from this LLM
        for s in self.souls:
            if s.llm_binding == llm_name:
                s.llm_binding = None
        
        soul.llm_binding = llm_name
        self._save_souls()
        return True
    
    def unbind_soul(self, soul_id: str) -> bool:
        """Unbind a soul from its LLM."""
        soul = self.get_soul(soul_id)
        if not soul:
            return False
        
        # Reset memory on unbind
        soul.llm_binding = None
        soul.memory = {
            'requests_processed': 0,
            'tokens_processed': 0,
            'scripts_fixed': 0,
            'templates_used': 0,
            'uploads_to_fixnet': 0,
            'last_used': None
        }
        self._save_souls()
        return True


# ═══════════════════════════════════════════════════════════════════════════
# TESTING & VALIDATION
# ═══════════════════════════════════════════════════════════════════════════

def test_dps_scaling():
    """Test DPS calculations across all rarities and levels."""
    print("\n" + "="*80)
    print("DPS SCALING TEST")
    print("="*80)
    
    test_cases = [
        ('common', 'creative', [1, 10, 25, 50]),
        ('uncommon', 'imp', [1, 25, 50, 99]),
        ('angelic', 'phoenix', [1, 50, 128, 256]),
        ('demonic', 'baal', [1, 128, 256, 500, 999]),
        ('celestial', 'azazel', [1, 256, 1000, 5000, 9999])
    ]
    
    for rarity, entity_key, test_levels in test_cases:
        print(f"\n{rarity.upper()} - {entity_key}")
        print("-" * 80)
        
        soul = Soul(
            soul_id=str(uuid.uuid4()),
            entity_key=entity_key,
            rarity=rarity,
            obtained_event="Test Event",
            obtained_date="2024-01-01T00:00:00Z",
            verified_hash="test_hash"
        )
        
        for level in test_levels:
            soul.level = level
            stats = soul.calculate_current_stats()
            dps = soul.calculate_dps()
            
            print(f"Level {level:4d} | Attack: {stats.get('attack', 0):.2f} | "
                  f"Defense: {stats.get('defense', 0):.2f} | "
                  f"Base DMG: {stats.get('base_damage', 0):.2f} | "
                  f"DPS: {dps:.2f}")
            
            if soul.weapons:
                for weapon_key, weapon in soul.weapons.items():
                    print(f"         | {weapon['emoji']} {weapon['name']}: "
                          f"{weapon['current_value']:.2f}/10.0 | "
                          f"Speed: {weapon['speed_value']:.2f}/10.0 | "
                          f"Base DPS: {weapon['dps']}")


def display_soul_loadout(soul: Soul, title: str):
    """Display detailed soul loadout with stats and equipment."""
    stats = soul.calculate_current_stats()
    max_hp = soul.calculate_max_health()
    dps = soul.calculate_dps()
    
    # Calculate total attack power and attack rate
    base_attack_power = stats.get('base_damage', 0)
    total_weapon_damage = 0
    attack_rates = []
    
    for weapon in soul.weapons.values():
        if not weapon.get('healing_item'):
            # Scale weapon damage by weapon level
            weapon_scale = weapon['current_value'] / 10.0
            total_weapon_damage += weapon['base_damage'] * weapon_scale
            attack_rates.append(weapon['attack_speed'])
    
    total_attack_power = base_attack_power + total_weapon_damage
    avg_attack_rate = sum(attack_rates) / len(attack_rates) if attack_rates else 1.0
    
    print("\n" + "=" * 80)
    print(f"{title}")
    print("=" * 80)
    print(f"{soul.entity['emoji']} {soul.entity['name']} - {soul.rarity.upper()} (Level {soul.level})")
    print()
    
    # Traits
    traits_str = ", ".join(soul.entity['traits'])
    print(f"🏷️  Traits: {traits_str}")
    print()
    
    # Stats
    print("⚔️  Combat Stats:")
    print(f"   ❤️  Health: {max_hp} HP")
    print(f"   ⚜️  Attack: {stats.get('attack', 0):.2f}/10.0")
    print(f"   🛡️  Defense: {stats.get('defense', 0):.2f}/10.0")
    print(f"   💥 Base Damage: {stats.get('base_damage', 0):.2f}/10.0")
    if 'speed' in stats:
        print(f"   ⚡ Speed: {stats.get('speed', 0):.2f}/10.0")
    print()
    print("💥 Attack Power:")
    print(f"   🔥 Total Attack Power: {total_attack_power:.2f}")
    print(f"   ⏱️  Attack Rate: {avg_attack_rate:.2f} attacks/second")
    print(f"   🗡️  Total DPS: {dps:.2f} (Power × Rate)")
    print()
    
    # Weapons/Equipment
    if soul.weapons:
        print("🔪 Equipped Weapons:")
        for weapon_key, weapon in soul.weapons.items():
            if weapon.get('healing_item'):
                print(f"   {weapon['emoji']} {weapon['name']} - ✨ HEALING ITEM")
                print(f"      ↪ Triggers at 20% HP, fully heals once per battle")
            else:
                print(f"   {weapon['emoji']} {weapon['name']}")
                print(f"      💥 Damage: {weapon['base_damage']} | ⏱️  Speed: {weapon['attack_speed']}/s | DPS: {weapon['dps']}")
                print(f"      📊 Level: {weapon['current_value']:.2f}/10.0")
    else:
        print("🔪 No Weapons (Base stats only)")
    
    print("=" * 80)


def get_weight_class(rarity: str) -> str:
    """Get weight class name for rarity."""
    weight_classes = {
        'common': 'FEATHERWEIGHT',
        'uncommon': 'LIGHTWEIGHT',
        'angelic': 'MIDDLEWEIGHT',
        'demonic': 'HEAVYWEIGHT',
        'celestial': 'SUPER HEAVYWEIGHT'
    }
    return weight_classes.get(rarity, 'UNKNOWN')


def battle_simulation(soul1: Soul, soul2: Soul) -> Soul:
    """Simulate a battle between two souls. Returns the winner."""
    import time
    
    # Tournament announcement
    print("\n\n")
    print("█" * 80)
    print("█" * 80)
    weight_class = get_weight_class(soul1.rarity)
    print(f"🎪  {weight_class} DIVISION BOUT  🎪".center(80))
    print("█" * 80)
    print("█" * 80)
    print()
    
    # Display both loadouts
    display_soul_loadout(soul1, "🔵 FIGHTER 1 - BLUE CORNER")
    time.sleep(0.5)
    display_soul_loadout(soul2, "🔴 FIGHTER 2 - RED CORNER")
    time.sleep(0.5)
    
    # Face-off
    print("\n" + "=" * 80)
    print("🤜  FACE-OFF  🤛".center(80))
    print("=" * 80)
    print(f"{soul1.entity['emoji']} {soul1.entity['name']:20s} VS {soul2.entity['name']:20s} {soul2.entity['emoji']}".center(80))
    print(f"Level {soul1.level:4d}                                Level {soul2.level:4d}".center(80))
    print("=" * 80)
    print()
    
    # Countdown
    print("📢 FIGHTERS READY...\n")
    time.sleep(1)
    for i in [3, 2, 1]:
        print(f"   {i}...".center(80))
        time.sleep(1)
    print("\n🔔 FIGHT! 🔔\n".center(80))
    time.sleep(0.3)
    
    fighter1_hp = soul1.calculate_max_health()
    fighter2_hp = soul2.calculate_max_health()
    
    fighter1_max_hp = fighter1_hp
    fighter2_max_hp = fighter2_hp
    
    fighter1_dps = soul1.calculate_dps()
    fighter2_dps = soul2.calculate_dps()
    
    fighter1_used_apple = False
    fighter2_used_apple = False
    
    def draw_health_bar(current_hp: float, max_hp: float, width: int = 40) -> str:
        """Draw a visual health bar."""
        percentage = max(0, min(1, current_hp / max_hp))
        filled = int(width * percentage)
        empty = width - filled
        
        # Color based on HP percentage
        if percentage > 0.6:
            bar_char = "█"  # Green
        elif percentage > 0.2:
            bar_char = "█"  # Yellow
        else:
            bar_char = "█"  # Red
        
        bar = bar_char * filled + "░" * empty
        return f"[{bar}] {int(current_hp)}/{int(max_hp)} HP ({percentage*100:.1f}%)"
    
    print("=" * 80)
    print("LIVE BATTLE")
    print("=" * 80)
    print()
    
    # Initial health bars
    print(f"🔵 {soul1.entity['emoji']} {soul1.entity['name']}")
    print(f"   {draw_health_bar(fighter1_hp, fighter1_max_hp)}")
    print()
    print(f"🔴 {soul2.entity['emoji']} {soul2.entity['name']}")
    print(f"   {draw_health_bar(fighter2_hp, fighter2_max_hp)}")
    print()
    print("=" * 80)
    time.sleep(1)
    
    round_num = 0
    while fighter1_hp > 0 and fighter2_hp > 0:
        round_num += 1
        
        # Fighter 1 attacks Fighter 2
        damage1 = fighter1_dps
        fighter2_hp -= damage1
        
        print(f"\n⚔️  Round {round_num}: {soul1.entity['emoji']} {soul1.entity['name']} attacks for {damage1:.2f} damage!")
        
        # Check for Golden Apple trigger (Fighter 2)
        if fighter2_hp <= fighter2_max_hp * 0.2 and soul2.has_golden_apple() and not fighter2_used_apple:
            fighter2_hp = fighter2_max_hp
            fighter2_used_apple = True
            print(f"   ✨ {soul2.entity['name']} uses 🍎 Golden Notch Apple! Fully healed!")
        
        # Show health bars
        print(f"\n🔵 {soul1.entity['emoji']} {soul1.entity['name']}")
        print(f"   {draw_health_bar(fighter1_hp, fighter1_max_hp)}")
        print(f"🔴 {soul2.entity['emoji']} {soul2.entity['name']}")
        print(f"   {draw_health_bar(max(0, fighter2_hp), fighter2_max_hp)}")
        
        if fighter2_hp <= 0:
            break
        
        time.sleep(0.3)
        
        # Fighter 2 attacks Fighter 1
        damage2 = fighter2_dps
        fighter1_hp -= damage2
        
        print(f"\n⚔️  Round {round_num}: {soul2.entity['emoji']} {soul2.entity['name']} attacks for {damage2:.2f} damage!")
        
        # Check for Golden Apple trigger (Fighter 1)
        if fighter1_hp <= fighter1_max_hp * 0.2 and soul1.has_golden_apple() and not fighter1_used_apple:
            fighter1_hp = fighter1_max_hp
            fighter1_used_apple = True
            print(f"   ✨ {soul1.entity['name']} uses 🍎 Golden Notch Apple! Fully healed!")
        
        # Show health bars
        print(f"\n🔵 {soul1.entity['emoji']} {soul1.entity['name']}")
        print(f"   {draw_health_bar(max(0, fighter1_hp), fighter1_max_hp)}")
        print(f"🔴 {soul2.entity['emoji']} {soul2.entity['name']}")
        print(f"   {draw_health_bar(max(0, fighter2_hp), fighter2_max_hp)}")
        
        time.sleep(0.3)
        
        # Pause every 10 rounds to prevent spam
        if round_num % 10 == 0:
            print("\n" + "-" * 80)
            time.sleep(0.5)
    
    print("\n" + "=" * 80)
    if fighter1_hp > 0:
        print(f"🏆 WINNER: {soul1.entity['emoji']} {soul1.entity['name']} with {int(fighter1_hp)} HP remaining!")
        return soul1
    else:
        print(f"🏆 WINNER: {soul2.entity['emoji']} {soul2.entity['name']} with {int(fighter2_hp)} HP remaining!")
        return soul2


def test_battles():
    """Test battles between different rarity tiers."""
    import time
    
    print("\n\n")
    print("⭐" * 40)
    print("⭐" * 40)
    print("🏪  SOUL COMBAT GRAND TOURNAMENT  🏪".center(80))
    print("⭐" * 40)
    print("⭐" * 40)
    print()
    time.sleep(1)
    
    # Create max-level souls for each tier
    common = Soul(str(uuid.uuid4()), 'creative', 'common', 'Test', '2024-01-01', 'hash')
    common.level = 50
    
    uncommon = Soul(str(uuid.uuid4()), 'imp', 'uncommon', 'Test', '2024-01-01', 'hash')
    uncommon.level = 99
    
    angelic = Soul(str(uuid.uuid4()), 'phoenix', 'angelic', 'Test', '2024-01-01', 'hash')
    angelic.level = 256
    
    demonic = Soul(str(uuid.uuid4()), 'baal', 'demonic', 'Test', '2024-01-01', 'hash')
    demonic.level = 999
    
    celestial = Soul(str(uuid.uuid4()), 'azazel', 'celestial', 'Test', '2024-01-01', 'hash')
    celestial.level = 9999
    
    # Battle 1: FEATHERWEIGHT - Common vs Common
    print("\n🏟️  BOUT 1 OF 5")
    common2 = Soul(str(uuid.uuid4()), 'dark', 'common', 'Test', '2024-01-01', 'hash')
    common2.level = 50
    winner1 = battle_simulation(common, common2)
    time.sleep(2)
    
    # Battle 2: LIGHTWEIGHT - Uncommon
    print("\n🏟️  BOUT 2 OF 5")
    winner2 = battle_simulation(uncommon, winner1)
    time.sleep(2)
    
    # Battle 3: MIDDLEWEIGHT - Angelic
    print("\n🏟️  BOUT 3 OF 5")
    winner3 = battle_simulation(angelic, winner2)
    time.sleep(2)
    
    # Battle 4: HEAVYWEIGHT - Demonic
    print("\n🏟️  BOUT 4 OF 5")
    winner4 = battle_simulation(demonic, winner3)
    time.sleep(2)
    
    # Battle 5: CHAMPIONSHIP - SUPER HEAVYWEIGHT - Celestial
    print("\n🏟️  CHAMPIONSHIP BOUT - BOUT 5 OF 5")
    champion = battle_simulation(celestial, winner4)
    time.sleep(1)
    
    # Grand finale
    print("\n\n")
    print("🏆" * 40)
    print("🏆" * 40)
    print("🎪  TOURNAMENT CHAMPION  🎪".center(80))
    print("🏆" * 40)
    print("🏆" * 40)
    print()
    print(f"{champion.entity['emoji']} {champion.entity['name']} - {champion.rarity.upper()} (Level {champion.level})".center(80))
    print()
    traits_str = ", ".join(champion.entity['traits'])
    print(f"Traits: {traits_str}".center(80))
    print()
    print("🏆" * 40)
    


if __name__ == "__main__":
    print("⚜️ Soul Combat System Initialized")
    print(f"📊 Rare Weapons: {len(RARE_WEAPONS)}")
    print(f"📊 Legendary Weapons: {len(LEGENDARY_WEAPONS)}")
    print(f"📊 Divine Weapons: {len(DIVINE_WEAPONS)}")
    print(f"📊 Common Souls: {len(COMMON_SOULS)}")
    print(f"📊 Uncommon Souls: {len(UNCOMMON_SOULS)}")
    print(f"📊 Angelic Souls: {len(ANGELIC_SOULS)}")
    print(f"📊 Demonic Souls: {len(DEMONIC_SOULS)}")
    print(f"📊 Celestial Souls: {len(CELESTIAL_SOULS)}")
    
    # Run DPS tests
    test_dps_scaling()
    
    # Run battle simulations
    test_battles()
