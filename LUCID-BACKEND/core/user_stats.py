#!/usr/bin/env python3
"""
📊 User Stats & Contribution Tracking
Tracks user contributions to consensus for proper attribution and leaderboards.
"""
import json
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
from collections import defaultdict

# Paths
LUCIFER_HOME = Path.home() / ".luciferai"
USER_STATS_FILE = LUCIFER_HOME / "data" / "user_stats.json"
TEMPLATES_FILE = LUCIFER_HOME / "consensus" / "templates" / "local_templates.json"
FIX_DICTIONARY = LUCIFER_HOME / "data" / "fix_dictionary.json"

# Ensure directory exists
USER_STATS_FILE.parent.mkdir(parents=True, exist_ok=True)

# Badge 0: Role Status - Special status badge (doesn't count toward 13-badge collection)
# Levels: Member (0), Moderator (1), Admin (2), Founder (∞)
BADGE_0_ROLES = {
    'member': {
        'id': 'member',
        'emoji': '👤',
        'name': 'Member',
        'level': 0,
        'hint': 'LuciferAI community member'
    },
    'moderator': {
        'id': 'moderator',
        'emoji': '🛡️',
        'name': 'Moderator',
        'level': 1,
        'hint': 'Community moderator'
    },
    'admin': {
        'id': 'admin',
        'emoji': '⚙️',
        'name': 'Admin',
        'level': 2,
        'hint': 'System administrator'
    },
    'founder': {
        'id': 'founder',
        'emoji': '🏆',
        'name': 'Founder',
        'level': '∞',
        'hint': 'Creator of LuciferAI'
    }
}

# Badge definitions with 4-level progression system (Badges 1-13)
# Level 0: ??? ??? ??? (locked)
# Level 1: I ??? ??? (33% progress)
# Level 2: I I ??? (66% progress)
# Level 3: I I I (99% progress)
# Level 4: Full unlock - emoji + name revealed
BADGE_DEFINITIONS = [
    {
        'id': 'first_contribution',
        'emoji': '🌱',
        'name': 'First Contribution',
        'hint': 'Make 20 contributions',
        'levels': [
            {'threshold': 20, 'desc': 'Make 20 contributions'},
        ]
    },
    {
        'id': 'active_contributor',
        'emoji': '🌿',
        'name': 'Active Contributor',
        'hint': 'Reach 200 contributions',
        'levels': [
            {'threshold': 20, 'desc': 'Make 20 contributions'},
            {'threshold': 40, 'desc': 'Make 40 contributions'},
            {'threshold': 60, 'desc': 'Make 60 contributions'},
            {'threshold': 200, 'desc': 'Make 200 contributions'},
        ]
    },
    {
        'id': 'veteran_contributor',
        'emoji': '🌳',
        'name': 'Veteran Contributor',
        'hint': 'Reach 1000 contributions',
        'levels': [
            {'threshold': 150, 'desc': 'Make 150 contributions'},
            {'threshold': 250, 'desc': 'Make 250 contributions'},
            {'threshold': 350, 'desc': 'Make 350 contributions'},
            {'threshold': 1000, 'desc': 'Make 1000 contributions'},
        ]
    },
    {
        'id': 'elite_contributor',
        'emoji': '⭐',
        'name': 'Elite Contributor',
        'hint': 'Reach 2000 contributions',
        'levels': [
            {'threshold': 550, 'desc': 'Make 550 contributions'},
            {'threshold': 650, 'desc': 'Make 650 contributions'},
            {'threshold': 750, 'desc': 'Make 750 contributions'},
            {'threshold': 2000, 'desc': 'Make 2000 contributions'},  # Massive final jump!
        ]
    },
    {
        'id': 'template_master',
        'emoji': '📚',
        'name': 'Template Master',
        'hint': 'Create 400 templates',
        'levels': [
            {'threshold': 30, 'desc': 'Create 30 templates'},
            {'threshold': 60, 'desc': 'Create 60 templates'},
            {'threshold': 100, 'desc': 'Create 100 templates'},
            {'threshold': 400, 'desc': 'Create 400 templates'},
        ]
    },
    {
        'id': 'fix_specialist',
        'emoji': '🔧',
        'name': 'Fix Specialist',
        'hint': 'Create 400 fixes',
        'levels': [
            {'threshold': 30, 'desc': 'Create 30 fixes'},
            {'threshold': 60, 'desc': 'Create 60 fixes'},
            {'threshold': 100, 'desc': 'Create 100 fixes'},
            {'threshold': 400, 'desc': 'Create 400 fixes'},
        ]
    },
    {
        'id': 'community_favorite',
        'emoji': '🌟',
        'name': 'Community Favorite',
        'hint': 'Get 2000 downloads',
        'levels': [
            {'threshold': 100, 'desc': 'Get 100 downloads'},
            {'threshold': 250, 'desc': 'Get 250 downloads'},
            {'threshold': 400, 'desc': 'Get 400 downloads'},
            {'threshold': 2000, 'desc': 'Get 2000 downloads'},
        ]
    },
    {
        'id': 'quality_contributor',
        'emoji': '💎',
        'name': 'Quality Contributor',
        'hint': 'Maintain 4.5+ avg rating',
        'levels': [
            {'threshold': 3.0, 'desc': 'Reach 3.0 avg rating'},
            {'threshold': 3.5, 'desc': 'Reach 3.5 avg rating'},
            {'threshold': 4.0, 'desc': 'Reach 4.0 avg rating'},
            {'threshold': 4.5, 'desc': 'Reach 4.5 avg rating'},  # Rating stays the same (not 45.0!)
        ]
    },
    {
        'id': 'first_fix_to_fixnet',
        'emoji': '🌐',
        'name': 'First Fix to FixNet',
        'hint': 'Upload 20 fixes to FixNet',
        'levels': [
            {'threshold': 20, 'desc': 'Upload 20 fixes to FixNet'},
        ]
    },
    {
        'id': 'first_template_to_fixnet',
        'emoji': '📦',
        'name': 'First Template to FixNet',
        'hint': 'Upload 20 templates to FixNet',
        'levels': [
            {'threshold': 20, 'desc': 'Upload 20 templates to FixNet'},
        ]
    },
    {
        'id': 'learning_experience',
        'emoji': '🔴',
        'name': 'Learning Experience',
        'hint': 'Have 20 fixes tested by others',
        'levels': [
            {'threshold': 20, 'desc': 'Have 20 fixes tested by someone'},
        ]
    },
    {
        'id': 'problem_solver',
        'emoji': '✅',
        'name': 'Problem Solver',
        'hint': 'Help 20 people with your fixes',
        'levels': [
            {'threshold': 20, 'desc': 'Have 20 fixes succeed for someone'},
        ]
    },
    {
        'id': 'template_pioneer',
        'emoji': '🚀',
        'name': 'Template Pioneer',
        'hint': 'Have 20 templates used successfully',
        'levels': [
            {'threshold': 20, 'desc': 'Have 20 templates used successfully'},
        ]
    }
]

# SECRET BADGES: 7 Deadly Sins
# Collecting all 7 unlocks "7DSD Mode" (7 Deadly Sins Diabolical Mode) aka "Trojan Mode"
# These badges are hidden and don't show until unlocked
SECRET_BADGE_DEFINITIONS = [
    {
        'id': 'sin_pride',
        'emoji': '👑',
        'name': 'Pride',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Collect all 13 base badges',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Complete the 13-badge collection'},
        ]
    },
    {
        'id': 'sin_greed',
        'emoji': '💰',
        'name': 'Greed',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Reach 5000+ total contributions',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Make 5000+ contributions'},
        ]
    },
    {
        'id': 'sin_wrath',
        'emoji': '🔥',
        'name': 'Wrath',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Use diabolical mode 100+ times',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Enter diabolical mode 100 times'},
        ]
    },
    {
        'id': 'sin_envy',
        'emoji': '👀',
        'name': 'Envy',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Download 1000+ fixes/templates from FixNet',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Download 1000+ items from others'},
        ]
    },
    {
        'id': 'sin_lust',
        'emoji': '💋',
        'name': 'Lust',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Use LuciferAI for 365+ days',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Use LuciferAI for a full year'},
        ]
    },
    {
        'id': 'sin_gluttony',
        'emoji': '🍔',
        'name': 'Gluttony',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Generate 50,000+ lines of code',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Generate 50,000+ lines'},
        ]
    },
    {
        'id': 'sin_sloth',
        'emoji': '😴',
        'name': 'Sloth',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Auto-fix 2000+ errors without manual intervention',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Let AI handle 2000+ fixes automatically'},
        ]
    }
]

# EASTER EGG BADGES: Fun hidden achievements
# These are discovered through specific actions or inputs
EASTEREGG_BADGE_DEFINITIONS = [
    {
        'id': 'easteregg_birthday',
        'emoji': '🎂',
        'name': "It's My Birthday!!!",
        'hint': 'Type a special date...',
        'unlock_condition': 'Type 8/25/1999 or 08/25/1999 or 8/25/99',
        'trigger_inputs': ['8/25/1999', '08/25/1999', '8/25/99', '08/25/99', '25/8/1999', '25/08/1999'],
        'easteregg': True,
        'levels': [
            {'threshold': 1, 'desc': 'Discovered the birthday secret!'},
        ]
    },
    {
        'id': 'easteregg_konami',
        'emoji': '🎮',
        'name': 'Konami Code',
        'hint': 'Try a classic cheat code...',
        'unlock_condition': 'Type "up up down down left right left right b a"',
        'trigger_inputs': ['up up down down left right left right b a', 'konami', 'konami code'],
        'easteregg': True,
        'levels': [
            {'threshold': 1, 'desc': 'Classic gamer achievement!'},
        ]
    },
    {
        'id': 'easteregg_devil',
        'emoji': '👿',
        'name': 'Speak of the Devil',
        'hint': 'Say the magic number...',
        'unlock_condition': 'Type 666 or say "hail lucifer"',
        'trigger_inputs': ['666', 'hail lucifer', 'hail satan', 'praise lucifer'],
        'easteregg': True,
        'levels': [
            {'threshold': 1, 'desc': 'The devil is in the details'},
        ]
    },
    {
        'id': 'easteregg_matrix',
        'emoji': '🕴️',
        'name': 'I Know Kung Fu',
        'hint': 'Follow the white rabbit...',
        'unlock_condition': 'Type "follow the white rabbit" or "red pill" or "blue pill"',
        'trigger_inputs': ['follow the white rabbit', 'red pill', 'blue pill', 'matrix', 'wake up neo'],
        'easteregg': True,
        'levels': [
            {'threshold': 1, 'desc': 'You took the red pill'},
        ]
    },
    {
        'id': 'easteregg_42',
        'emoji': '🧮',
        'name': 'Life, Universe, Everything',
        'hint': 'What is the answer?',
        'unlock_condition': 'Type 42 or "the answer is 42"',
        'trigger_inputs': ['42', 'the answer is 42', 'forty two', 'forty-two'],
        'easteregg': True,
        'levels': [
            {'threshold': 1, 'desc': "Don't panic!"},
        ]
    }
]

# Secret Badges: 7 Deadly Sins (unlocks 7DSD Mode / Trojan Mode)
# These are hidden until unlocked and trigger special diabolical capabilities
SECRET_BADGE_DEFINITIONS = [
    {
        'id': 'sin_pride',
        'emoji': '👑',
        'name': 'Pride',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Reach #1 on leaderboard',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Hidden achievement'},
        ]
    },
    {
        'id': 'sin_greed',
        'emoji': '💰',
        'name': 'Greed',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Collect 100+ total badges across all achievements',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Hidden achievement'},
        ]
    },
    {
        'id': 'sin_wrath',
        'emoji': '🔥',
        'name': 'Wrath',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Report 50+ bugs or issues',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Hidden achievement'},
        ]
    },
    {
        'id': 'sin_envy',
        'emoji': '👀',
        'name': 'Envy',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Download 500+ fixes/templates from others',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Hidden achievement'},
        ]
    },
    {
        'id': 'sin_lust',
        'emoji': '💋',
        'name': 'Lust',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Use LuciferAI for 100+ consecutive days',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Hidden achievement'},
        ]
    },
    {
        'id': 'sin_gluttony',
        'emoji': '🍔',
        'name': 'Gluttony',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Generate 10,000+ lines of code',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Hidden achievement'},
        ]
    },
    {
        'id': 'sin_sloth',
        'emoji': '😴',
        'name': 'Sloth',
        'hint': '??? Secret Sin Badge ???',
        'unlock_condition': 'Let LuciferAI auto-fix 1000+ errors without manual intervention',
        'secret': True,
        'levels': [
            {'threshold': 1, 'desc': 'Hidden achievement'},
        ]
    }
]


class UserStatsTracker:
    """
    Track user contributions to FixNet consensus.
    Provides stats, history, and leaderboard functionality.
    """
    
    def __init__(self):
        self.stats = self._load_stats()
    
    def _load_stats(self) -> Dict:
        """Load user statistics."""
        if USER_STATS_FILE.exists():
            with open(USER_STATS_FILE, 'r') as f:
                return json.load(f)
        return {}
    
    def _save_stats(self):
        """Save user statistics."""
        with open(USER_STATS_FILE, 'w') as f:
            json.dump(self.stats, f, indent=2)
    
    def get_user_profile(self, user_id: str) -> Dict:
        """
        Get complete profile for a user.
        
        Returns:
            Dict with user stats, contributions, and badges
        """
        if user_id not in self.stats:
            return {
                'user_id': user_id,
                'total_templates': 0,
                'total_fixes': 0,
                'total_downloads': 0,
                'avg_rating': 0.0,
                'badges': [],
                'joined': datetime.now().isoformat(),
                'last_contribution': None
            }
        
        return self.stats[user_id]
    
    def update_user_stats(self, user_id: str, contribution_type: str, 
                         item_hash: str, item_name: str):
        """
        Update user stats when they contribute a template or fix.
        
        Args:
            user_id: User's client ID
            contribution_type: 'template' or 'fix'
            item_hash: Hash of the contributed item
            item_name: Name/description of the item
        """
        if user_id not in self.stats:
            self.stats[user_id] = {
                'user_id': user_id,
                'total_templates': 0,
                'total_fixes': 0,
                'total_downloads': 0,
                'avg_rating': 0.0,
                'badges': [],
                'joined': datetime.now().isoformat(),
                'last_contribution': None,
                'contributions': []
            }
        
        profile = self.stats[user_id]
        
        # Update counts
        if contribution_type == 'template':
            profile['total_templates'] += 1
        elif contribution_type == 'fix':
            profile['total_fixes'] += 1
        
        # Add to contribution history
        contribution = {
            'type': contribution_type,
            'hash': item_hash,
            'name': item_name,
            'timestamp': datetime.now().isoformat()
        }
        
        if 'contributions' not in profile:
            profile['contributions'] = []
        
        profile['contributions'].append(contribution)
        profile['last_contribution'] = datetime.now().isoformat()
        
        # Award badges
        self._award_badges(user_id)
        
        self._save_stats()
    
    def _award_badges(self, user_id: str):
        """
        Award badges based on contribution milestones.
        13 total badges (Badges 1-13) covering various achievements.
        Badge 0 (Founder/Member) is handled separately and not counted here.
        Uses badge IDs instead of full emoji+name strings.
        """
        profile = self.stats[user_id]
        badges = set(profile.get('badges', []))
        
        total = profile['total_templates'] + profile['total_fixes']
        
        # 1. Contribution level badges
        if total >= 1:
            badges.add('first_contribution')
        if total >= 10:
            badges.add('active_contributor')
        if total >= 50:
            badges.add('veteran_contributor')
        if total >= 100:
            badges.add('elite_contributor')
        
        # 6-7. Specialist badges
        if profile['total_templates'] >= 20:
            badges.add('template_master')
        if profile['total_fixes'] >= 20:
            badges.add('fix_specialist')
        
        # 8-9. Community badges
        if profile.get('total_downloads', 0) >= 100:
            badges.add('community_favorite')
        if profile.get('avg_rating', 0) >= 4.5:
            badges.add('quality_contributor')
        
        # 6-7. First FixNet upload badges
        if profile.get('first_fix_uploaded_to_fixnet', False):
            badges.add('first_fix_to_fixnet')
        if profile.get('first_template_uploaded_to_fixnet', False):
            badges.add('first_template_to_fixnet')
        
        # 8-10. Community validation badges
        if profile.get('first_fix_failed_by_user', False):
            badges.add('learning_experience')
        if profile.get('first_fix_succeeded_for_user', False):
            badges.add('problem_solver')
        if profile.get('first_template_used_successfully', False):
            badges.add('template_pioneer')
        
        profile['badges'] = list(badges)
    
    def get_badge_display(self, badge_id: str) -> dict:
        """
        Get display info for a badge.
        
        Args:
            badge_id: Badge identifier
        
        Returns:
            Dict with emoji, name, and other metadata
        """
        for badge_def in BADGE_DEFINITIONS:
            if badge_def['id'] == badge_id:
                return badge_def
        return None
    
    def _calculate_badge_progress(self, user_id: str, badge_def: dict) -> int:
        """
        Calculate progress level (0-4) for a badge.
        
        Args:
            user_id: User's client ID
            badge_def: Badge definition dict
        
        Returns:
            Progress level: 0 (locked), 1 (I), 2 (II), 3 (III), 4 (unlocked)
        """
        profile = self.get_user_profile(user_id)
        badge_id = badge_def['id']
        
        # Check if fully unlocked
        if badge_id in profile.get('badges', []):
            return 4
        
        # Calculate progress based on badge type
        total = profile['total_templates'] + profile['total_fixes']
        
        # Get current value for this badge type
        if badge_id == 'first_contribution':
            current_value = total
        elif badge_id in ['active_contributor', 'veteran_contributor', 'elite_contributor']:
            current_value = total
        elif badge_id == 'template_master':
            current_value = profile['total_templates']
        elif badge_id == 'fix_specialist':
            current_value = profile['total_fixes']
        elif badge_id == 'community_favorite':
            current_value = profile.get('total_downloads', 0)
        elif badge_id == 'quality_contributor':
            current_value = profile.get('avg_rating', 0)
        elif badge_id == 'first_fix_to_fixnet':
            current_value = 1 if profile.get('first_fix_uploaded_to_fixnet', False) else 0
        elif badge_id == 'first_template_to_fixnet':
            current_value = 1 if profile.get('first_template_uploaded_to_fixnet', False) else 0
        elif badge_id == 'learning_experience':
            current_value = 1 if profile.get('first_fix_failed_by_user', False) else 0
        elif badge_id == 'problem_solver':
            current_value = 1 if profile.get('first_fix_succeeded_for_user', False) else 0
        elif badge_id == 'template_pioneer':
            current_value = 1 if profile.get('first_template_used_successfully', False) else 0
        else:
            current_value = 0
        
        # Determine level based on thresholds
        levels = badge_def.get('levels', [])
        if not levels:
            return 0
        
        # Count how many levels achieved (but not fully unlocked yet)
        level = 0
        for i, level_def in enumerate(levels):
            if current_value >= level_def['threshold']:
                level = min(i + 1, 3)  # Max level 3 before full unlock
        
        return level
    
    def _get_roman_numeral_display(self, level: int, badge_emoji: str) -> str:
        """
        Get badge display with Roman numerals for progress.
        Red ❓ shows locked badge, ? represents remaining levels.
        
        Args:
            level: Progress level (0-4)
            badge_emoji: The actual badge emoji to show once unlocked
        
        Returns:
            String like "❓ ???" or "🌿 I??" or "🌿 II?" or "🌿 III"
        """
        if level == 0:
            return f"❓ ???"
        elif level == 1:
            return f"{badge_emoji} I??"
        elif level == 2:
            return f"{badge_emoji} II?"
        elif level == 3:
            return f"{badge_emoji} III"
        else:
            return ""  # Fully unlocked, show emoji + name instead
    
    def check_easteregg_trigger(self, user_id: str, user_input: str) -> Optional[str]:
        """
        Check if user input triggers an easter egg badge.
        
        Args:
            user_id: User's client ID
            user_input: The text the user typed
        
        Returns:
            Badge name if triggered, None otherwise
        """
        profile = self.get_user_profile(user_id)
        unlocked_eggs = set(profile.get('badges', []))
        
        # Normalize input
        input_lower = user_input.lower().strip()
        
        # Check each easter egg
        for egg_def in EASTEREGG_BADGE_DEFINITIONS:
            # Skip if already unlocked
            if egg_def['id'] in unlocked_eggs:
                continue
            
            # Check if input matches any trigger
            for trigger in egg_def['trigger_inputs']:
                if trigger.lower() in input_lower or input_lower == trigger.lower():
                    # Award the badge!
                    if egg_def['id'] not in profile.get('badges', []):
                        if 'badges' not in profile:
                            profile['badges'] = []
                        profile['badges'].append(egg_def['id'])
                        self._save_stats()
                        return egg_def['name']
        
        return None
    
    def get_badge_0_status(self, user_id: str) -> dict:
        """
        Get Badge 0 status (Founder or Member).
        This badge doesn't count toward the 13-badge collection.
        
        Args:
            user_id: User's client ID
        
        Returns:
            Badge 0 status dict
        """
        from core.founder_config import is_founder
        
        if is_founder(user_id):
            badge = BADGE_0_ROLES['founder']
        else:
            badge = BADGE_0_ROLES['member']
        
        return {
            'id': badge['id'],
            'emoji': badge['emoji'],
            'name': badge['name'],
            'hint': badge['hint'],
            'is_badge_0': True,
            'unlocked': True  # Badge 0 is always unlocked
        }
    
    def get_all_badges_status(self, user_id: str) -> list:
        """
        Get status of all badges for a user with progress levels.
        This returns Badges 1-13 only (excludes Badge 0: Founder/Member).
        
        Args:
            user_id: User's client ID
        
        Returns:
            List of badge dicts with 'unlocked' status and progress levels
        """
        profile = self.get_user_profile(user_id)
        unlocked_badges = set(profile.get('badges', []))
        
        badges_status = []
        for badge_def in BADGE_DEFINITIONS:
            is_unlocked = badge_def['id'] in unlocked_badges
            progress_level = self._calculate_badge_progress(user_id, badge_def)
            
            # Determine display
            if is_unlocked or progress_level == 4:
                emoji = badge_def['emoji']
                name = badge_def['name']
                progress_display = ""
            else:
                # Show compact Roman numeral progress: ❓ ???, 🌿 I??, 🌿 II?, 🌿 III
                progress_display = self._get_roman_numeral_display(progress_level, badge_def['emoji'])
                emoji = progress_display
                name = "???"
            
            # Get next milestone hint
            next_milestone = ""
            if not is_unlocked and progress_level < 4:
                levels = badge_def.get('levels', [])
                if levels and progress_level < len(levels):
                    next_milestone = levels[progress_level]['desc']
            
            badges_status.append({
                'id': badge_def['id'],
                'emoji': emoji,
                'name': name,
                'hint': badge_def['hint'],
                'progress_level': progress_level,
                'progress_display': progress_display,
                'next_milestone': next_milestone,
                'unlocked': is_unlocked or progress_level == 4
            })
        
        return badges_status
    
    def calculate_badge_collection_progress(self, user_id: str) -> dict:
        """
        Calculate overall badge collection progress (Badges 1-13 only).
        Badge 0 (Founder/Member) is excluded from the collection count.
        
        Args:
            user_id: User's client ID
        
        Returns:
            Dict with progress percentage, unlocked count, and rewards info
        """
        badges_status = self.get_all_badges_status(user_id)
        
        # Total possible progress: 13 badges * 4 levels each = 52 total levels
        # (Level 4 = unlocked, so we count levels 0-4)
        # NOTE: Badge 0 (Founder/Member) is NOT counted
        total_levels = 0
        max_levels = len(BADGE_DEFINITIONS) * 4  # 13 badges * 4 levels = 52
        
        unlocked_count = 0
        for badge in badges_status:
            level = badge['progress_level']
            total_levels += level
            if badge['unlocked']:
                unlocked_count += 1
        
        # Calculate percentage (0-100)
        percentage = int((total_levels / max_levels) * 100) if max_levels > 0 else 0
        
        # Determine reward status
        reward_7_unlocked = unlocked_count >= 7
        reward_13_unlocked = unlocked_count >= 13
        
        return {
            'total_levels': total_levels,
            'max_levels': max_levels,
            'percentage': percentage,
            'unlocked_count': unlocked_count,
            'total_badges': len(BADGE_DEFINITIONS),
            'reward_7_unlocked': reward_7_unlocked,
            'reward_13_unlocked': reward_13_unlocked,
            'next_reward': 7 if unlocked_count < 7 else (13 if unlocked_count < 13 else None)
        }
    
    def get_progress_bar(self, percentage: int, width: int = 20) -> str:
        """
        Generate a visual progress bar.
        
        Args:
            percentage: Progress percentage (0-100)
            width: Width of the bar in characters
        
        Returns:
            Progress bar string like [████████░░░░░░░░░░░░] 40%
        """
        filled = int((percentage / 100) * width)
        empty = width - filled
        bar = '█' * filled + '░' * empty
        return f"[{bar}] {percentage}%"
    
    def calculate_user_score(self, user_id: str) -> int:
        """
        Calculate contribution score for a user.
        
        Scoring:
        - Template: 10 points
        - Fix: 5 points
        - Download: 1 point
        - High rating (4.5+): 20 bonus points
        """
        profile = self.get_user_profile(user_id)
        
        score = 0
        score += profile['total_templates'] * 10
        score += profile['total_fixes'] * 5
        score += profile.get('total_downloads', 0) * 1
        
        if profile.get('avg_rating', 0) >= 4.5:
            score += 20
        
        return score
    
    def get_leaderboard(self, top_n: int = 10) -> List[Dict]:
        """
        Get top contributors leaderboard.
        
        Args:
            top_n: Number of top users to return
        
        Returns:
            List of user profiles sorted by score
        """
        leaderboard = []
        
        for user_id, profile in self.stats.items():
            score = self.calculate_user_score(user_id)
            leaderboard.append({
                **profile,
                'score': score
            })
        
        # Sort by score (descending)
        leaderboard.sort(key=lambda x: x['score'], reverse=True)
        
        return leaderboard[:top_n]
    
    def rebuild_stats_from_consensus(self):
        """
        Rebuild user stats from existing consensus data.
        Useful for initial migration or data recovery.
        """
        # Clear existing stats
        self.stats = {}
        
        # Scan templates
        if TEMPLATES_FILE.exists():
            with open(TEMPLATES_FILE, 'r') as f:
                templates = json.load(f)
            
            for template_hash, template in templates.items():
                user_id = template.get('author', 'unknown')
                if user_id and user_id != 'unknown':
                    self.update_user_stats(
                        user_id=user_id,
                        contribution_type='template',
                        item_hash=template_hash,
                        item_name=template.get('name', 'Unknown')
                    )
        
        # Scan fixes
        if FIX_DICTIONARY.exists():
            with open(FIX_DICTIONARY, 'r') as f:
                fix_dict = json.load(f)
            
            for key, fixes in fix_dict.items():
                for fix in fixes:
                    user_id = fix.get('user_id', 'unknown')
                    if user_id and user_id != 'unknown':
                        self.update_user_stats(
                            user_id=user_id,
                            contribution_type='fix',
                            item_hash=fix.get('fix_hash', 'unknown'),
                            item_name=f"{fix.get('error_type', 'Unknown')} - {fix.get('script_name', 'Unknown')}"
                        )
        
        print(f"✅ Rebuilt stats for {len(self.stats)} user(s)")
    
    def get_user_history(self, user_id: str, limit: int = 20) -> List[Dict]:
        """
        Get contribution history for a user.
        
        Args:
            user_id: User's client ID
            limit: Max number of recent contributions to return
        
        Returns:
            List of contributions (most recent first)
        """
        profile = self.get_user_profile(user_id)
        contributions = profile.get('contributions', [])
        
        # Sort by timestamp (most recent first)
        contributions.sort(key=lambda x: x['timestamp'], reverse=True)
        
        return contributions[:limit]
    
    def search_user_contributions(self, user_id: str, 
                                  contribution_type: Optional[str] = None,
                                  keyword: Optional[str] = None) -> List[Dict]:
        """
        Search a user's contributions with filters.
        
        Args:
            user_id: User's client ID
            contribution_type: Filter by 'template' or 'fix'
            keyword: Search in contribution names
        
        Returns:
            List of matching contributions
        """
        contributions = self.get_user_history(user_id, limit=1000)
        
        results = []
        for contrib in contributions:
            # Type filter
            if contribution_type and contrib['type'] != contribution_type:
                continue
            
            # Keyword filter
            if keyword and keyword.lower() not in contrib['name'].lower():
                continue
            
            results.append(contrib)
        
        return results
    
    def print_user_profile(self, user_id: str):
        """Print formatted user profile."""
        profile = self.get_user_profile(user_id)
        score = self.calculate_user_score(user_id)
        
        print("\n" + "="*60)
        print(f"👤 User Profile: {user_id}")
        
        # Show founder label if applicable
        if user_id == "B35EE32A34CE37C2":
            print(f"   🏆 (Founder)")
        
        print("="*60 + "\n")
        
        print(f"📊 Statistics:")
        print(f"   • Total Score: {score}")
        print(f"   • Templates: {profile['total_templates']}")
        print(f"   • Fixes: {profile['total_fixes']}")
        print(f"   • Downloads: {profile.get('total_downloads', 0)}")
        print(f"   • Avg Rating: {profile.get('avg_rating', 0):.1f}/5.0")
        print()
        
        if profile.get('badges'):
            print(f"🏅 Badges:")
            for badge in profile['badges']:
                print(f"   {badge}")
            print()
        
        print(f"📅 Activity:")
        print(f"   • Joined: {profile.get('joined', 'Unknown')[:10]}")
        if profile.get('last_contribution'):
            print(f"   • Last Contribution: {profile['last_contribution'][:10]}")
        print()
        
        # Recent contributions
        recent = self.get_user_history(user_id, limit=5)
        if recent:
            print(f"📝 Recent Contributions (last 5):")
            for i, contrib in enumerate(recent, 1):
                print(f"   {i}. [{contrib['type'].upper()}] {contrib['name']}")
                print(f"      {contrib['timestamp'][:10]} - {contrib['hash'][:12]}...")
            print()
        
        print("="*60 + "\n")


# CLI interface
if __name__ == "__main__":
    import sys
    
    tracker = UserStatsTracker()
    
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "rebuild":
            print("🔄 Rebuilding user stats from consensus...")
            tracker.rebuild_stats_from_consensus()
        
        elif command == "profile" and len(sys.argv) > 2:
            user_id = sys.argv[2]
            tracker.print_user_profile(user_id)
        
        elif command == "leaderboard":
            print("\n🏆 Top Contributors Leaderboard\n")
            print("="*60)
            
            leaderboard = tracker.get_leaderboard(10)
            for rank, user in enumerate(leaderboard, 1):
                print(f"{rank}. {user['user_id']} (Score: {user['score']})")
                if user.get('badges'):
                    print(f"   {' '.join(user['badges'][:3])}")
                print(f"   Templates: {user['total_templates']} | Fixes: {user['total_fixes']}")
                print()
            
            print("="*60 + "\n")
    else:
        print("Usage:")
        print("  python3 user_stats.py rebuild")
        print("  python3 user_stats.py profile <user_id>")
        print("  python3 user_stats.py leaderboard")
