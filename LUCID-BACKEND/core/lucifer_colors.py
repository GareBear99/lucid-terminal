#!/usr/bin/env python3
"""
🎨 LuciferAI Color & Emoji System
Centralized color psychology + emoji feedback system
"""
import time
import random

# ═══════════════════════════════════════════════════════════
# 🧩 1. ANSI Color Codes
# ═══════════════════════════════════════════════════════════

class Colors:
    """ANSI color codes for terminal output."""
    # Primary Accent (Lucifer Purple)
    PURPLE = "\033[95m"
    LUCIFER = "\033[95m"
    
    # Success / Greenlight
    GREEN = "\033[92m"
    SUCCESS = "\033[92m"
    
    # Warning / Caution Yellow
    YELLOW = "\033[93m"
    WARNING = "\033[93m"
    
    # Error / Failure Red
    RED = "\033[91m"
    ERROR = "\033[91m"
    
    # Info / Calm Cyan
    CYAN = "\033[96m"
    INFO = "\033[96m"
    
    # Blue
    BLUE = "\033[94m"
    
    # White / Reset
    WHITE = "\033[0m"
    RESET = "\033[0m"
    
    # Grey (Dim Log)
    GREY = "\033[90m"
    DIM = "\033[90m"
    
    # Bold
    BOLD = "\033[1m"
    
    # Blends (combine multiple)
    PURPLE_CYAN = "\033[95;96m"
    GREEN_PURPLE = "\033[92;95m"
    BLUE_PURPLE = "\033[94;95m"


# ═══════════════════════════════════════════════════════════
# 🎯 2. Emoji Library
# ═══════════════════════════════════════════════════════════

class Emojis:
    """Emoji identity markers."""
    # Core Identity
    LUCIFER = "👾"
    SKULL = "💀"
    SKULL_BONES = "☠️"
    HEARTBEAT = "🩸"
    BRAIN = "🧠"
    PUZZLE = "🧩"
    
    # States
    IDLE = "🩸"
    PROCESSING = "💀"
    REFLECTING = "🧠"
    
    # Success & Magic
    SPARKLE = "✨"
    SPARKLES = "✨"
    ROCKET = "🚀"
    CHECKMARK = "✅"
    CHECK = "✔️"
    
    # Authentication
    LOCKED = "🔒"
    UNLOCKED = "🔓"
    ENCRYPTED = "🔐"
    
    # Errors & Warnings
    CROSS = "❌"
    WARNING = "⚠️"
    BANDAGE = "🩹"
    
    # Actions
    WRENCH = "🔧"
    HAMMER = "🛠️"
    MICROSCOPE = "🔬"
    PLAY = "▶️"
    EXIT = "🔚"
    
    # Files & Data
    FILE = "📄"
    FOLDER = "📁"
    SCROLL = "📜"
    COMPRESS = "🗜️"
    RECEIPT = "🧾"
    
    # Network
    GLOBE = "🌐"
    GALAXY = "🌌"
    GHOST = "👻"
    
    # Info
    LIGHTBULB = "💡"
    ROBOT = "🤖"
    CLIPBOARD = "📋"
    BOOK = "📖"
    LOCATION = "📍"
    MAGNIFIER = "🔍"
    LIGHTNING = "⚡"
    FIRE = "🔥"
    TARGET = "🎯"


# ═══════════════════════════════════════════════════════════
# 🖌️ 3. Colorization Functions
# ═══════════════════════════════════════════════════════════

def c(text: str, color: str) -> str:
    """
    Colorize text with specified color.
    
    Args:
        text: Text to colorize
        color: Color name (purple, green, yellow, red, cyan, grey, white)
    
    Returns:
        Colorized text with reset
    """
    color_map = {
        "purple": Colors.PURPLE,
        "lucifer": Colors.PURPLE,
        "green": Colors.GREEN,
        "success": Colors.GREEN,
        "yellow": Colors.YELLOW,
        "warning": Colors.YELLOW,
        "red": Colors.RED,
        "error": Colors.RED,
        "cyan": Colors.CYAN,
        "info": Colors.CYAN,
        "blue": Colors.BLUE,
        "grey": Colors.GREY,
        "dim": Colors.GREY,
        "white": Colors.WHITE,
    }
    
    color_code = color_map.get(color.lower(), Colors.WHITE)
    return f"{color_code}{text}{Colors.RESET}"


def colored(text: str, *colors) -> str:
    """
    Apply multiple color codes to text.
    
    Example:
        colored("Text", Colors.PURPLE, Colors.BOLD)
    """
    codes = "".join(colors)
    return f"{codes}{text}{Colors.RESET}"


# ═══════════════════════════════════════════════════════════
# 👾 4. Banner & Title Blocks
# ═══════════════════════════════════════════════════════════

def detect_installed_models():
    """Detect installed AI models and platforms in project directory."""
    from pathlib import Path
    import json
    import sys
    
    # Import tier mapping
    sys.path.insert(0, str(Path(__file__).parent))
    from model_tiers import get_model_tier, get_tier_capabilities
    
    # Get project root - use main models directory
    project_root = Path(__file__).parent.parent
    luciferai_dir = project_root / '.luciferai'
    bin_dir = luciferai_dir / 'bin'
    models_dir = project_root / 'models'
    
    detected = {
        'llamafile': (bin_dir / 'llamafile').exists(),
        'bundled_models': [],  # Models in models/
        'ollama_models': []    # Models from Ollama
    }
    
    # Check for bundled models in models/
    if models_dir.exists():
        # Import model sizes for validation
        try:
            from model_files_map import MODEL_SIZES
        except:
            MODEL_SIZES = {}
        
        # Track found models to avoid duplicates
        found_models = set()
        
        for model_file in models_dir.glob('*.gguf'):
            filename_lower = model_file.name.lower()
            model_name = None
            
            # Comprehensive model name detection
            # Tier 0 models
            if 'tinyllama' in filename_lower or 'tiny' in filename_lower:
                model_name = 'tinyllama'
            elif 'phi-2' in filename_lower or 'phi2' in filename_lower:
                model_name = 'phi-2'
            elif 'stablelm' in filename_lower:
                model_name = 'stablelm'
            
            # Tier 1 models  
            # llama3.2 removed from core bundle
            elif 'llama-2' in filename_lower or 'llama2' in filename_lower:
                model_name = 'llama2'
            elif 'phi-3' in filename_lower or 'phi3' in filename_lower:
                model_name = 'phi-3'
            elif 'gemma' in filename_lower:
                if 'gemma2' in filename_lower or 'gemma-2' in filename_lower:
                    model_name = 'gemma2'
                else:
                    model_name = 'gemma'
            elif 'vicuna' in filename_lower:
                model_name = 'vicuna'
            elif 'orca-2' in filename_lower:
                model_name = 'orca-2'
            elif 'openchat' in filename_lower:
                model_name = 'openchat'
            elif 'starling' in filename_lower:
                model_name = 'starling'
            
            # Tier 2 models
            elif 'mistral-7b' in filename_lower and 'mixtral' not in filename_lower:
                model_name = 'mistral'
            elif 'mixtral' in filename_lower:
                if '8x22b' in filename_lower:
                    model_name = 'mixtral-8x22b'
                else:
                    model_name = 'mixtral'
            # Check for 70B llama variants first (Tier 4)
            elif ('llama-3.1' in filename_lower or 'llama3.1' in filename_lower) and '70b' in filename_lower:
                model_name = 'llama3.1-70b'
            elif ('llama-3' in filename_lower or 'llama3' in filename_lower) and '70b' in filename_lower:
                model_name = 'llama3-70b'
            # Then check for regular llama3.1 (8B)
            elif 'llama-3.1' in filename_lower or 'llama3.1' in filename_lower:
                model_name = 'llama3.1'
            elif 'llama-3' in filename_lower or 'llama3' in filename_lower:
                model_name = 'llama3'
            elif 'codellama' in filename_lower or 'code-llama' in filename_lower:
                model_name = 'codellama'
            elif 'neural-chat' in filename_lower:
                model_name = 'neural-chat'
            elif 'solar' in filename_lower:
                model_name = 'solar'
            elif 'qwen' in filename_lower:
                if 'qwen2' in filename_lower:
                    model_name = 'qwen2'
                else:
                    model_name = 'qwen'
            elif 'yi' in filename_lower:
                model_name = 'yi'
            
            # Tier 3 models
            elif 'deepseek' in filename_lower:
                model_name = 'deepseek-coder'
            elif 'wizardcoder' in filename_lower:
                model_name = 'wizardcoder'
            elif 'wizardlm' in filename_lower:
                model_name = 'wizardlm'
            elif 'dolphin' in filename_lower:
                model_name = 'dolphin'
            elif 'nous-hermes' in filename_lower or 'hermes' in filename_lower:
                model_name = 'nous-hermes'
            elif 'phind' in filename_lower:
                model_name = 'phind-codellama'
            
            if model_name and model_name not in found_models:
                found_models.add(model_name)
                tier = get_model_tier(model_name)
                tier_info = get_tier_capabilities(tier)
                
                # Check file size integrity
                actual_size_mb = model_file.stat().st_size / (1024 * 1024)
                expected_size_mb = MODEL_SIZES.get(model_name, 0)
                
                # Check if size matches (allow 5% tolerance)
                size_valid = True
                size_diff_percent = 0
                if expected_size_mb > 0:
                    size_diff_percent = abs(actual_size_mb - expected_size_mb) / expected_size_mb * 100
                    size_valid = size_diff_percent < 5
                
                # Check GGUF header
                header_valid = True
                try:
                    with open(model_file, 'rb') as f:
                        magic = f.read(4)
                        if magic != b'GGUF':
                            header_valid = False
                except:
                    header_valid = False
                
                detected['bundled_models'].append({
                    'name': model_name,
                    'tier': f"Tier {tier}",
                    'tier_name': tier_info['name'],
                    'file': model_file.name,
                    'actual_size_mb': actual_size_mb,
                    'expected_size_mb': expected_size_mb,
                    'size_valid': size_valid,
                    'header_valid': header_valid,
                    'corrupted': not (size_valid and header_valid)
                })
    
    # Load LLM state (enabled/disabled)
    llm_state_file = Path.home() / '.luciferai' / 'llm_state.json'
    llm_state = {}
    if llm_state_file.exists():
        try:
            with open(llm_state_file, 'r') as f:
                llm_state = json.load(f)
        except:
            pass
    
    # Add enabled/disabled status to bundled models
    for model in detected['bundled_models']:
        model['enabled'] = llm_state.get(model['name'], True)
    
    # Check for Ollama and its models
    import shutil
    detected['ollama'] = bool(shutil.which('ollama'))
    
    if detected['ollama']:
        try:
            import requests
            response = requests.get("http://localhost:11434/api/tags", timeout=1)
            if response.status_code == 200:
                models = response.json().get('models', [])
                for m in models:
                    model_name = m['name'].split(':')[0]
                    detected['ollama_models'].append({
                        'name': model_name,
                        'tier': model_tiers.get(model_name, 'Unknown'),
                        'enabled': llm_state.get(model_name, True)
                    })
        except:
            pass
    
    return detected

def display_banner(mode: str = "Rule-Based", user_id: str = "Unknown"):
    """Display the main LuciferAI banner."""
    import platform
    
    # Detect installed models
    models = detect_installed_models()
    
    print(f"\n{Colors.PURPLE}╔════════════════════════════════════════════════════════════╗{Colors.RESET}")
    print(f"{Colors.PURPLE}║              {Emojis.LUCIFER}  LuciferAI Terminal                   {Colors.PURPLE}║{Colors.RESET}")
    print(f"{Colors.PURPLE}║     Self-Healing • Authenticated • Reflective AI Core     {Colors.PURPLE}║{Colors.RESET}")
    print(f"{Colors.PURPLE}║                                                            {Colors.PURPLE}║{Colors.RESET}")
    print(f"{Colors.CYAN}║              \"Forged in Silence, Born of Neon.\"              {Colors.PURPLE}║{Colors.RESET}")
    print(f"{Colors.PURPLE}╚════════════════════════════════════════════════════════════╝{Colors.RESET}\n")
    
    print(c(f"Mode: {mode}", "cyan"))
    print(c("Output: Interactive mode with idle heartbeat animation", "cyan"))
    print(c("Perfect for: Real-time command execution and monitoring", "cyan"))
    print()
    
    # Check for Catalina and show warning
    if platform.system() == "Darwin":
        try:
            version_str = platform.mac_ver()[0]
            parts = version_str.split('.')
            major = int(parts[0]) if len(parts) > 0 else 0
            minor = int(parts[1]) if len(parts) > 1 else 0
            if major == 10 and minor <= 15:
                print()
                print(c(f"⚠️  macOS {version_str} (Catalina or older) detected", "yellow"))
                print(c("   Native Ollama requires Sonoma 14.0+", "dim"))
                print(c("   Recommended: Use Docker for Ollama or cloud APIs", "green"))
                print(c("   Type: help for available commands", "cyan"))
        except:
            pass
    
    print()
    
    # Show AI Model Status
    print(c("🤖 AI Models:", "cyan"))
    
    # Show llamafile status
    if models['llamafile']:
        print(c("   ✅ llamafile (bundled)", "green"))
    else:
        print(c("   📦 llamafile not installed", "yellow"))
        print(c("      Type: ./setup_bundled_models.sh", "dim"))
    
    # Show bundled models from .luciferai/models/
    if models['bundled_models']:
        print(c("\n   📦 Bundled Models:", "cyan"))
        
        # Group models by tier
        models_by_tier = {}
        installed_tiers = set()
        
        for model in models['bundled_models']:
            # Extract tier number
            try:
                tier_num = int(model['tier'].split()[-1]) if 'Tier' in model['tier'] else -1
                if tier_num >= 0:
                    installed_tiers.add(tier_num)
                    if tier_num not in models_by_tier:
                        models_by_tier[tier_num] = []
                    models_by_tier[tier_num].append(model)
            except:
                pass
        
        # Display models organized by tier (0-4)
        for tier in sorted(models_by_tier.keys()):
            tier_models = models_by_tier[tier]
            
            for model in tier_models:
                # Check if model is corrupted
                if model.get('corrupted', False):
                    status_icon = "⚠️"
                    status_text = "Corrupted"
                    status_color = "red"
                    
                    model_display = f"{model['name'].title()} ({model['tier']})"
                    print(c(f"      {status_icon} {model_display} - ", "white") + c(status_text, status_color))
                    
                    # Show size mismatch details
                    if model.get('expected_size_mb', 0) > 0:
                        actual = model.get('actual_size_mb', 0)
                        expected = model.get('expected_size_mb', 0)
                        print(c(f"         Size: {actual:.1f}MB (expected {expected:.0f}MB)", "dim"))
                    else:
                        actual = model.get('actual_size_mb', 0)
                        print(c(f"         Size: {actual:.1f}MB (unusually small)", "dim"))
                    
                    # Show reinstall command
                    print(c(f"         Fix: ", "dim") + c(f"install {model['name']}", "yellow"))
                else:
                    status_icon = "✅" if model['enabled'] else "⏸️"
                    status_text = "Enabled" if model['enabled'] else "Disabled"
                    status_color = "green" if model['enabled'] else "yellow"
                    
                    model_display = f"{model['name'].title()} ({model['tier']})"
                    print(c(f"      {status_icon} {model_display} - ", "white") + c(status_text, status_color))
        
        # Find first missing tier (0-4)
        missing_tier = None
        for tier in range(5):  # 0, 1, 2, 3, 4
            if tier not in installed_tiers:
                missing_tier = tier
                break
        
        # Suggest missing tier LLM
        if missing_tier is not None:
            tier_suggestions = {
                0: ("tinyllama", "1.1B, basic chat", "Quick responses, simple tasks, low-power devices"),
                1: ("gemma2", "9B, Google's general purpose", "Balanced performance, general tasks, moderate complexity"),
                2: ("mistral", "7B, best in class", "Complex tasks, coding, analysis, better reasoning"),
                3: ("deepseek-coder", "33B, code expert", "Expert coding, complex reasoning, specialized tasks"),
                4: ("llama3.1-70b", "70B, ultra-expert", "Enterprise systems, research, production apps")
            }
            if tier_suggestions[missing_tier] is not None:
                model_name, description, capabilities = tier_suggestions[missing_tier]
                print(c(f"\n   💡 Complete Tier {missing_tier}:", "cyan"))
                print(c(f"      ", "dim") + c(f"install {model_name}", "yellow") + c(f" - {description}", "dim"))
                print(c(f"      Best for: {capabilities}", "dim"))
    else:
        print(c("\n   📦 No bundled models detected", "yellow"))
        print(c("      Type: ./setup_bundled_models.sh to install TinyLlama", "dim"))
    
    # Show Ollama models
    if models['ollama']:
        if models['ollama_models']:
            print(c("\n   🦙 Ollama Models:", "cyan"))
            for model in models['ollama_models']:
                status_icon = "✅" if model['enabled'] else "⏸️"
                status_text = "Enabled" if model['enabled'] else "Disabled"
                status_color = "green" if model['enabled'] else "yellow"
                
                model_display = f"{model['name']} ({model['tier']})"
                print(c(f"      {status_icon} {model_display} - ", "white") + c(status_text, status_color))
        else:
            print(c("\n   ✅ Ollama available", "green"))
            print(c("      Type: luci list  (to see available models)", "dim"))
    else:
        version_str = platform.mac_ver()[0] if platform.system() == "Darwin" else ""
        is_catalina = version_str.startswith('10.15') if version_str else False
        
        if is_catalina:
            print(c("\n   ⚠️  Ollama unavailable (macOS Catalina)", "yellow"))
            print(c("      Use: llamafile (recommended for Catalina)", "dim"))
        else:
            print(c("\n   📦 Ollama not installed", "yellow"))
            print(c("      Type: luci install ollama", "dim"))
    
    print()
    
    # Show mode-specific status
    if "Ollama" in mode:
        print(c(f"{Emojis.ROBOT} AI Mode: Ollama - Full access to offline consensus + all tools", "green"))
    elif "Mistral" in mode or "Tier 2" in mode:
        print(c(f"🔥 AI Mode: Mistral (Tier 2) - Advanced natural language understanding", "green"))
        print(c(f"   • Superior context parsing and multi-step reasoning", "dim"))
        print(c(f"   • Works on all systems (including Catalina)", "dim"))
        print(c(f"   • No internet required", "dim"))
        print(c(f"   • Type 'memory' to see conversation stats", "dim"))
    elif "TinyLlama" in mode or "Tier 0" in mode:
        print(c(f"🦙 AI Mode: TinyLlama (Tier 0) - Basic chat with 200-message memory", "green"))
        print(c(f"   • Works on all systems (including Catalina)", "dim"))
        print(c(f"   • No internet required", "dim"))
        print(c(f"   • Type 'memory' to see conversation stats", "dim"))
        
        # Suggest Mistral upgrade if not installed
        has_mistral = any(m['name'] == 'mistral-7b' for m in models['bundled_models'])
        if not has_mistral:
            print(c(f"\n   💡 Upgrade to Mistral (Tier 2) for better understanding:", "cyan"))
            print(c(f"      Type: help for upgrade instructions", "dim"))
    else:
        print(c(f"{Emojis.CLIPBOARD} Rule-Based Mode", "yellow"))
        
        # Suggest next steps based on what's available
        if not models['llamafile'] and not models['ollama']:
            print(c(f"   🧠 Recommended: ", "yellow") + c("./setup_bundled_models.sh", "cyan") + c(" (installs TinyLlama)", "dim"))
        elif models['llamafile'] and not models['bundled_models']:
            print(c(f"   🧠 Next: ", "yellow") + c("./setup_bundled_models.sh", "cyan") + c(" (downloads TinyLlama)", "dim"))
        elif models['ollama'] and not models['ollama_models']:
            print(c(f"   🧠 Next: ", "yellow") + c("luci install mistral", "cyan") + c(" (7GB, Tier 2)", "dim"))
    
    print(c(f"{Emojis.LIGHTBULB} Type 'help' to see what I can do, 'exit' to quit", "cyan"))
    print()
    print(c(f"Commands:", "yellow"))
    print(c("  • Type commands and watch the idle heartbeat pulse", "dim"))
    print(c("  • Animated feedback for processing states", "dim"))
    print(c("  • Arrow keys for command history", "dim"))
    print(c("  • 'clear' to reset screen, 'exit' to quit", "dim"))
    print()
    print(c("─" * 60, "dim"))
    print()
    print(c(f"{Emojis.SKULL} User ID: {user_id}", "dim"))
    print()


def display_section_banner(title: str):
    """Display a section banner."""
    print(f"\n{Colors.PURPLE}{'═'*60}{Colors.RESET}")
    print(f"{Colors.PURPLE}{Emojis.WRENCH} {title}{Colors.RESET}")
    print(f"{Colors.PURPLE}{'═'*60}{Colors.RESET}\n")


# ═══════════════════════════════════════════════════════════
# 🩸 5. Idle State & Emotional Feedback
# ═══════════════════════════════════════════════════════════

class IdleState:
    """Manages idle state animations."""
    
    STATES = [
        (f"{Emojis.HEARTBEAT} Idle • Awaiting Commands... {Emojis.SKULL_BONES}", Colors.PURPLE),
        (f"{Emojis.PROCESSING} Processing • Deep Analysis...", Colors.CYAN),
        (f"{Emojis.REFLECTING} Reflecting on Fix...", Colors.GREEN),
        (f"{Emojis.LOCKED} Verifying Credentials...", Colors.YELLOW),
        (f"{Emojis.UNLOCKED} Access Granted.", Colors.GREEN),
        (f"{Emojis.SKULL_BONES} Security Lockdown Triggered.", Colors.RED),
        (f"{Emojis.EXIT} Exiting — Restoring System State...", Colors.GREY),
    ]
    
    @staticmethod
    def show_idle():
        """Display idle state."""
        state, color = IdleState.STATES[0]
        print(c(state, "purple"), end="\r", flush=True)
    
    @staticmethod
    def show_processing():
        """Display processing state."""
        state, color = IdleState.STATES[1]
        print(c(state, "cyan"), end="\r", flush=True)
    
    @staticmethod
    def show_reflecting():
        """Display reflecting state."""
        state, color = IdleState.STATES[2]
        print(c(state, "green"), end="\r", flush=True)
    
    @staticmethod
    def show_authenticating():
        """Display authenticating state."""
        state, color = IdleState.STATES[3]
        print(c(state, "yellow"))
    
    @staticmethod
    def show_authorized():
        """Display authorized state."""
        state, color = IdleState.STATES[4]
        print(c(state, "green"))
    
    @staticmethod
    def show_lockdown():
        """Display lockdown state."""
        state, color = IdleState.STATES[5]
        print(c(state, "red"))
    
    @staticmethod
    def show_exiting():
        """Display exiting state."""
        state, color = IdleState.STATES[6]
        print(c(state, "grey"))


# ═══════════════════════════════════════════════════════════
# ✨ 6. Sparkle Feedback System
# ═══════════════════════════════════════════════════════════

def sparkle_output(msg: str, success: bool = True, emoji: str = None):
    """
    Sparkle feedback for important events.
    
    Args:
        msg: Message to display
        success: True for success (green), False for error (red)
        emoji: Override emoji (default: ✨ for success, 💀 for error)
    """
    if emoji is None:
        emoji = Emojis.SPARKLE if success else Emojis.SKULL
    
    color = "green" if success else "red"
    print(c(f"{emoji} {msg}", color))


def reflection_output(msg: str):
    """Display reflection/learning update."""
    print(c(f"{Emojis.PUZZLE} {msg}", "purple"))


# ═══════════════════════════════════════════════════════════
# 🔒 7. Authentication Indicators
# ═══════════════════════════════════════════════════════════

def auth_prompt_display():
    """Display authentication prompt indicator."""
    print(c(f"{Emojis.LOCKED} Authentication Required for Privileged Action", "yellow"))


def auth_success_display(username: str = "User"):
    """Display authentication success."""
    print(c(f"{Emojis.UNLOCKED} Access Granted — Welcome back, {username}", "green"))


def auth_failure_display(attempts_remaining: int):
    """Display authentication failure."""
    print(c(f"{Emojis.CROSS} Invalid Credentials ({attempts_remaining} attempts remaining)", "red"))


def auth_lockdown_display():
    """Display lockdown."""
    print(c(f"{Emojis.SKULL_BONES} Terminal Locked for 60 seconds.", "red"))


# ═══════════════════════════════════════════════════════════
# 🧰 8. Command Feedback / Action Status
# ═══════════════════════════════════════════════════════════

class CommandFeedback:
    """Command execution feedback."""
    
    @staticmethod
    def build(script_name: str):
        print(c(f"{Emojis.HAMMER} Building Script Template: {script_name}", "cyan"))
    
    @staticmethod
    def run(script_name: str):
        print(c(f"{Emojis.PLAY} Running: {script_name}", "green"))
    
    @staticmethod
    def fix(description: str):
        print(c(f"{Emojis.WRENCH} Fix applied: {description}", "yellow"))
    
    @staticmethod
    def analyze(target: str):
        print(c(f"{Emojis.MICROSCOPE} Analyzing: {target}", "purple"))
    
    @staticmethod
    def daemon_add(name: str):
        print(c(f"{Emojis.GHOST} Registered Background Daemon: {name}", "cyan"))
    
    @staticmethod
    def sync_env():
        print(c(f"{Emojis.GLOBE} Environment synchronized with latest fixes.", "blue"))
    
    @staticmethod
    def exit_graceful():
        print(c(f"{Emojis.EXIT} Exiting — Restoring System State...", "grey"))


# ═══════════════════════════════════════════════════════════
# 💾 9. Logging and File Activity
# ═══════════════════════════════════════════════════════════

class FileFeedback:
    """File operation feedback."""
    
    @staticmethod
    def log_rotation():
        print(c(f"{Emojis.SCROLL} Rotating logs...", "grey"))
    
    @staticmethod
    def compression():
        print(c(f"{Emojis.COMPRESS} Compressing session archives...", "yellow"))
    
    @staticmethod
    def encryption(filename: str):
        print(c(f"{Emojis.ENCRYPTED} Encrypting patch: {filename}", "cyan"))
    
    @staticmethod
    def upload():
        print(c(f"{Emojis.ROCKET} Uploading to GitHub Public FixNet...", "green"))
    
    @staticmethod
    def verification():
        print(c(f"{Emojis.RECEIPT} Signature Verified — SHA256 match", "blue"))


# ═══════════════════════════════════════════════════════════
# ⚠️ 10. Error State Hierarchy
# ═══════════════════════════════════════════════════════════

class ErrorFeedback:
    """Error state feedback."""
    
    @staticmethod
    def warning(msg: str):
        print(c(f"{Emojis.WARNING} {msg}", "yellow"))
    
    @staticmethod
    def error(msg: str):
        print(c(f"{Emojis.CROSS} {msg}", "red"))
    
    @staticmethod
    def critical(msg: str):
        print(c(f"{Emojis.SKULL_BONES} {msg}", "red"))
    
    @staticmethod
    def recovery(msg: str):
        print(c(f"{Emojis.BANDAGE} {msg}", "cyan"))


# ═══════════════════════════════════════════════════════════
# 📘 11. Convenience Functions
# ═══════════════════════════════════════════════════════════

def print_step(step_num: int, total_steps: int, description: str):
    """Print a step in a multi-step process with separator lines."""
    print(c("─" * 60, "dim"))
    print(c(f"📝 Step {step_num}/{total_steps}: {description}", "cyan"))
    print()


def print_success(msg: str):
    """Print success message."""
    print(c(f"{Emojis.CHECKMARK} {msg}", "green"))


def print_error(msg: str):
    """Print error message."""
    print(c(f"{Emojis.CROSS} {msg}", "red"))


def print_info(msg: str):
    """Print info message."""
    print(c(f"{Emojis.LIGHTBULB} {msg}", "cyan"))


def print_divider(char: str = "═", length: int = 60, color: str = "purple"):
    """Print a divider line."""
    print(c(char * length, color))


# ═══════════════════════════════════════════════════════════
# 🎯 12. Test Function
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    """Test all visual components."""
    print("\n" + "="*70)
    print("🎨 LuciferAI Color & Emoji System Test")
    print("="*70 + "\n")
    
    # Test banner
    display_banner(mode="AI-Powered (Ollama)", user_id="TEST123456")
    
    # Test sparkle outputs
    sparkle_output("Created script: /scripts/auto_trader.py", success=True)
    sparkle_output("Error: Could not analyze syntax at line 142.", success=False)
    reflection_output("Reflection Applied: Added branch 'NameError_Fix_v2'")
    
    # Test auth
    print("\n--- Authentication Tests ---")
    auth_prompt_display()
    time.sleep(0.5)
    auth_success_display("Gary")
    auth_failure_display(2)
    
    # Test commands
    print("\n--- Command Tests ---")
    CommandFeedback.build("trader_core.py")
    CommandFeedback.run("/scripts/trader_core.py")
    CommandFeedback.fix("restored missing import")
    CommandFeedback.analyze("ai_parser.py")
    
    # Test errors
    print("\n--- Error Tests ---")
    ErrorFeedback.warning("Dependency 'requests' missing — attempting reinstall")
    ErrorFeedback.error("Script execution failed")
    ErrorFeedback.critical("Kernel Panic — Auto-Restoration Engaged")
    ErrorFeedback.recovery("Attempting self-repair...")
    
    # Test file ops
    print("\n--- File Operation Tests ---")
    FileFeedback.encryption("fix_ai_parser.enc")
    FileFeedback.upload()
    FileFeedback.verification()
    
    print("\n" + c("✅ All visual tests complete!", "green") + "\n")
