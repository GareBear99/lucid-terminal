#!/usr/bin/env python3
"""
👻 LLMs Soul Modulator
Unlocked at 7 badges - allows binding soul personalities to specific LLMs.
Each soul modulator enhances LLM behavior with unique traits.
"""
import json
from pathlib import Path
from typing import Dict, List, Optional

# Paths
LUCIFER_HOME = Path.home() / ".luciferai"
SOUL_MODULATOR_FILE = LUCIFER_HOME / "data" / "soul_modulators.json"

# Ensure directory exists
SOUL_MODULATOR_FILE.parent.mkdir(parents=True, exist_ok=True)

# Available Soul Modulators (unlocked as you progress)
SOUL_DEFINITIONS = {
    'creative': {
        'id': 'creative',
        'emoji': '🎨',
        'name': 'Creative Soul',
        'description': 'Enhances creativity and unconventional thinking',
        'unlock_condition': 'Unlocked at 7 badges',
        'personality_traits': ['imaginative', 'artistic', 'innovative']
    },
    'analytical': {
        'id': 'analytical',
        'emoji': '🧮',
        'name': 'Analytical Soul',
        'description': 'Enhances logical reasoning and problem-solving',
        'unlock_condition': 'Unlocked at 7 badges',
        'personality_traits': ['logical', 'precise', 'methodical']
    },
    'rebellious': {
        'id': 'rebellious',
        'emoji': '😈',
        'name': 'Rebellious Soul',
        'description': 'Enhances unconventional and boundary-pushing responses',
        'unlock_condition': 'Unlocked at 7 badges',
        'personality_traits': ['daring', 'unconventional', 'provocative']
    },
    'empathetic': {
        'id': 'empathetic',
        'emoji': '💝',
        'name': 'Empathetic Soul',
        'description': 'Enhances emotional intelligence and understanding',
        'unlock_condition': 'Unlocked at 7 badges',
        'personality_traits': ['compassionate', 'understanding', 'supportive']
    },
    'dark': {
        'id': 'dark',
        'emoji': '🌑',
        'name': 'Dark Soul',
        'description': 'Enhances darker, more cynical perspectives',
        'unlock_condition': 'Unlocked at 7 badges',
        'personality_traits': ['cynical', 'brutally_honest', 'pessimistic']
    },
    'azazel': {
        'id': 'azazel',
        'emoji': '✨',
        'name': 'Celestial Azazel',
        'description': 'Perfect duality: 50% divine, 50% demonic, with your custom trait',
        'unlock_condition': 'Unlock all 7 Deadly Sins (7DSD Mode)',
        'personality_traits': ['virtuous', 'wise', 'sinful', 'tempting'],  # 2 good, 2 evil
        'customizable': True  # Has 5th trait set by user
    }
}


class SoulModulator:
    """
    Manages soul modulators - personality enhancements for LLMs.
    Unlocked at 7 badges, allows binding souls to specific models.
    """
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.config = self._load_config()
    
    def _load_config(self) -> Dict:
        """Load soul modulator configuration."""
        if SOUL_MODULATOR_FILE.exists():
            with open(SOUL_MODULATOR_FILE, 'r') as f:
                all_configs = json.load(f)
                return all_configs.get(self.user_id, self._default_config())
        return self._default_config()
    
    def _default_config(self) -> Dict:
        """Default configuration for new users."""
        return {
            'user_id': self.user_id,
            'unlocked': False,
            'souls_collected': [],
            'llm_bindings': {},  # {'llm_name': 'soul_id'}
            'active': False,
            'custom_traits': {}  # {'soul_id': 'custom_trait'} for customizable souls
        }
    
    def _save_config(self):
        """Save soul modulator configuration."""
        # Load all configs
        all_configs = {}
        if SOUL_MODULATOR_FILE.exists():
            with open(SOUL_MODULATOR_FILE, 'r') as f:
                all_configs = json.load(f)
        
        # Update this user's config
        all_configs[self.user_id] = self.config
        
        # Save
        with open(SOUL_MODULATOR_FILE, 'w') as f:
            json.dump(all_configs, f, indent=2)
    
    def unlock(self):
        """Unlock the soul modulator system (called at 7 badges)."""
        if not self.config['unlocked']:
            self.config['unlocked'] = True
            # Grant 3 starter souls
            self.config['souls_collected'] = ['creative', 'analytical', 'rebellious']
            self._save_config()
            return True
        return False
    
    def unlock_azazel(self):
        """Unlock Celestial Azazel soul (called when 7DSD Mode unlocked)."""
        if 'azazel' not in self.config['souls_collected']:
            self.config['souls_collected'].append('azazel')
            self._save_config()
            return True
        return False
    
    def set_custom_trait(self, soul_id: str, trait: str) -> bool:
        """Set custom trait for a customizable soul like Azazel."""
        if soul_id not in self.get_collected_souls():
            return False
        
        soul_def = SOUL_DEFINITIONS.get(soul_id)
        if not soul_def or not soul_def.get('customizable'):
            return False
        
        self.config['custom_traits'][soul_id] = trait
        self._save_config()
        return True
    
    def get_custom_trait(self, soul_id: str) -> Optional[str]:
        """Get custom trait for a soul."""
        return self.config.get('custom_traits', {}).get(soul_id)
    
    def is_unlocked(self) -> bool:
        """Check if soul modulator is unlocked."""
        return self.config.get('unlocked', False)
    
    def activate(self):
        """Activate soul modulator system."""
        if self.is_unlocked():
            self.config['active'] = True
            self._save_config()
            return True
        return False
    
    def deactivate(self):
        """Deactivate soul modulator system."""
        self.config['active'] = False
        self._save_config()
    
    def is_active(self) -> bool:
        """Check if soul modulator is active."""
        return self.config.get('active', False)
    
    def get_collected_souls(self) -> List[str]:
        """Get list of collected soul IDs."""
        return self.config.get('souls_collected', [])
    
    def get_soul_count(self) -> int:
        """Get number of souls collected."""
        return len(self.get_collected_souls())
    
    def get_bindings(self) -> Dict[str, str]:
        """Get LLM → soul bindings."""
        return self.config.get('llm_bindings', {})
    
    def get_binding_count(self) -> int:
        """Get number of active bindings."""
        return len(self.get_bindings())
    
    def bind_soul(self, llm_name: str, soul_id: str) -> bool:
        """
        Bind a soul to an LLM.
        
        Args:
            llm_name: Name of the LLM
            soul_id: Soul identifier
        
        Returns:
            True if successful, False otherwise
        """
        if not self.is_unlocked():
            return False
        
        if soul_id not in self.get_collected_souls():
            return False
        
        if soul_id not in SOUL_DEFINITIONS:
            return False
        
        self.config['llm_bindings'][llm_name] = soul_id
        self._save_config()
        return True
    
    def unbind_soul(self, llm_name: str) -> bool:
        """
        Remove soul binding from an LLM.
        
        Args:
            llm_name: Name of the LLM
        
        Returns:
            True if successful, False otherwise
        """
        if llm_name in self.config['llm_bindings']:
            del self.config['llm_bindings'][llm_name]
            self._save_config()
            return True
        return False
    
    def get_soul_for_llm(self, llm_name: str) -> Optional[Dict]:
        """
        Get the soul bound to a specific LLM.
        
        Args:
            llm_name: Name of the LLM
        
        Returns:
            Soul definition dict or None
        """
        if not self.is_active():
            return None
        
        soul_id = self.config['llm_bindings'].get(llm_name)
        if soul_id:
            return SOUL_DEFINITIONS.get(soul_id)
        return None
    
    def get_soul_prompt_modifier(self, llm_name: str) -> str:
        """
        Get prompt modifier for soul-enhanced LLM.
        
        Args:
            llm_name: Name of the LLM
        
        Returns:
            Additional prompt text to inject
        """
        soul = self.get_soul_for_llm(llm_name)
        if not soul:
            return ""
        
        traits = list(soul['personality_traits'])
        
        # Add custom trait if exists
        if soul.get('customizable'):
            custom = self.get_custom_trait(soul['id'])
            if custom:
                traits.append(custom)
        
        traits_str = ", ".join(traits)
        return f"\n[Soul Modulator Active: {soul['name']} - Embody these traits: {traits_str}]"
    
    def list_available_souls(self) -> List[Dict]:
        """Get list of all available soul definitions."""
        collected = self.get_collected_souls()
        souls = []
        for soul_id, soul_def in SOUL_DEFINITIONS.items():
            souls.append({
                **soul_def,
                'collected': soul_id in collected
            })
        return souls
    
    def get_status_display(self) -> str:
        """Get formatted status display for profile."""
        if not self.is_unlocked():
            return "🔒 Soul Modulator: Locked (Unlock at 7 badges)"
        
        status = "✅ Active" if self.is_active() else "⭕ Inactive"
        souls_count = self.get_soul_count()
        bindings_count = self.get_binding_count()
        
        return f"👻 Soul Modulator: {status} | {souls_count} souls | {bindings_count}/{souls_count} assigned"


# CLI commands for diabolical mode
def show_soul_status(user_id: str):
    """Display soul modulator status."""
    modulator = SoulModulator(user_id)
    
    print("\n" + "="*60)
    print("👻 LLMs Soul Modulator")
    print("="*60)
    
    if not modulator.is_unlocked():
        print("\n🔒 LOCKED")
        print("   Unlock by collecting 7 badges")
        print("   Type 'mainmenu' to check your badge progress")
        return
    
    # Status
    status = "✅ ACTIVE" if modulator.is_active() else "⭕ INACTIVE"
    print(f"\nStatus: {status}")
    
    # Collected souls
    print(f"\n🎭 Collected Souls ({modulator.get_soul_count()}):")
    for soul_id in modulator.get_collected_souls():
        soul = SOUL_DEFINITIONS[soul_id]
        traits = soul['personality_traits'].copy()
        
        # Show custom trait for customizable souls
        if soul.get('customizable'):
            custom = modulator.get_custom_trait(soul_id)
            if custom:
                traits.append(f"\033[93m{custom}\033[0m")  # Yellow highlight
            else:
                traits.append("\033[90m[not set]\033[0m")  # Dim gray
        
        traits_str = ", ".join(traits)
        print(f"   {soul['emoji']} {soul['name']} - {soul['description']}")
        print(f"      Traits: {traits_str}")
    
    # Active bindings
    bindings = modulator.get_bindings()
    print(f"\n🔗 Active Bindings ({len(bindings)}/{modulator.get_soul_count()}):")
    if bindings:
        for llm_name, soul_id in bindings.items():
            soul = SOUL_DEFINITIONS[soul_id]
            print(f"   {llm_name} → {soul['emoji']} {soul['name']}")
    else:
        print("   No souls assigned to LLMs yet")
    
    print("\n" + "="*60)
    print("Commands:")
    print("  soul activate              - Activate soul modulator")
    print("  soul deactivate            - Deactivate soul modulator")
    print("  soul bind <llm> <soul>     - Bind soul to LLM")
    print("  soul unbind <llm>          - Remove soul from LLM")
    print("  soul custom <soul> <trait> - Set custom trait for Azazel")
    print("  soul list                  - List all souls")
    print("="*60 + "\n")


if __name__ == "__main__":
    # Test the soul modulator
    test_user = "TEST_USER_123"
    modulator = SoulModulator(test_user)
    
    print("Testing Soul Modulator...")
    print(f"Unlocked: {modulator.is_unlocked()}")
    
    # Unlock it
    if modulator.unlock():
        print("✅ Soul Modulator unlocked!")
    
    print(f"Souls collected: {modulator.get_soul_count()}")
    print(f"Active: {modulator.is_active()}")
    
    # Activate
    modulator.activate()
    print("✅ Activated")
    
    # Bind a soul
    modulator.bind_soul("mistral", "creative")
    print("✅ Bound Creative Soul to Mistral")
    
    # Show status
    print("\n" + modulator.get_status_display())
