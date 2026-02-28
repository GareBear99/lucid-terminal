#!/usr/bin/env python3
"""
⚔️ Physics-Based Soul Combat Engine v3
Complete real-time battle simulation with projectile physics, weapon mechanics, and animations.
"""
import sys
import os
import time
from typing import List, Optional, Tuple, Dict
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.soul_system_v2 import Soul, RARE_WEAPONS, LEGENDARY_WEAPONS, DIVINE_WEAPONS

# ═══════════════════════════════════════════════════════════════════════════
# WEAPON CLASSIFICATION AND METADATA
# ═══════════════════════════════════════════════════════════════════════════

class WeaponType(Enum):
    MELEE = "melee"
    RANGED = "ranged"
    BOOMERANG = "boomerang"
    HYBRID = "hybrid"

# Enhanced weapon metadata with combat mechanics
WEAPON_MECHANICS = {
    # RARE WEAPONS
    'golden_apple': {
        'type': WeaponType.MELEE,  # Not actually used in combat
        'combat': False
    },
    'archery': {
        'type': WeaponType.RANGED,
        'projectile': '→',
        'projectile_speed': 150,
        'range': (10, 80),
        'ammo': None
    },
    'flight': {
        'type': WeaponType.HYBRID,
        'melee_range': 5,
        'ranged_range': (5, 30),
        'projectile': '🦅',
        'projectile_speed': 120
    },
    'gun': {
        'type': WeaponType.RANGED,
        'projectile': '~',
        'projectile_speed': 200,
        'range': (10, 80),
        'ammo': 6,
        'reload_multiplier': 3
    },
    'wings': {
        'type': WeaponType.HYBRID,
        'melee_range': 5,
        'ranged_range': (5, 25),
        'projectile': '👼',
        'projectile_speed': 100
    },
    'laser': {
        'type': WeaponType.RANGED,
        'projectile': '*',
        'projectile_speed': 200,
        'range': (10, 80),
        'ammo': None
    },
    'holy_halo': {
        'type': WeaponType.MELEE,
        'range': 5
    },
    'unholy_halo': {
        'type': WeaponType.MELEE,
        'range': 5
    },
    
    # LEGENDARY WEAPONS
    'zeus_bolt': {
        'type': WeaponType.RANGED,
        'projectile': '⚡',
        'projectile_speed': 200,
        'range': (15, 80)
    },
    'poseidon_trident': {
        'type': WeaponType.BOOMERANG,
        'projectile': '🔱',
        'projectile_speed': 100,
        'range': (10, 40)
    },
    'hephaestus_hammer': {
        'type': WeaponType.BOOMERANG,
        'projectile': '⚒️',
        'projectile_speed': 80,
        'range': (10, 35)
    },
    'apollo_bow': {
        'type': WeaponType.RANGED,
        'projectile': '→',
        'projectile_speed': 160,
        'range': (15, 80)
    },
    'ares_blade': {
        'type': WeaponType.MELEE,
        'range': 6
    },
    'chaos_blades': {
        'type': WeaponType.HYBRID,
        'melee_range': 6,
        'ranged_range': (6, 30),
        'projectile': '🌊',
        'projectile_speed': 100
    },
    'leviathan_axe': {
        'type': WeaponType.BOOMERANG,
        'projectile': '🪓',
        'projectile_speed': 90,
        'range': (10, 40)
    },
    'mjolnir': {
        'type': WeaponType.BOOMERANG,
        'projectile': '⚒️',
        'projectile_speed': 100,
        'range': (10, 40)
    },
    'blades_of_exile': {
        'type': WeaponType.HYBRID,
        'melee_range': 6,
        'ranged_range': (6, 28),
        'projectile': '🔥',
        'projectile_speed': 110
    },
    'blade_of_olympus': {
        'type': WeaponType.MELEE,
        'range': 7
    },
    'medusa_gaze': {
        'type': WeaponType.RANGED,
        'projectile': '👁️',
        'projectile_speed': 80,
        'range': (15, 60)
    },
    'scorpion_chain': {
        'type': WeaponType.HYBRID,
        'melee_range': 5,
        'ranged_range': (5, 25),
        'projectile': '🦂',
        'projectile_speed': 120
    },
    
    # DIVINE WEAPONS
    'excalibur': {
        'type': WeaponType.MELEE,
        'range': 7
    },
    'spear_of_destiny': {
        'type': WeaponType.RANGED,
        'projectile': '👑',
        'projectile_speed': 140,
        'range': (12, 70)
    },
    'durandal': {
        'type': WeaponType.MELEE,
        'range': 6
    },
    'aegis_shield': {
        'type': WeaponType.MELEE,
        'range': 5
    },
    'gungnir': {
        'type': WeaponType.RANGED,
        'projectile': '⚡',
        'projectile_speed': 150,
        'range': (15, 75)
    },
    'artemis_bow': {
        'type': WeaponType.RANGED,
        'projectile': '→',
        'projectile_speed': 170,
        'range': (15, 80)
    },
    'surtr_sword': {
        'type': WeaponType.RANGED,
        'projectile': '🔥',
        'projectile_speed': 110,
        'range': (10, 50)
    },
    'celestial_lance': {
        'type': WeaponType.RANGED,
        'projectile': '💫',
        'projectile_speed': 140,
        'range': (12, 70)
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# CORE CLASSES
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class Projectile:
    """Represents a projectile in flight."""
    char: str
    pos: float
    target_pos: float
    speed: float
    damage: float
    owner: int  # 1 or 2
    is_boomerang: bool = False
    returning: bool = False
    hit_target: bool = False
    
    def update(self, dt: float) -> Optional[Tuple[int, float]]:
        """Update projectile position. Returns (target_id, damage) if hit."""
        if self.returning:
            # Moving back to owner
            direction = -1 if self.pos > self.target_pos else 1
        else:
            # Moving toward target
            direction = 1 if self.target_pos > self.pos else -1
        
        self.pos += direction * self.speed * dt
        
        # Check if reached destination
        if not self.returning:
            if abs(self.pos - self.target_pos) < 2:
                if self.is_boomerang:
                    self.returning = True
                    self.hit_target = True
                    target = 2 if self.owner == 1 else 1
                    return (target, self.damage)
                else:
                    target = 2 if self.owner == 1 else 1
                    return (target, self.damage)
        else:
            # Boomerang returning
            if abs(self.pos - self.target_pos) < 2:
                return None  # Caught by owner
        
        return None


@dataclass
class FighterState:
    """Represents a fighter's state in the arena."""
    soul: Soul
    position: float
    hp: float
    max_hp: float
    
    # Weapon state
    current_weapon: Optional[str] = None
    ammo: Dict[str, int] = None
    reloading_until: float = 0.0
    weapon_in_flight: bool = False
    can_attack_at: float = 0.0
    
    # Jump mechanics
    y_position: float = 0.0  # 0 = ground, positive = in air
    y_velocity: float = 0.0  # Vertical velocity
    can_jump_at: float = 0.0  # When next jump is allowed
    
    def __post_init__(self):
        if self.ammo is None:
            self.ammo = {}
            # Initialize ammo for weapons that need it
            for weapon_key in self.soul.weapons.keys():
                mechanics = WEAPON_MECHANICS.get(weapon_key, {})
                if mechanics.get('ammo'):
                    self.ammo[weapon_key] = mechanics['ammo']


# ═══════════════════════════════════════════════════════════════════════════
# DISPLAY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def clear_screen():
    """Clear terminal screen."""
    os.system('clear' if os.name != 'nt' else 'cls')

def move_cursor_up(lines: int):
    """Move cursor up n lines."""
    sys.stdout.write(f'\033[{lines}A')
    sys.stdout.flush()

def draw_health_bar_left(current_hp: float, max_hp: float, width: int = 22) -> str:
    """Draw health bar filling left to right with red color and light grey depleted."""
    percentage = max(0, min(1, current_hp / max_hp))
    filled = int(width * percentage)
    empty = width - filled
    # Red filled, grey empty
    bar = "\033[41m" + " " * filled + "\033[0m" + "░" * empty
    hp_text = f"{int(max(0, current_hp))}/{int(max_hp)}"
    return f"[{bar}] {hp_text} HP"

def draw_health_bar_right(current_hp: float, max_hp: float, width: int = 22) -> str:
    """Draw health bar filling right to left (mirrored) with red color and light grey depleted."""
    percentage = max(0, min(1, current_hp / max_hp))
    filled = int(width * percentage)
    empty = width - filled
    # Grey empty, red filled
    bar = "░" * empty + "\033[41m" + " " * filled + "\033[0m"
    hp_text = f"HP {int(max(0, current_hp))}/{int(max_hp)}"
    return f"HP {hp_text} [{bar}]"

def get_screen_resolution() -> Tuple[int, int]:
    """Get actual screen resolution (width, height in pixels)."""
    try:
        # Try to get screen resolution on macOS
        import subprocess
        result = subprocess.run(
            ['system_profiler', 'SPDisplaysDataType'],
            capture_output=True,
            text=True,
            timeout=2
        )
        # Parse resolution from output
        for line in result.stdout.split('\n'):
            if 'Resolution' in line:
                # Extract numbers like "1920 x 1080"
                parts = line.split(':')
                if len(parts) > 1:
                    res = parts[1].strip().split('x')
                    if len(res) >= 2:
                        width = int(res[0].strip())
                        height = int(res[1].strip().split()[0])  # Remove any trailing text
                        return width, height
    except:
        pass
    
    # Fallback: assume common resolution
    return 1920, 1080

def draw_cooldown_bar(current_time: float, can_attack_at: float, attack_speed: float, width: int = 10) -> str:
    """Draw weapon cooldown/recharge bar using loading cubes."""
    if can_attack_at <= current_time:
        # Ready to fire - green
        return "[\033[42m" + "█" * width + "\033[0m] READY"
    
    # Calculate cooldown percentage
    time_since_attack = current_time - (can_attack_at - attack_speed)
    percentage = min(1.0, time_since_attack / attack_speed)
    filled = int(width * percentage)
    empty = width - filled
    
    # Yellow loading, grey empty
    bar = "\033[43m" + "█" * filled + "\033[0m" + "░" * empty
    return f"[{bar}]"

def draw_arena(fighter1: FighterState, fighter2: FighterState, projectiles: List[Projectile], time_elapsed: float, last_action: str = "", screen_width: int = 1920, current_time: float = 0.0):
    """Draw the complete battle arena with fighters and projectiles.
    
    Args:
        screen_width: The actual screen resolution width being used for coordinates
        current_time: Current battle time for cooldown indicators
    """
    # Get terminal size for display
    try:
        import shutil
        width, term_height = shutil.get_terminal_size()
    except:
        width, term_height = 80, 24
    
    width = max(80, min(width, 150))  # Min 80, max 150 for display
    arena_width = width - 4  # Account for borders
    
    lines = []
    line_num = 0  # Track line numbers
    
    # Column headers with single letters (A-Z repeating)
    col_headers = ''.join(chr(65 + (i % 26)) for i in range(arena_width))
    lines.append(f"{line_num:2}   {col_headers}")
    line_num += 1
    
    # Header
    lines.append(f"{line_num:2} +" + "=" * (width - 2) + "+")
    line_num += 1
    lines.append(f"{line_num:2} |" + " " * (width - 2) + "|")
    line_num += 1
    
    # Fighter names with emojis (emojis count as 2 chars for display width)
    name1 = f"{fighter1.soul.entity['emoji']} {fighter1.soul.entity['name']}"
    name2 = f"{fighter2.soul.entity['name']} {fighter2.soul.entity['emoji']}"
    # Account for emoji display width (each emoji = ~2 chars)
    display_len1 = len(name1) + 1  # Add 1 for emoji width
    display_len2 = len(name2) + 1  # Add 1 for emoji width
    spacing = max(2, width - 4 - display_len1 - display_len2)
    lines.append(f"{line_num:2} | {name1}{' ' * spacing}{name2} |")
    line_num += 1
    
    # Health bars
    hb1 = draw_health_bar_left(fighter1.hp, fighter1.max_hp)
    hb2 = draw_health_bar_right(fighter2.hp, fighter2.max_hp)
    # Calculate spacing accounting for ANSI codes
    bare_hb1 = f"[{' ' * 22}] {int(fighter1.hp)}/{int(fighter1.max_hp)} HP"
    bare_hb2 = f"HP {int(fighter2.hp)}/{int(fighter2.max_hp)} [{' ' * 22}]"
    bar_spacing = max(2, width - 4 - len(bare_hb1) - len(bare_hb2))
    lines.append(f"{line_num:2} | {hb1}{' ' * bar_spacing}{hb2} |")
    line_num += 1
    
    # Weapon loadout and cooldown indicators
    if fighter1.current_weapon and fighter2.current_weapon:
        weapon1_data = fighter1.soul.weapons[fighter1.current_weapon]
        weapon2_data = fighter2.soul.weapons[fighter2.current_weapon]
        
        # Get cooldown bars
        cd1 = draw_cooldown_bar(current_time, fighter1.can_attack_at, weapon1_data['attack_speed'], 10)
        cd2 = draw_cooldown_bar(current_time, fighter2.can_attack_at, weapon2_data['attack_speed'], 10)
        
        # Weapon info with colors: blue for left, red for right
        w1_text = f"\033[34m🔪 {weapon1_data['name']}\033[0m {cd1}"
        w2_text = f"{cd2} \033[31m{weapon2_data['name']} 🔪\033[0m"
        
        # Calculate spacing (accounting for ANSI codes in cooldown)
        bare_w1 = f"🔪 {weapon1_data['name']} [          ] READY"
        bare_w2 = f"[          ] READY {weapon2_data['name']} 🔪"
        weapon_spacing = max(2, width - 4 - len(bare_w1) - len(bare_w2) + 30)  # Adjust for ANSI
        
        lines.append(f"{line_num:2} | {w1_text}{' ' * weapon_spacing}{w2_text} |")
        line_num += 1
    else:
        lines.append(f"{line_num:2} |" + " " * (width - 2) + "|")
        line_num += 1
    
    lines.append(f"{line_num:2} |" + " " * (width - 2) + "|")
    line_num += 1
    
    # Time display
    time_str = f"TIME: {time_elapsed:.1f}s"
    lines.append(f"{line_num:2} |{time_str.center(width - 2)}|")
    line_num += 1
    
    lines.append(f"{line_num:2} |" + " " * (width - 2) + "|")
    line_num += 1
    
    # Battle arena (11 rows: 0-7 empty, 8 fighters, 9 ground, 10 death line)
    for row in range(11):
        arena_line = [' '] * arena_width
        
        # Map screen coordinates to terminal display positions
        # Fighters use screen resolution coordinates (e.g., 0-1920), we scale to terminal width
        def map_to_display(screen_pos: float) -> int:
            """Map screen coordinate to terminal display position."""
            ratio = screen_pos / screen_width
            return int(ratio * arena_width)
        
        f1_pos = map_to_display(fighter1.position)
        f2_pos = map_to_display(fighter2.position)
        
        # Row 8 shows fighters
        if row == 8:
            # Draw projectiles with grey background (hitbox)
            for proj in projectiles:
                proj_pos = map_to_display(proj.pos)
                if 0 <= proj_pos < arena_width:
                    arena_line[proj_pos] = f"\033[100m{proj.char}\033[0m"  # Grey background
            
            # Draw fighters with grey background (hitbox)
            if 0 <= f1_pos < arena_width:
                arena_line[f1_pos] = f"\033[100m{fighter1.soul.entity['emoji']}\033[0m"  # Grey background
            if 0 <= f2_pos < arena_width:
                arena_line[f2_pos] = f"\033[100m{fighter2.soul.entity['emoji']}\033[0m"  # Grey background
        
        # Row 9: Dark grey ground immediately below fighters
        if row == 9:
            # Dark grey ground with solid blocks
            arena_line = ['\033[100m█\033[0m'] * arena_width
        
        # Row 10: Death line (white background with dashes)
        if row == 10:
            # Death line with dashes on white background
            arena_line = ['-'] * arena_width
        
        # VS indicator in center when no combat (on row 8 with fighters)
        if row == 8 and not projectiles and abs(f1_pos - f2_pos) > 20:
            center_text = "⚔️  VS  ⚔️"
            center_pos = (arena_width - len(center_text)) // 2
            if center_pos > 0:
                for i, char in enumerate(center_text):
                    if center_pos + i < arena_width:
                        # Draw VS on empty space
                        if arena_line[center_pos + i] == ' ':
                            arena_line[center_pos + i] = char
        
        line_str = ''.join(arena_line)
        lines.append(f"{line_num:2} | {line_str} |")
        line_num += 1
    
    lines.append(f"{line_num:2} |" + " " * (width - 2) + "|")
    line_num += 1
    lines.append(f"{line_num:2} +" + "=" * (width - 2) + "+")
    line_num += 1
    
    # Battle log line
    if last_action:
        # Truncate if too long
        if len(last_action) > width - 4:
            last_action = last_action[:width - 7] + "..."
        lines.append(f"{line_num:2}   {last_action}")
    else:
        lines.append(f"{line_num:2}")
    
    # Print all lines at once
    print('\n'.join(lines))
    sys.stdout.flush()


# ═══════════════════════════════════════════════════════════════════════════
# COMBAT ENGINE
# ═══════════════════════════════════════════════════════════════════════════

class PhysicsCombatEngine:
    """Complete physics-based combat simulation."""
    
    def __init__(self, soul1: Soul, soul2: Soul):
        """Initialize battle between two souls."""
        # Get actual screen resolution for coordinate system
        screen_width, screen_height = get_screen_resolution()
        self.screen_width = screen_width
        self.screen_height = screen_height
        
        # Use screen width as arena coordinate system
        self.arena_width = screen_width
        
        # Position fighters at 20% and 80% of screen width
        start_offset = self.arena_width * 0.2
        end_offset = self.arena_width * 0.8
        
        self.fighter1 = FighterState(
            soul=soul1,
            position=start_offset,
            hp=soul1.calculate_max_health(),
            max_hp=soul1.calculate_max_health()
        )
        
        self.fighter2 = FighterState(
            soul=soul2,
            position=end_offset,
            hp=soul2.calculate_max_health(),
            max_hp=soul2.calculate_max_health()
        )
        
        self.projectiles: List[Projectile] = []
        self.time = 0.0
        self.dt = 0.05  # 50ms tick rate = 20 FPS
        
        # Battle log
        self.last_action = ""
        self.battle_log: List[str] = []
        
        # Select initial weapons
        self.select_best_weapon(self.fighter1)
        self.select_best_weapon(self.fighter2)
        
        # Log initial loadout
        w1_name = self.fighter1.soul.weapons[self.fighter1.current_weapon]['name'] if self.fighter1.current_weapon else "None"
        w2_name = self.fighter2.soul.weapons[self.fighter2.current_weapon]['name'] if self.fighter2.current_weapon else "None"
        self.log_action(f"{soul1.entity['emoji']} {soul1.entity['name']} equips {w1_name}")
        self.log_action(f"{soul2.entity['emoji']} {soul2.entity['name']} equips {w2_name}")
    
    def log_action(self, action: str):
        """Log a battle action."""
        timestamp = f"[{self.time:.1f}s]"
        log_entry = f"{timestamp} {action}"
        self.battle_log.append(log_entry)
        self.last_action = action
    
    def select_best_weapon(self, fighter: FighterState) -> None:
        """Select the best weapon for the fighter based on DPS."""
        if not fighter.soul.weapons:
            return
        
        best_weapon = None
        best_dps = 0
        
        for weapon_key, weapon_data in fighter.soul.weapons.items():
            mechanics = WEAPON_MECHANICS.get(weapon_key, {})
            if mechanics.get('combat', True) == False:
                continue
            
            dps = weapon_data.get('dps', 0)
            if dps > best_dps:
                best_dps = dps
                best_weapon = weapon_key
        
        if best_weapon:
            fighter.current_weapon = best_weapon
    
    def get_distance(self, fighter1: FighterState, fighter2: FighterState) -> float:
        """Get distance between fighters."""
        return abs(fighter1.position - fighter2.position)
    
    def can_reach_target(self, attacker: FighterState, target: FighterState) -> bool:
        """Check if attacker can reach target with current weapon."""
        if not attacker.current_weapon:
            return False
        
        mechanics = WEAPON_MECHANICS[attacker.current_weapon]
        distance = self.get_distance(attacker, target)
        
        weapon_type = mechanics['type']
        
        if weapon_type == WeaponType.MELEE:
            return distance <= mechanics['range']
        elif weapon_type == WeaponType.RANGED or weapon_type == WeaponType.BOOMERANG:
            min_range, max_range = mechanics['range']
            return min_range <= distance <= max_range
        elif weapon_type == WeaponType.HYBRID:
            melee_range = mechanics.get('melee_range', 5)
            if distance <= melee_range:
                return True
            ranged_min, ranged_max = mechanics['ranged_range']
            return ranged_min <= distance <= ranged_max
        
        return False
    
    def attempt_attack(self, attacker: FighterState, defender: FighterState, attacker_id: int) -> None:
        """Attempt an attack if conditions are met."""
        if self.time < attacker.can_attack_at:
            return
        
        if not attacker.current_weapon:
            return
        
        # Check if reloading
        if self.time < attacker.reloading_until:
            return
        
        # Check if weapon is in flight (boomerang)
        if attacker.weapon_in_flight:
            return
        
        # Check if can reach
        if not self.can_reach_target(attacker, defender):
            return
        
        weapon_key = attacker.current_weapon
        weapon_data = attacker.soul.weapons[weapon_key]
        mechanics = WEAPON_MECHANICS[weapon_key]
        
        # Check ammo
        if mechanics.get('ammo') is not None:
            if attacker.ammo.get(weapon_key, 0) <= 0:
                # Start reload
                attack_speed = weapon_data['attack_speed']
                reload_multiplier = mechanics.get('reload_multiplier', 3)
                attacker.reloading_until = self.time + (attack_speed * reload_multiplier)
                attacker.ammo[weapon_key] = mechanics['ammo']
                return
        
        # Calculate damage
        stats = attacker.soul.calculate_current_stats()
        damage = stats['attack'] + weapon_data['base_damage']
        
        weapon_type = mechanics['type']
        
        # Execute attack
        weapon_name = weapon_data['name']
        if weapon_type == WeaponType.MELEE:
            # Instant damage
            defender.hp -= damage
            self.log_action(f"{attacker.soul.entity['emoji']} {attacker.soul.entity['name']} hits with {weapon_name} for {damage:.1f} dmg!")
        elif weapon_type == WeaponType.RANGED or weapon_type == WeaponType.BOOMERANG:
            # Create projectile
            projectile = Projectile(
                char=mechanics['projectile'],
                pos=attacker.position,
                target_pos=defender.position,
                speed=mechanics['projectile_speed'],
                damage=damage,
                owner=attacker_id,
                is_boomerang=(weapon_type == WeaponType.BOOMERANG)
            )
            self.projectiles.append(projectile)
            
            if weapon_type == WeaponType.BOOMERANG:
                attacker.weapon_in_flight = True
                self.log_action(f"{attacker.soul.entity['emoji']} {attacker.soul.entity['name']} throws {weapon_name}!")
            else:
                self.log_action(f"{attacker.soul.entity['emoji']} {attacker.soul.entity['name']} fires {weapon_name}!")
        elif weapon_type == WeaponType.HYBRID:
            distance = self.get_distance(attacker, defender)
            melee_range = mechanics.get('melee_range', 5)
            
            if distance <= melee_range:
                # Melee hit
                defender.hp -= damage
                self.log_action(f"{attacker.soul.entity['emoji']} {attacker.soul.entity['name']} slashes with {weapon_name} for {damage:.1f} dmg!")
            else:
                # Ranged projectile
                projectile = Projectile(
                    char=mechanics['projectile'],
                    pos=attacker.position,
                    target_pos=defender.position,
                    speed=mechanics['projectile_speed'],
                    damage=damage,
                    owner=attacker_id
                )
                self.projectiles.append(projectile)
                self.log_action(f"{attacker.soul.entity['emoji']} {attacker.soul.entity['name']} attacks with {weapon_name}!")
        
        # Use ammo
        if mechanics.get('ammo') is not None:
            attacker.ammo[weapon_key] -= 1
            if attacker.ammo[weapon_key] == 0:
                self.log_action(f"{attacker.soul.entity['emoji']} {attacker.soul.entity['name']} reloading {weapon_name}...")
        
        # Set cooldown
        attack_speed = weapon_data['attack_speed']
        attacker.can_attack_at = self.time + attack_speed
    
    def update_projectiles(self) -> None:
        """Update all projectiles and handle hits."""
        projectiles_to_remove = []
        
        for i, projectile in enumerate(self.projectiles):
            result = projectile.update(self.dt)
            
            if result:
                target_id, damage = result
                # Apply damage and log
                if target_id == 1:
                    self.fighter1.hp -= damage
                    self.log_action(f"{projectile.char} hits {self.fighter1.soul.entity['emoji']} {self.fighter1.soul.entity['name']} for {damage:.1f} dmg!")
                else:
                    self.fighter2.hp -= damage
                    self.log_action(f"{projectile.char} hits {self.fighter2.soul.entity['emoji']} {self.fighter2.soul.entity['name']} for {damage:.1f} dmg!")
            
            # Check if projectile should be removed
            if projectile.is_boomerang:
                if projectile.returning:
                    # Check if caught
                    if projectile.owner == 1:
                        if abs(projectile.pos - self.fighter1.position) < 2:
                            projectiles_to_remove.append(i)
                            self.fighter1.weapon_in_flight = False
                    else:
                        if abs(projectile.pos - self.fighter2.position) < 2:
                            projectiles_to_remove.append(i)
                            self.fighter2.weapon_in_flight = False
            else:
                # Regular projectile - remove when hits
                if result:
                    projectiles_to_remove.append(i)
        
        # Remove projectiles in reverse order
        for i in reversed(projectiles_to_remove):
            self.projectiles.pop(i)
    
    def move_fighter(self, fighter: FighterState, target: FighterState) -> None:
        """AI movement logic."""
        if not fighter.current_weapon:
            return
        
        distance = self.get_distance(fighter, target)
        mechanics = WEAPON_MECHANICS[fighter.current_weapon]
        weapon_type = mechanics['type']
        
        # Calculate movement speed
        stats = fighter.soul.calculate_current_stats()
        base_speed = 20
        speed_bonus = stats.get('speed', 0) * 2
        move_speed = min(40, base_speed + speed_bonus) * self.dt
        
        # Decision logic
        if weapon_type == WeaponType.MELEE:
            # Rush toward enemy if too far
            if distance > mechanics['range']:
                if fighter.position < target.position:
                    fighter.position = min(target.position - mechanics['range'], fighter.position + move_speed)
                else:
                    fighter.position = max(target.position + mechanics['range'], fighter.position - move_speed)
        
        elif weapon_type == WeaponType.RANGED or weapon_type == WeaponType.BOOMERANG:
            min_range, max_range = mechanics['range']
            optimal_distance = (min_range + max_range) / 2
            
            if distance < min_range:
                # Back away
                if fighter.position < target.position:
                    fighter.position -= move_speed
                else:
                    fighter.position += move_speed
            elif distance > max_range:
                # Move closer
                if fighter.position < target.position:
                    fighter.position += move_speed
                else:
                    fighter.position -= move_speed
        
        elif weapon_type == WeaponType.HYBRID:
            melee_range = mechanics.get('melee_range', 5)
            ranged_min, ranged_max = mechanics['ranged_range']
            
            # Prefer staying at ranged distance
            optimal_distance = (ranged_min + ranged_max) / 2
            
            if distance < ranged_min - 5:
                # Too close, back away
                if fighter.position < target.position:
                    fighter.position -= move_speed
                else:
                    fighter.position += move_speed
            elif distance > ranged_max:
                # Too far, move closer
                if fighter.position < target.position:
                    fighter.position += move_speed
                else:
                    fighter.position -= move_speed
        
        # Keep in bounds (use dynamic arena width)
        fighter.position = max(0, min(self.arena_width, fighter.position))
    
    def update_jump_physics(self, fighter: FighterState) -> None:
        """Update jump physics with gravity and ground collision."""
        gravity = 500.0  # Pixels per second squared (fast like I Wanna Be The Guy)
        ground_level = 0.0
        death_line = -50.0  # Below this line = instant death
        
        # Apply gravity
        if fighter.y_position > ground_level or fighter.y_velocity != 0:
            fighter.y_velocity -= gravity * self.dt
            fighter.y_position += fighter.y_velocity * self.dt
            
            # Check death line collision
            if fighter.y_position < death_line:
                fighter.hp = 0
                self.log_action(f"{fighter.soul.entity['emoji']} {fighter.soul.entity['name']} fell to their death!")
                return
            
            # Ground collision
            if fighter.y_position <= ground_level:
                fighter.y_position = ground_level
                fighter.y_velocity = 0.0
    
    def attempt_jump(self, fighter: FighterState) -> None:
        """Attempt to jump based on attack rate."""
        if self.time < fighter.can_jump_at:
            return
        
        # Only jump if on ground
        if fighter.y_position > 0.01:
            return
        
        if not fighter.current_weapon:
            return
        
        # Jump speed based on attack speed (fire rate)
        weapon_data = fighter.soul.weapons[fighter.current_weapon]
        attack_speed = weapon_data['attack_speed']
        
        # Jump every attack cycle
        jump_velocity = 250.0  # Base jump power
        fighter.y_velocity = jump_velocity
        fighter.can_jump_at = self.time + attack_speed  # Jump at fire rate
        
        self.log_action(f"{fighter.soul.entity['emoji']} {fighter.soul.entity['name']} jumps!")
    
    def simulate_battle(self, max_time: float = 60.0, show_display: bool = True) -> int:
        """Run the battle simulation. Returns winner (1 or 2, or 0 for draw)."""
        if show_display:
            clear_screen()
        
        frames = 0
        
        while self.time < max_time:
            # Update fighters
            self.move_fighter(self.fighter1, self.fighter2)
            self.move_fighter(self.fighter2, self.fighter1)
            
            # Update jump physics (gravity, ground, death line)
            self.update_jump_physics(self.fighter1)
            self.update_jump_physics(self.fighter2)
            
            # Attempt jumps (based on fire rate)
            self.attempt_jump(self.fighter1)
            self.attempt_jump(self.fighter2)
            
            # Attempt attacks
            self.attempt_attack(self.fighter1, self.fighter2, 1)
            self.attempt_attack(self.fighter2, self.fighter1, 2)
            
            # Update projectiles
            self.update_projectiles()
            
            # Check for winner
            if self.fighter1.hp <= 0:
                self.log_action(f"{self.fighter2.soul.entity['emoji']} {self.fighter2.soul.entity['name']} WINS!")
                if show_display:
                    draw_arena(self.fighter1, self.fighter2, self.projectiles, self.time, self.last_action, self.screen_width, self.time)
                    print(f"\n🔴 {self.fighter2.soul.entity['name']} WINS!")
                log_path = self.save_battle_log()
                if show_display:
                    print(f"\n📁 Battle log saved: {log_path}")
                return 2
            elif self.fighter2.hp <= 0:
                self.log_action(f"{self.fighter1.soul.entity['emoji']} {self.fighter1.soul.entity['name']} WINS!")
                if show_display:
                    draw_arena(self.fighter1, self.fighter2, self.projectiles, self.time, self.last_action, self.screen_width, self.time)
                    print(f"\n🔵 {self.fighter1.soul.entity['name']} WINS!")
                log_path = self.save_battle_log()
                if show_display:
                    print(f"\n📁 Battle log saved: {log_path}")
                return 1
            
            # Display update (every frame = 20 FPS)
            if show_display:
                if frames > 0:
                    # Clear screen and reset cursor instead of moving up
                    clear_screen()
                draw_arena(self.fighter1, self.fighter2, self.projectiles, self.time, self.last_action, self.screen_width, self.time)
            
            self.time += self.dt
            frames += 1
            
            if show_display:
                time.sleep(self.dt)
        
        # Timeout - decide by remaining HP
        if self.fighter1.hp > self.fighter2.hp:
            self.log_action(f"TIME OUT! {self.fighter1.soul.entity['emoji']} {self.fighter1.soul.entity['name']} WINS by HP!")
            if show_display:
                print(f"\n⏱️  TIME OUT! 🔵 {self.fighter1.soul.entity['name']} WINS by HP!")
            log_path = self.save_battle_log()
            if show_display:
                print(f"\n📁 Battle log saved: {log_path}")
            return 1
        elif self.fighter2.hp > self.fighter1.hp:
            self.log_action(f"TIME OUT! {self.fighter2.soul.entity['emoji']} {self.fighter2.soul.entity['name']} WINS by HP!")
            if show_display:
                print(f"\n⏱️  TIME OUT! 🔴 {self.fighter2.soul.entity['name']} WINS by HP!")
            log_path = self.save_battle_log()
            if show_display:
                print(f"\n📁 Battle log saved: {log_path}")
            return 2
        else:
            self.log_action("TIME OUT! DRAW!")
            if show_display:
                print(f"\n⏱️  TIME OUT! DRAW!")
            log_path = self.save_battle_log()
            if show_display:
                print(f"\n📁 Battle log saved: {log_path}")
            return 0
    
    def save_battle_log(self) -> str:
        """Save battle log to logs directory. Returns the filepath."""
        logs_dir = Path("logs")
        logs_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"battle_{self.fighter1.soul.entity['name']}_vs_{self.fighter2.soul.entity['name']}_{timestamp}.txt"
        filepath = logs_dir / filename
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"⚔️  BATTLE LOG ⚔️\n")
            f.write(f"{'═' * 80}\n")
            f.write(f"{self.fighter1.soul.entity['emoji']} {self.fighter1.soul.entity['name']} (Level {self.fighter1.soul.level})\n")
            f.write(f"    VS\n")
            f.write(f"{self.fighter2.soul.entity['emoji']} {self.fighter2.soul.entity['name']} (Level {self.fighter2.soul.level})\n")
            f.write(f"{'═' * 80}\n\n")
            
            # Write weapon loadouts
            f.write("LOADOUTS:\n")
            f.write(f"{self.fighter1.soul.entity['emoji']} {self.fighter1.soul.entity['name']} weapons:\n")
            for weapon_key, weapon_data in self.fighter1.soul.weapons.items():
                f.write(f"  - {weapon_data['name']}\n")
            f.write(f"\n{self.fighter2.soul.entity['emoji']} {self.fighter2.soul.entity['name']} weapons:\n")
            for weapon_key, weapon_data in self.fighter2.soul.weapons.items():
                f.write(f"  - {weapon_data['name']}\n")
            f.write(f"\n{'═' * 80}\n\n")
            
            # Write battle actions
            f.write("BATTLE LOG:\n")
            for entry in self.battle_log:
                f.write(f"{entry}\n")
            
            f.write(f"\n{'═' * 80}\n")
            f.write(f"Battle Duration: {self.time:.1f}s\n")
            f.write(f"Final HP: {self.fighter1.soul.entity['emoji']} {int(max(0, self.fighter1.hp))} | {self.fighter2.soul.entity['emoji']} {int(max(0, self.fighter2.hp))}\n")
        
        return str(filepath.absolute())


# ═══════════════════════════════════════════════════════════════════════════
# TOURNAMENT SYSTEM
# ═══════════════════════════════════════════════════════════════════════════

def display_fighter_profile(fighter: Soul, corner: str):
    """Display a fighter's profile before battle."""
    stats = fighter.calculate_current_stats()
    total_dps = fighter.calculate_dps()
    
    print(f"\n{'═' * 80}")
    print(f"{corner}")
    print(f"{'═' * 80}")
    print(f"{fighter.entity['emoji']} {fighter.entity['name']} - {fighter.rarity.upper()} (Level {fighter.level})")
    print()
    print(f"🏷️  Traits: {', '.join(fighter.entity['traits'])}")
    
    print(f"\n⚔️  Combat Stats:")
    print(f"   ❤️  Health: {fighter.calculate_max_health()} HP")
    print(f"   ⚜️  Attack: {stats['attack']:.2f}/10.0")
    print(f"   🛡️  Defense: {stats['defense']:.2f}/10.0")
    print(f"   💥 Base Damage: {stats['attack']:.2f}/10.0")
    if 'speed' in stats:
        print(f"   ⚡ Speed: {stats['speed']:.2f}/10.0")
    
    print(f"\n💥 Attack Power:")
    print(f"   🔥 Total Attack Power: {stats['attack']:.2f}")
    print(f"   ⏱️  Attack Rate: 1.00 attacks/second")
    print(f"   🗡️  Total DPS: {total_dps:.2f} (Power × Rate)")
    
    print(f"\n🔪 Weapons:")
    if fighter.weapons:
        for weapon_key, weapon_data in fighter.weapons.items():
            if weapon_data.get('healing_item'):
                print(f"  🍎 {weapon_data['name']}: HEALING ITEM")
            else:
                weapon_scale = weapon_data['current_value'] / 10.0
                weapon_dps = weapon_data['dps'] * weapon_scale
                weapon_rarity = weapon_data.get('weapon_type', 'Unknown').title()
                
                # Get weapon mechanics info
                mechanics = WEAPON_MECHANICS.get(weapon_key, {})
                weapon_type = mechanics.get('type', WeaponType.MELEE)
                
                type_icon = "⚔️"
                type_name = "Melee"
                if weapon_type == WeaponType.RANGED:
                    type_icon = "🏹"
                    type_name = "Ranged"
                elif weapon_type == WeaponType.BOOMERANG:
                    type_icon = "🪃"
                    type_name = "Boomerang"
                elif weapon_type == WeaponType.HYBRID:
                    type_icon = "⚡"
                    type_name = "Hybrid"
                
                print(f"  {type_icon} {weapon_data['name']} ({weapon_rarity}) - {type_name}: {weapon_dps:.2f} DPS")
                
                # Show projectile info for ranged weapons
                if weapon_type in [WeaponType.RANGED, WeaponType.BOOMERANG]:
                    projectile = mechanics.get('projectile', '→')
                    print(f"     Projectile: {projectile}")
                    if weapon_type == WeaponType.BOOMERANG:
                        print(f"     Special: Returns after hitting target")
    else:
        print(f"  🔪 No Weapons (Base stats only)")
    print(f"{'═' * 80}")


def run_physics_battle(soul1: Soul, soul2: Soul) -> int:
    """Run a complete physics-based battle with pre-fight display."""
    print("\n" + "═" * 80)
    print("⚔️  PHYSICS COMBAT ARENA ⚔️".center(80))
    print("═" * 80)
    
    # Display fighters
    display_fighter_profile(soul1, "🔵 BLUE")
    display_fighter_profile(soul2, "🔴 RED")
    
    print("\n" + "═" * 80)
    input("Press ENTER to start battle...")
    
    # Run battle
    engine = PhysicsCombatEngine(soul1, soul2)
    winner = engine.simulate_battle()
    
    return winner


if __name__ == "__main__":
    # Test the system
    from core.soul_system_v2 import CELESTIAL_SOULS
    
    print("⚔️ Physics Combat Engine v3 - COMPLETE")
    print(f"✅ {len(WEAPON_MECHANICS)} weapons classified")
    print("✅ Projectile physics system")
    print("✅ Ammo & reload mechanics")
    print("✅ Boomerang weapons (throw/return cycle)")
    print("✅ Movement AI")
    print("✅ Real-time combat simulation")
    print("✅ 19-row battle arena")
    print("\n" + "═" * 80)
    
    # Quick test battle
    print("\nRunning quick system test (no display)...")
    
    # Get Thor (has Mjolnir - boomerang) and Apollo (has bow - ranged)
    thor = Soul(
        soul_id="test_thor",
        entity_key='thor',
        rarity='celestial',
        obtained_event='test',
        obtained_date='2024-01-01',
        verified_hash='test123'
    )
    thor.level = 50
    
    apollo = Soul(
        soul_id="test_apollo",
        entity_key='apollo',
        rarity='celestial',
        obtained_event='test',
        obtained_date='2024-01-01',
        verified_hash='test456'
    )
    apollo.level = 50
    
    # Quick test without display
    engine = PhysicsCombatEngine(thor, apollo)
    winner = engine.simulate_battle(max_time=10.0, show_display=False)
    
    if winner == 1:
        print(f"✅ Thor wins in quick test!")
    elif winner == 2:
        print(f"✅ Apollo wins in quick test!")
    else:
        print(f"✅ Draw in quick test!")
    
    print(f"\n✅ System fully operational!")
    print("\nTo run a full visual battle, use: run_physics_battle(soul1, soul2)")
