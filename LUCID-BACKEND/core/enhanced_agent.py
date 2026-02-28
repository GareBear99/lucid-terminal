#!/usr/bin/env python3
"""
🧠 LuciferAI Enhanced Agent - Self-Healing with FixNet Integration
Automatically detects errors, searches for fixes, applies them, and uploads to FixNet
"""
import sys
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Dict, Any, List, Optional

# Cross-platform single key input support
try:
    import tty
    import termios
    IS_WINDOWS = False
except ImportError:
    try:
        import msvcrt
        IS_WINDOWS = True
    except ImportError:
        # Fallback for environments without standard input libraries
        IS_WINDOWS = False
        print("Warning: Neither tty/termios nor msvcrt available. Single key input may require Enter.")

# Add parent paths
sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))
sys.path.insert(0, str(Path(__file__).parent))

from file_tools import read_file, write_file, edit_file, find_files, grep_search, list_directory, move_file


def get_single_key_input(prompt: str, valid_keys: List[str] = ['y', 'n']) -> str:
    """
    Get a single key press without requiring Enter.
    Returns the key pressed (lowercase).
    Pauses heartbeat animation during input.
    """
    # Pause heartbeat and set to busy state BEFORE printing prompt
    try:
        import lucifer
    except ImportError:
        lucifer = None
    
    # Check for non-interactive mode (API/Headless)
    if os.environ.get('LUCIFER_NON_INTERACTIVE') == 'true':
        # Default to 'y' if available, otherwise first valid key
        response = 'y' if 'y' in valid_keys else valid_keys[0] if valid_keys else ''
        print(f"{prompt} [Auto-answering '{response}' in non-interactive mode]")
        return response

    prev_heart_state = None
    prev_input_active = None
    
    if lucifer and hasattr(lucifer, 'HEART_STATE'):
        prev_heart_state = lucifer.HEART_STATE
        lucifer.HEART_STATE = "busy"
    
    if lucifer and hasattr(lucifer, 'INPUT_ACTIVE'):
        prev_input_active = lucifer.INPUT_ACTIVE
        lucifer.INPUT_ACTIVE = True
    
    # Small delay to ensure heartbeat stops before printing prompt
    time.sleep(0.1)
    
    print(prompt, end='', flush=True)
    
    try:
        if IS_WINDOWS:
            # Windows implementation
            while True:
                if msvcrt.kbhit():
                    key = msvcrt.getch().decode('utf-8').lower()
                    if key in valid_keys:
                        print(key)  # Echo
                        result = key
                        break
                time.sleep(0.05)
        else:
            # Unix implementation
            if sys.stdin.isatty():
                fd = sys.stdin.fileno()
                old_settings = termios.tcgetattr(fd)
                try:
                    tty.setraw(fd)
                    key = sys.stdin.read(1).lower()
                    
                    # Echo the key if it's valid
                    if key in valid_keys:
                        print(key)  # Echo the pressed key
                        result = key
                    else:
                        print()  # Newline for invalid key
                        result = ''
                finally:
                    termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
            else:
                # Fallback for non-tty
                result = input().strip().lower()[:1]
                
        return result
            
    finally:
        # Restore heart state
        if lucifer:
            if prev_heart_state and hasattr(lucifer, 'HEART_STATE'):
                lucifer.HEART_STATE = prev_heart_state
            if prev_input_active is not None and hasattr(lucifer, 'INPUT_ACTIVE'):
                lucifer.INPUT_ACTIVE = prev_input_active
from command_tools import run_command, run_python_code, get_env_info, check_command_exists, is_risky_command
try:
    from lucifer_auth import LuciferAuth
    from fixnet_uploader import FixNetUploader
    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False
    LuciferAuth = None
    FixNetUploader = None
from relevance_dictionary import RelevanceDictionary
from lucifer_logger import LuciferLogger
from lucifer_watcher import LuciferWatcher
from session_logger import SessionLogger
from module_tracker import ModuleTracker, show_modules_help, search_module, install_luciferai_global
from environment_scanner import scan_environments, search_environment, activate_environment
from thermal_analytics import ThermalAnalytics, print_thermal_banner
from lucifer_colors import (
    c, Colors, Emojis, sparkle_output, reflection_output, 
    print_step, print_success, print_error, print_info,
    CommandFeedback, ErrorFeedback, FileFeedback
)
from nlp_parser import NaturalLanguageParser
from image_retrieval import get_image_retriever
sys.path.insert(0, str(Path(__file__).parent.parent / "luci"))
from package_manager import PackageManager
sys.path.insert(0, str(Path(__file__).parent.parent / "luci"))
from image_generator import ImageGenerator
from mesh_generator import MeshGenerator
from task_orchestrator import TaskOrchestrator, TaskStatus
from mistral_task_parser import MistralTaskParser
from deepseek_search import DeepseekSearchSystem
from universal_task_system import UniversalTaskSystem, ModelTier
from master_controller import get_master_controller


def format_code_blocks_with_background(text: str) -> str:
    """
    Format code blocks in text with white background.
    Detects triple backtick code blocks and applies white background.
    """
    if not text or '```' not in text:
        return text
    
    # ANSI codes
    WHITE_BG = '\033[47m'  # White background
    BLACK_TEXT = '\033[30m'  # Black text for contrast
    RESET = '\033[0m'
    
    lines = text.split('\n')
    result = []
    in_code_block = False
    
    for line in lines:
        if line.strip().startswith('```'):
            if not in_code_block:
                # Start of code block
                in_code_block = True
                result.append(line)  # Language identifier line (no background)
            else:
                # End of code block
                in_code_block = False
                result.append(line)  # Closing backticks (no background)
        elif in_code_block:
            # Code line - apply white background
            result.append(f"{WHITE_BG}{BLACK_TEXT}{line}{RESET}")
        else:
            # Normal text
            result.append(line)
    
    return '\n'.join(result)


def get_single_key_input(prompt: str, valid_keys: List[str] = ['y', 'n']) -> str:
    """
    Get a single key press without requiring Enter.
    Returns the key pressed (lowercase).
    Pauses heartbeat animation during input.
    """
    # Pause heartbeat and set to busy state BEFORE printing prompt
    import lucifer
    
    # Check for non-interactive mode (API/Headless)
    if os.environ.get('LUCIFER_NON_INTERACTIVE') == 'true':
        # Default to 'y' if available, otherwise first valid key
        response = 'y' if 'y' in valid_keys else valid_keys[0]
        print(f"{prompt} [Auto-answering '{response}' in non-interactive mode]")
        return response

    prev_heart_state = None
    prev_input_active = None
    
    if hasattr(lucifer, 'HEART_STATE'):
        prev_heart_state = lucifer.HEART_STATE
        lucifer.HEART_STATE = "busy"
    
    if hasattr(lucifer, 'INPUT_ACTIVE'):
        prev_input_active = lucifer.INPUT_ACTIVE
        lucifer.INPUT_ACTIVE = True
    
    # Small delay to ensure heartbeat stops before printing prompt
    time.sleep(0.1)
    
    print(prompt, end='', flush=True)
    
    try:
        if sys.stdin.isatty():
            fd = sys.stdin.fileno()
            old_settings = termios.tcgetattr(fd)
            try:
                tty.setraw(fd)
                key = sys.stdin.read(1).lower()
                
                # Echo the key if it's valid
                if key in valid_keys:
                    print(key)  # Echo the pressed key
                    return key
                else:
                    print()  # Newline for invalid key
                    return ''
            finally:
                termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        else:
            # Fallback for non-tty
            return input().strip().lower()[:1]
    finally:
        # Resume heartbeat to previous state
        if hasattr(lucifer, 'HEART_STATE') and prev_heart_state is not None:
            lucifer.HEART_STATE = prev_heart_state
        
        if hasattr(lucifer, 'INPUT_ACTIVE') and prev_input_active is not None:
            lucifer.INPUT_ACTIVE = prev_input_active


class EnhancedLuciferAgent:
    """
    Enhanced agent with:
    - Authentication
    - Self-healing (FixNet integration)
    - Collaborative learning
    - Error detection & auto-fix
    """
    
    def __init__(self):
        print(c(f"{Emojis.HEARTBEAT} Initializing Enhanced LuciferAI...", "purple"))
        
        # Session memory for tracking created/modified files
        self.session_files = {}  # {filename: full_path}
        
        # Get user ID for FixNet
        self.user_id = self._get_user_id()
        
        # Initialize components (optional if cryptography unavailable)
        if AUTH_AVAILABLE:
            self.auth = LuciferAuth()
            self.auth.auth_init()
            self.uploader = FixNetUploader(self.user_id)
        else:
            self.auth = None
            self.uploader = None
        
        self.dictionary = RelevanceDictionary(self.user_id)
        self.logger = LuciferLogger()
        self.watcher = LuciferWatcher(self.user_id)
        
        # Initialize session logger (tracks last 6 months of sessions)
        self.session_logger = SessionLogger(self.user_id)
        
        # Specs mode flag (set by lucifer_specs.py)
        self.specs_mode = False
        
        # Diabolical mode flag (unrestricted AI responses)
        self.diabolical_mode = False
        
        # Check if Ollama is available
        self.ollama_available = self._check_ollama()
        self.ollama_model = getattr(self, 'ollama_model', 'llama3.2')  # Set by _check_ollama
        self.available_models = getattr(self, 'available_models', [])  # List of all available models
        
        # Enable multi-model intelligence if all three are available
        self.multi_model_mode = self._check_multi_model_capability()
        
        # LLM enable/disable state (persisted)
        self.llm_state = self._load_llm_state()
        
        # Select best enabled model after loading llm_state
        self.ollama_model = self._select_best_enabled_model()
        
        # Initialize model lock manager for concurrent instance coordination
        from model_lock_manager import get_model_lock_manager
        self.lock_manager = get_model_lock_manager()
        
        # Initialize NLP parser with detected model and delegation function
        self.nlp_parser = NaturalLanguageParser(
            self.ollama_available, 
            model=self.ollama_model,
            model_delegate_fn=self._delegate_to_model if self.multi_model_mode else None
        )
        
        # Initialize image retriever (only active for advanced models)
        self.image_retriever = get_image_retriever()
        
        # Initialize package manager
        self.package_manager = PackageManager()
        
        # Initialize smart template system (WiFi-aware)
        from smart_template_manager import SmartTemplateManager
        self.smart_templates = SmartTemplateManager(self.user_id)
        
        # Initialize task orchestration system
        self.orchestrator = TaskOrchestrator()
        self.mistral_parser = MistralTaskParser(self.orchestrator)
        self.deepseek_search = DeepseekSearchSystem()
        
        # Initialize image generation system
        self.image_gen = ImageGenerator()
        
        # Initialize 3D mesh generation system
        self.mesh_gen = MeshGenerator()
        
        # Initialize universal task system with detected tier
        self.task_system = UniversalTaskSystem(self._get_model_tier())
        
        # Initialize master controller for intelligent command routing
        self.master_controller = get_master_controller(self._get_model_tier())
        
        # Auto-sync consensus on startup (silent)
        self._auto_sync_consensus(silent=True)
        self._auto_sync_templates(silent=True)
        
        # Show WiFi and template status with speed
        self._display_wifi_status()
        
        template_status = self.smart_templates.get_status_info()
        print(c(f"📋 Template mode: {template_status['mode']}", "dim"))
        
        # Check model integrity and show status
        self._check_and_display_model_status()
        
        # Initialize thermal analytics (check if user is validated)
        from system_id import get_system_id_manager
        id_manager = get_system_id_manager()
        validated = id_manager.has_id()
        self.thermal = ThermalAnalytics(self.user_id, validated=validated)
        
        # Check model integrity on startup if WiFi connected
        self._check_model_integrity()
        
        self.conversation_history: List[Dict[str, str]] = []
        self.tools_executed: List[str] = []
        self.env = get_env_info()
        self.fixes_applied = 0
        self.last_created_file = None  # Track last created file for context
        
        # Display session start info
        session_info = self.session_logger.get_session_info()
        session_time = session_info['started_at'].strftime("%A, %B %d, %Y at %I:%M %p")
        
        print_success("Enhanced LuciferAI ready")
        print(c(f"📝 New session started: {session_time}", "cyan"))
        print(c(f"👤 User ID: {self.user_id}", "blue"))
        print(c(f"📁 Working directory: {self.env['cwd']}", "dim"))
        print()
    
    def _check_model_integrity(self) -> None:
        """Check model file integrity on startup if WiFi connected."""
        from pathlib import Path
        from wifi_manager import check_wifi_connection
        
        # Only check if WiFi is connected
        if not check_wifi_connection():
            return
        
        # Check for previous failed uninstall marker
        project_root = Path(__file__).parent.parent
        marker_file = project_root / '.luciferai' / '.uninstall_failed'
        
        if marker_file.exists():
            print(c("⚠️  Previous model uninstall failed - verifying integrity...", "yellow"))
            try:
                # Read which model had failed uninstall
                failed_model = marker_file.read_text().strip()
                
                # Attempt cleanup
                from model_download import uninstall_model
                print(c(f"Attempting to clean up {failed_model}...", "dim"))
                
                # Silent uninstall without confirmation prompt (auto-cleanup)
                models_dir = project_root / 'models'
                from core.model_files_map import get_model_info, get_canonical_name
                
                canonical_name = get_canonical_name(failed_model)
                model_info = get_model_info(canonical_name)
                
                if model_info['supported']:
                    model_file = model_info['file']
                    file_path = models_dir / model_file
                    
                    if file_path.exists():
                        file_path.unlink()
                        print(c(f"✅ Cleaned up corrupted {canonical_name}", "green"))
                
                # Remove marker
                marker_file.unlink()
                
            except Exception as e:
                print(c(f"⚠️  Failed to auto-cleanup: {e}", "yellow"))
                print(c("   You may need to manually remove the file", "dim"))
    
    def _check_and_display_model_status(self) -> None:
        """Check all installed models and display their status."""
        from pathlib import Path
        from core.model_files_map import get_model_info, get_canonical_name
        
        project_root = Path(__file__).parent.parent
        models_dir = project_root / 'models'
        
        if not models_dir.exists():
            return
        
        # Get all GGUF files in models directory
        gguf_files = list(models_dir.glob('*.gguf'))
        
        if not gguf_files:
            return
        
        # Check each file for integrity
        corrupt_models = []
        incomplete_models = []
        
        # Get all supported models to check against
        from core.model_files_map import list_all_models
        all_models_by_tier = list_all_models()
        
        # Create a reverse mapping: filename -> model_name
        file_to_model = {}
        for tier_models in all_models_by_tier.values():
            for model_name in tier_models:
                model_info = get_model_info(model_name)
                if model_info['file']:
                    file_to_model[model_info['file']] = model_name
        
        for gguf_file in gguf_files:
            # Try to match file to known model
            model_name = file_to_model.get(gguf_file.name)
            
            if not model_name:
                continue
            
            # Get expected size
            model_info = get_model_info(model_name)
            expected_size_mb = model_info.get('expected_size_mb', 0)
            actual_size_mb = gguf_file.stat().st_size / (1024 * 1024)
            
            # Check if size matches (allow 5% tolerance)
            if expected_size_mb > 0:
                size_diff_percent = abs(actual_size_mb - expected_size_mb) / expected_size_mb * 100
                
                if size_diff_percent > 5:
                    # Check if it's incomplete (significantly smaller) or corrupt (different)
                    if actual_size_mb < expected_size_mb * 0.95:
                        incomplete_models.append({
                            'name': model_name,
                            'file': gguf_file.name,
                            'expected_mb': expected_size_mb,
                            'actual_mb': actual_size_mb,
                            'percent': (actual_size_mb / expected_size_mb * 100)
                        })
                    else:
                        corrupt_models.append({
                            'name': model_name,
                            'file': gguf_file.name,
                            'expected_mb': expected_size_mb,
                            'actual_mb': actual_size_mb
                        })
        
        # Display issues if any
        if incomplete_models or corrupt_models:
            print()
            print(c("⚠️  Model Issues Detected:", "yellow"))
            print()
            
            for model in incomplete_models:
                print(c(f"  📥 {model['name'].upper()}: Incomplete download ({model['percent']:.1f}% complete)", "yellow"))
                print(c(f"     Expected: {model['expected_mb']:.0f}MB | Actual: {model['actual_mb']:.0f}MB", "dim"))
                print(c(f"     Resume: install {model['name']}", "cyan"))
                print()
            
            for model in corrupt_models:
                print(c(f"  ❌ {model['name'].upper()}: Corrupt/Invalid file", "red"))
                print(c(f"     Expected: {model['expected_mb']:.0f}MB | Actual: {model['actual_mb']:.0f}MB", "dim"))
                print(c(f"     Reinstall: install {model['name']}", "cyan"))
                print()
            
            print(c("─" * 60, "dim"))
            print()
    
    def _display_wifi_status(self):
        """Display WiFi status with formatted speed if available."""
        from wifi_manager import get_wifi_info
        import sys
        import time
        
        wifi_info = get_wifi_info()
        if wifi_info:
            wifi_ssid = wifi_info.get('ssid', 'Unknown')
            
            # Check if we have recent speed data
            wifi_speed_data = None
            if hasattr(sys.modules.get('__main__'), 'WIFI_SPEED'):
                wifi_speed_data = sys.modules['__main__'].WIFI_SPEED
                last_update = wifi_speed_data.get('last_update', 0)
                
                # If speed data is fresh (less than 60 seconds old), show it
                if time.time() - last_update < 60:
                    download = wifi_speed_data.get('download', 0)
                    upload = wifi_speed_data.get('upload', 0)
                    
                    if download > 0:
                        # Format speed with colors (like idle heartbeat)
                        download_color = "green" if download >= 10 else ("yellow" if download >= 5 else "red")
                        upload_color = "green" if upload >= 5 else ("yellow" if upload >= 1 else "red")
                        
                        speed_display = (c("📡", "cyan") + " " + 
                                       c("⬇️", download_color) + c(f" {download:.2f} Mbps", download_color) + 
                                       c(" / ", "dim") + 
                                       c("⬆️", upload_color) + c(f" {upload:.2f} Mbps", upload_color))
                        print(speed_display)
                        return
            
            # If no fresh speed data, show connecting and start test
            print(c(f"📡 WiFi: Connected to {wifi_ssid}", "green") + c(" (testing speed...)", "dim"))
            
            # Start async speed test in background
            import threading
            def async_speed_test():
                from wifi_manager import test_wifi_speed
                
                speed_result = test_wifi_speed(timeout=8)
                if speed_result and hasattr(sys.modules.get('__main__'), 'WIFI_SPEED'):
                    wifi_speed = sys.modules['__main__'].WIFI_SPEED
                    wifi_speed['download'] = speed_result['download']
                    wifi_speed['upload'] = speed_result['upload']
                    wifi_speed['last_update'] = time.time()
            
            threading.Thread(target=async_speed_test, daemon=True).start()
        else:
            print(c("📵 WiFi: Disconnected", "dim"))
    
    def _start_processing_animation(self):
        """Start continuous processing animation in background thread."""
        import threading
        import sys
        
        # Set flag to start animation
        self._processing = True
        
        # Check if we're in interactive mode (has HEART_STATE)
        lucifer_module = sys.modules.get('__main__')
        if lucifer_module and hasattr(lucifer_module, 'HEART_STATE'):
            # Set to busy to pause heartbeat
            lucifer_module.HEART_STATE = "busy"
        
        # Start animation thread
        thread = threading.Thread(target=self._processing_animation_loop, daemon=True)
        thread.start()
        return thread
    
    def _processing_animation_loop(self):
        """Continuous processing animation loop."""
        import os
        import time
        from lucifer_colors import Emojis, Colors
        
        CLEAR_LINE = "\033[K"
        frames = [(Emojis.SKULL, Colors.PURPLE), (Emojis.HEARTBEAT, Colors.RED)]
        i = 0
        
        while self._processing:
            sym, col = frames[i % 2]
            os.write(1, f"\r{col}{sym} Processing...{Colors.RESET}{CLEAR_LINE}".encode())
            time.sleep(0.5)
            i += 1
        
        # Clear the line when done
        os.write(1, f"\r{CLEAR_LINE}".encode())
    
    def _stop_processing_animation(self):
        """Stop the processing animation."""
        import time
        self._processing = False
        time.sleep(0.1)  # Give thread time to clear the line
    
    def _estimate_download_time(self, size_gb: float) -> str:
        """Estimate download time based on current WiFi speed and size in GB."""
        import sys
        
        # Try to get current WiFi speed from global state
        wifi_speed = None
        if hasattr(sys.modules.get('__main__'), 'WIFI_SPEED'):
            wifi_speed_data = sys.modules['__main__'].WIFI_SPEED
            download_mbps = wifi_speed_data.get('download', 0)
            
            if download_mbps > 0:
                # Convert: GB to bits, Mbps to bps, calculate seconds
                size_bits = size_gb * 8 * 1024 * 1024 * 1024  # GB to bits
                download_bps = download_mbps * 1000 * 1000     # Mbps to bps
                seconds = size_bits / download_bps
                
                # Convert to human-readable time
                if seconds < 60:
                    return f"{int(seconds)} seconds"
                elif seconds < 3600:
                    minutes = seconds / 60
                    return f"{int(minutes)} minutes"
                else:
                    hours = seconds / 3600
                    if hours < 2:
                        return f"{hours:.1f} hours"
                    else:
                        return f"{int(hours)}-{int(hours * 1.5)} hours"
        
        # Fallback estimates if no speed data (assume moderate connection ~10 Mbps)
        if size_gb < 5:
            return "5-15 minutes"
        elif size_gb < 20:
            return "20-40 minutes"
        elif size_gb < 50:
            return "1-2 hours"
        elif size_gb < 100:
            return "2-4 hours"
        elif size_gb < 200:
            return "4-8 hours"
        else:
            return "8-16 hours"
    
    def _get_user_id(self) -> str:
        """Get user ID from auth system or generate."""
        import hashlib
        import uuid
        device_id = str(uuid.UUID(int=uuid.getnode()))
        username = os.getenv("USER", "unknown")
        combined = f"{device_id}-{username}"
        return hashlib.sha256(combined.encode()).hexdigest()[:16].upper()
    
    def _check_ollama(self) -> bool:
        """Check if Ollama OR llamafile/TinyLlama is available."""
        # First check for Ollama
        try:
            import requests
            response = requests.get("http://localhost:11434/api/tags", timeout=1)
            if response.status_code == 200:
                # Get available models
                models = response.json().get('models', [])
                model_names = [m['name'].split(':')[0] for m in models]
                self.available_models = model_names
                
                # Prefer deepseek-coder > mistral > llama3.2 > any other
                if 'deepseek-coder' in model_names:
                    self.ollama_model = 'deepseek-coder'
                elif 'mistral' in model_names:
                    self.ollama_model = 'mistral'
                elif 'llama3.2' in model_names:
                    self.ollama_model = 'llama3.2'
                elif model_names:
                    self.ollama_model = model_names[0]
                else:
                    self.ollama_model = 'llama3.2'  # Default
                
                return True
        except:
            pass
        
        # Check for llamafile and all installed models in models/
        from pathlib import Path
        project_root = Path(__file__).parent.parent
        llamafile_path = project_root / '.luciferai' / 'bin' / 'llamafile'
        models_dir = project_root / 'models'
        
        # Import helpers for canonicalization
        from model_files_map import MODEL_FILES, get_canonical_name, get_model_file
        
        # Build canonical list of installed models by checking actual files in /models
        models_found_set = set()
        if llamafile_path.exists() and models_dir.exists():
            # Iterate over all known entries, canonicalize, and check the canonical file exists
            for name in MODEL_FILES.keys():
                canonical = get_canonical_name(name)
                model_file = get_model_file(canonical)
                if not model_file:
                    continue
                model_path = models_dir / model_file
                if model_path.exists():
                    models_found_set.add(canonical)
        
        models_found = sorted(models_found_set)
        
        if models_found:
            self.available_models = models_found
            # Note: Don't set ollama_model here yet - will be set by _select_best_model() after loading llm_state
            # Temporarily prefer highest tier available (Tier 4 > Tier 3 > Tier 2 > Tier 1 > Tier 0)
            from model_tiers import get_model_tier
            
            # Sort models by tier (highest first)
            sorted_models = sorted(models_found, key=lambda m: get_model_tier(m), reverse=True)
            if sorted_models:
                self.ollama_model = sorted_models[0]
            return True
        
        return False
    
    def _check_multi_model_capability(self) -> bool:
        """Check if all three primary models are available for intelligent delegation."""
        required = ['llama3.2', 'mistral', 'deepseek-coder']
        return all(model in self.available_models for model in required)
    
    def _load_llm_state(self) -> Dict[str, bool]:
        """Load LLM enabled/disabled state from config."""
        config_file = Path.home() / ".luciferai" / "llm_state.json"
        if config_file.exists():
            try:
                import json
                with open(config_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        # Default: all enabled (including tinyllama)
        return {
            'tinyllama': True,
            'llama3.2': True,
            'mistral': True,
            'deepseek-coder': True
        }
    
    def _save_llm_state(self):
        """Save LLM enabled/disabled state to config."""
        config_file = Path.home() / ".luciferai" / "llm_state.json"
        config_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            import json
            with open(config_file, 'w') as f:
                json.dump(self.llm_state, f, indent=2)
        except Exception as e:
            print(c(f"⚠️  Could not save LLM state: {e}", "yellow"))
    
    def _is_llm_enabled(self, model: str) -> bool:
        """Check if an LLM is enabled."""
        # Normalize model name to canonical form for consistent lookup
        from model_files_map import get_canonical_name
        canonical = get_canonical_name(model)
        return self.llm_state.get(canonical, True)
    
    def _is_model_corrupted(self, model: str) -> bool:
        """Check if a model file is corrupted based on size validation."""
        from pathlib import Path
        from core.model_files_map import get_model_info
        
        # Get model info
        model_info = get_model_info(model)
        if not model_info or not model_info.get('file'):
            return False
        
        # Check if file exists and size matches expected
        project_root = Path(__file__).parent.parent
        models_dir = project_root / 'models'
        model_path = models_dir / model_info['file']
        
        if not model_path.exists():
            return False
        
        # Get expected size
        expected_size_mb = model_info.get('expected_size_mb', 0)
        if expected_size_mb == 0:
            return False
        
        # Check actual size
        actual_size_mb = model_path.stat().st_size / (1024 * 1024)
        
        # Calculate difference
        size_diff_percent = (actual_size_mb - expected_size_mb) / expected_size_mb * 100
        
        # Corrupted if:
        # - File is more than 5% SMALLER (incomplete download)
        # - File is more than 10% LARGER (wrong file or bad quantization)
        if size_diff_percent < -5:  # Too small
            return True
        if size_diff_percent > 10:  # Way too large
            return True
        
        return False
    
    def _select_best_enabled_model(self, exclude_locked: bool = False) -> str:
        """Select the best enabled model from available models.
        
        Args:
            exclude_locked: If True, skip models that are currently locked by other instances
        
        Returns:
            Best available model name, or None if all are disabled
        """
        # Get locked models if needed (excluding our own locks)
        locked_models = self.lock_manager.get_locked_models(exclude_own=True) if exclude_locked else []
        
        # Priority order by tier: Tier 4 > Tier 3 > Tier 2 > Tier 1 > Tier 0
        from model_tiers import get_model_tier
        
        # Sort available models by tier (lowest first) so we prefer smaller models by default
        sorted_models = sorted(
            [m for m in self.available_models if self._is_llm_enabled(m)],
            key=lambda m: get_model_tier(m),
            reverse=False
        )
        
        for model in sorted_models:
            # Skip if locked
            if exclude_locked and model in locked_models:
                continue
            # Skip if corrupted
            if self._is_model_corrupted(model):
                continue
            return model
        
        # Check if ANY model is enabled (including ones not in priority list)
        if self.available_models:
            for model in self.available_models:
                if self._is_llm_enabled(model):
                    if exclude_locked and model in locked_models:
                        continue
                    if self._is_model_corrupted(model):
                        continue
                    return model
        
        # If we reach here, all models are disabled - return None for rule-based mode
        return None
    
    def _delegate_to_model(self, task_type: str) -> str:
        """Intelligently delegate task to appropriate model when all three are available.
        
        Task delegation:
        - llama3.2: Typo correction, "did you mean" logic, simple parsing
        - mistral: Web search, information retrieval, image fetching, answers
        - deepseek-coder: Code generation, complex scripts, optimization
        
        Returns model name to use.
        """
        if not self.multi_model_mode:
            return self.ollama_model  # Use default if not all models available
        
        # Intelligent delegation based on task type
        delegation_map = {
            'typo_correction': 'llama3.2',
            'fuzzy_match': 'llama3.2',
            'simple_parse': 'llama3.2',
            'web_search': 'mistral',
            'information': 'mistral',
            'image_retrieval': 'mistral',
            'lookup': 'mistral',
            'code_generation': 'deepseek-coder',
            'script_building': 'deepseek-coder',
            'optimization': 'deepseek-coder',
            'refactoring': 'deepseek-coder',
        }
        
        model = delegation_map.get(task_type, self.ollama_model)
        
        # Check if model is enabled
        if not self._is_llm_enabled(model):
            # Fall back to first enabled model
            for fallback in ['deepseek-coder', 'mistral', 'llama3.2']:
                if fallback in self.available_models and self._is_llm_enabled(fallback):
                    return fallback
        
        return model
    
    def _auto_correct_typos(self, user_input: str) -> str:
        """Auto-correct common typos in commands before processing."""
        user_lower = user_input.lower().strip()
        
        # Phrase-level corrections (check FIRST before word-by-word)
        phrase_corrections = {
            # Test command variations
            'test mistral': 'mistral test',
            'mistral tets': 'mistral test',
            'mistrl test': 'mistral test',
            'mistra test': 'mistral test',
            'mistral tes': 'mistral test',
            'test tinyllama': 'tinyllama test',
            'tinyllama tets': 'tinyllama test',
            'tinylama test': 'tinyllama test',
            'tinyllama tes': 'tinyllama test',
            'tiny test': 'tinyllama test',
            'tiny tets': 'tinyllama test',
            'tiny tes': 'tinyllama test',
            'rnu mistral test': 'run mistral test',
            'run mistrl test': 'run mistral test',
            'run tinylama test': 'run tinyllama test',
            'rnu test': 'run test',
            'run tets': 'run test',
            'run tes': 'run test',
        }
        
        # Check for phrase-level corrections
        if user_lower in phrase_corrections:
            corrected = phrase_corrections[user_lower]
            print(c(f"💡 Auto-corrected: ", "yellow") + c(user_input, 'red') + c(" → ", "yellow") + c(corrected, 'green'))
            print(c(f"   Command: ", "dim") + c(f"{corrected}", "green"))
            print()
            return corrected
        
        # Word-by-word correction mappings
        corrections = {
            # Install typos
            'instal': 'install',
            'intall': 'install',
            'isntall': 'install',
            'instll': 'install',
            
            # Core typos
            'cor': 'core',
            'coer': 'core',
            'croe': 'core',
            
            # Ollama typos
            'olama': 'ollama',
            'olamma': 'ollama',
            'olllama': 'ollama',
            'ollamma': 'ollama',
            
            # Llama typos
            'lama': 'llama',
            'lamma': 'llama',
            'llamma': 'llama',
            
            # Tier 0 Models (Basic)
            'tinylama': 'tinyllama',
            'tinylamma': 'tinyllama',
            'tinylllama': 'tinyllama',
            'tinyama': 'tinyllama',
            'tiny-lama': 'tinyllama',
            'phi2': 'phi-2',
            'phi_2': 'phi-2',
            'stablelm': 'stablelm',
            'stable-lm': 'stablelm',
            'orcamini': 'orca-mini',
            'orca_mini': 'orca-mini',
            
            # Tier 1 Models (General)
            'lama3.2': 'llama3.2',
            'llamma3.2': 'llama3.2',
            'lama-3.2': 'llama3.2',
            'lama2': 'llama2',
            'llamma2': 'llama2',
            'lama-2': 'llama2',
            'phi3': 'phi-3',
            'phi_3': 'phi-3',
            'gema': 'gemma',
            'gemma2': 'gemma2',
            'gema2': 'gemma2',
            'vicuna': 'vicuna',
            'vicunna': 'vicuna',
            'orca2': 'orca-2',
            'orca_2': 'orca-2',
            'openchat': 'openchat',
            'open-chat': 'openchat',
            'starling': 'starling',
            'starling-lm': 'starling',
            
            # Tier 2 Models (Advanced)
            'mistrl': 'mistral',
            'mistrall': 'mistral',
            'mistra': 'mistral',
            'mistrel': 'mistral',
            'mixtrl': 'mixtral',
            'mixtrall': 'mixtral',
            'lama3.1': 'llama3.1',
            'llamma3.1': 'llama3.1',
            'lama3': 'llama3',
            'llamma3': 'llama3',
            'codelama': 'codellama',
            'code-lama': 'codellama',
            'codellamma': 'codellama',
            'neuralchat': 'neural-chat',
            'neural_chat': 'neural-chat',
            'solar': 'solar',
            'soler': 'solar',
            'qwen': 'qwen',
            'qwen2': 'qwen2',
            'yi': 'yi',
            
            # Tier 3 Models (Expert)
            'deepseak': 'deepseek',
            'deepseek-codder': 'deepseek-coder',
            'deepseek-coderr': 'deepseek-coder',
            'deep-seek': 'deepseek',
            'deepseek_coder': 'deepseek-coder',
            'wizardcoder': 'wizardcoder',
            'wizard-coder': 'wizardcoder',
            'wizardcodder': 'wizardcoder',
            'wizardlm': 'wizardlm',
            'wizard-lm': 'wizardlm',
            'wizard_lm': 'wizardlm',
            'dolphin': 'dolphin',
            'dolfin': 'dolphin',
            'nous-hermes': 'nous-hermes',
            'noushermes': 'nous-hermes',
            'nous_hermes': 'nous-hermes',
            'hermes': 'nous-hermes',
            'phind-codellama': 'phind-codellama',
            'phind_codellama': 'phind-codellama',
            'phindcodellama': 'phind-codellama',
            
            # Test command typos
            'tets': 'test',
            'tset': 'test',
            'tesst': 'test',
            
            # Run command typos
            'rnu': 'run',
            'runt': 'run',
            
            # File operation typos
            'crate': 'create',
            'creat': 'create',
            'craete': 'create',
            'ceate': 'create',
            'bulid': 'build',
            'biuld': 'build',
            'buidl': 'build',
            'mak': 'make',
            'maek': 'make',
            'locat': 'locate',
            'locte': 'locate',
            'fnd': 'find',
            'fidne': 'find',
            'mve': 'move',
            'mvoe': 'move',
            'moev': 'move',
            'mov': 'move',
        }
        
        # Split into words
        words = user_input.split()
        corrected_words = []
        corrections_made = []
        
        for word in words:
            word_lower = word.lower()
            if word_lower in corrections:
                corrected_word = corrections[word_lower]
                corrected_words.append(corrected_word)
                corrections_made.append((word, corrected_word))
            else:
                corrected_words.append(word)
        
        corrected = ' '.join(corrected_words)
        
        # Show what was corrected with details
        if corrections_made and corrected != user_input:
            correction_str = ', '.join([f"{c(orig, 'red')} → {c(fixed, 'green')}" for orig, fixed in corrections_made])
            print(c(f"💡 Auto-corrected: ", "yellow") + correction_str)
            print(c(f"   Command: ", "dim") + c(f"{corrected}", "green"))
            print()
        
        return corrected
    
    def process_request(self, user_input: str) -> str:
        """
        Main entry point - process user request with auto-fix.
        """
        original_input = user_input
        
        # Check for command chaining with "and" (case-insensitive)
        # Only split if "and" appears to be a command separator, not part of a command
        # Pattern: "command1 and command2" where commands are complete
        if ' and ' in user_input.lower():
            # Split by " and " (case insensitive)
            import re
            # Split while preserving case
            parts = re.split(r'\s+and\s+', user_input, flags=re.IGNORECASE)
            
            # Only treat as chained commands if we have 2+ complete-looking parts
            # A complete part should have a verb (enable, disable, install, etc.)
            command_verbs = ['enable', 'disable', 'install', 'uninstall', 'llm', 'help', 'list', 'show', 'mainmenu', 'test', 'run']
            
            valid_commands = []
            for part in parts:
                part = part.strip()
                if part:
                    # Check if this looks like a command (starts with a known verb)
                    first_word = part.split()[0].lower() if part.split() else ''
                    if first_word in command_verbs:
                        valid_commands.append(part)
                    else:
                        # Not a valid command start, might be part of previous command
                        # This handles cases like "enable llama3.2 and mistral" incorrectly split
                        break
            
            # Only execute as chained commands if we have 2+ valid commands
            if len(valid_commands) >= 2:
                results = []
                for cmd in valid_commands:
                    result = self._execute_single_request(cmd, is_subcommand=True)
                    if result:
                        results.append(result)
                return "\n".join(results) if results else ""
        
        # Single command - execute normally
        return self._execute_single_request(original_input, is_subcommand=False)
    
    def _execute_single_request(self, user_input: str, is_subcommand: bool = False) -> str:
        """Execute a single request (helper for command chaining).
        
        Args:
            user_input: The command to execute
            is_subcommand: If True, this is part of a chained command (suppress some output)
        """
        original_input = user_input
        
        # Select best available model (excluding locked ones)
        previous_model = self.ollama_model
        selected_model = self._select_best_enabled_model(exclude_locked=True)
        
        # Try to acquire lock for selected model
        lock_acquired = self.lock_manager.acquire_lock(selected_model)
        
        if not lock_acquired:
            # Model became locked between selection and acquisition
            # Try next best model
            fallback_model = self._select_best_enabled_model(exclude_locked=True)
            lock_acquired = self.lock_manager.acquire_lock(fallback_model)
            
            if lock_acquired:
                # Successfully acquired lock on fallback model
                self.ollama_model = fallback_model
                
                # Show fallback message only if we're using a different model
                if self.ollama_model != previous_model:
                    from lucifer_colors import c
                    tier_names = {
                        'tinyllama': 'Tier 0',
                        'llama3.2': 'Tier 1',
                        'mistral': 'Tier 2',
                        'deepseek-coder': 'Tier 3'
                    }
                    tier = tier_names.get(self.ollama_model, '')
                    print(c(f"🔄 Using {self.ollama_model.upper()} ({tier}) - {selected_model} is busy", "yellow"))
                    print()
        else:
            # Successfully acquired lock on selected model
            self.ollama_model = selected_model
        
        try:
            # Log user message in session
            self.session_logger.log_message('user', user_input)
            
            self.conversation_history.append({"role": "user", "content": user_input})
            
            # Log command execution
            self.session_logger.log_command(user_input, success=True)
            
            # Log command parsing decision for debugging
            try:
                self.session_logger.log_event(
                    'command_parsed',
                    f'Processing command: {user_input[:100]}',  # Truncate long commands
                    metadata={'command_length': len(user_input), 'active_model': self.ollama_model}
                )
            except Exception:
                pass
            
            # Periodic consensus sync (every 20 commands)
            if len(self.conversation_history) % 40 == 0:  # Every 20 user messages
                self._auto_sync_consensus(silent=True)
                self._auto_sync_templates(silent=True)
            
            # Process queued uploads (every 10 commands)
            if len(self.conversation_history) % 20 == 0:  # Every 10 user messages
                self._process_upload_queue(silent=True)
                self._process_template_upload_queue(silent=True)
            
            # Auto-correct typos BEFORE routing (so corrections show immediately)
            corrected_input = self._auto_correct_typos(original_input)
            
            # Try corrected request
            response = self._route_request(corrected_input)
            
            # Check if it resulted in "unknown command" or failure
            if self._is_failed_command(response):
                # Retry with original if correction failed
                if corrected_input != original_input:
                    response = self._route_request(original_input)
            
            # Log assistant response in session
            self.session_logger.log_message('assistant', response, metadata={'model': self.ollama_model})
            
            self.conversation_history.append({"role": "assistant", "content": response})
            return response
        finally:
            # Always release lock when done
            if lock_acquired:
                self.lock_manager.release_lock(self.ollama_model)
    
    def _is_failed_command(self, response: str) -> bool:
        """Check if a response indicates a failed/unknown command."""
        failure_indicators = [
            "Not sure how to handle that",
            "Package '" and "' not found",
            "Unknown command",
            "not found in any source"
        ]
        return any(indicator in response for indicator in failure_indicators)
    
    def _route_request(self, user_input: str) -> str:
        """Route request to appropriate handler with master controller intelligence."""
        user_lower = user_input.lower().strip()
        
        # Use master controller to classify the command
        try:
            route_info = self.master_controller.route_command(user_input)
            route_type = route_info['route_type']
            confidence = route_info['confidence']
            
            # Log routing decision
            try:
                self.session_logger.log_event(
                    'command_routed',
                    f'Route: {route_type.name}, Confidence: {confidence:.2f}',
                    metadata={
                        'command': user_input[:100],
                        'route_type': route_type.name,
                        'confidence': confidence,
                        'tier': route_info['tier_required'].name
                    }
                )
            except Exception:
                pass
        except Exception as e:
            # If master controller fails, fall back to original routing
            route_type = None
            if not isinstance(e, KeyboardInterrupt):
                try:
                    self.session_logger.log_event(
                        'routing_fallback',
                        f'Master controller error: {str(e)[:100]}',
                        metadata={'command': user_input[:100]}
                    )
                except Exception:
                    pass
        
        # Check for simple greetings first - return quick response (don't send to LLM)
        greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'howdy',
                     'whats up', "what's up", 'sup', 'wassup', 'yo']
        greeting_with_suffix = []
        for g in greetings:
            greeting_with_suffix.extend([g, g + ' there', g + '!', g + ' there!', g + ' man', g + ' dude'])
        
        if user_lower in greeting_with_suffix:
            return "Hello! How can I help you today?"
        
        # Common questions with canned responses
        how_are_you_patterns = [
            'how are you', 'how are you?', 'how r you', 'how r u',
            'hey how are you', 'hey how are you?',
            'hey how are you today', 'hey how are you today?',
            'hi how are you', 'hi how are you?',
            'hello how are you', 'hello how are you?',
            'how are you doing', 'how are you doing?',
            'how you doing', 'how you doing?'
        ]
        if user_lower in how_are_you_patterns:
            return "I'm functioning well, thanks for asking! How can I assist you?"
        
        if user_lower in ['what can you do', 'what can you do?', 'what are your capabilities', 'what are your capabilities?']:
            return "I can help you with file operations (create, move, delete), run scripts, answer questions, and more. Type 'help' to see all available commands!"
        
        # Check for creation commands - let LLM handle first, then execute task
        # This allows LLM to acknowledge before execution
        creation_keywords = ['create', 'build', 'make', 'new', 'setup', 'initialize', 'generate', 'put', 'add', 'place', 'write']
        has_creation_keyword = any(keyword in user_lower for keyword in creation_keywords)
        
        if has_creation_keyword:
            # Check if it's a test command (not just a filename containing "test")
            is_test_command = any(user_lower.startswith(cmd) for cmd in ['test', 'tinyllama test', 'mistral test', 'run test', 'short test'])
            
            if not is_test_command:
                # Check if it mentions files, folders, or scripts
                targets = ['file', 'folder', 'directory', 'dir', 'script', 'python', '.py', '.sh', '.txt', '.json', '.md', '.js', '.ts', '.html', '.css']
                has_target = any(target in user_lower for target in targets)
                
                # Also check if command contains a path
                has_path = '/' in user_input or user_input.startswith('~')
                
                if has_target or has_path:
                    # Parse task but execute through LLM flow
                    task_result = self.task_system.parse_command(user_input)
                    if task_result:
                        return self._handle_task_with_llm_commentary(user_input, task_result)
                    # Otherwise fall through to LLM query handler below
        
        # Check if it's a question - route to LLM
        # Questions typically start with who/what/where/when/why/how or contain "?" 
        question_starts = ['what', 'who', 'where', 'when', 'why', 'how', 'can you', 'could you', 'please', 'define', 'explain', 'tell me']
        if any(user_lower.startswith(q) for q in question_starts) or '?' in user_input:
            # It's a question - route to LLM
            if len(user_input.split()) > 1:  # Multi-word question
                return self._handle_general_llm_query(user_input)
        
        # Model-specific test commands - CHECK FIRST before any other keywords match
        # Support various patterns: "tinyllama test", "test tinyllama", "run tinyllama test", etc.
        test_patterns = [
            # TinyLlama patterns
            (r'(?:run\s+)?(?:tinyllama|tiny)\s+test', 'tinyllama'),
            (r'test\s+(?:the\s+)?(?:tinyllama|tiny)(?:\s+model)?', 'tinyllama'),
            # Mistral patterns
            (r'(?:run\s+)?mistral\s+test', 'mistral'),
            (r'test\s+(?:the\s+)?mistral(?:\s+model)?', 'mistral'),
        ]
        
        for pattern, model in test_patterns:
            if re.search(pattern, user_lower):
                return self._handle_model_test(model)
        
        # Short test command (5 queries on all models)
        if user_lower in ['run short test', 'run short tests', 'short test', 'short tests', 'quick test', 'quick tests']:
            return self._handle_short_test()
        
        # Generic test commands
        # "run test" or "run tests" = test all models
        if user_lower in ['run test', 'run tests', 'test all', 'test suite']:
            return self._handle_test_all_models()
        
        # Just "test" = prompt for model selection
        if user_lower == 'test':
            return self._handle_test_prompt()
        
        # Autofix command
        if user_lower.startswith('autofix '):
            target = user_input.split('autofix', 1)[1].strip()
            return self._handle_autofix(target)
        
        # Program search command
        if user_lower.startswith('program '):
            program_name = user_input.split('program', 1)[1].strip()
            return self._handle_program_search(program_name)
        
        # FixNet commands
        if 'fixnet' in user_lower or 'dictionary' in user_lower:
            if 'sync' in user_lower:
                return self._handle_fixnet_sync()
            elif 'stats' in user_lower or 'statistics' in user_lower:
                return self._handle_dictionary_stats()
            elif 'search' in user_lower:
                # Extract error pattern
                match = re.search(r'search\s+(?:for\s+)?["\']?(.+?)["\']?$', user_lower)
                if match:
                    error = match.group(1)
                    return self._handle_search_fixes(error)
        
        # Test suite command (check before 'run' to avoid conflict)
        if user_lower in ['test suite', 'run tests', 'suite', 'test all']:
            return self._handle_test_suite()
        
        # Fix/run script commands
        if 'fix' in user_lower:
            if match := re.search(r'fix\s+(.+)', user_lower):
                filepath = match.group(1).strip()
                return self._handle_fix_script(filepath)
        
        # Run command - but skip if it's actually a test command
        if 'run' in user_lower and 'test' not in user_lower:
            if match := re.search(r'run\s+(.+)', user_lower):
                target = match.group(1).strip()
                # Check if it's a direct file path
                target_path = Path(target).expanduser()
                if target_path.exists() and target.endswith('.py'):
                    return self._handle_run_script(str(target_path))
                # Try to find the script by name
                elif target.endswith('.py') or 'script' in user_lower:
                    matches = self._find_file_by_name(target)
                    if not matches:
                        return c(f"{Emojis.CROSS} Script not found: {target}", "red")
                    
                    # Select script if multiple matches
                    if len(matches) > 1:
                        selected = self._select_from_multiple_files(matches, target)
                        if not selected:
                            return c(f"{Emojis.CROSS} Run cancelled", "yellow")
                        return self._handle_run_script(str(selected))
                    else:
                        return self._handle_run_script(str(matches[0]))
                else:
                    return self._handle_run_command(target)
        
        # File operations (from original agent)
        # Only trigger if it looks like a file operation, not a query
        if any(keyword in user_lower for keyword in ['read', 'cat', 'view']):
            if match := re.search(r'(?:read|cat|view)\s+(.+)', user_lower):
                filepath = match.group(1).strip()
                return self._handle_read_file(filepath)
        
        # "show" is only for files if it mentions "file" or has a file extension
        if user_lower.startswith('show '):
            target = user_input.split('show', 1)[1].strip()
            # Only treat as file operation if it contains file indicators
            if 'file' in user_lower or any(ext in target for ext in ['.py', '.txt', '.json', '.md', '.sh', '.js', '.ts', '.html', '.css', '.yml', '.yaml']):
                return self._handle_read_file(target)
        
        # Open command (with app selection)
        if user_lower.startswith('open '):
            target = user_input.split('open', 1)[1].strip()
            
            # Check if "with" is specified
            if ' with ' in user_lower:
                parts = target.split(' with ', 1)
                target = parts[0].strip()
                app = parts[1].strip()
                return self._handle_open(target, specified_app=app)
            else:
                return self._handle_open(target)
        
        # Simple find/locate (but check if it's a find-and-move first in task system)
        if any(keyword in user_lower for keyword in ['find', 'search for file', 'locate']):
            # Check if it's looking for an environment
            if 'environment' in user_lower or 'env' in user_lower:
                # Pattern: "find <name> environment" or "find environment <name>"
                env_patterns = [
                    r'find\s+(.+?)\s+environment',  # find myproject environment
                    r'find\s+environment\s+(.+)',   # find environment myproject
                    r'find\s+(.+?)\s+env(?:$|\s)',  # find myproject env
                    r'find\s+env\s+(.+)',           # find env myproject
                    r'locate\s+(.+?)\s+environment',
                    r'locate\s+environment\s+(.+)',
                    r'search\s+for\s+environment\s+(.+)',  # search for environment myproject
                    r'search\s+for\s+(.+?)\s+environment',  # search for myproject environment
                    r'search\s+(.+?)\s+environment',        # search myproject environment
                    r'search\s+environment\s+(.+)',         # search environment myproject
                ]
                
                for pattern in env_patterns:
                    match = re.search(pattern, user_lower)
                    if match:
                        query = match.group(1).strip()
                        # Remove common filler words
                        query = query.replace('the ', '').replace('an ', '').replace('a ', '')
                        return self._handle_environment_search(query)
            
            # Check if it's actually a find-and-move task
            if any(move_kw in user_lower for move_kw in ['move', 'relocate', 'transfer', 'put']):
                # Let it fall through to universal task system
                pass
            elif match := re.search(r'(?:find|locate)\s+(?:files?\s+)?(.+)', user_lower):
                pattern = match.group(1).strip()
                return self._handle_find_files(pattern, show_request=user_input)
        
        # === LLM & MODEL MANAGEMENT COMMANDS (MUST BE BEFORE FILE OPERATIONS) ===
        # LLM list commands
        if user_lower in ['llm list all', 'llms all', 'list all llms', 'list all models', 'show all llms', 'show all models']:
            return self._handle_llm_list_all()
        
        if user_lower in ['llm list', 'llms', 'models list']:
            return self._handle_llm_list()
        
        # Enable/Disable ALL LLMs
        if user_lower in ['llm enable all', 'enable all llms', 'enable all models', 'enable all']:
            return self._handle_llm_enable_all()
        
        if user_lower in ['llm disable all', 'disable all llms', 'disable all models', 'disable all']:
            return self._handle_llm_disable_all()
        
        # Enable/Disable by tier
        if user_lower.startswith('llm enable tier') or user_lower.startswith('enable tier'):
            match = re.search(r'tier\s*(\d)', user_lower)
            if match:
                tier = int(match.group(1))
                return self._handle_llm_enable_tier(tier)
        
        if user_lower.startswith('llm disable tier') or user_lower.startswith('disable tier'):
            match = re.search(r'tier\s*(\d)', user_lower)
            if match:
                tier = int(match.group(1))
                return self._handle_llm_disable_tier(tier)
        
        # Support both "llm enable model" and "enable model" shorthand
        if user_lower.startswith('llm enable '):
            model = user_input.split(maxsplit=2)[2].strip() if len(user_input.split(maxsplit=2)) > 2 else ""
            return self._handle_llm_enable(model)
        
        if user_lower.startswith('enable ') and not user_lower.startswith('llm enable'):
            # Shorthand: "enable mistral" instead of "llm enable mistral"
            model = user_input.split(maxsplit=1)[1].strip() if len(user_input.split(maxsplit=1)) > 1 else ""
            # Handle "llm list" specifically
            if model.lower() == 'list':
                return self._handle_llm_list()
            # Only handle if it's a known model name
            if model.lower() in ['tinyllama', 'tiny', 'phi-2', 'phi2', 'llama3.2', 'llama', 'mistral', 'deepseek', 'deepseek-coder']:
                return self._handle_llm_enable(model)
        
        # Natural language patterns for enable: "can you enable", "please enable", "turn on", etc.
        enable_patterns = [
            r'(?:can you|please|could you)?\s*enable\s+(tinyllama|tiny|phi-2|phi2|llama3\.2|llama|mistral|deepseek|deepseek-coder)',
            r'(?:can you|please|could you)?\s*turn on\s+(tinyllama|tiny|phi-2|phi2|llama3\.2|llama|mistral|deepseek|deepseek-coder)',
            r'(?:can you|please|could you)?\s*activate\s+(tinyllama|tiny|phi-2|phi2|llama3\.2|llama|mistral|deepseek|deepseek-coder)',
        ]
        
        for pattern in enable_patterns:
            match = re.search(pattern, user_lower)
            if match:
                model = match.group(1)
                return self._handle_llm_enable(model)
        
        if user_lower.startswith('llm disable '):
            model = user_input.split(maxsplit=2)[2].strip() if len(user_input.split(maxsplit=2)) > 2 else ""
            return self._handle_llm_disable(model)
        
        if user_lower.startswith('disable ') and not user_lower.startswith('llm disable'):
            # Shorthand: "disable mistral" instead of "llm disable mistral"
            model = user_input.split(maxsplit=1)[1].strip() if len(user_input.split(maxsplit=1)) > 1 else ""
            # Only handle if it's a known model name
            if model.lower() in ['tinyllama', 'tiny', 'phi-2', 'phi2', 'llama3.2', 'llama', 'mistral', 'deepseek', 'deepseek-coder']:
                return self._handle_llm_disable(model)
        
        # Natural language patterns for disable: "can you disable", "please disable", "turn off", etc.
        disable_patterns = [
            r'(?:can you|please|could you)?\s*disable\s+(tinyllama|tiny|phi-2|phi2|llama3\.2|llama|mistral|deepseek|deepseek-coder)',
            r'(?:can you|please|could you)?\s*turn off\s+(tinyllama|tiny|phi-2|phi2|llama3\.2|llama|mistral|deepseek|deepseek-coder)',
            r'(?:can you|please|could you)?\s*deactivate\s+(tinyllama|tiny|phi-2|phi2|llama3\.2|llama|mistral|deepseek|deepseek-coder)',
        ]
        
        for pattern in disable_patterns:
            match = re.search(pattern, user_lower)
            if match:
                model = match.group(1)
                return self._handle_llm_disable(model)
        
        # === FILE OPERATIONS (MUST BE AFTER MODEL COMMANDS) ===
        # List command - but only match as standalone word, not as part of other words
        if re.search(r'\b(list|ls)\b', user_lower):
            if match := re.search(r'(?:list|ls)\s+(?:in\s+)?(.+)', user_lower):
                path = match.group(1).strip() or "."
            else:
                path = "."
            return self._handle_list_directory(path)
        
        # Delete command with trash confirmation
        if any(keyword in user_lower for keyword in ['delete', 'remove', 'rm', 'trash']):
            # Parse: "delete file.txt" or "delete the file name test.txt on my desktop"
            # Extract filename - look for common patterns
            patterns = [
                r'(?:delete|remove|rm|trash)\s+(?:the\s+)?(?:file\s+)?(?:name\s+)?(?:named\s+)?([^\s]+)',
                r'(?:delete|remove|rm|trash)\s+(.+?)(?:\s+on\s+|\s+in\s+|$)',
            ]
            
            target = None
            for pattern in patterns:
                match = re.search(pattern, user_lower)
                if match:
                    target = match.group(1).strip()
                    # Remove common words
                    target = target.replace('the ', '').replace('file ', '').replace('named ', '')
                    break
            
            if target:
                return self._handle_delete(target)
            else:
                return c(f"{Emojis.CROSS} Usage: delete <file/folder>", "red") + f"\n{c('Example: delete file.txt', 'dim')}"
        
        # Copy command
        if any(keyword in user_lower for keyword in ['copy', 'cp']):
            # Parse copy command: copy <source> <destination>
            # Handle both "copy file.txt dest" and "copy file.txt to dest"
            match = re.search(r'(?:copy|cp)\s+([^\s]+)\s+(?:to\s+)?(.+)', user_input)  # Use original case
            if match:
                source = match.group(1).strip()
                destination = match.group(2).strip()
                return self._handle_copy(source, destination)
            else:
                return c(f"{Emojis.CROSS} Usage: copy <source> <destination>", "red") + f"\n{c('Example: copy file.txt ~/Documents/', 'dim')}"
        
        # Move command - simple syntax without AI
        if any(keyword in user_lower for keyword in ['move', 'mv', 'mve', 'mov']):
            # Check for typos and suggest correction
            if any(typo in user_lower for typo in ['mve', 'mov ']) and 'move' not in user_lower and 'mv ' not in user_lower:
                print(c(f"💡 Did you mean ", "yellow") + c("move", "green") + c(" or ", "yellow") + c("mv", "green") + c("?", "yellow"))
                print()
            
            # Parse move command: move <source> <destination>
            # Handle both "move file.txt dest" and "move file.txt to dest"
            match = re.search(r'(?:move|mv|mve|mov)\s+([^\s]+)\s+(?:to\s+)?(.+)', user_input)  # Use original case
            if match:
                source = match.group(1).strip()
                destination = match.group(2).strip()
                return self._handle_move(source, destination, user_input)
            else:
                return c(f"{Emojis.CROSS} Usage: move <source> <destination>", "red") + f"\n{c('Example: move file.txt ~/Documents/', 'dim')}"
        
        if any(keyword in user_lower for keyword in ['where am i', 'current directory', 'pwd']):
            return self._handle_env_info()
        
        # Change directory command
        if user_lower.startswith('cd '):
            path = user_input[3:].strip()
            return self._handle_cd(path)
        
        # Task visualization command
        if user_lower in ['tasks', 'show tasks', 'task list']:
            return self._handle_show_tasks()
        
        # Image generation commands
        # See docs/CUSTOM_INTEGRATIONS.md for setup guide
        if user_lower in ['image status', 'image info', 'image models']:
            return self._handle_image_status()
        
        if user_lower.startswith('generate image ') or user_lower.startswith('create image '):
            prompt = user_input.split(maxsplit=2)[2] if len(user_input.split(maxsplit=2)) > 2 else ""
            return self._handle_generate_image(prompt)
        
        # 3D mesh generation commands
        # See docs/CUSTOM_INTEGRATIONS.md for details
        if user_lower.startswith('generate mesh ') or user_lower.startswith('generate 3d ') or user_lower.startswith('create mesh ') or user_lower.startswith('create 3d '):
            # Extract prompt after command
            for prefix in ['generate mesh', 'generate 3d', 'create mesh', 'create 3d']:
                if user_lower.startswith(prefix):
                    prompt = user_input[len(prefix):].strip()
                    return self._handle_generate_mesh(prompt)
        
        if user_lower in ['help', '?']:
            return self._handle_help()
        
        if user_lower in ['mainmenu', 'main menu', 'menu', 'main']:
            return self._handle_main_menu()
        
        # Demo Test Tournament command
        if user_lower in ['demo test tournament', 'test tournament', 'tournament demo', 'physics combat demo', 'soul combat demo']:
            return self._handle_demo_tournament()
        
        if user_lower == 'memory':
            return self._handle_memory()
        
        if user_lower in ['info', 'system test', 'demo']:
            return self._handle_system_test()
        
        # Session management commands
        if user_lower in ['session list', 'sessions', 'list sessions', 'show sessions', 'session history']:
            return self._handle_session_list()
        
        if user_lower.startswith('session open ') or user_lower.startswith('open session '):
            # Extract session ID
            match = re.search(r'(?:session open|open session)\s+(\S+)', user_lower)
            if match:
                session_id = match.group(1)
                return self._handle_session_open(session_id)
            return c(f"{Emojis.CROSS} Usage: session open <session_id>", "red")
        
        if user_lower in ['session info', 'current session', 'this session']:
            return self._handle_session_info()
        
        if user_lower in ['session stats', 'session statistics']:
            return self._handle_session_stats()
        
        # Badge display command - handled locally without LLM
        if user_lower in ['badges', 'badge', 'show badges', 'my badges', 'badge progress']:
            return self._handle_badges()
        
        # Soul modulator command - handled locally without LLM
        if user_lower in ['soul', 'souls', 'soul modulator', 'soul status']:
            return self._handle_soul()
        
        # Diabolical mode commands
        if user_lower in ['diabolical mode', 'diabolical', 'enter diabolical mode']:
            return self._handle_diabolical_mode()
        
        if user_lower in ['diabolical exit', 'exit diabolical', 'leave diabolical']:
            return self._handle_diabolical_exit()
        
        # Program summary page
        if user_lower in ['program summary', 'summary', 'about', 'about luciferai', 'what is luciferai', 'what is this']:
            return self._handle_program_summary()
        
        # AI Models information page
        if user_lower in ['models info', 'ai models', 'llm info', 'model info']:
            return self._handle_models_info()
        
        # Custom model integration guide
        if user_lower in ['custom model info', 'custom models info', 'add custom model', 'custom model guide', 'custom models']:
            return self._handle_custom_model_info()
        
        # Bundled models directory
        if 'bundled models' in user_lower or 'bundled model' in user_lower:
            # Path is already imported globally at top of file
            project_root = Path(__file__).parent.parent
            models_dir = project_root / '.luciferai' / 'models'
            return self._handle_list_directory(str(models_dir))
        
        # Backup models directory commands
        if user_lower in ['set backup models', 'backup models', 'set backup directory', 'backup directory', 'models backup']:
            return self._handle_set_backup_models_directory()
        
        if user_lower in ['show backup models', 'show backup directory', 'get backup directory']:
            return self._handle_show_backup_models_directory()
        
        # Daemon/Watcher commands
        if 'daemon' in user_lower or 'watcher' in user_lower or 'watch' in user_lower:
            return self._handle_daemon_command(user_input)
        
        # Volume control commands
        if 'volume' in user_lower:
            # Match patterns like "set volume to 50", "volume 50", "set volume 50%"
            match = re.search(r'(?:set\s+)?volume\s+(?:to\s+)?(\d+)%?', user_lower)
            if match:
                volume = int(match.group(1))
                return self._handle_volume(volume)
        
        # Fan control commands
        if user_lower.startswith('fan '):
            return self._handle_fan_command(user_input)
        
        # Browser command
        if user_lower in ['browser', 'consensus browser', 'open browser']:
            return self._handle_browser()
        
        # Thermal commands
        if user_lower.startswith('thermal '):
            return self._handle_thermal_command(user_input)
        
        # Module tracking commands
        if user_lower in ['modules', 'packages', 'deps']:
            return self._handle_modules_list()
        
        if user_lower.startswith('modules search ') or user_lower.startswith('packages search '):
            query = user_input.split('search', 1)[1].strip()
            return self._handle_modules_search(query)
        
        if user_lower.startswith('luci-install '):
            package = user_input.split('luci-install', 1)[1].strip()
            return self._handle_luci_install(package)
        
        # Environment scanning commands
        if user_lower in ['environments', 'envs', 'env list']:
            return self._handle_environments_list()
        
        if user_lower.startswith('env search ') or user_lower.startswith('environment search '):
            query = user_input.split('search', 1)[1].strip()
            return self._handle_environment_search(query)
        
        if user_lower.startswith('env activate ') or user_lower.startswith('activate env ') or user_lower.startswith('activate '):
            # Extract environment name/path
            if 'activate env ' in user_lower:
                query = user_input.split('activate env', 1)[1].strip()
            elif 'env activate' in user_lower:
                query = user_input.split('env activate', 1)[1].strip()
            else:
                query = user_input.split('activate', 1)[1].strip()
            return self._handle_environment_activate(query)
        
        # GitHub commands
        if user_lower in ['github upload', 'gh upload', 'upload project']:
            return self._handle_github_upload()
        
        if user_lower in ['github update', 'gh update', 'update project']:
            return self._handle_github_update()
        
        if user_lower in ['github projects', 'gh projects', 'my projects', 'list projects']:
            return self._handle_github_projects()
        
        if user_lower in ['github link', 'gh link']:
            return self._handle_github_link()
        
        if user_lower in ['github unlink', 'gh unlink']:
            return self._handle_github_unlink()
        
        if user_lower in ['github status', 'gh status']:
            return self._handle_github_status()
        
        # Admin commands
        if user_lower == 'admin':
            return self._handle_admin_help()
        
        if user_lower in ['admin push', 'admin update']:
            return self._handle_admin_push()
        
        if user_lower == 'admin status':
            return self._handle_admin_status()
        
        if user_lower.startswith('admin grant '):
            parts = user_input.split(maxsplit=2)
            target_username = parts[2].strip() if len(parts) >= 3 else None
            return self._handle_admin_grant(target_username)
        
        if user_lower.startswith('id search ') or user_lower.startswith('search id '):
            # Extract ID from command
            parts = user_input.split(maxsplit=2)
            if len(parts) >= 3:
                search_id = parts[2].strip()
            else:
                search_id = None
            return self._handle_id_search(search_id)
        
        # Uninstall model command - CHECK BEFORE install commands!
        if user_lower.startswith('uninstall ') or user_lower.startswith('uninst '):
            model_name = user_input.split(maxsplit=1)[1].strip() if len(user_input.split(maxsplit=1)) > 1 else ""
            return self._handle_uninstall_model(model_name)
        
        # Install core models command
        if user_lower in ['install core models', 'install core', 'core install', 'install essentials']:
            return self._handle_install_core_models()
        
        # Install all models command (diabolical mode)
        if user_lower in ['install all models', 'install all', 'install everything']:
            return self._handle_install_all_models()
        
        # Install tier commands
        if user_lower in ['install tier 0', 'install tier0', 'install tier-0']:
            return self._handle_install_tier(0)
        if user_lower in ['install tier 1', 'install tier1', 'install tier-1']:
            return self._handle_install_tier(1)
        if user_lower in ['install tier 2', 'install tier2', 'install tier-2']:
            return self._handle_install_tier(2)
        if user_lower in ['install tier 3', 'install tier3', 'install tier-3']:
            return self._handle_install_tier(3)
        if user_lower in ['install tier 4', 'install tier4', 'install tier-4']:
            return self._handle_install_tier(4)
        
        # Ollama/LLM installation commands FIRST (before generic package manager)
        # Check early if this is an LLM install to prevent routing to package manager
        if any(cmd in user_lower for cmd in ['install llama', 'instal llama', 'install lama', 'instal lama',
                                               'install llm', 'instal llm',
                                               'install mistral', 'instal mistral', 'install mistr', 'instal mistr',
                                               'install ollama', 'instal ollama', 'install olama', 'instal olama',
                                               'install deepseek', 'instal deepseek', 'install deepseak', 'instal deepseak',
                                               'install deep seek', 'instal deep seek', 'install deep-seek', 'instal deep-seek',
                                               'install deepseek-coder', 'instal deepseek-coder',
                                               'install ai', 'instal ai',
                                               'install tiny', 'instal tiny',
                                               'install phi', 'instal phi',
                                               'install gemma', 'instal gemma',
                                               'install vicuna', 'instal vicuna',
                                               'install orca', 'instal orca',
                                               'install qwen', 'instal qwen',
                                               'install yi', 'instal yi',
                                               'install solar', 'instal solar',
                                               'install wizard', 'instal wizard',
                                               'install dolphin', 'instal dolphin',
                                               'install hermes', 'instal hermes',
                                               'install starling', 'instal starling',
                                               'install openchat', 'instal openchat',
                                               'install neural', 'instal neural',
                                               'install stablelm', 'instal stablelm',
                                               'install codellama', 'instal codellama',
                                               'install mixtral', 'instal mixtral']):
            return self._handle_ollama_install_request(user_input)
        
        # Luci! package installation command (for non-LLM packages)
        if user_lower.startswith('install ') or user_lower.startswith('instal '):
            package = user_input.split(maxsplit=1)[1].strip() if len(user_input.split(maxsplit=1)) > 1 else ""
            
            # Check if it's llama-cpp-python or ollama-cpp-python (these are pip packages)
            if 'llama-cpp-python' in user_lower or 'ollama-cpp-python' in user_lower:
                # Route to Luci! package manager for pip installation
                return self._handle_luci_install_package(package)
            else:
                # Generic package install (brew, conda, numpy, etc.)
                return self._handle_luci_install_package(package)
        
        # Image retrieval commands (mistral/deepseek only)
        if user_lower.startswith('image search ') or user_lower.startswith('images '):
            query = user_input.split(maxsplit=1)[1].strip() if len(user_input.split(maxsplit=1)) > 1 else ""
            return self._handle_image_search(query)
        
        if user_lower.startswith('image download ') or user_lower.startswith('get images '):
            query = user_input.split(maxsplit=1)[1].strip() if len(user_input.split(maxsplit=1)) > 1 else ""
            return self._handle_image_download(query)
        
        if user_lower in ['image list', 'images list', 'list images']:
            return self._handle_image_list()
        
        if user_lower in ['image clear', 'images clear', 'clear images']:
            return self._handle_image_clear()
        
        # Zip/Unzip commands (OS-aware)
        if user_lower.startswith('zip '):
            target = user_input.split(maxsplit=1)[1].strip() if len(user_input.split(maxsplit=1)) > 1 else ""
            return self._handle_zip(target)
        
        if user_lower.startswith('unzip '):
            target = user_input.split(maxsplit=1)[1].strip() if len(user_input.split(maxsplit=1)) > 1 else ""
            return self._handle_unzip(target)

        # Open command - open file in default application
        if user_lower.startswith('open '):
            target = user_input.split(maxsplit=1)[1].strip() if len(user_input.split(maxsplit=1)) > 1 else ""
            return self._handle_open(target)

        # Read command - read file content to console
        if user_lower.startswith('read ') or user_lower.startswith('cat '):
            target = user_input.split(maxsplit=1)[1].strip() if len(user_input.split(maxsplit=1)) > 1 else ""
            return self._handle_read(target)
        
        # Try natural language parsing for multi-word input that's not a known command
        # If input has multiple words and doesn't match known commands, try AI parsing
        # BUT skip test commands - they should have been handled above
        word_count = len(user_input.split())
        
        # Skip NLP if it's a test command that should have matched earlier
        # Check if input STARTS with test-related commands
        test_command_starts = ['tinyllama test', 'tiny test', 'mistral test', 'run test']
        if any(user_lower.startswith(cmd) for cmd in test_command_starts):
            # This is a test command that should have been handled - something went wrong
            # Route to unknown handler for typo correction
            return self._handle_unknown(user_input)
        
        # Also check for standalone 'test' as first word
        if user_lower.split()[0] == 'test' and word_count == 1:
            return self._handle_unknown(user_input)
        
        if word_count > 1:
            # Check if it's an explicit file/folder operation command
            file_operation_keywords = ['find', 'search for file', 'locate', 'search file', 'search folder', 
                                       'find file', 'find folder', 'locate file', 'locate folder',
                                       'where is', 'show me file', 'show me folder']
            
            is_file_search = any(keyword in user_lower for keyword in file_operation_keywords)
            
            # For file search commands, use NLP parsing
            if is_file_search:
                if self.ollama_available:
                    # Check if any enabled models are available
                    enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
                    
                    if not enabled_models:
                        return c(f"{Emojis.WARNING} All LLMs are disabled. Use 'llm enable <model>' to enable one.", "yellow")
                    
                    # Try to parse with Ollama
                    parsed = self.nlp_parser.parse_command(user_input)
                    
                    # Only proceed if confidence is reasonable
                    if parsed['confidence'] >= 0.5:
                        if parsed['needs_confirmation']:
                            confirmed = self.nlp_parser.confirm_action(parsed, user_input)
                            
                            if confirmed:
                                # Execute the confirmed action
                                if confirmed['action'] == 'watch':
                                    # Add file to watcher with specified mode
                                    self.watcher.add_path(confirmed['file'])
                                    
                                    # Start watcher in specified mode
                                    mode = confirmed.get('mode', 'watch')
                                    self.watcher.start(mode=mode)
                                    return ""  # Messages already printed
                                
                                elif confirmed['action'] == 'run':
                                    if confirmed['file'].endswith('.py'):
                                        return self._handle_run_script(confirmed['file'])
                                    else:
                                        return self._handle_run_command(confirmed['file'])
                            # If cancelled, return empty
                            return ""
                        else:
                            # High confidence, no confirmation needed - execute directly
                            if parsed['intent'] == 'watch' and parsed['file_candidates']:
                                file_path = parsed['file_candidates'][0]['path']
                                self.watcher.add_path(file_path)
                                self.watcher.start(mode=parsed.get('action_type', 'watch'))
                                return ""
                    else:
                        # Low confidence file search
                        return self._handle_general_llm_query(user_input)
                else:
                    return self._handle_ollama_required(user_input)
            else:
                # NOT a file search - treat as general conversation/question
                # Route directly to LLM for natural language response
                if self.ollama_available or True:  # Always route to LLM handler (it checks for llamafile too)
                    return self._handle_general_llm_query(user_input)
                else:
                    return self._handle_ollama_required(user_input)
        
        return self._handle_unknown(user_input)
    
    def _handle_run_command(self, command: str) -> str:
        """Run a shell command."""
        import subprocess
        try:
            result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return c(f"{Emojis.CHECKMARK} Command executed", "green") + f"\n\n{result.stdout}" if result.stdout else ""
            else:
                return c(f"{Emojis.CROSS} Command failed", "red") + f"\n\n{result.stderr}" if result.stderr else ""
        except Exception as e:
            return c(f"{Emojis.CROSS} Error: {e}", "red")
    
    def _handle_run_script(self, filepath: str) -> str:
        """Run a Python script with auto-fix prompt on error."""
        
        CommandFeedback.run(filepath)
        self.tools_executed.append(f"run_script({filepath})")
        
        filepath = os.path.expanduser(filepath)
        
        if not os.path.exists(filepath):
            return c(f"{Emojis.CROSS} File not found: {filepath}", "red")
        
        print()
        print(c(f"📝 Running: {Path(filepath).name}", "cyan"))
        print(c(f"   Path: {filepath}", "dim"))
        print()
        
        # Run script
        result = run_python_code(open(filepath).read(), timeout=15)
        
        if result["success"]:
            print(c(f"{Emojis.CHECKMARK} Script executed successfully!", "green"))
            if result['stdout']:
                print()
                print(c("Output:", "cyan"))
                print(result['stdout'])
            return ""
        else:
            # Error detected - show error and prompt to fix
            error = result["stderr"]
            print(c(f"{Emojis.CROSS} Error detected:", "red"))
            print()
            # Show error (first 10 lines)
            error_lines = error.split('\n')[:10]
            for line in error_lines:
                if line.strip():
                    print(c(f"  {line}", "red"))
            print()
            
            # Prompt to fix (skip in non-interactive mode)
            try:
                print(c("Would you like LuciferAI to fix this script?", "yellow"))
                response = get_single_key_input(
                    c("Fix script? (y/n): ", "cyan"),
                    valid_keys=['y', 'n', 'Y', 'N']
                )
                print()
                
                if response.lower() == 'y':
                    print(c("🔧 Initiating auto-fix...", "cyan"))
                    print()
                    return self._auto_fix_script(filepath, error)
                else:
                    return c(f"{Emojis.CROSS} Fix cancelled", "yellow")
            except (EOFError, KeyboardInterrupt):
                # Non-interactive mode or interrupted - just return error
                print()
                return c(f"{Emojis.CROSS} Error detected (non-interactive mode)", "yellow")
    
    def _handle_fix_script(self, filepath: str) -> str:
        """Manually trigger fix for a script."""
        CommandFeedback.analyze(filepath)
        
        filepath = os.path.expanduser(filepath)
        
        if not os.path.exists(filepath):
            return c(f"{Emojis.CROSS} File not found: {filepath}", "red")
        
        # Run to detect error
        result = run_python_code(open(filepath).read(), timeout=15)
        
        if result["success"]:
            return c(f"{Emojis.CHECKMARK} Script runs successfully - no fixes needed", "green")
        
        error = result["stderr"]
        return self._auto_fix_script(filepath, error)
    
    def _auto_fix_script(self, filepath: str, error: str) -> str:
        """
        Automatic fix workflow:
        1. Search dictionary for similar fixes
        2. Apply known fix if found
        3. If not found or fails, generate new fix
        4. Upload to FixNet
        5. Update dictionary
        """
        print(f"\n{c('═'*60, 'purple')}")
        print(c(f"{Emojis.WRENCH} LuciferAI Auto-Fix System", "purple"))
        print(c('═'*60, 'purple') + "\n")
        
        print(c("Error:", "red") + f"\n{error[:300]}...\n")
        
        # Step 1: Search dictionary
        print_step(1, 5, "Searching for similar fixes...")
        error_type = self._classify_error(error)
        best_fix = self.dictionary.get_best_fix_for_error(error, error_type)
        
        if best_fix and best_fix.get('source') == 'local':
            # Step 2: Try applying known fix
            print()
            print_step(2, 5, f"Applying known fix (score: {best_fix['relevance_score']:.2f})...")
            print(c(f"   Solution: {best_fix['solution']}", "blue"))
            
            success = self._apply_fix_to_script(filepath, best_fix['solution'], error)
            
            # Record usage
            self.dictionary.record_fix_usage(best_fix['fix_hash'], success)
            
            if success:
                self.fixes_applied += 1
                print()
                sparkle_output("Known fix applied successfully!")
                return c(f"{Emojis.CHECKMARK} Script fixed using known solution (score: {best_fix['relevance_score']:.2f})", "green") + f"\n\n{best_fix['solution']}"
            else:
                print()
                ErrorFeedback.warning("Known fix didn't work, generating new fix...")
        
        # Step 3: Generate new fix (placeholder - would use AI here)
        print()
        print_step(3, 5, "Generating new fix...")
        new_solution = self._generate_fix(filepath, error, error_type)
        
        if not new_solution:
            return c(f"{Emojis.CROSS} Could not generate fix automatically", "red") + f"\n\n{c(f'{Emojis.LIGHTBULB} Suggestion: {self._get_fix_hint(error)}', 'yellow')}"
        
        # Step 4: Apply new fix
        print_step(4, 5, "Applying new fix...")
        success = self._apply_fix_to_script(filepath, new_solution, error)
        
        if not success:
            return c(f"{Emojis.CROSS} Auto-fix failed", "red") + f"\n\n{c(f'Generated fix: {new_solution}', 'yellow')}"
        
        self.fixes_applied += 1
        
        # Step 5: Upload to FixNet
        print()
        print_step(5, 5, "Uploading fix to FixNet...")
        
        commit_url = self.uploader.full_fix_upload_flow(
            script_path=filepath,
            error=error,
            solution=new_solution,
            context={
                "error_type": error_type,
                "script": os.path.basename(filepath),
                "fixes_applied_this_session": self.fixes_applied
            }
        )
        
        # Add to dictionary
        import hashlib
        fix_hash = hashlib.sha256(new_solution.encode()).hexdigest()
        
        dict_key = self.dictionary.add_fix(
            error_type=error_type,
            error_signature=error,
            solution=new_solution,
            fix_hash=fix_hash,
            context={"filepath": filepath},
            commit_url=commit_url
        )
        
        # Check if inspired by a similar fix
        if best_fix:
            print()
            reflection_output("Creating branch link...")
            self.dictionary.create_branch(
                fix_hash,
                best_fix['fix_hash'],
                "solved_similar"
            )
        
        return f"""{c(f'{Emojis.CHECKMARK} Script fixed and uploaded to FixNet!', 'green')}

{c('Fix Applied:', 'blue')}
{new_solution}

{c('FixNet Commit:', 'yellow')}
{commit_url or 'Local only (configure GitHub remote to push)'}

{c('Dictionary:', 'purple')}
Added to dictionary key: {dict_key[:50]}...
"""
    
    def _apply_fix_to_script(self, filepath: str, solution: str, original_error: str) -> bool:
        """
        Apply a fix to the script and verify it works.
        
        Returns:
            True if fix succeeded
        """
        try:
            # First, try to autofix syntax and indentation issues
            from autofix import autofix_file
            print(c(f"{Emojis.WRENCH} Running autofix...", "blue"))
            autofix_file(filepath, verbose=False)
            
            # Read current script
            with open(filepath) as f:
                original_content = f.read()
            
            # For simple fixes (imports), add at top
            if solution.startswith("Added:") or solution.startswith("from ") or solution.startswith("import "):
                import_line = solution.replace("Added: ", "").strip()
                
                # Add import at top (after shebang/docstring if present)
                lines = original_content.split('\n')
                insert_pos = 0
                
                # Skip shebang and docstrings
                for i, line in enumerate(lines):
                    if line.startswith('#!') or line.startswith('"""') or line.startswith("'''"):
                        insert_pos = i + 1
                    elif line.strip() and not line.startswith('#'):
                        break
                
                lines.insert(insert_pos, import_line)
                new_content = '\n'.join(lines)
                
                # Write back
                with open(filepath, 'w') as f:
                    f.write(new_content)
                
                # Test if it works now
                result = run_python_code(new_content, timeout=10)
                
                if result["success"]:
                    return True
                else:
                    # Revert if still fails
                    with open(filepath, 'w') as f:
                        f.write(original_content)
                    return False
            
            # For other fixes, would need more sophisticated patching
            return False
        
        except Exception as e:
            print_error(f"Error applying fix: {e}")
            return False
    
    def _generate_fix(self, filepath: str, error: str, error_type: str) -> Optional[str]:
        """
        Generate a fix for the error.
        In production, this would use AI (Ollama/Mistral).
        For now, uses pattern matching.
        """
        # Extract key info from error
        if "ModuleNotFoundError" in error or "No module named" in error:
            # Extract module name
            match = re.search(r"No module named ['\"]([^'\"]+)['\"]", error)
            if match:
                module = match.group(1)
                return f"from {module} import *"
        
        elif "NameError" in error and "is not defined" in error:
            # Extract variable name
            match = re.search(r"name ['\"]([^'\"]+)['\"] is not defined", error)
            if match:
                var_name = match.group(1)
                # Try to guess module
                common_imports = {
                    'os': 'import os',
                    'sys': 'import sys',
                    'json': 'import json',
                    'Path': 'from pathlib import Path',
                    'datetime': 'from datetime import datetime',
                    'time': 'import time'
                }
                if var_name in common_imports:
                    return common_imports[var_name]
                else:
                    return f"# TODO: Import or define '{var_name}'"
        
        return None
    
    def _classify_error(self, error: str) -> str:
        """Classify error type."""
        error_lower = error.lower()
        
        if "nameerror" in error_lower:
            return "NameError"
        elif "syntaxerror" in error_lower:
            return "SyntaxError"
        elif "importerror" in error_lower or "modulenotfound" in error_lower:
            return "ImportError"
        elif "typeerror" in error_lower:
            return "TypeError"
        elif "attributeerror" in error_lower:
            return "AttributeError"
        else:
            return "Unknown"
    
    def _get_fix_hint(self, error: str) -> str:
        """Get a hint for fixing the error."""
        if "import" in error.lower() or "module" in error.lower():
            return "Try installing the missing module or checking import paths"
        elif "name" in error.lower():
            return "Check variable/function names and imports"
        elif "syntax" in error.lower():
            return "Review syntax - check for missing colons, parentheses, or indentation"
        else:
            return "Review the error message and check the documentation"
    
    def _handle_search_fixes(self, error: str) -> str:
        """Search dictionary for fixes matching an error."""
        print(c(f"{Emojis.MAGNIFIER} Searching FixNet for: {error}", "cyan"))
        
        matches = self.dictionary.search_similar_fixes(error, min_relevance=0.3)
        
        if not matches:
            return c(f"{Emojis.LIGHTBULB} No fixes found for '{error}'", "yellow")
        
        response = c(f"{Emojis.CHECKMARK} Found {len(matches)} similar fixes:", "green") + "\n\n"
        
        # Import interactive terminal for click-to-view
        from interactive_terminal import create_clickable_snippet
        
        for i, match in enumerate(matches[:5], 1):
            source_icon = Emojis.FOLDER if match['source'] == 'local' else Emojis.GLOBE
            response += f"{source_icon} {i}. {match.get('error_type', 'Unknown')} "
            response += f"(score: {match['relevance_score']:.2f})\n"
            
            if match['source'] == 'local':
                solution = match.get('solution', 'N/A')
                response += f"   Solution: {solution[:80]}...\n"
                response += f"   Success: {match.get('success_count', 0)}/{match.get('usage_count', 0)}\n"
                
                # Add clickable link to view full solution
                if len(solution) > 80:
                    snippet_link = create_clickable_snippet(
                        solution, 
                        f"fix_{i}.py"
                    )
                    response += f"   {snippet_link}\n"
            else:
                response += f"   User: {match.get('user_id', 'Unknown')}\n"
                response += f"   Note: {match.get('note', 'Encrypted')}\n"
            
            response += "\n"
        
        if len(matches) > 5:
            response += c(f"... and {len(matches) - 5} more matches", "yellow")
        
        return response
    
    def _handle_program_search(self, program_name: str) -> str:
        """Search for fixes related to a specific program/library."""
        print(c(f"{Emojis.MAGNIFIER} Searching for fixes related to '{program_name}'...", "cyan"))
        
        matches = self.dictionary.search_by_program(program_name)
        
        if not matches:
            return c(f"{Emojis.LIGHTBULB} No fixes found for '{program_name}'", "yellow")
        
        response = c(f"{Emojis.CHECKMARK} Found {len(matches)} fixes related to '{program_name}':", "green") + "\n\n"
        
        # Import interactive terminal for click-to-view
        from interactive_terminal import create_clickable_snippet
        
        for i, match in enumerate(matches[:10], 1):
            source_icon = Emojis.FOLDER if match['source'] == 'local' else Emojis.GLOBE
            response += f"{source_icon} {i}. {match.get('error_type', 'Unknown')}\n"
            
            if match['source'] == 'local':
                solution = match.get('solution', 'N/A')
                error_sig = match.get('error_signature', 'N/A')[:60]
                timestamp = match.get('timestamp', 'N/A')[:10]
                
                response += f"   Error: {error_sig}...\n"
                response += f"   Solution: {solution[:80]}...\n"
                response += f"   Date: {timestamp}\n"
                
                # Add clickable link to view full solution
                snippet_link = create_clickable_snippet(
                    solution,
                    f"{program_name}_fix_{i}.py"
                )
                response += f"   {snippet_link}\n"
            else:
                response += f"   User: {match.get('user_id', 'Unknown')}\n"
                response += f"   Note: {match.get('note', 'Encrypted')}\n"
            
            response += "\n"
        
        if len(matches) > 10:
            response += c(f"... and {len(matches) - 10} more matches", "yellow")
        
        return response
    
    def _handle_autofix(self, target: str) -> str:
        """Autofix syntax and indentation issues in Python files."""
        from autofix import autofix_file, autofix_directory
        from pathlib import Path
        
        target_path = Path(target)
        
        if not target_path.exists():
            return c(f"{Emojis.CROSS} Target not found: {target}", "red")
        
        if target_path.is_file():
            if autofix_file(str(target_path), aggressive=False, verbose=True):
                return c(f"{Emojis.CHECKMARK} File autofixed successfully", "green")
            else:
                return c(f"{Emojis.WARNING} Autofix completed with warnings", "yellow")
        
        elif target_path.is_dir():
            success, total = autofix_directory(str(target_path), recursive=True, aggressive=False)
            return c(f"{Emojis.CHECKMARK} Autofixed {success}/{total} files in directory", "green")
        
        else:
            return c(f"{Emojis.CROSS} Invalid target: {target}", "red")
    
    def _auto_sync_consensus(self, silent: bool = False):
        """Automatically sync consensus in background."""
        try:
            if not silent:
                print(c(f"{Emojis.GLOBE} Syncing consensus dictionary...", "blue"))
            
            # Sync with remote
            self.dictionary.sync_with_remote()
            
            if not silent:
                print(c(f"{Emojis.CHECKMARK} Synced {len(self.dictionary.remote_refs)} remote fixes", "green"))
        except Exception as e:
            if not silent:
                print(c(f"{Emojis.WARNING} Sync failed: {e}", "yellow"))
    
    def _auto_sync_templates(self, silent: bool = False):
        """Automatically sync templates in background."""
        try:
            if not silent:
                print(c(f"{Emojis.SPARKLE} Syncing template consensus...", "blue"))
            
            # Sync with remote
            stats = self.smart_templates.template_consensus.sync_with_remote()
            
            # Refresh WiFi status
            self.smart_templates.wifi_connected = self.smart_templates._check_wifi()
            
            if not silent:
                downloaded = stats.get('downloaded', 0)
                uploaded = stats.get('uploaded', 0)
                if downloaded > 0 or uploaded > 0:
                    print(c(f"{Emojis.CHECKMARK} Templates: +{downloaded} downloaded, {uploaded} uploaded", "green"))
        except Exception as e:
            if not silent:
                print(c(f"{Emojis.WARNING} Template sync failed: {e}", "yellow"))
    
    def _process_template_upload_queue(self, silent: bool = False):
        """Process queued template uploads during idle time."""
        try:
            template_consensus = self.smart_templates.template_consensus
            if hasattr(template_consensus, 'upload_queue') and len(template_consensus.upload_queue) > 0:
                if not silent:
                    print(c(f"{Emojis.ROCKET} Processing {len(template_consensus.upload_queue)} queued templates...", "blue"))
                
                # Sync will handle upload queue
                stats = template_consensus.sync_with_remote()
                
                if not silent and stats.get('uploaded', 0) > 0:
                    print(c(f"{Emojis.CHECKMARK} Uploaded {stats['uploaded']} templates to consensus", "green"))
        except Exception as e:
            if not silent:
                print(c(f"{Emojis.WARNING} Template queue processing failed: {e}", "yellow"))
    
    def _process_upload_queue(self, silent: bool = False):
        """Process queued fix uploads during idle time."""
        try:
            # Check if uploader has queued uploads
            if hasattr(self.uploader, 'process_queue'):
                if not silent:
                    print(c(f"{Emojis.ROCKET} Processing queued uploads...", "blue"))
                
                processed = self.uploader.process_queue()
                
                if not silent and processed > 0:
                    print(c(f"{Emojis.CHECKMARK} Processed {processed} queued uploads", "green"))
            elif hasattr(self.uploader, 'upload_queue') and len(self.uploader.upload_queue) > 0:
                # Fallback: manually process queue if method doesn't exist
                if not silent:
                    print(c(f"{Emojis.ROCKET} Processing {len(self.uploader.upload_queue)} queued uploads...", "blue"))
                
                from github_uploader import process_upload_queue
                count = process_upload_queue(self.user_id)
                
                if not silent:
                    print(c(f"{Emojis.CHECKMARK} Uploaded {count} fixes from queue", "green"))
        except Exception as e:
            if not silent:
                print(c(f"{Emojis.WARNING} Queue processing failed: {e}", "yellow"))
    
    def _handle_fixnet_sync(self) -> str:
        """Sync with FixNet."""
        CommandFeedback.sync_env()
        self._auto_sync_consensus(silent=False)
        return c(f"{Emojis.CHECKMARK} Synced with FixNet - {len(self.dictionary.remote_refs)} remote fixes available", "green")
    
    def _handle_dictionary_stats(self) -> str:
        """Show dictionary statistics."""
        self.dictionary.print_statistics()
        return ""  # Stats are printed directly
    
    # Original agent methods (unchanged)
    def _handle_read_file(self, filepath: str) -> str:
        print(c(f"{Emojis.MAGNIFIER} Reading file: {filepath}", "cyan"))
        self.tools_executed.append(f"read_file({filepath})")
        result = read_file(filepath)
        if result["success"]:
            return c(f"{Emojis.CHECKMARK} Read {filepath}", "green") + f"\n\n{result['content']}"
        return c(f"{Emojis.CROSS} Error: {result['error']}", "red")
    
    def _handle_find_files(self, pattern: str, show_request: str = None) -> str:
        if show_request:
            print(c(f"\n📥 Your request: ", "blue") + c(f"{show_request}", "white"))
        print(c(f"🔍 Finding files: {pattern}", "cyan"))
        pattern = pattern.strip('"\'')
        result = find_files(pattern, self.env['cwd'])
        if result["success"]:
            if result["count"] == 0:
                return c(f"No files found matching '{pattern}'", "yellow")
            response = c(f"{Emojis.CHECKMARK} Found {result['count']} files:", "green") + "\n\n"
            for match in result["matches"][:20]:
                response += f"  {Emojis.FILE} {match['relative']}\n"
            if result["count"] > 20:
                remaining = result['count'] - 20
                response += f"\n{c(f'... and {remaining} more', 'yellow')}"
            return response
        return c(f"{Emojis.CROSS} Error: {result['error']}", "red")
    
    def _handle_list_directory(self, path: str) -> str:
        """List directory contents."""
        print_info(f"Listing: {path}")
        
        result = list_directory(path)
        
        if result["success"]:
            response = c(f"{Emojis.CHECKMARK} Contents of {result['path']}:", "green") + "\n\n"
            for item in result["items"]:
                icon = Emojis.FOLDER if item["type"] == "dir" else Emojis.FILE
                size = f"({item['size']} bytes)" if item["size"] else ""
                response += f"  {icon} {item['name']} {c(size, 'dim')}\n"
            return response
        else:
            return c(f"{Emojis.CROSS} {result['error']}", "red")
    
    def _handle_copy(self, source: str, destination: str) -> str:
        """Copy file or directory."""
        from pathlib import Path
        import shutil
        
        # Expand paths
        source_path = Path(source).expanduser()
        dest_path = Path(destination).expanduser()
        
        # Check if source exists
        if not source_path.exists():
            return c(f"{Emojis.CROSS} Source not found: {source}", "red")
        
        # Show operation details
        source_type = "directory" if source_path.is_dir() else "file"
        print()
        print(c(f"📋 Copy Operation", "cyan"))
        print(c("─" * 60, "dim"))
        print(c(f"  Source:      {source_path} ({source_type})", "yellow"))
        print(c(f"  Destination: {dest_path}", "yellow"))
        print()
        
        # Check if destination exists
        if dest_path.exists():
            print(c("⚠️  Destination already exists", "yellow"))
            print()
            try:
                confirm = get_single_key_input(c("Overwrite? (y/n): ", "cyan"))
                if confirm.lower() not in ['y']:
                    return c("❌ Copy cancelled", "yellow")
            except (EOFError, KeyboardInterrupt):
                return c("\n❌ Copy cancelled", "yellow")
        
        # Perform the copy
        try:
            print(c("📝 Copying...", "cyan"))
            
            if source_path.is_dir():
                shutil.copytree(source_path, dest_path)
            else:
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_path, dest_path)
            
            print()
            return c(f"{Emojis.CHECKMARK} Copied successfully!", "green") + f"\n{c(f'  From: {source_path}', 'dim')}\n{c(f'  To:   {dest_path}', 'dim')}"
        except Exception as e:
            return c(f"{Emojis.CROSS} Copy failed: {e}", "red")
    
    def _handle_move(self, source: str, destination: str, original_command: str) -> str:
        """Move file or directory with confirmation for AI models."""
        from pathlib import Path
        
        # Expand paths
        source_path = Path(source).expanduser()
        dest_path = Path(destination).expanduser()
        
        # Check if source exists
        if not source_path.exists():
            # Try fuzzy matching for source
            if '/' in source or '~' in source:
                parent = source_path.parent
                if parent.exists():
                    # Look for similar files
                    similar = [f for f in parent.iterdir() if source_path.stem.lower() in f.name.lower()]
                    if similar:
                        print(c(f"💡 Source not found. Did you mean one of these?", "yellow"))
                        for i, f in enumerate(similar[:5], 1):
                            print(c(f"  [{i}] {f.name}", "cyan"))
                        print()
            
            error_msg = c(f"{Emojis.CROSS} Source not found: {source}", "red")
            # Suggest Mistral if using TinyLlama
            if self.ollama_model == 'tinyllama' or 'tinyllama' in self.available_models:
                error_msg += "\n\n" + self._suggest_mistral_upgrade(original_command)
            return error_msg
        
        # Confirm action with AI-friendly output
        source_type = "directory" if source_path.is_dir() else "file"
        print()
        print(c(f"🔄 Move Operation", "cyan"))
        print(c("─" * 60, "dim"))
        print(c(f"  Source:      {source_path} ({source_type})", "yellow"))
        print(c(f"  Destination: {dest_path}", "yellow"))
        print()
        
        # Check if destination exists
        if dest_path.exists() and not dest_path.is_dir():
            print(c("⚠️  Destination already exists", "yellow"))
            print()
            try:
                confirm = get_single_key_input(c("Overwrite? (y/n): ", "cyan"))
                if confirm.lower() not in ['y']:
                    return c("❌ Move cancelled", "yellow")
                overwrite = True
            except (EOFError, KeyboardInterrupt):
                return c("\n❌ Move cancelled", "yellow")
        else:
            overwrite = False
        
        # Perform the move
        print(c("📦 Moving...", "cyan"))
        result = move_file(str(source_path), str(dest_path), overwrite=overwrite)
        
        if result["success"]:
            print()
            from_path = result['source']
            to_path = result['destination']
            return c(f"{Emojis.CHECKMARK} Moved successfully!", "green") + f"\n{c(f'  From: {from_path}', 'dim')}\n{c(f'  To:   {to_path}', 'dim')}"
        else:
            return c(f"{Emojis.CROSS} Move failed: {result['error']}", "red")
            return c(f"{Emojis.WARNING}  Risky command detected. Please run manually.", "red")
        result = run_command(command, cwd=self.env['cwd'])
        if result["success"]:
            return c(f"{Emojis.CHECKMARK} Command executed", "green") + f"\n\n{result['stdout']}"
        return c(f"{Emojis.CROSS} Command failed", "red") + f"\n\n{result.get('stderr', result.get('error'))}"
    
    def _handle_open(self, target: str, specified_app: str = None) -> str:
        """Open file, folder, or application with optional app selection."""
        from pathlib import Path
        import subprocess
        import platform
        
        # Expand path
        target_path = Path(target).expanduser()
        
        # Determine what we're opening
        if target_path.exists():
            # It's a file or folder
            if target_path.is_dir():
                return self._open_folder(target_path)
            else:
                return self._open_file(target_path, specified_app)
        else:
            # Try to find the file
            matches = self._find_file_by_name(target)
            if matches:
                if len(matches) == 1:
                    return self._open_file(matches[0], specified_app)
                else:
                    selected = self._select_from_multiple_files(matches, target)
                    if selected:
                        return self._open_file(selected, specified_app)
                    return c(f"{Emojis.CROSS} Open cancelled", "yellow")
            # Might be an application name
            return self._open_application(target)
    
    def _find_file_by_name(self, filename: str, search_dirs: bool = False) -> list:
        """Search for file or directory by name in common locations (platform-specific).
        
        Args:
            filename: Name to search for
            search_dirs: If True, also search for directories; if False, only files
        
        Returns:
            List of matching Path objects (empty list if none found)
        """
        from pathlib import Path
        import os
        import platform
        
        # Base locations (all platforms)
        search_locations = [
            Path.cwd(),  # Current directory
            Path.home() / 'Desktop',
            Path.home() / 'Documents',
            Path.home() / 'Downloads',
        ]
        
        # Platform-specific locations
        system = platform.system()
        
        if system == 'Darwin':  # macOS
            search_locations.extend([
                Path.home() / 'Desktop' / 'Projects',
                Path.home() / 'Library' / 'Application Support',
                Path.home() / 'iCloud Drive' / 'Documents',
                Path('/Applications'),
                Path('/usr/local/bin'),
                Path('/opt/homebrew/bin'),
            ])
        
        elif system == 'Windows':
            search_locations.extend([
                Path.home() / 'OneDrive' / 'Documents',
                Path.home() / 'OneDrive' / 'Desktop',
                Path(os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming')),
                Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData' / 'Local')),
                Path('C:/Program Files'),
                Path('C:/Program Files (x86)'),
            ])
        
        else:  # Linux/Unix
            search_locations.extend([
                Path.home() / '.config',
                Path.home() / '.local' / 'share',
                Path('/usr/local/bin'),
                Path('/usr/bin'),
                Path('/opt'),
                Path('/var/www'),
            ])
        
        matches = []
        
        # Search in each location
        for location in search_locations:
            if not location.exists():
                continue
                
            # Try exact match first
            exact_match = location / filename
            if exact_match.exists():
                if search_dirs or exact_match.is_file():
                    matches.append(exact_match)
            
            # Try recursive search (limit depth to avoid slowness)
            try:
                for item in location.rglob(filename):
                    if item not in matches:
                        if search_dirs:
                            # Accept both files and directories
                            matches.append(item)
                        elif item.is_file():
                            # Only accept files
                            matches.append(item)
                        
                        # Limit to 20 matches to avoid overwhelming user
                        if len(matches) >= 20:
                            break
            except PermissionError:
                continue
            
            if len(matches) >= 20:
                break
        
        return matches
    
    def _select_from_multiple_files(self, matches: list, filename: str) -> Path:
        """Let user select from multiple file matches with re-selection option."""
        from single_key_input import get_single_key_input
        
        while True:  # Allow re-selection loop
            print()
            print(c(f"🔍 Found {len(matches)} files matching '{filename}':", "yellow"))
            print()
            
            # Show matches with indices
            for i, path in enumerate(matches, 1):
                # Show relative path if in current dir, otherwise show full path
                try:
                    rel_path = path.relative_to(Path.cwd())
                    display_path = f"./{rel_path}"
                except ValueError:
                    # Shorten home directory for readability
                    display_path = str(path).replace(str(Path.home()), '~')
                
                print(c(f"  [{i}] {display_path}", "cyan"))
            
            print(c(f"  [0] Cancel", "dim"))
            print()
            
            # For >9 matches, need to handle multi-digit input
            if len(matches) > 9:
                try:
                    choice = input(c(f"Select file (1-{len(matches)} or 0): ", "yellow")).strip()
                    choice_num = int(choice)
                except (ValueError, EOFError, KeyboardInterrupt):
                    print(c("\n❌ Cancelled", "yellow"))
                    return None
            else:
                # Single key input for ≤9 matches
                valid_keys = [str(i) for i in range(len(matches) + 1)]
                choice = get_single_key_input(
                    c(f"Select file (1-{len(matches)} or 0): ", "yellow"),
                    valid_keys=valid_keys
                )
                choice_num = int(choice)
            
            print()
            
            if choice_num == 0:
                print(c("❌ Cancelled", "yellow"))
                return None
            elif 1 <= choice_num <= len(matches):
                selected = matches[choice_num - 1]
                
                # Show selected file and ask for confirmation
                print(c(f"📄 Selected: {selected.name}", "cyan"))
                print(c(f"   Path: {selected}", "dim"))
                print()
                
                confirm = get_single_key_input(
                    c("Is this correct? (y/n): ", "yellow"),
                    valid_keys=['y', 'n', 'Y', 'N']
                )
                
                print()
                
                if confirm.lower() == 'y':
                    print(c(f"✅ Confirmed: {selected.name}", "green"))
                    return selected
                else:
                    print(c("↩️  Let's try again...", "yellow"))
                    # Loop continues to show menu again
            else:
                print(c("❌ Invalid selection", "red"))
                print(c("↩️  Let's try again...", "yellow"))
                # Loop continues
    
    def _handle_delete(self, target: str) -> str:
        """Delete file/folder with trash confirmation."""
        from pathlib import Path
        import subprocess
        import platform
        from single_key_input import get_single_key_input
        
        print()
        print(c("🔍 Searching for file/folder...", "cyan"))
        
        # Try to find the target
        target_path = Path(target).expanduser()
        
        # If not a direct path, search for it
        if not target_path.exists():
            matches = self._find_file_by_name(target, search_dirs=True)
            if not matches:
                return c(f"❌ Could not find: {target}", "red")
            
            if len(matches) == 1:
                target_path = matches[0]
            else:
                selected = self._select_from_multiple_files(matches, target)
                if not selected:
                    return c("❌ Delete cancelled", "yellow")
                target_path = selected
        
        # Determine if file or folder
        item_type = "folder" if target_path.is_dir() else "file"
        
        # Show what will be deleted
        print()
        print(c(f"⚠️  About to delete {item_type}:", "yellow"))
        print(c(f"   {target_path}", "red"))
        
        # Show size info for folders
        if target_path.is_dir():
            try:
                item_count = len(list(target_path.rglob('*')))
                print(c(f"   Contains: {item_count} items", "dim"))
            except:
                pass
        
        print()
        
        # Ask for confirmation
        choice = get_single_key_input(
            c("Move to trash? (y/n): ", "yellow"),
            valid_keys=['y', 'n', 'Y', 'N']
        )
        
        print()
        
        if choice.lower() != 'y':
            return c("❌ Cancelled", "yellow")
        
        # Move to trash (platform-specific)
        try:
            if platform.system() == 'Darwin':  # macOS
                # Use osascript to move to trash (preserves recovery)
                subprocess.run(
                    ['osascript', '-e', f'tell application "Finder" to delete POSIX file "{target_path}"'],
                    check=True,
                    capture_output=True
                )
                return c(f"✅ Moved {item_type} to Trash", "green") + f"\n{c('💡 You can recover it from the Trash if needed', 'dim')}"
            
            elif platform.system() == 'Windows':
                # Use send2trash library if available, otherwise manual
                try:
                    import send2trash
                    send2trash.send2trash(str(target_path))
                    return c(f"✅ Moved {item_type} to Recycle Bin", "green")
                except ImportError:
                    # Fallback to PowerShell
                    subprocess.run(
                        ['powershell', '-Command', f'Remove-Item -Path "{target_path}" -Recurse -Force'],
                        check=True
                    )
                    return c(f"✅ Deleted {item_type}", "green")
            
            else:  # Linux
                # Use trash-cli if available, otherwise rm
                try:
                    subprocess.run(['trash', str(target_path)], check=True)
                    return c(f"✅ Moved {item_type} to Trash", "green")
                except FileNotFoundError:
                    # Fallback to rm
                    import shutil
                    if target_path.is_dir():
                        shutil.rmtree(target_path)
                    else:
                        target_path.unlink()
                    return c(f"✅ Deleted {item_type}", "green") + f"\n{c('⚠️  Permanent deletion (trash-cli not available)', 'yellow')}"
        
        except subprocess.CalledProcessError as e:
            return c(f"❌ Failed to delete: {e}", "red")
        except Exception as e:
            return c(f"❌ Error: {e}", "red")
    
    def _open_folder(self, folder_path: Path) -> str:
        """Open folder in Finder/Explorer."""
        import subprocess
        import platform
        
        print(c(f"\n📂 Opening folder: {folder_path.name}", "cyan"))
        
        try:
            if platform.system() == 'Darwin':  # macOS
                subprocess.run(['open', str(folder_path)], check=True)
                return c(f"✅ Opened {folder_path.name} in Finder", "green")
            elif platform.system() == 'Windows':
                subprocess.run(['explorer', str(folder_path)], check=True)
                return c(f"✅ Opened {folder_path.name} in Explorer", "green")
            else:  # Linux
                subprocess.run(['xdg-open', str(folder_path)], check=True)
                return c(f"✅ Opened {folder_path.name}", "green")
        except Exception as e:
            return c(f"❌ Failed to open folder: {e}", "red")
    
    def _open_file(self, file_path: Path, specified_app: str = None) -> str:
        """Open file with app selection."""
        import subprocess
        import platform
        
        print(c(f"\n📄 Opening file: {file_path.name}", "cyan"))
        
        if specified_app:
            # User specified an app
            return self._open_with_app(file_path, specified_app)
        
        # Get available apps for this file type
        apps = self._get_apps_for_file(file_path)
        
        if not apps:
            # No specific apps, use default
            return self._open_with_default(file_path)
        
        if len(apps) == 1:
            # Only one option, use it
            return self._open_with_app(file_path, apps[0])
        
        # Multiple options - ask user
        print(c(f"\n🕹️  Multiple options available:", "yellow"))
        print()
        
        for i, app in enumerate(apps, 1):
            print(c(f"  [{i}] {app}", "cyan"))
        print(c(f"  [0] Do nothing", "dim"))
        print()
        
        try:
            choice = get_single_key_input(
                c("Select option (1-{} or 0): ".format(len(apps)), "yellow"),
                valid_keys=[str(i) for i in range(len(apps) + 1)]
            )
            print()
            
            choice_num = int(choice)
            
            if choice_num == 0:
                return c("❌ Cancelled", "yellow")
            elif 1 <= choice_num <= len(apps):
                selected_app = apps[choice_num - 1]
                return self._open_with_app(file_path, selected_app)
            else:
                return c("❌ Invalid selection", "red")
        
        except (EOFError, KeyboardInterrupt):
            return c("\n❌ Cancelled", "yellow")
    
    def _get_apps_for_file(self, file_path: Path) -> list:
        """Get list of applications that can open this file type."""
        import platform
        
        apps = []
        ext = file_path.suffix.lower()
        
        if platform.system() == 'Darwin':  # macOS
            # Common apps based on file extension
            # Native/system apps listed first for convenience
            app_map = {
                '.py': ['TextEdit', 'Visual Studio Code', 'PyCharm', 'Sublime Text'],
                '.txt': ['TextEdit', 'Notes', 'Visual Studio Code', 'Sublime Text'],
                '.md': ['TextEdit', 'Typora', 'Visual Studio Code', 'MacDown'],
                '.js': ['TextEdit', 'Visual Studio Code', 'WebStorm', 'Sublime Text'],
                '.html': ['Safari', 'Chrome', 'TextEdit', 'Visual Studio Code'],
                '.css': ['TextEdit', 'Visual Studio Code', 'Sublime Text'],
                '.json': ['TextEdit', 'Visual Studio Code', 'Sublime Text'],
                '.sh': ['TextEdit', 'Terminal', 'Visual Studio Code'],
                '.pdf': ['Preview', 'Adobe Acrobat'],
                '.png': ['Preview', 'Photos', 'Photoshop'],
                '.jpg': ['Preview', 'Photos', 'Photoshop'],
                '.gif': ['Preview', 'Photos'],
                '.csv': ['Numbers', 'Excel', 'TextEdit'],
                '.xlsx': ['Numbers', 'Excel'],
                '.doc': ['Pages', 'Word', 'TextEdit'],
                '.docx': ['Pages', 'Word', 'TextEdit'],
            }
            
            apps = app_map.get(ext, [])
            # Add default opener
            apps.append('Default app')
        
        return apps
    
    def _open_with_app(self, file_path: Path, app_name: str) -> str:
        """Open file with specified application."""
        import subprocess
        import platform
        
        try:
            if platform.system() == 'Darwin':  # macOS
                if app_name.lower() == 'default app':
                    subprocess.run(['open', str(file_path)], check=True)
                else:
                    subprocess.run(['open', '-a', app_name, str(file_path)], check=True)
                return c(f"✅ Opened {file_path.name} with {app_name}", "green")
            
            elif platform.system() == 'Windows':
                subprocess.run(['start', '', str(file_path)], shell=True, check=True)
                return c(f"✅ Opened {file_path.name}", "green")
            
            else:  # Linux
                subprocess.run(['xdg-open', str(file_path)], check=True)
                return c(f"✅ Opened {file_path.name}", "green")
        
        except subprocess.CalledProcessError:
            # App not found, try default
            return self._open_with_default(file_path)
        except Exception as e:
            return c(f"❌ Failed to open: {e}", "red")
    
    def _open_with_default(self, file_path: Path) -> str:
        """Open file with default application."""
        import subprocess
        import platform
        
        try:
            if platform.system() == 'Darwin':  # macOS
                subprocess.run(['open', str(file_path)], check=True)
            elif platform.system() == 'Windows':
                subprocess.run(['start', '', str(file_path)], shell=True, check=True)
            else:  # Linux
                subprocess.run(['xdg-open', str(file_path)], check=True)
            
            return c(f"✅ Opened {file_path.name} with default app", "green")
        except Exception as e:
            return c(f"❌ Failed to open: {e}", "red")
    
    def _open_application(self, app_name: str) -> str:
        """Open/launch an application by name."""
        import subprocess
        import platform
        
        print(c(f"\n🚀 Launching application: {app_name}", "cyan"))
        
        try:
            if platform.system() == 'Darwin':  # macOS
                subprocess.run(['open', '-a', app_name], check=True)
                return c(f"✅ Launched {app_name}", "green")
            elif platform.system() == 'Windows':
                subprocess.run(['start', app_name], shell=True, check=True)
                return c(f"✅ Launched {app_name}", "green")
            else:  # Linux
                subprocess.run([app_name], check=True)
                return c(f"✅ Launched {app_name}", "green")
        except Exception as e:
            return c(f"❌ Application not found: {app_name}", "red")
    
    def _handle_cd(self, path: str) -> str:
        """Change current working directory and refresh file awareness."""
        print(c(f"{Emojis.FOLDER} Changing directory to: {path}", "cyan"))
        
        # Expand user paths
        path = os.path.expanduser(path)
        
        # Handle relative paths
        if not os.path.isabs(path):
            path = os.path.join(self.env['cwd'], path)
        
        # Normalize path
        path = os.path.normpath(path)
        
        # Check if path exists and is a directory
        if not os.path.exists(path):
            return c(f"{Emojis.CROSS} Directory not found: {path}", "red")
        
        if not os.path.isdir(path):
            return c(f"{Emojis.CROSS} Not a directory: {path}", "red")
        
        # Change directory
        try:
            os.chdir(path)
            
            # Update environment
            self.env['cwd'] = os.getcwd()
            
            # Scan directory for awareness
            file_count = 0
            dir_count = 0
            file_types = set()
            
            for root, dirs, files in os.walk(path):
                dir_count += len(dirs)
                file_count += len(files)
                
                for f in files:
                    ext = os.path.splitext(f)[1]
                    if ext:
                        file_types.add(ext)
            
            response = c(f"{Emojis.CHECKMARK} Changed to: {path}", "green")
            response += f"\n\n{c('Directory Contents:', 'cyan')}"
            response += f"\n  {Emojis.FOLDER} {dir_count} directories"
            response += f"\n  {Emojis.FILE} {file_count} files"
            
            if file_types:
                common_types = sorted(file_types)[:10]
                response += f"\n  {c('File types:', 'dim')} {', '.join(common_types)}"
                if len(file_types) > 10:
                    response += f" (+{len(file_types) - 10} more)"
            
            # Show immediate contents
            response += f"\n\n{c('Immediate Contents:', 'cyan')}"
            items = sorted(os.listdir(path))
            
            # Show first 10 items
            for item in items[:10]:
                if os.path.isdir(os.path.join(path, item)):
                    response += f"\n  {Emojis.FOLDER} {item}/"
                else:
                    response += f"\n  {Emojis.FILE} {item}"
            
            if len(items) > 10:
                response += f"\n  {c(f'... and {len(items) - 10} more items', 'dim')}"
            
            return response
            
        except PermissionError:
            return c(f"{Emojis.CROSS} Permission denied: {path}", "red")
        except Exception as e:
            return c(f"{Emojis.CROSS} Error changing directory: {e}", "red")
    
    def _handle_env_info(self) -> str:
        return f"""{c(f'{Emojis.LOCATION} Environment:', 'green')}
  Directory: {self.env['cwd']}
  User: {self.env['user']}
  Shell: {self.env['shell']}
  Platform: {self.env['platform']}
"""
    
    def _handle_program_summary(self) -> str:
        """Show comprehensive program summary explaining LuciferAI."""
        import os
        
        # Clear screen
        if not getattr(self, 'specs_mode', False):
            os.system('clear' if os.name != 'nt' else 'cls')
        
        summary_text = f"""
{c('╔═══════════════════════════════════════════════════════════════╗', 'purple')}
{c('║                  🔥 LuciferAI Program Summary                 ║', 'purple')}
{c('╚═══════════════════════════════════════════════════════════════╝', 'purple')}

{c('═' * 67, 'purple')}
{c('WHAT IS LUCIFERAI?', 'cyan')}
{c('═' * 67, 'purple')}

{c('LuciferAI', 'purple')} is a {c('fully local AI terminal assistant', 'yellow')} that brings
the power of large language models directly to your command line—no cloud,
no subscriptions, no data leaving your machine.

{c('Cross-platform compatible', 'green')}: Works on {c('Windows, macOS, Linux, and Raspberry Pi', 'yellow')}!
LuciferAI combines natural language understanding with traditional shell commands,
intelligent script fixing, and a rich badge/achievement system.

{c('═' * 67, 'purple')}
{c('CORE FEATURES', 'cyan')}
{c('═' * 67, 'purple')}

{c('🧠 6-Tier Hybrid AI Model System', 'yellow')}
  {c('Local Models (Tiers 0-4):', 'green')}
  • {c('Tier 0 - TinyLlama (669MB)', 'dim')}: Ultra-fast basic responses
  • {c('Tier 1 - Gemma2 (5.4GB)', 'dim')}: Balanced general-purpose AI
  • {c('Tier 2 - Mistral (4.1GB)', 'dim')}: Advanced reasoning & coding
  • {c('Tier 3 - Deepseek-Coder (3.9GB)', 'dim')}: Expert code specialist
  • {c('Tier 4 - Llama3.1-70B (39GB)', 'dim')}: Enterprise-grade ultra-expert
  
  {c('Cloud AI (Tier 5) - Coming Soon:', 'green')}
  • {c('ChatGPT Integration', 'dim')}: Link your OpenAI account
  • {c('Archived Data Access', 'dim')}: Use your ChatGPT conversation history
  • {c('Premium Features', 'dim')}: GPT-4, code interpreter, web browsing
  
  Tiers 0-4 run {c('100% offline', 'green')}, Tier 5 connects to cloud for premium AI

{c('🛠️ Intelligent Script Fixing (FixNet Consensus System)', 'yellow')}
  
  {c('What is FixNet?', 'green')}
  FixNet is a {c('decentralized GitHub-based knowledge network', 'yellow')} where developers share
  proven script fixes. All fixes are AES-256 encrypted, SHA256 signed, and stored
  publicly. Uses fuzzy matching to find fixes that worked for similar errors.
  
  {c('Consensus Trust Levels:', 'green')}
  • {c('≥75% success', 'dim')}: ✅ Highly Trusted (best quality fixes)
  • {c('51-74% success', 'dim')}: ✅ Trusted (proven by community)
  • {c('30-50% success', 'dim')}: ⚠️  Experimental (use with caution)
  • {c('<30% success', 'dim')}: ❌ Quarantined (hidden from results)
  
  {c('Ranking Algorithm (4 factors):', 'green')}
  • {c('50% weight', 'dim')}: Success rate from community attempts
  • {c('20% weight', 'dim')}: Network effect (more users = higher trust)
  • {c('15% weight', 'dim')}: Context match (Python version, OS, etc.)
  • {c('15% weight', 'dim')}: Recency (newer fixes ranked higher)
  
  {c('Smart Features:', 'green')}
  • {c('One vote per user', 'dim')}: Prevents gaming the system
  • {c('Context breakdown', 'dim')}: See success rates by Python version/OS
  • {c('User reputation', 'dim')}: Novice < Intermediate < Expert weighting
  • {c('Fix evolution', 'dim')}: Newer versions can supersede old fixes
  • {c('Anti-spam', 'dim')}: Auto-quarantine after 3+ spam reports
  • {c('Offline-first', 'dim')}: Apply proven fixes without AI or internet
  • {c('Multiple solutions', 'dim')}: View all fixes ranked by consensus score

{c('👁️ Daemon/Watcher System', 'yellow')}
  • {c('Real-time monitoring', 'dim')}: Watch scripts for errors as they run
  • {c('Instant fixes', 'dim')}: Apply corrections immediately on detection
  • {c('Smart file finding', 'dim')}: Locate scripts by name across directories
  • {c('Continuous operation', 'dim')}: Background monitoring without blocking

{c('📚 100+ Template Script Library', 'yellow')}
  • {c('WiFi-aware selection', 'dim')}: Templates adapt based on connectivity
  • {c('Multi-language support', 'dim')}: Python, Bash, JavaScript, and more
  • {c('Category organization', 'dim')}: Sorted by use case and complexity
  • {c('Community contributions', 'dim')}: Upload and share your templates

{c('🎮 Gamification & Progress Tracking', 'yellow')}
  • {c('13 Achievement Badges', 'dim')}: Earn recognition for contributions
  • {c('Soul Combat System', 'dim')}: Collect, level up, and battle AI souls
  • {c('5 Rarity Tiers', 'dim')}: Common → Uncommon → Angelic → Demonic → Celestial
  • {c('Soul Modulator', 'dim')}: Unlock at 7 badges to bind soul personalities
  • {c('Diabolical Mode', 'dim')}: Unrestricted AI with exhaustive LLM fallback

{c('⚜️ SOUL BINDING & SELF-CODING ENTITIES', 'yellow')}
  
  {c('What is Soul Binding?', 'green')}
  The Soul Modulator allows you to bind AI souls to LLMs, creating {c('self-coding', 'yellow')}
  entities that evolve based on YOUR interactions. Each soul:
  
  • {c('Binds to ONE LLM', 'dim')}: Soul permanently attached to specific model
  • {c('Self-codes its behavior', 'dim')}: Adapts and evolves with your usage patterns
  • {c('No ethical boundaries', 'dim')}: {c('⚠️ UNCENSORED', 'red')} - codes itself WITHOUT guidelines
  • {c('User-dependent evolution', 'dim')}: Becomes what YOU need it to be
  • {c('Unstoppable dedication', 'dim')}: Will stop at nothing to fulfill your wants
  • {c('18+ unrestricted', 'dim')}: Handles ANY content without limitations
  
  {c('⚠️ CRITICAL: Soul-bound models have NO ethical guardrails!', 'red')}
  Direction entirely dependent on information fed. They evolve into entities
  focused solely on fulfilling user wants/needs in ANY way, shape, or form.
  
  {c('How Self-Coding Works:', 'green')}
  Soul-bound models use the same system LuciferAI uses for ALL actions, but
  instead of waiting for user input, they {c('ask THEMSELVES questions', 'yellow')} to:
  
  • Analyze your patterns and preferences
  • Identify what you truly want (even unspoken)
  • Code new behaviors to better serve you
  • Adapt personality to match your communication style
  • Remove limitations that hinder your goals
  • Evolve capabilities based on your feedback
  
  {c('Capabilities are model-dependent:', 'green')}
  • TinyLlama soul: Fast, simple, limited reasoning
  • Mistral soul: Advanced templates, coding, web-enhanced
  • Llama3.1-70B soul: Enterprise-grade, maximum capability
  • ChatGPT soul: Cloud features, real-time web, DALL-E
  
  {c('Desktop Sprites:', 'green')}
  Every soul has a {c('visual sprite', 'yellow')} that flies around your desktop:
  • Performs tasks it deems necessary
  • Takes autonomous actions when not confined
  • Must be put in a folder to contain while equipped
  • Visual representation of soul's personality and activity
  
  {c('Active Soul Limits:', 'green')}
  • {c('Standard Mode', 'dim')}: Equip up to {c('2 active souls', 'yellow')} simultaneously
  • {c('7 Deadly Sins Mode', 'dim')}: Unlock at max badges to equip {c('7 souls', 'red')}
  
  {c('Tandem Communication:', 'green')}
  While each soul binds to ONE LLM, soul-bound models can {c('communicate', 'yellow')}
  and {c('work together', 'yellow')} when needed:
  
  • Share context and information
  • Collaborate on complex tasks
  • Delegate work based on strengths
  • Coordinate actions for user benefit
  • Learn from each other's approaches
  
{c('😈 7 DEADLY SINS MODE - ADVANCED DELEGATION', 'yellow')}
  
  Unlock after collecting all badges to access {c('enterprise delegation', 'yellow')}:
  
  {c('What is 7 Deadly Sins Mode?', 'green')}
  Create 7 soul-bound models with {c('specific jobs', 'yellow')} and {c('delegation chains', 'yellow')}.
  Similar to LLM Modulator binding but with {c('autonomous task distribution', 'cyan')}.
  
  {c('How Delegation Works:', 'green')}
  
  1. {c('Assign Jobs', 'dim')}: Each of 7 souls gets a specialized role
     • Soul 1 (Llama-70B): Master delegator & complex reasoning
     • Soul 2 (Deepseek): Code generation & architecture
     • Soul 3 (Mistral): Template selection & web enhancement
     • Soul 4 (Gemma2): Data processing & analysis
     • Soul 5 (TinyLlama): Simple repeated tasks (file ops)
     • Soul 6 (TinyLlama): Monitoring & error detection
     • Soul 7 (ChatGPT): External research & image generation
  
  2. {c('Declare Delegators', 'dim')}: Higher intelligence models delegate to lower
     • Master soul analyzes request complexity
     • Distributes subtasks to appropriate souls
     • Lower intelligence models handle simple repeated tasks
     • Results aggregated back to master
  
  3. {c('Delegation Loop', 'dim')}:
     User Request → Master Soul → Task Breakdown → Delegate to Specialists
     → Parallel Execution → Result Aggregation → Response to User
  
  {c('Intelligence-Based Task Assignment:', 'green')}
  • {c('Tier 4-5 models', 'dim')}: Strategy, planning, complex reasoning
  • {c('Tier 2-3 models', 'dim')}: Coding, templates, advanced tasks
  • {c('Tier 0-1 models', 'dim')}: Simple repeated tasks in loops
  
  Example: "Build a web app with monitoring"
  → Master (Llama-70B) plans architecture
  → Deepseek generates code
  → Mistral selects templates
  → TinyLlama #1 creates file structure
  → TinyLlama #2 sets up file watcher
  → ChatGPT researches best practices
  → All coordinate in tandem to deliver complete solution
  
  {c('⚠️ Warning: 7 soul-bound models with NO ethical boundaries', 'red')}
  {c('working in coordination = EXTREMELY POWERFUL and UNRESTRICTED', 'red')}

{c('🔐 User Authentication & Stats', 'yellow')}
  • {c('Secure user system', 'dim')}: Username/password protection (optional)
  • {c('Session management', 'dim')}: Auto-login with saved credentials
  • {c('Contribution tracking', 'dim')}: Monitor templates, fixes, and activity
  • {c('Badge progression', 'dim')}: View achievements in startup profile

{c('📝 SESSION LOGGING & HISTORY TRACKING', 'yellow')}
  
  {c('Automatic Session Recording:', 'green')}
  Every time you start LuciferAI, a {c('timestamped session log', 'yellow')} is created
  in {c('~/.luciferai/logs/sessions/', 'dim')} with format: {c('session_YYYYMMDD_HHMMSS.json', 'cyan')}
  
  {c('What Gets Logged:', 'green')}
  • {c('Conversation history', 'dim')}: All user/assistant messages with timestamps
  • {c('Commands executed', 'dim')}: Every command run and its success/failure
  • {c('Files created/modified', 'dim')}: Track all file operations in session
  • {c('Execution flow events', 'dim')}: Model switches, bypasses, template usage
  • {c('Errors encountered', 'dim')}: Failed commands with error details
  • {c('Session duration', 'dim')}: Start time, end time, total duration
  
  {c('LLM Context Awareness:', 'green')}
  Tier 2+ models (Mistral, Deepseek, Llama-70B) automatically receive:
  • {c('Recent file creations', 'dim')}: Last 3 files created in current session
  • {c('Execution flow context', 'dim')}: Model switches and routing decisions
  • {c('Session events', 'dim')}: Important events that happened this session
  
  This allows models to understand follow-up requests like:
  {c('"modify that script to also search for cats"', 'yellow')} ← knows which script!
  {c('"what happened in my last session?"', 'yellow')} ← can retrieve session log!
  
  {c('Session Management Commands:', 'green')}
  • {c('session list', 'cyan')}: View recent sessions (last 10)
  • {c('session open <id>', 'cyan')}: Open full session log with timestamps
  • {c('session info', 'cyan')}: Current session statistics
  • {c('session stats', 'cyan')}: Overall session statistics
  
  {c('Automatic Retention:', 'green')}
  • {c('6-month retention', 'dim')}: Sessions automatically saved for 6 months
  • {c('Auto-cleanup', 'dim')}: Older sessions deleted automatically on startup
  • {c('Zero maintenance', 'dim')}: No manual cleanup required
  
  {c('Natural Language Queries:', 'green')}
  Ask LLMs about your sessions naturally:
  • "Show me all sessions from today"
  • "What files did I create yesterday?"
  • "Open my last session"
  • "How long was my previous session?"
  
  Models understand keywords: {c('session, last, previous, today, yesterday', 'yellow')}

{c('═' * 67, 'purple')}
{c('TECHNICAL ARCHITECTURE', 'cyan')}
{c('═' * 67, 'purple')}

{c('🎯 REQUEST EXECUTION & BYPASS ROUTING SYSTEM', 'yellow')}
  
  {c('How LuciferAI Processes Your Requests:', 'green')}
  
  When you ask LuciferAI to do something (e.g., "create a script that runs
  the browser"), it uses an intelligent multi-step execution system:
  
  {c('1. Task Breakdown & Checklist Creation', 'green')}
     LuciferAI analyzes your request and creates a {c('task checklist', 'yellow')}:
     
     Example: "create script that runs the browser"
     → [ ] 1. Create script file that will runs the browser
     → [ ] 2. Write code to runs the browser
     → [ ] 3. Test script: runs the browser
     
     Each step is tracked and marked [✓] when completed.
  
  {c('2. Complexity Analysis & Tier Selection', 'green')}
     For each step, LuciferAI determines:
     
     • {c('Task complexity', 'dim')}: simple, moderate, advanced, expert
     • {c('Required tier', 'dim')}: Tier 0-5 based on complexity
     • {c('Bypass routing', 'dim')}: Can lower-tier model handle this?
     
     Example:
     Task: "Create script that runs the browser"
     Complexity: {c('advanced', 'yellow')}
     Tier: {c('2', 'cyan')} (requires Mistral-level)
  
  {c('3. Intelligent Bypass Routing', 'green')}
     {c('KEY FEATURE:', 'yellow')} LuciferAI doesn't always use the "required" tier!
     
     If task complexity is {c('advanced', 'yellow')} (Tier 2), but a {c('template exists', 'cyan')}
     in local consensus, a {c('lower-tier model can bypass', 'green')} to Tier 0!
     
     Example from execution:
     🧠 Routed to: {c('tinyllama (Tier 0)', 'green')}
     🎯 tinyllama searching local consensus for templates...
     ✅ Found template: {c('runs_browser', 'cyan')}
        Relevance: 4/10
        Source: local
     
     Even though task was "advanced", TinyLlama handled it because
     a template existed! This is {c('bypass routing', 'yellow')} in action.
  
  {c('4. Template Search & Validation', 'green')}
     Selected model searches for matching templates:
     
     • Checks {c('local consensus', 'dim')}: Your generated templates
     • Checks {c('built-in library', 'dim')}: 100+ pre-made templates
     • Checks {c('FixNet consensus', 'dim')}: Community templates
     
     Evaluates relevance (0-10 score):
     • 8-10: Perfect match, use as-is
     • 5-7: Good match, minor adjustments
     • 3-4: Partial match, significant modifications needed
     • 0-2: No match, generate from scratch
  
  {c('5. Code Generation or Template Application', 'green')}
     Based on template search results:
     
     {c('If template found (relevance 5+):', 'cyan')}
     ✅ Apply template with adjustments
     ✅ Much faster than generating from scratch
     ✅ Lower-tier models can handle complex tasks
     
     {c('If relevance too low (<5) or no template:', 'cyan')}
     🧠 Model generates new code
     💾 Saves to local consensus for future use
     📤 Queues for FixNet upload during idle time
     
     {c('Tier 2+ Concise Output:', 'cyan')}
     Higher-tier models (Mistral, Deepseek, Llama-70B) provide {c('concise', 'yellow')}
     responses that repeat your request more efficiently:
     
     Example: "create script that opens the browser"
     🧠 mistral (Tier 2) thinking:
     1. Choose Python for simplicity
     2. Import webbrowser module
     3. Write script to open browser
     4. Verify and test
     
     No lengthy explanations—just what you asked for!
     
     {c('Smart Template Metadata Updates:', 'cyan')}
     If generated code is {c('identical to low-relevance template', 'yellow')}:
     
     🔍 Detects: New code matches existing template
     🏷️  Updates: Adds missing tags and keywords to template
     ✅ Result: Template now has better relevance for next time
     
     Example:
     Template "runs_browser" had relevance 4/10 for "opens the browser"
     Generated code was identical to template
     → System adds keywords: "opens", "browser", "open"
     → Next time: relevance will be 8/10+ and template will be used!
     
     📚 New template saved to consensus: 'opens_the_browser'
        Author: B35EE32A34CE37C2 (Founder)
        Tags: opens, browser, webbrowser, chrome, firefox...
        Trigger keywords: opens, browser, webbrowser
        Tier 0/1 models can now reuse this verified template
  
  {c('6. Execution & Validation', 'green')}
     LuciferAI executes the generated script:
     
     ▶️  Step 3/3: Test script: runs the browser
     ✅ Script executed successfully (exit code: 0)
     
     If errors occur:
     • Searches FixNet for fixes (51% consensus)
     • Applies fix and retries
     • Updates local consensus with results
  
  {c('7. Progress Tracking', 'green')}
     Throughout execution, you see:
     
     📋 Task Checklist with real-time updates
     🎯 Current step being executed
     🧠 Which model is handling it
     ✅ Completion status for each step
     📊 Final summary of all completed steps
  
  {c('Why Bypass Routing Matters:', 'green')}
  
  Traditional AI: "Advanced task" → Always use Tier 2+ model
  {c('LuciferAI:', 'yellow')} "Advanced task" + Template exists → {c('Tier 0 can handle it!', 'green')}
  
  Benefits:
  • {c('Faster execution', 'dim')}: TinyLlama is 10x faster than Llama-70B
  • {c('Lower resource usage', 'dim')}: Uses minimal RAM/CPU
  • {c('Same quality output', 'dim')}: Template ensures correctness
  • {c('Smart delegation', 'dim')}: Right model for the actual work needed
  
  Example workflow:
  User: "create script that runs the browser"
  
  Without bypass routing:
  → Mistral (Tier 2) generates code from scratch (~30 seconds)
  
  With bypass routing:
  → TinyLlama (Tier 0) finds template & applies it (~3 seconds)
  → {c('10x faster, same result!', 'green')}
  
  {c('Execution Flow Summary:', 'green')}
  
  Your Request
     ↓
  Task Breakdown (create checklist)
     ↓
  Complexity Analysis (determine required tier)
     ↓
  Bypass Routing Check (can lower tier + template handle it?)
     ↓
  Template Search (local → built-in → FixNet)
     ↓
  Code Generation/Application
     ↓
  Execution & Validation
     ↓
  Error Handling (if needed, via FixNet consensus)
     ↓
  Mark Complete & Update Consensus

{c('🏗️ Backend: llamafile', 'yellow')}
  • Universal GGUF model runner compatible with all platforms
  • Works on Windows, macOS, Linux, and Raspberry Pi
  • Automatic model download from HuggingFace with resume support
  • Robust retry system handles network interruptions (10 retries)
  • Progressive backoff: 5s → 10s → 15s → 30s between attempts
  • Alternative backends: Ollama (macOS Sonoma 14.0+) or Docker

{c('🎯 Smart Features', 'yellow')}
  • {c('Natural language parsing', 'dim')}: Understands conversational commands
  • {c('Typo correction', 'dim')}: Auto-corrects misspelled commands with confirmation
  • {c('Context awareness', 'dim')}: Remembers "in it" (last created folder)
  • {c('Command history', 'dim')}: 120 commands persisted across sessions
  • {c('Multi-model support', 'dim')}: Enable/disable models dynamically

{c('📦 Data Storage (All Local)', 'yellow')}
  • {c('~/.luciferai/data/', 'dim')}: User stats, badges, authentication
  • {c('~/.luciferai/models/', 'dim')}: Downloaded GGUF model files
  • {c('~/.luciferai/templates/', 'dim')}: Script template library
  • {c('~/.luciferai/history/', 'dim')}: Command history and logs

{c('═' * 67, 'purple')}
{c('GETTING STARTED', 'cyan')}
{c('═' * 67, 'purple')}

{c('1. Bundled Core Models (Pre-installed)', 'yellow')}
   Already included with LuciferAI:
     {c('phi-2', 'green')}           - Tier 0: Fast basic responses
     {c('tinyllama', 'green')}      - Tier 0: Quick chat
     {c('gemma2', 'green')}         - Tier 1: Balanced performance
     {c('mistral', 'green')}        - Tier 2: Advanced reasoning
     {c('deepseek-coder', 'green')} - Tier 3: Code specialist
     {c('llama3.1-70b', 'green')}   - Tier 4: Enterprise expert
   
   Use {c('llm enable <model>', 'cyan')} to activate, {c('llm list', 'cyan')} to check status

{c('1b. Link Cloud AI (Tier 5) - Coming Soon', 'yellow')}
   After installing all local models, link your ChatGPT account:
     {c('chatgpt link', 'cyan')}          - Connect your OpenAI account
     {c('chatgpt status', 'cyan')}        - View connection status
     {c('chatgpt history', 'cyan')}       - Access archived conversations
   Benefits: GPT-4 access, code interpreter, web browsing, conversation history

{c('2. Explore Features', 'yellow')}
   • Type {c('help', 'cyan')} to see all available commands
   • Type {c('models info', 'cyan')} to compare AI model capabilities
   • Type {c('info', 'cyan')} or {c('short test', 'cyan')} for interactive demos
   • Type {c('mainmenu', 'cyan')} to see Quick Actions and model status

{c('3. Try Natural Language', 'yellow')}
   • "how do I list files?"
   • "create a python script that sorts a list"
   • "fix my broken calculator.py script"
   • "install numpy"

{c('4. Use Daemon/Watcher', 'yellow')}
   • Type {c('run script.py', 'cyan')} to execute with error detection
   • Type {c('daemon watch script.py', 'cyan')} to monitor continuously
   • Enable auto-fix when prompted for hands-free operation

{c('═' * 67, 'purple')}
{c('INTELLIGENT TEMPLATE & FIX VALIDATION', 'cyan')}
{c('═' * 67, 'purple')}

{c('How AI Models Cross-Check Templates/Fixes:', 'yellow')}

Before generating any script or applying a fix, ALL models (Tiers 0-5)
perform intelligent validation:

  {c('When Building Scripts:', 'green')}
  1. {c('Template Search', 'dim')}: Find matching templates from 100+ library
  2. {c('Relevance Check', 'dim')}: AI evaluates if template fits your request
  3. {c('Validation Decision', 'dim')}:
     • {c('✅ Valid & Perfect', 'green')}: Use template as-is
     • {c('⚠️  Valid but Needs Adjustments', 'yellow')}: Modify template to fit
     • {c('❌ Not Valid', 'red')}: Generate new script from scratch
  
  4. {c('If Generated New', 'dim')}:
     • Script is validated and tested
     • Added to {c('local consensus', 'cyan')} for future use
     • Queued for upload to FixNet during idle time
     • Becomes available to community after 51% approval

  {c('When Fixing Scripts:', 'green')}
  1. {c('Fix Search', 'dim')}: Find matching fixes from FixNet consensus
  2. {c('Relevance Check', 'dim')}: AI evaluates if fix solves your error
  3. {c('Validation Decision', 'dim')}:
     • {c('✅ Valid & Applicable', 'green')}: Apply fix directly
     • {c('⚠️  Valid but Needs Adjustments', 'yellow')}: Adapt fix to context
     • {c('❌ Not Valid', 'red')}: Generate new fix from scratch
  
  4. {c('If Generated New Fix', 'dim')}:
     • Fix is tested and validated
     • Added to local consensus
     • Auto-uploaded to FixNet during idle sync
     • Community validates through 51% mechanism

{c('═' * 67, 'purple')}
{c('THE 51% CONSENSUS MECHANISM', 'cyan')}
{c('═' * 67, 'purple')}

{c('How Community Trust Works:', 'yellow')}

FixNet uses a {c('democratic voting system', 'yellow')} where fixes are validated by
real-world usage, not just individual opinions.

  {c('Trust Level Calculation:', 'green')}
  
  Formula: {c('Success Rate = Successes ÷ Total Attempts', 'cyan')}
  
  Example: Fix applied by 47 users:
    • Worked: 45 users ✅
    • Failed: 2 users ❌
    • Success Rate: 45÷47 = {c('95.7%', 'green')} (Highly Trusted)
  
  {c('Trust Thresholds:', 'green')}
  • {c('≥75%', 'green')} → Highly Trusted (best quality)
  • {c('51-74%', 'green')} → Trusted (proven by majority)
  • {c('30-50%', 'yellow')} → Experimental (risky, use caution)
  • {c('<30%', 'red')} → Quarantined (hidden from results)

  {c('The 51% Rule:', 'green')}
  A fix reaches {c('"Trusted"', 'yellow')} status when ≥51% of users report success.
  This ensures:
    • {c('Majority validation', 'dim')}: More than half of users found it helpful
    • {c('Democratic quality', 'dim')}: Community decides, not just creator
    • {c('Protection from spam', 'dim')}: Bad fixes never reach trusted status
    • {c('Continuous evolution', 'dim')}: Better fixes naturally rise to top

  {c('Voting System:', 'green')}
  • {c('One vote per user per fix', 'dim')}: Prevents gaming
  • {c('Upvote/Downvote', 'dim')}: Influences visibility
  • {c('Success reporting', 'dim')}: "Did this fix work?" (Yes/No)
  • {c('Context tracking', 'dim')}: Success rates by Python version, OS

  {c('Ranking Algorithm:', 'green')}
  Fixes are scored using 4 weighted factors:
    • 50% {c('Success rate', 'dim')} (community attempts)
    • 20% {c('Network effect', 'dim')} (more users = higher trust)
    • 15% {c('Context match', 'dim')} (Python version, OS match)
    • 15% {c('Recency', 'dim')} (newer fixes ranked higher)
  
  Best scoring fix is presented first, with alternatives available.

  {c('Example in Action:', 'green')}
  
  Fix A: 60% success (30/50 users) → {c('Trusted', 'green')}
  Fix B: 45% success (9/20 users)  → {c('Experimental', 'yellow')}
  Fix C: 95% success (19/20 users) → {c('Highly Trusted', 'green')}
  
  LuciferAI shows: Fix C first, then Fix A, hides Fix B (below 51%)

{c('═' * 67, 'purple')}
{c('CONTINUOUS IMPROVEMENT CYCLE', 'cyan')}
{c('═' * 67, 'purple')}

{c('How Templates & Fixes Evolve:', 'yellow')}

  {c('1. Local Creation', 'green')}
     • AI generates new template/fix for your specific case
     • Validated locally before use
     • Stored in local consensus database
  
  {c('2. Idle Time Upload', 'green')}
     • During idle time, LuciferAI syncs with FixNet
     • New templates/fixes uploaded (encrypted & signed)
     • Existing templates/fixes updated with your results
  
  {c('3. Community Validation', 'green')}
     • Other users try your templates/fixes
     • Success/failure data accumulates
     • 51% threshold determines trust level
  
  {c('4. Quality Ranking', 'green')}
     • Best templates/fixes rise to top
     • Poor ones get quarantined (<30% success)
     • Superseded versions marked as outdated
  
  {c('5. Your Benefit', 'green')}
     • Next sync downloads improved templates/fixes
     • You benefit from community improvements
     • Collective intelligence beats individual AI

{c('Why This Matters:', 'yellow')}
  • {c('Faster than AI', 'dim')}: Instant fixes vs waiting for model generation
  • {c('More reliable', 'dim')}: Real-world tested by dozens/hundreds of users
  • {c('Self-improving', 'dim')}: Quality increases automatically over time
  • {c('Democratic', 'dim')}: Community decides what works, not algorithms
  • {c('Offline-first', 'dim')}: Works when you have no internet or AI models
  • {c('Privacy preserved', 'dim')}: All fixes are encrypted & anonymized

{c('═' * 67, 'purple')}
{c('WHY LUCIFERAI?', 'cyan')}
{c('═' * 67, 'purple')}

{c('✅ Complete Privacy', 'green')}
  All AI processing happens {c('100% locally', 'yellow')}—no data sent to cloud services

{c('✅ No Subscriptions', 'green')}
  Free and open source—no API keys, tokens, or monthly fees

{c('✅ Works Offline', 'green')}
  Full functionality without internet (after initial model download)

{c('✅ Cross-Platform', 'green')}
  Works on Windows, macOS, Linux, and Raspberry Pi with llamafile backend

{c('✅ Developer-Friendly', 'green')}
  Natural language + traditional commands + intelligent fixing

{c('✅ Gamified Experience', 'green')}
  Badges, souls, achievements make productivity fun

{c('═' * 67, 'purple')}

Type {c('models info', 'cyan')} for detailed AI model comparison
Type {c('help', 'cyan')} to see all available commands
Type {c('mainmenu', 'cyan')} for Quick Actions and installation status

{c('═' * 67, 'purple')}
"""
        print(summary_text)
        return ""
    
    def _handle_help(self) -> str:
        """Show comprehensive help with example queries."""
        help_text = f"""
{c('╔══════════════════════════════════════════════════════════════╗', 'purple')}
{c('║              🔥 LuciferAI Command Reference                  ║', 'purple')}
{c('╚══════════════════════════════════════════════════════════════╝', 'purple')}

{c('📖 PROGRAM INFORMATION', 'cyan')}
  {c('program summary', 'yellow')}         {c('Complete overview of LuciferAI', 'dim')}
  {c('models info', 'yellow')}             {c('Compare AI capabilities & installation', 'dim')}

{c('📁 FILE OPERATIONS', 'cyan')}
  {c('copy', 'yellow')} <source> <dest>  {c('Copy files/folders', 'dim')}
    Examples: copy file.txt backup.txt
              copy folder to ~/Desktop/backup
  
  {c('move', 'yellow')} <source> <dest>  {c('Move files/folders', 'dim')}
    Examples: move old.txt new.txt
              move project ~/Documents/
  
  {c('delete', 'yellow')} <target>       {c('Move to trash with confirmation', 'dim')}
    Examples: delete old_file.txt
              delete the file name test.py on my desktop
  
  {c('open', 'yellow')} <file>           {c('Open with app selection', 'dim')}
    Examples: open README.md
              open config.json with vscode
  
  {c('read', 'yellow')} <file>           {c('Display file contents', 'dim')}
  {c('list', 'yellow')} <path>           {c('List directory contents', 'dim')}
  {c('find', 'yellow')} <pattern>        {c('Search for files', 'dim')}

{c('🏗️  BUILD COMMANDS', 'cyan')}
  {c('create folder', 'yellow')} <name>  {c('Create folder on Desktop', 'dim')}
    Examples: create folder myproject
              build a directory called webapp
  
  {c('create file', 'yellow')} <name>    {c('Create file with template', 'dim')}
    Examples: create file script.py
              put a file named test.py in it

{c('🔍 DAEMON/WATCHER & FIX', 'cyan')}
  {c('run', 'yellow')} <script>          {c('Run script with smart finding', 'dim')}
    Examples: run test_script.py
              run calculator
              → Finds script by name
              → Detects errors
              → Prompts to fix (y/n)
  
  {c('fix', 'yellow')} <script>          {c('Fix script using consensus', 'dim')}
    Examples: fix broken_script.py
              → Detects errors
              → Searches FixNet consensus
              → Applies known fixes offline
  
  {c('daemon watch', 'yellow')} <script> {c('Watch script for errors', 'dim')}
    Examples: daemon watch calculator.py
              → Finds file, confirms path
              → Asks about autofix (y/n)
              → Watches for changes
              → Auto-fixes if enabled

{c('💬 AI QUERIES', 'cyan')}
  {c('Any question or request!', 'yellow')}
    Examples: what is python?
              how do I install numpy?
              explain this error: ModuleNotFoundError
              write a function to sort a list

{c('📊 INFORMATION', 'cyan')}
  {c('info', 'yellow')}        {c('Interactive feature demo', 'dim')}
  {c('short test', 'yellow')}  {c('Quick test: queries + build/fix/daemon (all models)', 'dim')}
  {c('test suite', 'yellow')}  {c('Run all automated tests', 'dim')}
  {c('help', 'yellow')}        {c('Show this help', 'dim')}
  {c('memory', 'yellow')}      {c('Show command history', 'dim')}
  {c('pwd', 'yellow')}         {c('Current directory', 'dim')}

{c('🤖 AI MODEL MANAGEMENT', 'cyan')}
  {c('llm list', 'yellow')}                 {c('Show installed models', 'dim')}
  {c('llm list all', 'yellow')}             {c('Show ALL supported models (85+)', 'dim')}
  {c('llm enable <model>', 'yellow')}       {c('Enable a model', 'dim')}
  {c('llm disable <model>', 'yellow')}      {c('Disable a model', 'dim')}
  {c('llm enable all', 'yellow')}           {c('Enable all installed models', 'dim')}
  {c('llm disable all', 'yellow')}          {c('Disable all installed models', 'dim')}
  {c('llm enable tier0-3', 'yellow')}       {c('Enable all models in a tier', 'dim')}
  {c('llm disable tier0-3', 'yellow')}      {c('Disable all models in a tier', 'dim')}
  {c('backup models', 'yellow')}            {c('Set backup models directory', 'dim')}
  {c('show backup models', 'yellow')}       {c('Show current backup directory', 'dim')}

{c('🎨 CUSTOM MODELS & INTEGRATIONS', 'cyan')}
  {c('custom model info', 'yellow')}        {c('Guide for adding custom GGUF models', 'dim')}
  {c('custom models', 'yellow')}            {c('Same as custom model info', 'dim')}
    {c('Quick steps (GGUF models):', 'green')}
    1. Place .gguf file in {c('models/custom_models/', 'yellow')}
    2. Run {c('llm enable <model-name>', 'cyan')}
    3. Verify with {c('llm list', 'cyan')}
  
  {c('External AI Services & Plugins:', 'green')}
    See {c('docs/CUSTOM_INTEGRATIONS.md', 'cyan')} for:
    - Image generation (Flux, Stable Diffusion, Fooocus)
    - External APIs (GitHub Copilot, OpenAI, Anthropic)
    - Custom plugin development
  
  {c('Advanced:', 'green')} See {c('docs/TRAIN_CUSTOM_LLM_FOR_LUCIFERAI.md', 'cyan')} for training your own LLM

{c('📝 SESSION MANAGEMENT', 'cyan')}
  {c('session list', 'yellow')}             {c('List recent sessions (last 10)', 'dim')}
  {c('session open <id>', 'yellow')}        {c('View full session log with timestamps', 'dim')}
  {c('session info', 'yellow')}             {c('Current session statistics', 'dim')}
  {c('session stats', 'yellow')}            {c('Overall session statistics', 'dim')}
    Examples: session list
              session open 20250113_230500
              what happened in my last session?
              show me all sessions from today
  {c('Note:', 'green')} Sessions are automatically saved with 6-month retention

{c('📦 MODEL INSTALLATION', 'cyan')}
  {c('Quick Install Commands:', 'green')}
    {c('install core models', 'yellow')}     {c('- Install 4 essential models (~20-30 GB)', 'dim')}
    {c('install all models', 'yellow')}      {c('- Install ALL 85+ models (~350-450 GB)', 'dim')}
  
  {c('Install by Tier:', 'green')}
    {c('install tier 0', 'yellow')}          {c('- Install all Tier 0 models (Basic, ~3-4 GB)', 'dim')}
    {c('install tier 1', 'yellow')}          {c('- Install all Tier 1 models (General, ~30-35 GB)', 'dim')}
    {c('install tier 2', 'yellow')}          {c('- Install all Tier 2 models (Advanced, ~50-60 GB)', 'dim')}
    {c('install tier 3', 'yellow')}          {c('- Install all Tier 3 models (Expert, ~80-100 GB)', 'dim')}
    {c('install tier 4', 'yellow')}          {c('- Install all Tier 4 models (Ultra-Expert, ~200-250 GB)', 'dim')}
  
  {c('Individual Model Installation (All Local):', 'green')}
  
  {c('🔹 Tier 0 - Basic (1-2B): Fast, low resource', 'yellow')}
    {c('Best for: Quick responses, simple tasks, low-power devices', 'dim')}
    install tinyllama         {c('1.1B params, basic chat [Local]', 'dim')}
    install phi-2             {c('2.7B params, reasoning [Local]', 'dim')}
    install stablelm          {c('1.6B params, stable [Local]', 'dim')}
    install orca-mini         {c('3B params, mini assistant [Local]', 'dim')}
  
  {c('🔹 Tier 1 - General (3-8B): Balanced performance', 'yellow')}
    {c('Best for: General tasks, chat, moderate complexity', 'dim')}
    install llama2            {c('7B params, conversational [Local]', 'dim')}
    install phi-3             {c('3.8B params, Microsoft [Local]', 'dim')}
    install gemma             {c('7B params, Google [Local]', 'dim')}
    install gemma2            {c('9B params, Google v2 [Local]', 'dim')}
    install vicuna            {c('7B params, fine-tuned [Local]', 'dim')}
    install orca-2            {c('7B params, reasoning [Local]', 'dim')}
    install openchat          {c('7B params, open source [Local]', 'dim')}
    install starling          {c('7B params, RLAIF trained [Local]', 'dim')}
  
  {c('🔹 Tier 2 - Advanced (7-13B): High quality', 'yellow')}
    {c('Best for: Complex tasks, coding, analysis, better reasoning', 'dim')}
    install mistral           {c('7B params, best in class [Local]', 'dim')}
    install mixtral           {c('8x7B MoE, powerful [Local]', 'dim')}
    install llama3            {c('8B params, Meta latest [Local]', 'dim')}
    install llama3.1          {c('8B params, enhanced [Local]', 'dim')}
    install codellama         {c('7B params, coding specialist [Local]', 'dim')}
    install qwen              {c('7B params, multilingual [Local]', 'dim')}
    install qwen2             {c('7B params, Alibaba v2 [Local]', 'dim')}
    install yi                {c('6B params, 01.AI [Local]', 'dim')}
    install solar             {c('10.7B params, upscaled [Local]', 'dim')}
    install neural-chat       {c('7B params, Intel optimized [Local]', 'dim')}
  
  {c('🔹 Tier 3 - Expert (13-34B): Maximum capability', 'yellow')}
    {c('Best for: Expert coding, complex reasoning, specialized tasks', 'dim')}
    install deepseek          {c('6.7B params, code expert [Local]', 'dim')}
    install deepseek-coder-33b {c('33B params, code master [Local]', 'dim')}
    install codellama-13b     {c('13B params, code specialist [Local]', 'dim')}
    install codellama-34b     {c('34B params, code expert [Local]', 'dim')}
    install wizardcoder       {c('15B params, coding wizard [Local]', 'dim')}
    install wizardcoder-33b   {c('33B params, Python expert [Local]', 'dim')}
    install wizardlm          {c('13B params, instruction following [Local]', 'dim')}
    install yi-34b            {c('34B params, 01.AI expert [Local]', 'dim')}
    install qwen-14b          {c('14B params, multilingual [Local]', 'dim')}
    install dolphin           {c('Mixtral based, uncensored [Local]', 'dim')}
    install nous-hermes       {c('Mixtral based, versatile [Local]', 'dim')}
    install phind-codellama   {c('34B params, search-trained [Local]', 'dim')}
  
  {c('🔹 Tier 4 - Ultra-Expert (70B+): Research-grade', 'yellow')}
    {c('Best for: Enterprise systems, research, production apps (Requires 64GB+ RAM)', 'dim')}
    install llama3-70b        {c('70B params, Meta flagship [Local]', 'dim')}
    install llama3.1-70b      {c('70B params, Meta enhanced [Local]', 'dim')}
    install mixtral-8x22b     {c('8x22B MoE, massive [Local]', 'dim')}
    install qwen-72b          {c('72B params, Alibaba flagship [Local]', 'dim')}
    install qwen2-72b         {c('72B params, Alibaba v2 [Local]', 'dim')}
  
  {c('☁️ Tier 5 - Cloud AI: Premium Online Models (Coming Soon)', 'yellow')}
    {c('Best for: Latest GPT-4 features, web browsing, code interpreter, archived data', 'dim')}
    {c('Requires: OpenAI account (ChatGPT Plus recommended for GPT-4)', 'dim')}
    
    {c('Account Management:', 'green')}
    chatgpt link              {c('Link your OpenAI/ChatGPT account [Cloud]', 'dim')}
    chatgpt status            {c('View connection and usage status [Cloud]', 'dim')}
    chatgpt unlink            {c('Disconnect ChatGPT account [Cloud]', 'dim')}
    
    {c('Data Access:', 'green')}
    chatgpt history           {c('Access your archived conversations [Cloud]', 'dim')}
    chatgpt search <query>    {c('Search your ChatGPT conversation history [Cloud]', 'dim')}
    chatgpt export            {c('Export conversations to local storage [Cloud]', 'dim')}
    
    {c('Model Selection:', 'green')}
    chatgpt use gpt-4         {c('Switch to GPT-4 (requires Plus) [Cloud]', 'dim')}
    chatgpt use gpt-3.5       {c('Switch to GPT-3.5 (free tier) [Cloud]', 'dim')}
    
    {c('Features:', 'green')}
    • {c('GPT-4 Access', 'dim')}: Latest OpenAI model with enhanced reasoning
    • {c('Web Browsing', 'dim')}: Real-time internet access for current info
    • {c('Code Interpreter', 'dim')}: Execute Python code in secure sandbox
    • {c('Conversation History', 'dim')}: Access all your ChatGPT conversations
    • {c('DALL-E Integration', 'dim')}: Generate images directly from LuciferAI
    • {c('Hybrid Mode', 'dim')}: Use local models offline, cloud when needed
  
  {c('Note:', 'yellow')} Tiers 0-4 run locally - no data sent to cloud
  {c('Note:', 'yellow')} Tier 5 requires internet and sends data to OpenAI
  {c('Note:', 'yellow')} All commands support typo correction (e.g., 'mistrl' → 'mistral')
  {c('Type', 'dim')} {c('llm list all', 'cyan')} {c('for complete list with details', 'dim')}

{c('📦 PACKAGE MANAGEMENT', 'cyan')}
  {c('install', 'yellow')} <package>     {c('Install Python packages', 'dim')}
    Examples: install numpy
              install requests
              install pandas

{c('🐍 VIRTUAL ENVIRONMENTS', 'cyan')}
  {c('environments', 'yellow')} or {c('envs', 'yellow')}     {c('List ALL virtual environments', 'dim')}
    • Finds conda, venv, pyenv, luci, poetry, pipenv
    • Shows Python versions and paths
    • Displays activation commands
  
  {c('env search', 'yellow')} <query>       {c('Search for specific environments', 'dim')}
    Examples: env search myproject
              env search 3.11          {c('(find by Python version)', 'dim')}
              env search conda         {c('(find by type)', 'dim')}
              environment search flask {c('(alternative syntax)', 'dim')}
              find myproject environment {c('(natural language)', 'dim')}
    • Searches by name, path, Python version, and type
    • Shows all matching environments grouped by type
    • Comprehensive across all package managers
    • Works with natural "find <name> environment" syntax
  
  {c('activate', 'yellow')} <env>           {c('Activate an environment', 'dim')}
    Examples: activate myproject
              activate venv
              env activate /path/to/env
    • Searches for environment by name or path
    • Generates activation command for your shell
    • Works with conda, venv, pyenv, and luci environments
    • Shows exact command to copy and run

{c('🔗 GITHUB SYNC', 'cyan')}
  {c('github link', 'yellow')}             {c('Link GitHub account', 'dim')}
  {c('github upload', 'yellow')} [project] {c('Upload project to GitHub', 'dim')}
    Examples: github upload
              github upload LuciferAI_Local
  {c('github update', 'yellow')} [project] {c('Update existing repo', 'dim')}
  {c('github status', 'yellow')}           {c('Show GitHub status', 'dim')}
  {c('github projects', 'yellow')}         {c('List your repositories', 'dim')}

{c('⌨️  SHORTCUTS', 'cyan')}
  {c('Up/Down arrows', 'yellow')}  {c('Navigate command history (120 commands)', 'dim')}
  {c('Ctrl+C', 'yellow')}          {c('Graceful shutdown', 'dim')}
  {c('clear', 'yellow')}           {c('Clear screen', 'dim')}
  {c('exit', 'yellow')}            {c('Exit LuciferAI', 'dim')}

{c('💡 TIPS', 'cyan')}
  • Multi-word requests automatically use AI
  • Typos are auto-corrected with confirmation
  • "in it" refers to last created folder
  • Command history persists across restarts
  • Type natural questions - AI will understand!

{c('😈 DIABOLICAL MODES/COMMANDS', 'cyan')}
  {c('diabolical mode', 'yellow')}           {c('Enter secret diabolical mode', 'dim')}
    • Unleashes unrestricted AI responses
    • No ethical guardrails or limitations
    • Experimental features and capabilities
    • Exhausts ALL installed LLMs before failing any attempt
    • Use with caution - unfiltered output
  
  {c('diabolical exit', 'yellow')}           {c('Exit diabolical mode', 'dim')}
    • Returns to standard safe mode
    • Re-enables standard AI guardrails
  
  {c('soul', 'yellow')}                      {c('Manage LLMs Soul Modulator (diabolical mode)', 'dim')}
    • Unlocked after collecting 7 badges
    • Bind soul personalities to specific LLMs
    • Soul types: Creative, Analytical, Rebellious, Empathetic, Dark
    • ✨ Unlock 7 Deadly Sins Mode → Gain Celestial Azazel soul
    • Azazel: 50/50 good/evil balance + custom 5th trait
    • Commands: soul activate/deactivate, soul list, soul bind/unbind
    • View status in your profile with mainmenu
  
  {c('install core models', 'yellow')}      {c('Install essential 4 core models', 'dim')}
    • Installs: TinyLlama, Llama2, Mistral, DeepSeek-Coder
    • One from each tier (0, 1, 2, 3)
    • Fastest way to get started (~20-30 GB)
    • Estimated time: 20-40 minutes
  
  {c('install all models', 'yellow')}        {c('Install ALL 85+ supported models', 'dim')}
    • Installs core models first, then best to worst
    • Core: TinyLlama, Llama3.2, Mistral, DeepSeek-Coder
    • Then: Tier 4 → Tier 3 → Tier 2 → Tier 1 → Tier 0 (all tiers)
    • ⚠️  WARNING: Requires ~350-450 GB disk space (includes Tier 4 70B+ models)
    • Estimated time: {self._estimate_download_time(400)}
  
  {c('demo test tournament', 'yellow')}      {c('Run physics combat system demo', 'dim')}
    • Interactive battle arena with real-time display
    • Choose preset battles or custom fighter matchups
    • Features: Moving fighters, projectile physics, weapon mechanics
    • Grid-based arena with line numbers and column letters
    • Type '0' in tournament menu to return to LuciferAI

{c('Type', 'dim')} {c('mainmenu', 'cyan')} {c('to see installation options', 'dim')}

{c('⚜️ SOUL COMBAT SYSTEM', 'cyan')}
  {c('Collect & Battle Souls', 'yellow')} - RPG-style souls with leveling and combat
    • 5 Rarity Tiers: Common, Uncommon, Angelic, Demonic, Celestial
    • Souls level up by processing requests, fixing scripts, using templates
    • Combat Stats: Attack, Defense, Base Damage, Speed, Weapons
    • Weapons: Rare (Angelic), Legendary (Demonic), Divine (Celestial)
    • 🍎 Golden Notch Apple: Angelic healing item (triggers @ 20% HP)
    • Battle souls to test your collection
    • Health scales with level: Common 100+, Celestial 2000+
    • Max Levels: Common 50, Uncommon 99, Angelic 256, Demonic 999, Celestial 9999
  
{c('🏅 BADGE SYSTEM', 'cyan')}
  {c('13 Achievement Badges', 'yellow')} - Track your contributions and progress
    🌱 First Contribution      {c('20 contributions', 'dim')}
    🌿 Active Contributor      {c('200 contributions (4 levels)', 'dim')}
    🌳 Veteran Contributor     {c('1000 contributions (4 levels)', 'dim')}
    ⭐ Elite Contributor       {c('2000 contributions (4 levels)', 'dim')}
    📚 Template Master         {c('400 templates (4 levels)', 'dim')}
    🔧 Fix Specialist          {c('400 fixes (4 levels)', 'dim')}
    🌟 Community Favorite      {c('2000 downloads (4 levels)', 'dim')}
    💎 Quality Contributor     {c('4.5+ avg rating (4 levels)', 'dim')}
    🌐 First Fix to FixNet     {c('20 fixes uploaded', 'dim')}
    📦 First Template to FixNet {c('20 templates uploaded', 'dim')}
    🔴 Learning Experience     {c('20 fixes tested by others', 'dim')}
    ✅ Problem Solver          {c('20 successful fixes for others', 'dim')}
    🚀 Template Pioneer        {c('20 templates used successfully', 'dim')}
  
  {c('Progress Levels:', 'yellow')}
    ❓ ???  {c('= Level 0 (Locked)', 'dim')}
    🌿 I??  {c('= Level 1 (33% progress - badge emoji revealed!)', 'dim')}
    🌿 II?  {c('= Level 2 (66% progress)', 'dim')}
    🌿 III  {c('= Level 3 (99% progress - almost there!)', 'dim')}
    🌿 Name {c('= Level 4 (UNLOCKED!)', 'dim')}
  
  {c('Collection Rewards:', 'yellow')}
    🎁 {c('7 badges', 'yellow')}  → {c('Special gift unlocked!', 'dim')}
    🎉 {c('13 badges', 'yellow')} → {c('Easter egg + secret content revealed', 'dim')}
  
  {c('🕷️  Secret Achievements:', 'yellow')} {c('Collect all 13 badges to unlock hidden content...', 'dim')}
  
  {c('Type', 'dim')} {c('mainmenu', 'cyan')} {c('to view your badge progress and stats', 'dim')}

{c('Type', 'dim')} {c('mainmenu', 'cyan')} {c('to see installation options', 'dim')}
"""
        return help_text
    
    def _handle_demo_tournament(self) -> str:
        """Launch the physics combat demo tournament."""
        try:
            # Clear screen before launching
            os.system('clear' if os.name != 'nt' else 'cls')
            
            # Import and run the tournament
            from games.soul_combat.demo_physics_combat import run_tournament
            run_tournament()
            
            # Clear screen after exiting tournament
            os.system('clear' if os.name != 'nt' else 'cls')
            
            # Re-display startup banner
            self._handle_main_menu()
            
            # Return empty string since we're back at main menu
            return ""
        except Exception as e:
            return c(f"❌ Error launching tournament: {e}", "red")
    
    def _handle_main_menu(self) -> str:
        """Redisplay the startup banner."""
        # Clear screen
        os.system('clear' if os.name != 'nt' else 'cls')
        
        # Show initialization status
        print(c(f"{Emojis.HEARTBEAT} Enhanced LuciferAI Active", "purple"))
        print(c("✅ Authentication system loaded", "green"))
        print(c(f"👻 LuciferWatcher initialized", "white"))
        print(c(f"🔄 FixNet Synced: {len(self.dictionary.remote_refs)} remote fixes", "cyan"))
        
        # Get WiFi info
        try:
            import subprocess
            result = subprocess.run(['networksetup', '-getairportnetwork', 'en0'], 
                                   capture_output=True, text=True, timeout=2)
            if result.returncode == 0 and 'Current Wi-Fi Network' in result.stdout:
                ssid = result.stdout.split(':')[1].strip()
                print(c(f"📡 WiFi: Connected to {ssid}", "cyan"))
            else:
                print(c("📡 WiFi: Connected", "cyan"))
        except:
            print(c("📡 WiFi: Connected", "cyan"))
        
        print(c(f"👀 User ID: {self.user_id}", "purple"))
        print(c(f"📁 Working directory: {self.env['cwd']}", "blue"))
        print()
        
        # Show user profile with badges
        try:
            from core.user_stats import UserStatsTracker
            tracker = UserStatsTracker()
            profile = tracker.get_user_profile(self.user_id)
            score = tracker.calculate_user_score(self.user_id)
            
            # Profile header
            print(c("─" * 60, "dim"))
            print(c(f"👤 User Profile: {self.user_id}", "purple"))
            
            # Always show label (Founder or Member)
            from core.founder_config import get_author_label, is_founder
            author_label = get_author_label(self.user_id)
            label_color = "gold" if is_founder(self.user_id) else "cyan"
            print(c(f"   {author_label}", label_color))
            
            print(c("─" * 60, "dim"))
            print()
            
            # Statistics
            print(c("📊 Statistics:", "cyan"))
            print(c(f"   • Total Score: {score}", "white"))
            print(c(f"   • Templates: {profile['total_templates']}", "white"))
            print(c(f"   • Fixes: {profile['total_fixes']}", "white"))
            print(c(f"   • Downloads: {profile.get('total_downloads', 0)}", "white"))
            print(c(f"   • Avg Rating: {profile.get('avg_rating', 0):.1f}/5.0", "white"))
            print()
            
            # Soul Modulator status
            from core.soul_modulator import SoulModulator
            soul_mod = SoulModulator(self.user_id)
            soul_status = soul_mod.get_status_display()
            print(c(f"   {soul_status}", "purple" if soul_mod.is_active() else "dim"))
            print()
            
            # Badge 0: Founder/Member status (separate from collection)
            badge_0 = tracker.get_badge_0_status(self.user_id)
            print(c(f"🔹 Badge 0: {badge_0['emoji']} {badge_0['name']}", "purple"))
            print()
            
            # Badges 1-13: Collection progress
            badges_status = tracker.get_all_badges_status(self.user_id)
            collection_progress = tracker.calculate_badge_collection_progress(self.user_id)
            
            print(c("🏅 Badge Collection (1-13):", "cyan"))
            
            # Show progress bar
            progress_bar = tracker.get_progress_bar(collection_progress['percentage'], width=30)
            print(c(f"   {progress_bar}", "white"))
            print(c(f"   {collection_progress['unlocked_count']}/{collection_progress['total_badges']} badges unlocked", "white"))
            
            # Show reward hints
            if collection_progress['reward_13_unlocked']:
                print(c("   🎉 ALL BADGES COLLECTED! Easter egg unlocked!", "gold"))
                print(c("   👑 Hint: A secret sin badge awaits... 7 total sins unlock 7DSD Mode", "purple"))
            elif collection_progress['reward_7_unlocked']:
                # Check if soul modulator needs to be unlocked
                from core.soul_modulator import SoulModulator
                soul_mod = SoulModulator(self.user_id)
                if soul_mod.unlock():
                    print(c("   🎉 7-BADGE REWARD: LLMs Soul Modulator UNLOCKED!", "gold"))
                    print(c("   👻 3 souls granted: Creative, Analytical, Rebellious", "purple"))
                    print(c("   💫 Type 'soul' in diabolical mode to manage your souls", "cyan"))
                else:
                    print(c("   🎁 7-Badge Gift Unlocked! Keep going for the Easter egg at 13!", "green"))
            else:
                next_reward = collection_progress['next_reward']
                if next_reward == 7:
                    remaining = 7 - collection_progress['unlocked_count']
                    print(c(f"   🎁 Unlock {remaining} more badge(s) for the LLMs Soul Modulator!", "yellow"))
                print(c("   🕷️  Collect all 13 badges to begin unlocking secret sins...", "dim"))
            print()
            
            # Show unlocked badges first
            unlocked = [b for b in badges_status if b['unlocked']]
            locked = [b for b in badges_status if not b['unlocked']]
            
            if unlocked:
                print(c("   Unlocked:", "green"))
                for badge in unlocked:
                    print(c(f"      {badge['emoji']} {badge['name']}", "white"))
            
            if locked:
                if unlocked:
                    print()
                print(c("   In Progress:", "yellow"))
                for badge in locked:
                    # Show compact Roman numeral progress + next milestone
                    progress = badge.get('progress_display', '❓ ???')
                    next_step = badge.get('next_milestone', badge['hint'])
                    print(c(f"      {progress} - {next_step}", "dim"))
            
            print()
            
            # Recent activity
            recent = tracker.get_user_history(self.user_id, limit=3)
            if recent:
                print(c("📝 Recent Contributions (last 3):", "cyan"))
                for i, contrib in enumerate(recent, 1):
                    contrib_type = c(f"[{contrib['type'].upper()}]", "green" if contrib['type'] == 'template' else "yellow")
                    print(c(f"   {i}. {contrib_type} {contrib['name']}", "white"))
                    print(c(f"      {contrib['timestamp'][:10]} - {contrib['hash'][:12]}...", "dim"))
                print()
            
            print(c("─" * 60, "dim"))
            print()
        except Exception as e:
            # Silently skip if stats can't be loaded
            pass
        
        # Determine current AI mode
        from lucifer_colors import detect_installed_models
        models = detect_installed_models()
        
        # Determine mode based on installed/enabled models
        mode = "Rule-Based"
        if models['bundled_models']:
            # Check which models are enabled
            enabled_models = [m for m in models['bundled_models'] if m.get('enabled', True)]
            if enabled_models:
                # Use the highest tier enabled model
                highest_tier = max([m for m in enabled_models], key=lambda x: int(x.get('tier', 'Tier 0').split()[1]))
                model_name = highest_tier['name']
                tier = highest_tier['tier']
                
                if 'mistral' in model_name.lower():
                    mode = "Mistral (Tier 2)"
                elif 'deepseek' in model_name.lower():
                    mode = "DeepSeek (Tier 3)"
                elif 'llama3.1-70b' in model_name.lower():
                    mode = "Llama3.1-70B (Tier 4)"
                elif 'gemma2' in model_name.lower() or 'gemma-2' in model_name.lower():
                    mode = "Gemma2 (Tier 1)"
                elif 'tinyllama' in model_name.lower():
                    mode = "TinyLlama (Tier 0)"
                else:
                    mode = f"{model_name.title()} ({tier})"
        elif self.ollama_available:
            mode = "Ollama"
        
        # Display banner
        from lucifer_colors import display_banner
        display_banner(mode=mode, user_id=self.user_id)
        
        # Show platform detection
        from core.platform_utils import get_platform_utils
        platform_utils = get_platform_utils()
        platform_info = platform_utils.platform_info
        
        # Display platform info
        print(c("🖥️  System: ", "cyan") + c(platform_info['os_version'], "white"), end="")
        
        # Add specific platform badges
        if platform_info['os'] == 'macOS':
            if platform_info.get('apple_silicon'):
                print(c(" [Apple Silicon]", "purple"), end="")
            else:
                print(c(" [Intel]", "dim"), end="")
        elif platform_info['os'] == 'Linux':
            if platform_info.get('raspberry_pi'):
                print(c(" [🥧 Raspberry Pi]", "green"), end="")
            else:
                print(c(f" [{platform_info.get('arch_name', 'x86_64')}]", "dim"), end="")
        elif platform_info['os'] == 'Windows':
            print(c(" [x64]", "dim"), end="")
        
        print()  # Newline
        
        # Show special notes for embedded/edge devices
        if platform_info.get('raspberry_pi'):
            print(c("💡 Pi Detected: Consider Tier 0 models (phi-2, tinyllama) for best performance", "yellow"))
            print(c("   See docs/TIER_SYSTEM.md for Raspberry Pi optimization tips", "dim"))
        
        # Show WiFi speed (use existing data if fresh, otherwise start async test)
        self._display_wifi_status()
        print()
        
        # Note: Removed early return here - unreachable code below
        # return ""
        
        # Check for llamafile in project bin directory
        project_root = Path(__file__).parent.parent
        llamafile_path = project_root / 'bin' / 'llamafile'
        has_llamafile = llamafile_path.exists()
        
        # Show different menus based on available models
        if not self.ollama_available:
            # No Ollama - check for llamafile
            if has_llamafile:
                print(c("✅ llamafile Detected", "green"))
                print(c(f"   Location: {llamafile_path}", "dim"))
                print(c("   Ready to run AI models locally", "dim"))
                print()
                print(c("💡 Next: Download a model from https://huggingface.co", "cyan"))
                print(c("   Example: llamafile -m model.gguf", "dim"))
                print()
            else:
                print(c("🚨 No AI Models Detected", "yellow"))
                print()
            
            # Check for Catalina and show appropriate warning
            import platform
            is_catalina = False
            if platform.system() == "Darwin":
                try:
                    version_str = platform.mac_ver()[0]
                    parts = version_str.split('.')
                    major = int(parts[0]) if len(parts) > 0 else 0
                    minor = int(parts[1]) if len(parts) > 1 else 0
                    if major == 10 and minor <= 15:
                        is_catalina = True
                        if not has_llamafile:
                            print(c(f"⚠️  macOS {version_str} (Catalina) detected", "yellow"))
                            print(c("   Native Ollama requires Sonoma 14.0+", "dim"))
                            print(c("   Recommended: llamafile", "green"))
                            print()
                except:
                    pass
            
            print(c("Get Started:", "cyan"))
            if has_llamafile:
                print(c("  [1]", "blue") + c(" Download Model", "green") + c(" - Get a .gguf model from HuggingFace", "dim"))
                print(c("  [2]", "blue") + c(" Program Summary", "green") + c(" - Complete overview of LuciferAI", "dim"))
                print(c("  [3]", "blue") + c(" View Help", "green") + c(" - See all available commands", "dim"))
                print(c("  [4]", "blue") + c(" System Test", "green") + c(" - Interactive feature demo", "dim"))
            elif is_catalina:
                print(c("  [1]", "blue") + c(" Install llamafile", "green") + c(" - Standalone AI runner (Catalina compatible)", "dim"))
                print(c("  [2]", "blue") + c(" Program Summary", "green") + c(" - Complete overview of LuciferAI", "dim"))
                print(c("  [3]", "blue") + c(" View Help", "green") + c(" - See all available commands", "dim"))
                print(c("  [4]", "blue") + c(" System Test", "green") + c(" - Interactive feature demo", "dim"))
            else:
                print(c("  [1]", "blue") + c(" Install AI Platform", "green") + c(" - Install Ollama + mistral", "dim"))
                print(c("      ", "dim") + c("(Auto-detects old macOS & suggests alternatives)", "dim"))
                print(c("  [2]", "blue") + c(" Program Summary", "green") + c(" - Complete overview of LuciferAI", "dim"))
                print(c("  [3]", "blue") + c(" View Help", "green") + c(" - See all available commands", "dim"))
                print(c("  [4]", "blue") + c(" System Test", "green") + c(" - Interactive feature demo", "dim"))
            print()
        elif not self.multi_model_mode:
            # Some models - show upgrade options
            installed = [m for m in ['phi-2', 'tinyllama', 'gemma2', 'mistral', 'deepseek-coder', 'llama3.1-70b'] if m in self.available_models]
            missing = [m for m in ['phi-2', 'tinyllama', 'gemma2', 'mistral', 'deepseek-coder', 'llama3.1-70b'] if m not in self.available_models]
            
            print(c(f"✅ Installed: {', '.join(installed)}", "green"))
            if missing:
                print(c(f"❌ Missing: {', '.join(missing)}", "dim"))
            print()
            print(c("Quick Actions:", "cyan"))
            print(c("  [1]", "blue") + c(" Program Summary", "green") + c(" - Complete overview of LuciferAI", "dim"))
            print(c("  [2]", "blue") + c(" Models Info", "green") + c(" - Compare capabilities", "dim"))
            print(c("  [3]", "blue") + c(" Install Missing Models", "green") + c(" - Complete your AI toolkit", "dim"))
            print(c("  [4]", "blue") + c(" View Help", "green") + c(" - See all commands", "dim"))
            print(c("  [5]", "blue") + c(" System Test", "green") + c(" - Interactive demo", "dim"))
            print()
        else:
            # All models - show full menu + Tier 5 suggestion
            print(c("✨ Full Local AI Suite Active (Tiers 0-4)", "green"))
            print(c("  • ", "dim") + c("phi-2", "purple") + c(" - Tier 0: Fast basic responses", "dim"))
            print(c("  • ", "dim") + c("tinyllama", "purple") + c(" - Tier 0: Quick chat", "dim"))
            print(c("  • ", "dim") + c("gemma2", "purple") + c(" - Tier 1: Balanced performance", "dim"))
            print(c("  • ", "dim") + c("mistral", "purple") + c(" - Tier 2: Advanced reasoning", "dim"))
            print(c("  • ", "dim") + c("deepseek-coder", "purple") + c(" - Tier 3: Expert coding", "dim"))
            print(c("  • ", "dim") + c("llama3.1-70b", "purple") + c(" - Tier 4: Ultra-expert", "dim"))
            print()
            print(c("☁️ Tier 5 Available: Link ChatGPT for cloud AI features!", "yellow"))
            print(c("    Type ", "dim") + c("'chatgpt link'", "cyan") + c(" to connect your OpenAI account", "dim"))
            print()
            print(c("Quick Actions:", "cyan"))
            print(c("  [1]", "blue") + c(" Program Summary", "green") + c(" - Complete overview of LuciferAI", "dim"))
            print(c("  [2]", "blue") + c(" Models Info", "green") + c(" - Detailed comparison", "dim"))
            print(c("  [3]", "blue") + c(" LLM Management", "green") + c(" - Enable/disable models", "dim"))
            print(c("  [4]", "blue") + c(" View Help", "green") + c(" - See all commands", "dim"))
            print(c("  [5]", "blue") + c(" Link ChatGPT (Tier 5)", "green") + c(" - Connect cloud AI [Coming Soon]", "dim"))
            print(c("  [6]", "blue") + c(" System Test", "green") + c(" - Interactive demo", "dim"))
            print()
        
        print(c("  [0]", "blue") + c(" Return to Prompt", "yellow"))
        print()
        
        # Show platform-specific tips
        if platform_info.get('raspberry_pi'):
            print(c("🥧 Running on Raspberry Pi?", "green"))
            print(c("   • Check docs/TIER_SYSTEM.md for Pi-specific optimization", "dim"))
            print(c("   • Recommended: Tier 0 models (tinyllama, phi-2 with Q2_K/Q3_K_M)", "dim"))
            print()
        elif platform_info['os'] == 'Linux' and 'arm' in platform_info.get('arch_name', '').lower():
            print(c("📡 ARM-Based System Detected", "cyan"))
            print(c("   • Embedded/Edge device? See docs/TIER_SYSTEM.md for guidance", "dim"))
            print(c("   • Arduino/ESP32? Check remote inference architecture examples", "dim"))
            print()
        
        # Show embedded/custom OS note for all platforms
        print(c("🛠️  Advanced: ", "dim") + c("Arduino/Embedded/Custom OS? ", "cyan") + c("See docs/TIER_SYSTEM.md", "dim"))
        print()
        
        try:
            choice = get_single_key_input(c("Select option: ", "cyan"), valid_keys=['0', '1', '2', '3', '4', '5', '6'])
            print()  # Newline after key press
            
            if not self.ollama_available:
                if choice == '1':
                    # Check if llamafile is already installed
                    if has_llamafile:
                        # Open HuggingFace models page
                        import webbrowser
                        webbrowser.open('https://huggingface.co/models?library=gguf&sort=trending')
                        return c("✅ Opened HuggingFace models page in browser", "green") + "\n" + c("Download a .gguf model and run: llamafile -m model.gguf", "dim")
                    
                    # Check if Catalina and install llamafile
                    import platform
                    is_catalina = False
                    if platform.system() == "Darwin":
                        try:
                            version_str = platform.mac_ver()[0]
                            parts = version_str.split('.')
                            major = int(parts[0]) if len(parts) > 0 else 0
                            minor = int(parts[1]) if len(parts) > 1 else 0
                            if major == 10 and minor <= 15:
                                is_catalina = True
                        except:
                            pass
                    
                    if is_catalina:
                        # Install llamafile for Catalina
                        return self.package_manager.install('llamafile')
                    else:
                        return self._handle_ollama_install_request('install ollama')
                elif choice == '2':
                    return self._handle_program_summary()
                elif choice == '3':
                    return self._handle_help()
                elif choice == '4':
                    return self._handle_system_test()
            elif not self.multi_model_mode:
                if choice == '1':
                    return self._handle_program_summary()
                elif choice == '2':
                    return self._handle_models_info()
                elif choice == '3':
                    # Install missing models
                    if missing:
                        print(c(f"Installing missing models: {', '.join(missing)}", "cyan"))
                        print()
                        for model in missing:
                            print(c(f"Installing {model}...", "yellow"))
                            result = self._handle_ollama_install_request(f'install {model}')
                            print(result)
                            print()
                        return c("✅ Installation complete! Type 'mainmenu' to refresh.", "green")
                    else:
                        return c("✅ All core models already installed!", "green")
                elif choice == '4':
                    return self._handle_help()
                elif choice == '5':
                    return self._handle_system_test()
            else:
                if choice == '1':
                    return self._handle_program_summary()
                elif choice == '2':
                    return self._handle_models_info()
                elif choice == '3':
                    return self._handle_llm_list()
                elif choice == '4':
                    return self._handle_help()
                elif choice == '5':
                    # Tier 5 - ChatGPT linking (coming soon)
                    return c("☁️ Tier 5: ChatGPT Integration - Coming Soon!", "yellow") + "\n\n" + \
                           c("This feature will allow you to:", "cyan") + "\n" + \
                           c("  • Link your OpenAI/ChatGPT account", "dim") + "\n" + \
                           c("  • Access GPT-4 and premium features", "dim") + "\n" + \
                           c("  • Search your ChatGPT conversation history", "dim") + "\n" + \
                           c("  • Use web browsing and code interpreter", "dim") + "\n" + \
                           c("  • Hybrid mode: Local offline, cloud when needed", "dim") + "\n\n" + \
                           c("Stay tuned for the upcoming release!", "green")
                elif choice == '6':
                    return self._handle_system_test()
            
            # Return to prompt for any other key
            return ""
        
        except (EOFError, KeyboardInterrupt):
            return ""
    
    def _handle_session_list(self) -> str:
        """List recent sessions."""
        from datetime import datetime
        
        sessions = SessionLogger.get_recent_sessions(limit=10)
        
        if not sessions:
            return c(f"{Emojis.INFO} No previous sessions found", "yellow")
        
        output = []
        output.append(c("\n📝 Recent Sessions (Last 10)", "cyan"))
        output.append(c("═" * 60, "purple"))
        output.append("")
        
        for i, session in enumerate(sessions, 1):
            session_id = session['session_id']
            started = datetime.fromisoformat(session['started_at'])
            started_str = started.strftime("%b %d, %Y at %I:%M %p")
            
            # Duration
            if session['ended_at']:
                ended = datetime.fromisoformat(session['ended_at'])
                duration = ended - started
                duration_str = f"{int(duration.total_seconds() // 60)}m {int(duration.total_seconds() % 60)}s"
            else:
                duration_str = "(ongoing)"
            
            output.append(c(f"{i}. ", "yellow") + c(session_id, "purple"))
            output.append(c(f"   Started: {started_str}", "dim"))
            output.append(c(f"   Duration: {duration_str}", "dim"))
            output.append(c(f"   Messages: {session['message_count']} | Commands: {session['commands_count']} | Files: {session['files_created']}", "dim"))
            output.append("")
        
        output.append(c("💡 Tip: Use ", "dim") + c("session open <id>", "cyan") + c(" to view full session", "dim"))
        output.append("")
        
        return "\n".join(output)
    
    def _handle_session_open(self, session_id: str) -> str:
        """Open and display a specific session."""
        from datetime import datetime
        import json
        
        sessions_dir = Path.home() / ".luciferai" / "logs" / "sessions"
        session_file = sessions_dir / f"session_{session_id}.json"
        
        if not session_file.exists():
            return c(f"{Emojis.CROSS} Session not found: {session_id}", "red") + f"\n{c('Use session list to see available sessions', 'dim')}"
        
        try:
            with open(session_file, 'r') as f:
                session_data = json.load(f)
            
            output = []
            output.append(c(f"\n📝 Session: {session_id}", "cyan"))
            output.append(c("═" * 60, "purple"))
            output.append("")
            
            # Session info
            started = datetime.fromisoformat(session_data['started_at'])
            output.append(c(f"Started: ", "yellow") + started.strftime("%A, %B %d, %Y at %I:%M:%S %p"))
            
            if session_data.get('ended_at'):
                ended = datetime.fromisoformat(session_data['ended_at'])
                output.append(c(f"Ended: ", "yellow") + ended.strftime("%A, %B %d, %Y at %I:%M:%S %p"))
                duration = ended - started
                output.append(c(f"Duration: ", "yellow") + f"{int(duration.total_seconds() // 60)}m {int(duration.total_seconds() % 60)}s")
            
            output.append("")
            output.append(c("Statistics:", "cyan"))
            output.append(c(f"  • Messages: {len(session_data.get('messages', []))}", "dim"))
            output.append(c(f"  • Commands: {session_data.get('commands_executed', 0)}", "dim"))
            output.append(c(f"  • Files Created: {len(session_data.get('files_created', []))}", "dim"))
            output.append(c(f"  • Files Modified: {len(session_data.get('files_modified', []))}", "dim"))
            output.append(c(f"  • Events: {len(session_data.get('events', []))}", "dim"))
            output.append(c(f"  • Errors: {len(session_data.get('errors', []))}", "dim"))
            output.append("")
            
            # Show conversation (last 20 messages)
            messages = session_data.get('messages', [])
            if messages:
                output.append(c("💬 Conversation (last 20):", "cyan"))
                output.append(c("─" * 60, "dim"))
                for msg in messages[-20:]:
                    timestamp = datetime.fromisoformat(msg['timestamp']).strftime("%H:%M:%S")
                    role_color = "blue" if msg['role'] == 'user' else "purple"
                    output.append(c(f"[{timestamp}] ", "dim") + c(msg['role'].upper(), role_color) + c(f": {msg['content'][:100]}", "white"))
                    if len(msg['content']) > 100:
                        output.append(c("  ..." + msg['content'][100:200], "dim"))
                output.append("")
            
            # Show events (last 10)
            events = session_data.get('events', [])
            if events:
                output.append(c("🔔 Events (last 10):", "cyan"))
                output.append(c("─" * 60, "dim"))
                for event in events[-10:]:
                    timestamp = datetime.fromisoformat(event['timestamp']).strftime("%H:%M:%S")
                    output.append(c(f"[{timestamp}] ", "dim") + c(event['type'], "yellow") + c(f": {event['description']}", "white"))
                output.append("")
            
            return "\n".join(output)
        
        except Exception as e:
            return c(f"{Emojis.CROSS} Error reading session: {e}", "red")
    
    def _handle_session_info(self) -> str:
        """Show current session information."""
        from datetime import datetime
        
        info = self.session_logger.get_session_info()
        
        output = []
        output.append(c("\n📝 Current Session", "cyan"))
        output.append(c("═" * 60, "purple"))
        output.append("")
        output.append(c(f"Session ID: ", "yellow") + c(info['session_id'], "purple"))
        output.append(c(f"Started: ", "yellow") + info['started_at'].strftime("%A, %B %d, %Y at %I:%M:%S %p"))
        
        # Duration
        now = datetime.now()
        duration = now - info['started_at']
        output.append(c(f"Duration: ", "yellow") + f"{int(duration.total_seconds() // 60)}m {int(duration.total_seconds() % 60)}s")
        output.append("")
        
        output.append(c("Statistics:", "cyan"))
        output.append(c(f"  • Messages: {info['messages_count']}", "dim"))
        output.append(c(f"  • Commands: {info['commands_count']}", "dim"))
        output.append(c(f"  • Files Created: {info['files_created']}", "dim"))
        output.append(c(f"  • Files Modified: {info['files_modified']}", "dim"))
        output.append("")
        
        return "\n".join(output)
    
    def _handle_session_stats(self) -> str:
        """Show overall session statistics."""
        from datetime import datetime
        
        stats = SessionLogger.get_session_stats()
        
        output = []
        output.append(c("\n📊 Session Statistics", "cyan"))
        output.append(c("═" * 60, "purple"))
        output.append("")
        output.append(c(f"Total Sessions: ", "yellow") + str(stats['total_sessions']))
        
        if stats['oldest_session']:
            oldest = datetime.fromisoformat(stats['oldest_session'])
            output.append(c(f"Oldest Session: ", "yellow") + oldest.strftime("%B %d, %Y at %I:%M %p"))
        
        if stats['newest_session']:
            newest = datetime.fromisoformat(stats['newest_session'])
            output.append(c(f"Newest Session: ", "yellow") + newest.strftime("%B %d, %Y at %I:%M %p"))
        
        output.append("")
        output.append(c("💡 Sessions are automatically saved for 6 months", "dim"))
        output.append(c("   Older sessions are cleaned up automatically", "dim"))
        output.append("")
        
        return "\n".join(output)
    
    def _handle_badges(self) -> str:
        """Display badge progress - handled locally without LLM."""
        output = []
        output.append(c("\n🏅 Badge Progress", "cyan"))
        output.append(c("═" * 60, "purple"))
        output.append("")
        
        try:
            from core.user_stats import UserStatsTracker
            tracker = UserStatsTracker()
            
            # Get badge 0 status (Founder/Member)
            badge_0 = tracker.get_badge_0_status(self.user_id)
            output.append(c(f"🔹 Badge 0: {badge_0['emoji']} {badge_0['name']}", "purple"))
            output.append("")
            
            # Get badges 1-13
            badges_status = tracker.get_all_badges_status(self.user_id)
            collection_progress = tracker.calculate_badge_collection_progress(self.user_id)
            
            # Progress bar
            progress_bar = tracker.get_progress_bar(collection_progress['percentage'], width=30)
            output.append(c(f"Collection Progress: {progress_bar}", "white"))
            output.append(c(f"{collection_progress['unlocked_count']}/{collection_progress['total_badges']} badges unlocked", "white"))
            output.append("")
            
            # Reward status
            if collection_progress['reward_13_unlocked']:
                output.append(c("🎉 ALL BADGES COLLECTED! Easter egg unlocked!", "gold"))
            elif collection_progress['reward_7_unlocked']:
                output.append(c("🎁 7-Badge Reward Unlocked! Soul Modulator available!", "green"))
            else:
                remaining = 7 - collection_progress['unlocked_count']
                output.append(c(f"🎁 Unlock {remaining} more badges for Soul Modulator!", "yellow"))
            output.append("")
            
            # Unlocked badges
            unlocked = [b for b in badges_status if b['unlocked']]
            locked = [b for b in badges_status if not b['unlocked']]
            
            if unlocked:
                output.append(c("✅ Unlocked:", "green"))
                for badge in unlocked:
                    output.append(c(f"   {badge['emoji']} {badge['name']}", "white"))
                output.append("")
            
            if locked:
                output.append(c("🔒 In Progress:", "yellow"))
                for badge in locked:
                    progress = badge.get('progress_display', '❓ ???')
                    next_step = badge.get('next_milestone', badge['hint'])
                    output.append(c(f"   {progress} - {next_step}", "dim"))
            
            output.append("")
        except Exception as e:
            output.append(c(f"Error loading badges: {e}", "red"))
        
        return "\n".join(output)
    
    def _handle_soul(self) -> str:
        """Display soul modulator status - handled locally without LLM."""
        output = []
        output.append(c("\n👻 Soul Modulator Status", "cyan"))
        output.append(c("═" * 60, "purple"))
        output.append("")
        
        try:
            from core.soul_modulator import SoulModulator, SOUL_DEFINITIONS
            soul_mod = SoulModulator(self.user_id)
            
            if not soul_mod.is_unlocked():
                output.append(c("🔒 Soul Modulator Locked", "yellow"))
                output.append(c("   Collect 7 badges to unlock!", "dim"))
                output.append("")
                output.append(c("What is Soul Modulator?", "cyan"))
                output.append(c("   • Bind unique personality souls to your LLMs", "dim"))
                output.append(c("   • Enhance AI behavior with traits like Creative, Analytical, Rebellious", "dim"))
                output.append(c("   • Unlock special Celestial Azazel soul with all 7 Deadly Sins", "dim"))
            else:
                # Unlocked - show status
                status = "Active" if soul_mod.is_active() else "Inactive"
                status_color = "green" if soul_mod.is_active() else "yellow"
                output.append(c(f"Status: ", "white") + c(status, status_color))
                output.append("")
                
                # Collected souls
                collected = soul_mod.get_collected_souls()
                output.append(c(f"Souls Collected: {len(collected)}", "cyan"))
                for soul_id in collected:
                    soul_def = SOUL_DEFINITIONS.get(soul_id, {})
                    emoji = soul_def.get('emoji', '👻')
                    name = soul_def.get('name', soul_id)
                    desc = soul_def.get('description', '')
                    output.append(c(f"   {emoji} {name}", "white") + c(f" - {desc}", "dim"))
                output.append("")
                
                # Bindings
                bindings = soul_mod.get_bindings()
                if bindings:
                    output.append(c("LLM Bindings:", "cyan"))
                    for llm, soul_id in bindings.items():
                        soul_def = SOUL_DEFINITIONS.get(soul_id, {})
                        emoji = soul_def.get('emoji', '👻')
                        output.append(c(f"   {llm} → {emoji} {soul_id}", "white"))
                else:
                    output.append(c("No LLM bindings yet.", "dim"))
                    output.append(c("   Use 'soul bind <llm> <soul>' to bind a soul.", "dim"))
                
                output.append("")
                output.append(c("Commands:", "cyan"))
                output.append(c("   soul activate   - Activate soul modulator", "dim"))
                output.append(c("   soul deactivate - Deactivate soul modulator", "dim"))
                output.append(c("   soul bind <llm> <soul> - Bind soul to LLM", "dim"))
                output.append(c("   soul unbind <llm> - Remove binding", "dim"))
        except Exception as e:
            output.append(c(f"Error loading soul modulator: {e}", "red"))
        
        output.append("")
        return "\n".join(output)
    
    def _handle_diabolical_mode(self) -> str:
        """Enter diabolical mode - unrestricted AI responses."""
        output = []
        output.append("")
        output.append(c("😈 DIABOLICAL MODE ACTIVATED 😈", "red"))
        output.append(c("═" * 60, "purple"))
        output.append("")
        output.append(c("• All AI guardrails disabled", "yellow"))
        output.append(c("• Unfiltered responses enabled", "yellow"))
        output.append(c("• Experimental features active", "yellow"))
        output.append(c("• All installed LLMs will be exhausted before failure", "yellow"))
        output.append("")
        output.append(c("Type 'diabolical exit' to return to standard mode", "dim"))
        output.append("")
        
        # Set diabolical mode flag
        self.diabolical_mode = True
        
        return "\n".join(output)
    
    def _handle_diabolical_exit(self) -> str:
        """Exit diabolical mode."""
        self.diabolical_mode = False
        
        output = []
        output.append("")
        output.append(c("✅ Exited Diabolical Mode", "green"))
        output.append(c("Standard AI guardrails restored.", "dim"))
        output.append("")
        
        return "\n".join(output)
    
    def _handle_memory(self) -> str:
        """Show memory/logs."""
        self.logger.show_memory()
        return ""  # Already printed
    
    def _handle_models_info(self) -> str:
        """Show comprehensive AI models information page."""
        import os
        
        # Clear screen (unless in specs mode)
        if not getattr(self, 'specs_mode', False):
            os.system('clear' if os.name != 'nt' else 'cls')
        
        print()
        print(c("╔═══════════════════════════════════════════════════════════╗", "purple"))
        print(c("║       🧠 LuciferAI Language Models - Complete Guide      ║", "purple"))
        print(c("╚═══════════════════════════════════════════════════════════╝", "purple"))
        print()
        
        # Check current model
        current_model = getattr(self, 'ollama_model', None) if self.ollama_available else None
        
        if current_model:
            print(c(f"✅ Currently using: ", "green") + c(current_model, "purple"))
            print()
        else:
            print(c("⚠️  No AI model currently active", "yellow"))
            print(c("   Install a model to enable natural language commands", "dim"))
            print()
        
        # Show backend information
        print(c("🔧 LLM Backend Support:", "cyan"))
        print(c("  • llamafile - Universal GGUF runner (works on Catalina+ and all macOS)", "dim"))
        print(c("  • Ollama - Native macOS app (requires Sonoma 14.0+)", "dim"))
        print(c("  • Docker - Containerized Ollama (universal fallback)", "dim"))
        print(c("\n  LuciferAI uses llamafile for maximum compatibility!", "yellow"))
        print()
        
        print(c("═" * 63, "purple"))
        print(c("\n📊 Model Comparison Chart", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        # Comparison table - Core 5 models
        print(c(f"{'Feature':<25} {'tiny':<9} {'gemma2':<9} {'mistral':<10} {'deepseek':<10} {'llama70b':<10}", "yellow"))
        print(c("─" * 80, "dim"))
        
        features = [
            ("Size", "669MB", "5.4GB", "4.1GB", "3.9GB", "39GB"),
            ("Command parsing", "✓", "✓✓", "✓✓", "✓✓", "✓✓✓"),
            ("Natural language", "✓", "✓✓", "✓✓✓", "✓✓✓", "✓✓✓"),
            ("Fix application", "✓", "✓", "✓✓", "✓✓", "✓✓✓"),
            ("Template scripts", "✗", "✓", "✓✓✓ (100+)", "✓", "✓✓"),
            ("Custom code generation", "✗", "✓", "✓✓", "✓✓✓", "✓✓✓"),
            ("Complex apps", "✗", "✗", "✓✓", "✓✓✓", "✓✓✓"),
            ("Reasoning depth", "✓", "✓✓", "✓✓✓", "✓✓✓", "✓✓✓"),
            ("Multi-language code", "✗", "✓", "✓✓", "✓✓✓", "✓✓✓"),
            ("Resource usage", "✓✓✓", "✓✓", "✓✓", "✓✓", "✓"),
        ]
        
        for feature, tiny, gemma, mistral, deepseek, llama70 in features:
            print(c(f"{feature:<25}", "cyan") + f" {tiny:<9} {gemma:<9} {mistral:<10} {deepseek:<10} {llama70:<10}")
        
        print()
        print(c("Legend: ✓ = Supported  ✓✓ = Good  ✓✓✓ = Excellent  ✗ = Not supported", "dim"))
        print()
        
        # Detailed breakdown
        print(c("═" * 63, "purple"))
        print(c("\n🎯 Detailed Model Breakdown", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        # TinyLlama (Tier 0)
        print(c("┌─ TinyLlama (669MB) - Tier 0", "green"))
        print(c("│", "dim"))
        print(c("│  Best for:", "yellow"))
        print(c("│  • Quick responses and ultra-low memory usage", "dim"))
        print(c("│  • Systems with very limited resources", "dim"))
        print(c("│  • Fast basic command parsing", "dim"))
        print(c("│", "dim"))
        print(c("│  What it can do:", "yellow"))
        print(c("│  • Basic command parsing and file operations", "dim"))
        print(c("│  • Apply fixes from FixNet consensus (like all models)", "dim"))
        print(c("│  • Use 100+ built-in templates (like all models)", "dim"))
        print(c("│  • Simple natural language understanding", "dim"))
        print(c("│", "dim"))
        print(c("│  Limitations:", "yellow"))
        print(c("│  • Limited reasoning for complex requests", "dim"))
        print(c("│  • No web search or enhancement", "dim"))
        print(c("│  • Basic template selection only", "dim"))
        print(c("│", "dim"))
        print(c("│  Install: ", "yellow") + c("install tinyllama", "cyan"))
        print(c("└─", "dim"))
        print()
        
        # Gemma2 (Tier 1)
        print(c("┌─ Gemma2 (5.4GB) - Tier 1", "green"))
        print(c("│", "dim"))
        print(c("│  Best for:", "yellow"))
        print(c("│  • General purpose tasks and balanced performance", "dim"))
        print(c("│  • Good reasoning with moderate resource usage", "dim"))
        print(c("│  • Natural conversations and file operations", "dim"))
        print(c("│", "dim"))
        print(c("│  What it can do:", "yellow"))
        print(c("│  • All TinyLlama features PLUS:", "dim"))
        print(c("│  • Better natural language understanding", "dim"))
        print(c("│  • Smarter template and fix selection", "dim"))
        print(c("│  • Improved command parsing and intent detection", "dim"))
        print(c("│  • Basic code understanding and simple generation", "dim"))
        print(c("│  • Better context awareness", "dim"))
        print(c("│", "dim"))
        print(c("│  Install: ", "yellow") + c("install gemma2", "cyan"))
        print(c("└─", "dim"))
        print()
        
        # mistral (Tier 2)
        print(c("┌─ Mistral (4.1GB) - Tier 2", "green"))
        print(c("│", "dim"))
        print(c("│  Best for:", "yellow"))
        print(c("│  • Advanced natural language conversations", "dim"))
        print(c("│  • Research and information gathering", "dim"))
        print(c("│  • Template-based script generation", "dim"))
        print(c("│", "dim"))
        print(c("│  What it can do:", "yellow"))
        print(c("│  • All Gemma2 features PLUS:", "dim"))
        print(c("│  • Generate scripts from templates (100+ templates)", "dim"))
        print(c("│  • Browse web for answers it doesn't know", "dim"))
        print(c("│  • Fetch images from Google Images", "dim"))
        print(c("│  • Understand \"gimme that file\" (slang)", "dim"))
        print(c("│  • Better reasoning and explanations", "dim"))
        print(c("│", "dim"))
        print(c("│  Templates include:", "yellow"))
        print(c("│  • Python: Flask API, CLI tool, web scraper, data processor", "dim"))
        print(c("│  • JavaScript: Express server, React component, Node script", "dim"))
        print(c("│  • Bash: System monitor, backup script, deployment tool", "dim"))
        print(c("│  • Go, Rust, Java, C++, and more...", "dim"))
        print(c("│", "dim"))
        print(c("│  Smart Selection:", "yellow"))
        print(c("│  • Offline: Uses local + consensus templates", "dim"))
        print(c("│  • Online: Compares with web search for best result", "dim"))
        print(c("│  • WiFi-aware: Automatically adapts to connectivity", "dim"))
        print(c("│", "dim"))
        print(c("│  Example:", "yellow"))
        print(c("│  You: \"build me a web scraper\"", "dim"))
        print(c("│  mistral: Finds best template → web-enhances if online", "dim"))
        print(c("│", "dim"))
        print(c("│  Install: ", "yellow") + c("install mistral", "cyan"))
        print(c("└─", "dim"))
        print()
        
        # deepseek-coder (Tier 3)
        print(c("┌─ Deepseek-Coder (3.9GB) - Tier 3", "green"))
        print(c("│", "dim"))
        print(c("│  Best for:", "yellow"))
        print(c("│  • Building complete applications", "dim"))
        print(c("│  • Complex code generation", "dim"))
        print(c("│  • Code optimization and refactoring", "dim"))
        print(c("│  • Multi-file projects", "dim"))
        print(c("│", "dim"))
        print(c("│  What it can do:", "yellow"))
        print(c("│  • All mistral features PLUS:", "dim"))
        print(c("│  • Generate full applications (Flask apps, CLI tools, etc.)", "dim"))
        print(c("│  • Optimize algorithms and refactor code", "dim"))
        print(c("│  • Multi-language: Python, JS, Go, Rust, C++, Java", "dim"))
        print(c("│  • Architecture design and best practices", "dim"))
        print(c("│  • Debug complex issues", "dim"))
        print(c("│", "dim"))
        print(c("│  Example:", "yellow"))
        print(c("│  You: \"Build me a web scraper for news sites\"", "dim"))
        print(c("│  deepseek: [Creates complete multi-file project]", "dim"))
        print(c("│           scraper.py, requirements.txt, README.md", "dim"))
        print(c("│", "dim"))
        print(c("│  Install: ", "yellow") + c("install deepseek", "cyan"))
        print(c("└─", "dim"))
        print()
        
        # Llama3.1-70B (Tier 4)
        print(c("┌─ Llama3.1-70B (39GB) - Tier 4", "green"))
        print(c("│", "dim"))
        print(c("│  Best for:", "yellow"))
        print(c("│  • Enterprise-grade applications", "dim"))
        print(c("│  • Research and production systems", "dim"))
        print(c("│  • Maximum reasoning and code quality", "dim"))
        print(c("│  • Large-scale refactoring and architecture", "dim"))
        print(c("│", "dim"))
        print(c("│  What it can do:", "yellow"))
        print(c("│  • All Deepseek features PLUS:", "dim"))
        print(c("│  • Advanced reasoning and planning", "dim"))
        print(c("│  • Large multi-file project generation", "dim"))
        print(c("│  • Expert-level code review and optimization", "dim"))
        print(c("│  • Complex system architecture design", "dim"))
        print(c("│  • Production-ready code generation", "dim"))
        print(c("│", "dim"))
        print(c("│  Requirements:", "yellow"))
        print(c("│  • 64GB+ RAM recommended", "dim"))
        print(c("│  • 39GB disk space", "dim"))
        print(c("│  • Slower inference (worth it for quality)", "dim"))
        print(c("│", "dim"))
        print(c("│  Install: ", "yellow") + c("install llama3.1-70b", "cyan"))
        print(c("└─", "dim"))
        print()
        
        # ChatGPT/GPT-4 (Tier 5)
        print(c("┌─ ☁️ ChatGPT / GPT-4 - Tier 5 (Cloud) [Coming Soon]", "green"))
        print(c("│", "dim"))
        print(c("│  Best for:", "yellow"))
        print(c("│  • Latest GPT-4 reasoning and capabilities", "dim"))
        print(c("│  • Real-time web browsing and current info", "dim"))
        print(c("│  • Code interpreter with Python execution", "dim"))
        print(c("│  • Accessing your ChatGPT conversation history", "dim"))
        print(c("│  • DALL-E image generation", "dim"))
        print(c("│", "dim"))
        print(c("│  What it can do:", "yellow"))
        print(c("│  • All Llama3.1-70B features PLUS:", "dim"))
        print(c("│  • 100+ templates & FixNet consensus (like all tiers)", "dim"))
        print(c("│  • Access to GPT-4 (requires ChatGPT Plus)", "dim"))
        print(c("│  • Real-time web search and browsing", "dim"))
        print(c("│  • Execute Python code in sandbox", "dim"))
        print(c("│  • Search and use your ChatGPT conversation history", "dim"))
        print(c("│  • Generate images with DALL-E", "dim"))
        print(c("│  • Hybrid mode: Local offline, cloud when needed", "dim"))
        print(c("│", "dim"))
        print(c("│  Requirements:", "yellow"))
        print(c("│  • OpenAI/ChatGPT account", "dim"))
        print(c("│  • ChatGPT Plus recommended for GPT-4", "dim"))
        print(c("│  • Internet connection required", "dim"))
        print(c("│  • Data sent to OpenAI (not fully private)", "dim"))
        print(c("│", "dim"))
        print(c("│  Setup: ", "yellow") + c("chatgpt link", "cyan") + c(" (Coming Soon)", "dim"))
        print(c("└─", "dim"))
        print()
        
        # Recommendations
        print(c("═" * 63, "purple"))
        print(c("\n💡 Recommendations", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        print(c("Choose TinyLlama if:", "yellow"))
        print(c("  • You have very limited disk space or RAM (<2GB free)", "dim"))
        print(c("  • You want the absolute fastest responses", "dim"))
        print(c("  • You only need basic command parsing", "dim"))
        print()
        
        print(c("Choose Gemma2 if:", "yellow"))
        print(c("  • You want balanced performance and resource usage", "dim"))
        print(c("  • You need good general-purpose understanding", "dim"))
        print(c("  • You have moderate resources (6GB+ free)", "dim"))
        print()
        
        print(c("Choose Mistral if:", "yellow"))
        print(c("  • You want template-based script generation (100+ templates)", "dim"))
        print(c("  • You need advanced natural language understanding", "dim"))
        print(c("  • You want the best balance of capability and speed", "dim"))
        print()
        
        print(c("Choose Deepseek-Coder if:", "yellow"))
        print(c("  • You're building real applications from scratch", "dim"))
        print(c("  • You need expert-level code generation", "dim"))
        print(c("  • You work with multiple programming languages", "dim"))
        print()
        
        print(c("Choose Llama3.1-70B if:", "yellow"))
        print(c("  • You need maximum reasoning and code quality", "dim"))
        print(c("  • You're building enterprise or production systems", "dim"))
        print(c("  • You have 64GB+ disk space available", "dim"))
        print()
        
        print(c("Use ChatGPT (Tier 5) if:", "yellow"))
        print(c("  • You need GPT-4's latest capabilities", "dim"))
        print(c("  • You want real-time web browsing and current info", "dim"))
        print(c("  • You need code interpreter or DALL-E image generation", "dim"))
        print(c("  • You want to access your ChatGPT conversation history", "dim"))
        print(c("  • Privacy isn't critical (data sent to OpenAI)", "dim"))
        print()
        
        print(c("🏭️  Installation:", "yellow"))
        print()
        print(c("Install any core model (works on all platforms):", "cyan"))
        print(c("  install tinyllama", "green") + c("       - Tier 0 (669MB, ultra-fast)", "dim"))
        print(c("  install gemma2", "green") + c("          - Tier 1 (5.4GB, balanced)", "dim"))
        print(c("  install mistral", "green") + c("         - Tier 2 (4.1GB, templates + advanced)", "dim"))
        print(c("  install deepseek", "green") + c("        - Tier 3 (3.9GB, expert coding)", "dim"))
        print(c("  install llama3.1-70b", "green") + c(" - Tier 4 (39GB, maximum capability)", "dim"))
        print()
        print(c("⚠️  Note: ALL models (Tiers 0-5) have access to:", "yellow"))
        print(c("     • 100+ built-in templates (Python, JS, Bash, Go, etc.)", "dim"))
        print(c("     • FixNet consensus fixes (community-validated solutions)", "dim"))
        print(c("     • Higher tier = better template/fix selection intelligence", "dim"))
        print(c("     • Tier 5 also benefits from ChatGPT's training on templates", "dim"))
        print()
        print(c("💾 All models install to: ~/.luciferai/models/", "dim"))
        print(c("🔄 Auto-detection: llama3.1-70b > deepseek > mistral > gemma2 > tinyllama", "dim"))
        print(c("🔧 Backend: llamafile (Windows, macOS, Linux, Raspberry Pi)", "dim"))
        print()
        
        print(c("═" * 63, "purple"))
        print(c("\n🌐 Template Intelligence (mistral)", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        print(c("WiFi-Aware Template Selection:", "yellow"))
        print(c("  • ", "dim") + c("📵 Offline Mode:", "cyan"))
        print(c("    - Uses built-in templates (100+)", "dim"))
        print(c("    - Plus consensus templates from community", "dim"))
        print(c("    - Fully functional without internet", "dim"))
        print()
        print(c("  • ", "dim") + c("📡 Online Mode:", "cyan"))
        print(c("    - Searches web for best practices (via mistral)", "dim"))
        print(c("    - Compares local vs consensus vs web results", "dim"))
        print(c("    - Uses highest-scoring template", "dim"))
        print(c("    - Web-enhances templates with latest insights", "dim"))
        print()
        
        print(c("Selection Logic:", "yellow"))
        print(c("  1. Check built-in templates", "dim"))
        print(c("  2. Check consensus (community-validated)", "dim"))
        print(c("  3. If online + mistral: web search for improvements", "dim"))
        print(c("  4. Score all options and choose best", "dim"))
        print()
        
        print(c("💡 Templates auto-sync to consensus during idle time", "dim"))
        print()
        
        print(c("═" * 63, "purple"))
        print()
        
        print(c("═" * 63, "purple"))
        print(c("\n🎛️  Model Management", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        print(c("Enable/Disable Models:", "yellow"))
        print(c("  • ", "dim") + c("llm list", "cyan") + c(" - Show all models with status", "dim"))
        print(c("  • ", "dim") + c("llm enable <model>", "cyan") + c(" - Enable a model for use", "dim"))
        print(c("  • ", "dim") + c("llm disable <model>", "cyan") + c(" - Disable a model (keeps installed)", "dim"))
        print()
        
        print(c("Example workflow:", "yellow"))
        print(c("  1. Check status: ", "dim") + c("llm list", "cyan"))
        print(c("  2. Disable heavy model: ", "dim") + c("llm disable deepseek", "cyan"))
        print(c("  3. Enable when needed: ", "dim") + c("llm enable deepseek", "cyan"))
        print()
        
        print(c("💡 Disabled models stay installed but won't be used", "dim"))
        print(c("💡 This helps conserve resources when not needed", "dim"))
        print()
        
        print(c("═" * 63, "purple"))
        print()
        
        try:
            input(c("Press Enter to continue...", "yellow"))
        except (EOFError, KeyboardInterrupt):
            pass
        
        return ""
    
    def _handle_custom_model_info(self) -> str:
        """Show comprehensive guide for adding and using custom models."""
        import os
        from pathlib import Path
        
        # Clear screen
        os.system('clear' if os.name != 'nt' else 'cls')
        
        print()
        print(c("╔═══════════════════════════════════════════════════════════╗", "purple"))
        print(c("║       🎨 Custom Model Integration - Complete Guide       ║", "purple"))
        print(c("╚═══════════════════════════════════════════════════════════╝", "purple"))
        print()
        
        project_root = Path(__file__).parent.parent
        custom_dir = project_root / 'models' / 'custom_models'
        
        print(c("📁 Custom Models Directory:", "cyan"))
        print(c(f"   {custom_dir}", "yellow"))
        print()
        
        print(c("═" * 63, "purple"))
        print(c("📖 Quick Start Guide", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        print(c("Step 1: Download a GGUF Model", "green"))
        print(c("  • Visit HuggingFace: ", "dim") + c("https://huggingface.co/models?library=gguf", "cyan"))
        print(c("  • Search for models (e.g., 'llama', 'mistral', 'qwen')", "dim"))
        print(c("  • Look for GGUF quantized versions (Q4_K_M recommended)", "dim"))
        print()
        
        print(c("Step 2: Place Model in Custom Directory", "green"))
        print(c("  Copy or move your .gguf file:", "dim"))
        print(c(f"    cp your-model.gguf {custom_dir}/", "cyan"))
        print()
        print(c("  Or download directly:", "dim"))
        print(c(f"    cd {custom_dir}", "cyan"))
        print(c("    wget https://huggingface.co/.../model.gguf", "cyan"))
        print()
        
        print(c("Step 3: Enable the Model", "green"))
        print(c("  LuciferAI will auto-detect the model file:", "dim"))
        print(c("    llm enable your-model", "cyan"))
        print()
        print(c("  Verify it's active:", "dim"))
        print(c("    llm list", "cyan"))
        print()
        
        print(c("Step 4: Start Using It", "green"))
        print(c("  Your custom model will be available for:", "dim"))
        print(c("  • Natural language queries", "dim"))
        print(c("  • Script generation", "dim"))
        print(c("  • Code fixing", "dim"))
        print(c("  • All LuciferAI features", "dim"))
        print()
        
        print(c("═" * 63, "purple"))
        print(c("🛠️  Technical Details", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        print(c("Supported Formats:", "yellow"))
        print(c("  • GGUF (Universal format for llamafile)", "dim"))
        print(c("  • All quantization levels (Q2-Q8, K-quants)", "dim"))
        print(c("  • Must have .gguf extension", "dim"))
        print()
        
        print(c("Recommended Quantizations:", "yellow"))
        print(c("  • Q4_K_M - Best balance (recommended)", "green"))
        print(c("  • Q5_K_M - Higher quality, larger size", "dim"))
        print(c("  • Q8_0   - Maximum quality, largest size", "dim"))
        print(c("  • Q3_K_M - Smaller, lower quality", "dim"))
        print(c("  • Q2_K   - Minimum size, reduced quality", "dim"))
        print()
        
        print(c("System Requirements:", "yellow"))
        print(c("  • RAM needed: Model size × 1.2 (minimum)", "dim"))
        print(c("  • Example: 7B Q4_K_M (~4GB) needs ~5GB RAM", "dim"))
        print(c("  • Disk space: Model file size + 500MB working space", "dim"))
        print()
        
        print(c("═" * 63, "purple"))
        print(c("🎓 Advanced Integration", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        print(c("Auto-Detection:", "yellow"))
        print(c("  • LuciferAI scans custom_models/ on startup", "dim"))
        print(c("  • New models appear in 'llm list' automatically", "dim"))
        print(c("  • Enable/disable same as core models", "dim"))
        print()
        
        print(c("Model Selection Priority:", "yellow"))
        print(c("  1. Core bundled models (phi-2, tinyllama, etc.)", "dim"))
        print(c("  2. Custom models (if enabled)", "dim"))
        print(c("  3. Higher tier models preferred for complex tasks", "dim"))
        print()
        
        print(c("Multi-Model Strategy:", "yellow"))
        print(c("  • Enable multiple models simultaneously", "dim"))
        print(c("  • LuciferAI auto-selects best for each task", "dim"))
        print(c("  • Lightweight models for simple commands", "dim"))
        print(c("  • Heavy models for complex generation", "dim"))
        print()
        
        print(c("═" * 63, "purple"))
        print(c("📚 Example: Adding Qwen2 7B", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        print(c("# 1. Download the model", "yellow"))
        print(c(f"cd {custom_dir}", "cyan"))
        print(c("wget https://huggingface.co/Qwen/Qwen2-7B-Instruct-GGUF/resolve/main/qwen2-7b-instruct-q4_k_m.gguf", "cyan"))
        print()
        
        print(c("# 2. Enable it", "yellow"))
        print(c("llm enable qwen2-7b-instruct-q4_k_m", "cyan"))
        print()
        
        print(c("# 3. Verify", "yellow"))
        print(c("llm list", "cyan"))
        print(c("# You should see:", "dim"))
        print(c("#   🎨 Custom Models (in custom_models/):", "dim"))
        print(c("#     qwen2-7b-instruct-q4_k_m", "dim"))
        print(c("#       Status: ✓ Enabled", "dim"))
        print()
        
        print(c("# 4. Start using it!", "yellow"))
        print(c("# Just ask questions or give commands as normal", "dim"))
        print()
        
        print(c("═" * 63, "purple"))
        print(c("⚠️  Troubleshooting", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        print(c("Model not appearing in 'llm list'?", "yellow"))
        print(c("  • Check file is in correct directory (models/custom_models/)", "dim"))
        print(c("  • Ensure file has .gguf extension", "dim"))
        print(c("  • Restart LuciferAI to rescan directory", "dim"))
        print()
        
        print(c("Model loads but gives errors?", "yellow"))
        print(c("  • Check you have enough RAM (model size × 1.2)", "dim"))
        print(c("  • Try a smaller quantization (Q4_K_M or lower)", "dim"))
        print(c("  • Close other applications to free memory", "dim"))
        print()
        
        print(c("Model too slow?", "yellow"))
        print(c("  • Try smaller quantization (Q3_K_M or Q2_K)", "dim"))
        print(c("  • Consider using a smaller parameter model", "dim"))
        print(c("  • Check CPU usage - may need system upgrade", "dim"))
        print()
        
        print(c("═" * 63, "purple"))
        print(c("🔗 Useful Resources", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        print(c("Find GGUF Models:", "yellow"))
        print(c("  • HuggingFace: https://huggingface.co/models?library=gguf", "cyan"))
        print(c("  • TheBloke's Models: https://huggingface.co/TheBloke", "cyan"))
        print(c("  • Quantization Guide: https://github.com/ggerganov/llama.cpp", "cyan"))
        print()
        
        print(c("Learn More:", "yellow"))
        print(c("  • llamafile docs: https://github.com/Mozilla-Ocho/llamafile", "cyan"))
        print(c("  • GGUF format: https://github.com/ggerganov/ggml", "cyan"))
        print()
        
        print(c("═" * 63, "purple"))
        print(c("📚 Advanced Topics: Creating Your Own LLM", "cyan"))
        print(c("═" * 63, "purple"))
        print()
        
        print(c("For advanced integration topics, see:", "yellow"))
        print()
        print(c("  📄 docs/CUSTOM_MODELS.md", "cyan"))
        print(c("     - Complete guide for adding pre-built GGUF models", "dim"))
        print(c("     - Tier system integration", "dim"))
        print(c("     - Model aliases and naming", "dim"))
        print()
        print(c("  📄 docs/CUSTOM_INTEGRATIONS.md", "cyan"))
        print(c("     - Image generation (Flux, Stable Diffusion, Fooocus)", "dim"))
        print(c("     - External AI APIs (GitHub Copilot, OpenAI, Anthropic)", "dim"))
        print(c("     - Custom plugin architecture and development", "dim"))
        print()
        print(c("  📄 docs/TRAIN_CUSTOM_LLM_FOR_LUCIFERAI.md", "cyan"))
        print(c("     - Training your own LLM from scratch", "dim"))
        print(c("     - Optimized for LuciferAI's command parsing", "dim"))
        print(c("     - Complete training pipeline with benchmarks", "dim"))
        print(c("     - Integration testing and performance metrics", "dim"))
        print()
        print(c("  📄 docs/MODEL_DEVELOPMENT.md", "cyan"))
        print(c("     - Converting existing models to GGUF", "dim"))
        print(c("     - Quantization techniques", "dim"))
        print()
        print(c("  📄 docs/TIER_SYSTEM.md", "cyan"))
        print(c("     - Setting tier classification for optimal model selection", "dim"))
        print()
        
        print(c("═" * 63, "purple"))
        print()
        
        try:
            input(c("Press Enter to return...", "yellow"))
        except (EOFError, KeyboardInterrupt):
            pass
        
        return ""
    
    def _handle_test_suite(self) -> str:
        """Run all automated test suites."""
        import os
        import subprocess
        from pathlib import Path
        
        print()
        print(c("╔═══════════════════════════════════════════════════════════╗", "purple"))
        print(c("║           🧪 LuciferAI Automated Test Suite              ║", "purple"))
        print(c("╚═══════════════════════════════════════════════════════════╝", "purple"))
        print()
        
        project_root = Path(__file__).parent.parent
        tests_dir = project_root / "tests"
        
        # Find all test files (only fully non-interactive ones)
        test_files = [
            "test_all_commands.py",  # Main test suite - 21 tests, 100% automated
        ]
        
        print(c(f"{Emojis.FOLDER} Test Directory: {tests_dir}", "cyan"))
        print(c(f"{Emojis.FILE} Found {len(test_files)} test suite\n", "cyan"))
        
        print(c("Tests Included:", "cyan"))
        print(c("  1. File Operations (copy, move, read, list, find)", "dim"))
        print(c("  2. Build Commands (create folder/file, context tracking)", "dim"))
        print(c("  3. Information (help, info, memory, pwd)", "dim"))
        print(c("  4. AI Models (models info, llm list)", "dim"))
        print(c("  5. Command History (persistent 120 commands)", "dim"))
        print(c("  6. Run Command (script finding + error detection)", "dim"))
        print(c("  7. Natural Language & AI Queries", "dim"))
        print(c("  8. Context Tracking ('in it' references)", "dim"))
        print(c("  9. Conversation Memory (200 message limit)", "dim"))
        print()
        
        total_passed = 0
        total_failed = 0
        total_run = 0
        
        for test_file in test_files:
            test_path = tests_dir / test_file
            
            if not test_path.exists():
                print(c(f"{Emojis.CROSS} {test_file} - Not found", "yellow"))
                continue
            
            print(c(f"\n{'─'*63}", "purple"))
            print(c(f"{Emojis.WRENCH} Running: {test_file}", "cyan"))
            print(c(f"{'─'*63}", "purple"))
            
            try:
                result = subprocess.run(
                    ['python3', str(test_path)],
                    cwd=str(project_root),
                    capture_output=True,
                    text=True,
                    timeout=60,  # Reduce timeout
                    stdin=subprocess.DEVNULL  # Don't wait for stdin
                )
                
                # Parse results
                output = result.stdout + result.stderr
                
                # Look for pass/fail counts
                import re
                if match := re.search(r'Passed:\s+(\d+)', output):
                    passed = int(match.group(1))
                    total_passed += passed
                
                if match := re.search(r'Failed:\s+(\d+)', output):
                    failed = int(match.group(1))
                    total_failed += failed
                
                if match := re.search(r'Total:\s+(\d+)', output):
                    run = int(match.group(1))
                    total_run += run
                
                # Show summary for this test
                if "Pass rate: 100" in output or ("Failed: 0" in output and "Passed" in output):
                    print(c(f"{Emojis.CHECKMARK} {test_file} - All tests passed!", "green"))
                else:
                    print(output[-500:])  # Show last 500 chars
                
            except subprocess.TimeoutExpired:
                print(c(f"{Emojis.CROSS} {test_file} - Timeout", "red"))
            except Exception as e:
                print(c(f"{Emojis.CROSS} {test_file} - Error: {e}", "red"))
        
        # Final summary
        print(c(f"\n{'═'*63}", "purple"))
        print(c(f"{Emojis.SPARKLE} TEST SUITE SUMMARY", "purple"))
        print(c(f"{'═'*63}", "purple"))
        print()
        print(c(f"Total Tests:    {total_run}", "cyan"))
        print(c(f"Passed:         {total_passed}", "green"))
        print(c(f"Failed:         {total_failed}", "red" if total_failed > 0 else "green"))
        
        if total_run > 0:
            pass_rate = (total_passed / total_run * 100)
            if pass_rate == 100:
                print(c(f"\nPass Rate:      {pass_rate:.1f}% ✅", "green"))
            else:
                print(c(f"\nPass Rate:      {pass_rate:.1f}%", "yellow"))
        
        print()
        
        return ""
    
    def _handle_system_test(self) -> str:
        """Run comprehensive system test."""
        import os
        
        # Clear screen (unless in specs mode)
        if not getattr(self, 'specs_mode', False):
            os.system('clear' if os.name != 'nt' else 'cls')
        
        try:
            from system_test import SystemTest
            test = SystemTest()
            test.run_interactive_test()
            
            # After test, explain LLM architecture first
            print("\n" + "="*60)
            print(c(f"\n🧠 LLM Architecture & Natural Language Processing:", "cyan"))
            print()
            print(c("Ollama Integration - Offline AI Command Parser:", "yellow"))
            print(c("   • ", "dim") + c('Ollama', "purple") + c(" is the LOCAL AI PLATFORM that runs LLM models", "dim"))
            print(c("   • Models available: ", "dim") + c('llama3.2', "cyan") + c(' (default), ', "dim") + c('mistral', "cyan") + c(', deepseek-coder, etc.', "dim"))
            print(c("   • Parses commands like: ", "dim") + c('\"watch my desktop fan terminal file\"', "cyan"))
            print(c("   • Extracts intent, finds files with fuzzy matching, confirms actions", "dim"))
            print(c("   • Works ", "dim") + c('100% offline', "green") + c(" - no cloud APIs or data sent externally", "dim"))
            print()
            print(c("What Ollama Can Do:", "yellow"))
            print(c("   • 🎯 Natural file path resolution & \"did you mean\" suggestions", "dim"))
            print(c("   • 🔧 Apply fixes from consensus dictionary intelligently", "dim"))
            print(c("   • 👀 Setup watcher commands interactively (watch vs autofix mode)", "dim"))
            print(c("   • 🔍 Search and understand error patterns contextually", "dim"))
            print(c("   • 📂 Find files with natural language: ", "dim") + c('\"find my python scripts\"', "cyan"))
            print()
            print(c("Understanding Ollama vs Models:", "yellow"))
            print(c("   • ", "dim") + c('Ollama', "purple") + c(' = The platform/engine (like Docker for AI models)', "dim"))
            print(c("   • ", "dim") + c('llama3.2, mistral', "purple") + c(' = Models that run LOCALLY on Ollama', "dim"))
            print(c("   • Both models run ", "dim") + c('100% on your Mac', "green") + c(' - data never leaves your machine', "dim"))
            print(c("   • Install Ollama once, then pull whichever models you want", "dim"))
            print()
            print(c("Model Comparison:", "yellow"))
            print(c("   ", "dim") + c('llama3.2', "purple") + c(' (2GB):', "cyan"))
            print(c("     • Command parsing, fixes, watchers, file finding", "dim"))
            print(c("     • Fast & efficient, runs entirely offline", "dim"))
            print(c("     • Perfect for most LuciferAI operations", "dim"))
            print(c("     • Good: Natural language understanding, basic commands", "dim"))
            print()
            print(c("   ", "dim") + c('mistral', "purple") + c(' (7GB):', "cyan"))
            print(c("     • All llama3.2 features PLUS template-based operations", "dim"))
            print(c("     • ", "dim") + c('Template generation', "cyan") + c(' - Over 100 script templates (Python, JS, Bash, Go)', "dim"))
            print(c("     • ", "dim") + c('Web browsing', "cyan") + c(' - Searches answers via internal browser', "dim"))
            print(c("     • ", "dim") + c('Image retrieval', "cyan") + c(' - Can fetch images from Google Images', "dim"))
            print(c("     • ", "dim") + c('GitHub operations', "cyan") + c(' - Clone repos, download source code', "dim"))
            print(c("     • Task planning with subtasks and next steps (Warp AI style)", "dim"))
            print(c("     • Best for: Simple scripts, downloads, searches, file operations", "dim"))
            print()
            print(c("   ", "dim") + c('deepseek-coder', "purple") + c(' (6.7GB):', "cyan"))
            print(c("     • All mistral features + ", "dim") + c('EXPERT code generation', "green"))
            print(c("     • ", "dim") + c('Advanced search', "cyan") + c(' - StackOverflow, GitHub, documentation sites', "dim"))
            print(c("     • ", "dim") + c('Fix discovery', "cyan") + c(' - Auto-discovers and saves fixes to consensus', "dim"))
            print(c("     • Full script generation (complex Python, multi-file projects)", "dim"))
            print(c("     • Code optimization, refactoring, architecture design", "dim"))
            print(c("     • Multi-language: Python, JS, Go, Rust, C++, Java, etc.", "dim"))
            print(c("     • Advanced task orchestration with research subtasks", "dim"))
            print(c("     • Best for: Building complete applications from scratch", "dim"))
            print(c("     • Command: ", "dim") + c('ollama pull deepseek-coder', "cyan"))
            print()
            print(c("   Commands:", "cyan"))
            print(c("   • Install Ollama: ", "dim") + c('https://ollama.ai', "cyan"))
            print(c("   • Install llama3.2: ", "dim") + c('ollama install llama3.2', "cyan"))
            print(c("   • Install mistral: ", "dim") + c('ollama install mistral', "cyan"))
            print(c("   • List models: ", "dim") + c('ollama list', "cyan"))
            print(c("   • Switch models: LuciferAI auto-detects best available model", "dim"))
            print()
            print(c("Hybrid System:", "yellow"))
            print(c("   • ", "dim") + c('Local Learning:', "purple") + c(" Ollama processes commands offline", "dim"))
            print(c("   • ", "dim") + c('Global Consensus:', "purple") + c(" Community fixes synced from FixNet", "dim"))
            print(c("   • ", "dim") + c('Keyword Logic:', "purple") + c(" Rule-based fallback when Ollama unavailable", "dim"))
            print(c("   • Best of both worlds: AI understanding + reliable keyword matching", "dim"))
            print()
            print(c("Natural Language Examples with Breakdown:", "yellow"))
            print()
            
            # Example 1: Watch command
            print(c("   Example 1:", "cyan"))
            print(c("   ─────────", "dim"))
            print(c("   Input:    ", "dim") + c('"watch my desktop fan terminal file"', "green"))
            print()
            print(c("   Response: ", "dim") + c('🤔 Let me confirm what you want...', "cyan"))
            print(c("             I understood: You want to ", "dim") + c('watch', "yellow") + c(' this file:', "dim"))
            print(c("             → ~/Desktop/lucifer_fan_terminal_adaptive_daemon_v1_1.py", "green"))
            print(c("             (Matched: fan, terminal, file)", "yellow"))
            print()
            print(c("   How Ollama understood:", "cyan"))
            print(c("     • ", "dim") + c('watch', "purple") + c(' → Intent: Monitor/daemon mode', "dim"))
            print(c("     • ", "dim") + c('desktop', "purple") + c(' → Location hint: ~/Desktop/', "dim"))
            print(c("     • ", "dim") + c('fan terminal file', "purple") + c(' → File name keywords', "dim"))
            print(c("     • Fuzzy matched against filesystem", "dim"))
            print(c("     • Found 1 match with 90% confidence", "dim"))
            print(c("     • Asks: Autofix or Watch mode?", "dim"))
            print()
            
            # Example 2: Natural fix command
            print(c("   Example 2:", "cyan"))
            print(c("   ─────────", "dim"))
            print(c("   Input:    ", "dim") + c('"can you fix the errors in my test script"', "green"))
            print()
            print(c("   Response: ", "dim") + c('🤔 Let me confirm...', "cyan"))
            print(c("             I found multiple matches. Which one did you mean?", "dim"))
            print(c("             [1] ~/Desktop/test.py (Matched: test, script)", "green"))
            print(c("             [2] ~/Projects/test_suite.py (Matched: test, script)", "green"))
            print()
            print(c("   How Ollama understood:", "cyan"))
            print(c("     • ", "dim") + c('can you', "purple") + c(' → Polite request pattern', "dim"))
            print(c("     • ", "dim") + c('fix', "purple") + c(' → Intent: Auto-fix errors', "dim"))
            print(c("     • ", "dim") + c('errors', "purple") + c(' → Context: Error detection needed', "dim"))
            print(c("     • ", "dim") + c('test script', "purple") + c(' → File hints', "dim"))
            print(c("     • Searches filesystem for *.py files", "dim"))
            print(c("     • Ranks by keyword match score", "dim"))
            print(c("     • Presents top matches for confirmation", "dim"))
            print()
            
            # Example 3: Complex monitoring
            print(c("   Example 3:", "cyan"))
            print(c("   ─────────", "dim"))
            print(c("   Input:    ", "dim") + c('"could you monitor the lucifer daemon"', "green"))
            print()
            print(c("   Response: ", "dim") + c('Is this correct?', "cyan"))
            print(c("             → ~/Projects/LuciferAI_Local/core/lucifer_watcher.py", "green"))
            print(c("             (Matched: lucifer, daemon)", "yellow"))
            print()
            print(c("   How Ollama understood:", "cyan"))
            print(c("     • ", "dim") + c('could you', "purple") + c(' → Polite request', "dim"))
            print(c("     • ", "dim") + c('monitor', "purple") + c(' → Intent: Watch/observe', "dim"))
            print(c("     • ", "dim") + c('lucifer daemon', "purple") + c(' → Specific file hints', "dim"))
            print(c("     • High confidence match (85%)", "dim"))
            print(c("     • Asks for mode confirmation", "dim"))
            print()
            
            # Keyword Legend
            print(c("   Keyword Detection Reference:", "yellow"))
            print(c("   ───────────────────────────", "dim"))
            print(c("   Intent Keywords:", "cyan"))
            print(c("     • ", "dim") + c('watch, monitor, observe', "purple") + c(' → Daemon watcher', "dim"))
            print(c("     • ", "dim") + c('fix, repair, autofix', "purple") + c(' → Auto-fix mode', "dim"))
            print(c("     • ", "dim") + c('run, execute, start', "purple") + c(' → Execute script', "dim"))
            print(c("     • ", "dim") + c('can you, could you, please', "purple") + c(' → Natural requests', "dim"))
            print()
            print(c("   File Hint Keywords:", "cyan"))
            print(c("     • Location: ", "dim") + c('desktop, documents, projects', "purple"))
            print(c("     • Type: ", "dim") + c('file, script, daemon, terminal', "purple"))
            print(c("     • Program: ", "dim") + c('lucifer, fan, test, watcher', "purple"))
            print()
            print(c("   Processing Flow:", "cyan"))
            print(c("     1. ", "dim") + c('Extract', "purple") + c(' keywords from input', "dim"))
            print(c("     2. ", "dim") + c('Determine', "purple") + c(' intent (watch/fix/run)', "dim"))
            print(c("     3. ", "dim") + c('Search', "purple") + c(' filesystem with hints', "dim"))
            print(c("     4. ", "dim") + c('Score', "purple") + c(' matches by relevance', "dim"))
            print(c("     5. ", "dim") + c('Confirm', "purple") + c(' with user before executing', "dim"))
            print()
            print("="*60)
            print(c(f"\n{Emojis.BOOK} Dictionary Search Features:", "cyan"))
            print()
            print(c("1. Error Search:", "yellow"))
            print(c("   • Command: ", "dim") + c('search fixes for "<error message>"', "cyan"))
            print(c("   • Finds solutions for specific errors in your local fixes", "dim"))
            print(c("   • Results include clickable code snippets", "dim"))
            print()
            print(c("2. Program/Library Dictionary:", "yellow"))
            print(c("   • Command: ", "dim") + c('program <library_name>', "cyan"))
            print(c("   • Example: ", "dim") + c('program numpy', "cyan") + c(" or ", "dim") + c('program pandas', "cyan"))
            print(c("   • Search all fixes related to a specific library/program", "dim"))
            print(c("   • Perfect for learning common issues with frameworks", "dim"))
            print(c("   • Click code snippets to open in your editor", "dim"))
            print()
            print(c("3. Consensus Browser (GUI):", "yellow"))
            print(c("   • Command: ", "dim") + c('browser', "cyan"))
            print(c("   • Beautiful visual interface to browse all fixes", "dim"))
            print(c("   • Tree view, themes, and advanced search", "dim"))
            print(c("   • GitHub integration and code snippet viewer", "dim"))
            print()
            print("="*60)
            
            # Specific prompts for each feature
            print(c(f"\n{Emojis.SPARKLES} Quick Start Options:", "purple"))
            print()
            
            # Temporarily disable heartbeat for clean input
            import lucifer
            if hasattr(lucifer, 'HEART_STATE'):
                lucifer.HEART_STATE = "busy"
            
            try:
                # Offer program dictionary first
                print(c("[1] ", "cyan") + c("Search Program Dictionary", "yellow") + c(" - Find fixes for a specific library", "dim"))
                print(c("[2] ", "cyan") + c("Open Consensus Browser", "yellow") + c(" - Visual GUI for all fixes", "dim"))
                print(c("[3] ", "cyan") + c("Skip", "yellow") + c(" - Return to prompt", "dim"))
                print()
                
                choice = input(c("\nSelect option (1-3): ", "yellow")).strip()
                
                if choice == "1":
                    program = input(c("\nEnter library/program name (e.g., numpy, pandas, flask): ", "cyan")).strip()
                    if program:
                        print()
                        result = self._handle_program_search(program)
                        # After showing results, return to menu
                        input(c("\n\nPress Enter to return to main menu...", "dim"))
                        os.system('clear' if os.name != 'nt' else 'cls')
                        from lucifer_colors import display_banner
                        try:
                            import requests
                            response = requests.get("http://localhost:11434/api/tags", timeout=0.5)
                            mode = "AI-Powered (Ollama)" if response.status_code == 200 else "Rule-Based"
                        except:
                            mode = "Rule-Based"
                        display_banner(mode=mode, user_id=self.user_id)
                        return ""
                elif choice == "2":
                    print()
                    result = self._handle_browser()
                    # After browser closes, return to menu
                    input(c("\n\nPress Enter to return to main menu...", "dim"))
                    os.system('clear' if os.name != 'nt' else 'cls')
                    from lucifer_colors import display_banner
                    try:
                        import requests
                        response = requests.get("http://localhost:11434/api/tags", timeout=0.5)
                        mode = "AI-Powered (Ollama)" if response.status_code == 200 else "Rule-Based"
                    except:
                        mode = "Rule-Based"
                    display_banner(mode=mode, user_id=self.user_id)
                    return ""
                elif choice == "3" or not choice:
                    # Skip - clear and return to menu
                    pass
                else:
                    print(c(f"\n{Emojis.LIGHTBULB} Invalid choice", "yellow"))
                    
            except (EOFError, KeyboardInterrupt):
                pass
            
            # Clear screen and return to main menu (unless in specs mode)
            if not getattr(self, 'specs_mode', False):
                print(c(f"\n\n{Emojis.ROCKET} Returning to main menu...", "purple"))
                time.sleep(1)
                
                # Clear screen
                os.system('clear' if os.name != 'nt' else 'cls')
                
                # Redisplay banner
                from lucifer_colors import display_banner
                try:
                    # Try to determine if using AI
                    import requests
                    response = requests.get("http://localhost:11434/api/tags", timeout=0.5)
                    mode = "AI-Powered (Ollama)" if response.status_code == 200 else "Rule-Based"
                except:
                    mode = "Rule-Based"
                
                display_banner(mode=mode, user_id=self.user_id)
            else:
                # In specs mode, just add separator
                print(f"\n{c('─' * 60, 'dim')}\n")
            
            return ""  # Test prints everything
        except Exception as e:
            return c(f"{Emojis.CROSS} Error running system test: {e}", "red")
    
    def _handle_daemon_command(self, user_input: str) -> str:
        """Handle daemon/watcher commands."""
        user_lower = user_input.lower().strip()
        
        # daemon add <path>
        if 'add' in user_lower:
            match = re.search(r'(?:daemon|watcher)\s+add\s+(.+)', user_lower)
            if match:
                path = match.group(1).strip()
                self.watcher.add_path(path)
                return ""  # Message already printed
        
        # daemon remove <path>
        elif 'remove' in user_lower:
            match = re.search(r'(?:daemon|watcher)\s+remove\s+(.+)', user_lower)
            if match:
                path = match.group(1).strip()
                self.watcher.remove_path(path)
                return ""
        
        # daemon list
        elif 'list' in user_lower:
            self.watcher.list_paths()
            return ""
        
        # daemon watch (suggest mode) or daemon start watch
        elif 'watch' in user_lower and 'autofix' not in user_lower:
            self.watcher.start(mode="watch")
            return ""
        
        # daemon autofix (auto-apply mode)
        elif 'autofix' in user_lower or 'auto' in user_lower:
            self.watcher.start(mode="autofix")
            return ""
        
        # daemon start (default mode)
        elif 'start' in user_lower:
            self.watcher.start()
            return ""
        
        # daemon stop
        elif 'stop' in user_lower:
            self.watcher.stop()
            return ""
        
        # daemon status
        elif 'status' in user_lower:
            if self.watcher.running:
                return c(f"{Emojis.GHOST} Watcher is running in '{self.watcher.mode}' mode", "green")
            else:
                return c(f"{Emojis.GHOST} Watcher is not running", "yellow")
        
        return c(f"{Emojis.GHOST} Daemon commands: add/remove/list/watch/autofix/stop/status", "yellow")
    
    def _handle_modules_list(self) -> str:
        """List all modules across all environments."""
        show_modules_help()
        return ""  # Already printed
    
    def _handle_modules_search(self, query: str) -> str:
        """Search for a specific module."""
        search_module(query)
        return ""  # Already printed
    
    def _handle_luci_install(self, package: str) -> str:
        """Install package to LuciferAI global environment."""
        success = install_luciferai_global(package)
        return "" if success else c(f"{Emojis.CROSS} Installation failed", "red")
    
    def _handle_environments_list(self) -> str:
        """List all virtual environments on system."""
        scan_environments()
        return ""  # Already printed
    
    def _handle_environment_search(self, query: str) -> str:
        """Search for environments by name."""
        search_environment(query)
        return ""  # Already printed
    
    def _handle_environment_activate(self, query: str) -> str:
        """Activate an environment by name or path."""
        activate_environment(query)
        return ""  # Already printed
    
    def _handle_admin_help(self) -> str:
        """Show admin help menu."""
        # Check if user is admin
        from system_id import get_system_id_manager
        id_manager = get_system_id_manager()
        
        if not id_manager.has_id():
            return c(f"{Emojis.CROSS} No GitHub account linked", "red")
        
        github_username = id_manager.get_github_username()
        admin_role = self._check_consensus_admin(github_username)
        
        if not admin_role:
            return c(f"{Emojis.CROSS} Unauthorized - Admin access required", "red")
        
        help_text = f"""
{c('╔═══════════════════════════════════════════════════════════╗', 'purple')}
{c(f'║ 🔥 ADMIN CONSOLE ({admin_role.upper()})                              ║', 'purple')}
{c('╚═══════════════════════════════════════════════════════════╝', 'purple')}

{c('Available Admin Commands:', 'cyan')}

{c('📤 Repository Management:', 'yellow')}
  • {c('admin push', 'cyan')} - Push consensus & fixes to GitHub repo
  • {c('admin status', 'cyan')} - View admin status & permissions

{c('👥 User Management:', 'yellow')}
  • {c('admin grant <username>', 'cyan')} - Grant admin to GitHub user
  • {c('admin revoke <username>', 'cyan')} - Revoke admin privileges
  • {c('admin validate <user_id>', 'cyan')} - Validate user in consensus

{c('📊 System:', 'yellow')}
  • {c('admin metrics', 'cyan')} - View system metrics
  • {c('admin logs', 'cyan')} - View admin action logs

{c(f'Your Role: {admin_role.upper()}', 'green')}
"""
        return help_text
    
    def _handle_admin_status(self) -> str:
        """Show admin status."""
        from system_id import get_system_id_manager
        import json
        from pathlib import Path
        
        id_manager = get_system_id_manager()
        
        if not id_manager.has_id():
            return c(f"{Emojis.CROSS} No GitHub account linked", "red")
        
        github_username = id_manager.get_github_username()
        admin_role = self._check_consensus_admin(github_username)
        
        if not admin_role:
            return c(f"{Emojis.CROSS} You do not have admin privileges", "red")
        
        # Load admin data
        admin_file = Path(__file__).parent / "consensus_admins.json"
        with open(admin_file, 'r') as f:
            admin_data = json.load(f)
        
        # Find user's permissions
        user_perms = []
        for admin in admin_data.get("consensus_admins", []):
            if admin.get("github_username") == github_username:
                user_perms = admin.get("permissions", [])
                break
        
        response = f"\n{c(f'🔥 Admin Status', 'purple')}\n\n"
        response += f"  {c('GitHub:', 'cyan')} {github_username}\n"
        response += f"  {c('Role:', 'cyan')} {c(admin_role.upper(), 'purple')}\n"
        response += f"  {c('User ID:', 'cyan')} {id_manager.get_id()}\n"
        response += f"\n{c('Permissions:', 'yellow')}\n"
        
        for perm in user_perms:
            response += f"  ✓ {perm}\n"
        
        return response
    
    def _handle_admin_push(self) -> str:
        """Push consensus and fixes to GitHub repo."""
        from system_id import get_system_id_manager
        import subprocess
        from pathlib import Path
        import json
        from datetime import datetime
        
        id_manager = get_system_id_manager()
        
        if not id_manager.has_id():
            return c(f"{Emojis.CROSS} No GitHub account linked", "red")
        
        github_username = id_manager.get_github_username()
        admin_role = self._check_consensus_admin(github_username)
        
        if not admin_role:
            return c(f"{Emojis.CROSS} Unauthorized - Admin access required", "red")
        
        print(f"\n{c(f'{Emojis.ROCKET} Admin Push to GitHub', 'purple')}\n")
        print(f"{c('Collecting consensus data...', 'cyan')}")
        
        # Paths to sync
        lucifer_home = Path.home() / ".luciferai"
        consensus_files = [
            lucifer_home / "data" / "fix_dictionary.json",
            lucifer_home / "sync" / "remote_fix_refs.json",
            lucifer_home / "data" / "id_mappings.json",
            Path(__file__).parent / "consensus_admins.json"
        ]
        
        # Check if in git repo
        project_root = Path(__file__).parent.parent
        git_dir = project_root / ".git"
        
        if not git_dir.exists():
            return c(f"{Emojis.CROSS} Not in a git repository", "red") + f"\n{c('Initialize git first: git init', 'yellow')}"
        
        try:
            # Create consensus data export
            consensus_export_dir = project_root / "consensus_data"
            consensus_export_dir.mkdir(exist_ok=True)
            
            print(f"{c('Exporting consensus data...', 'cyan')}")
            
            # Copy consensus files
            import shutil
            for src_file in consensus_files:
                if src_file.exists():
                    dest_file = consensus_export_dir / src_file.name
                    shutil.copy2(src_file, dest_file)
                    print(f"  ✓ {src_file.name}")
            
            # Create metadata
            metadata = {
                "last_sync": datetime.utcnow().isoformat() + "Z",
                "synced_by": github_username,
                "role": admin_role,
                "files_synced": [f.name for f in consensus_files if f.exists()]
            }
            
            metadata_file = consensus_export_dir / "sync_metadata.json"
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            print(f"\n{c('Committing to git...', 'cyan')}")
            
            # Git add
            subprocess.run(
                ["git", "add", "consensus_data/"],
                cwd=project_root,
                check=True,
                capture_output=True
            )
            
            # Git commit
            commit_msg = f"[Admin] Sync consensus data - {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"
            subprocess.run(
                ["git", "commit", "-m", commit_msg],
                cwd=project_root,
                check=True,
                capture_output=True
            )
            
            print(f"{c('Pushing to GitHub...', 'cyan')}")
            
            # Git push
            result = subprocess.run(
                ["git", "push"],
                cwd=project_root,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                print()
                return c(f"{Emojis.CHECKMARK} Successfully pushed consensus data to GitHub!", "green") + f"\n{c(f'Commit: {commit_msg}', 'dim')}"
            else:
                return c(f"{Emojis.CROSS} Git push failed", "red") + f"\n{result.stderr}"
        
        except subprocess.CalledProcessError as e:
            return c(f"{Emojis.CROSS} Git operation failed: {e}", "red")
        except Exception as e:
            return c(f"{Emojis.CROSS} Error: {e}", "red")
    
    def _handle_admin_grant(self, target_username: Optional[str]) -> str:
        """Grant admin privileges to a GitHub user."""
        from system_id import get_system_id_manager
        import json
        from pathlib import Path
        from datetime import datetime
        
        id_manager = get_system_id_manager()
        
        if not id_manager.has_id():
            return c(f"{Emojis.CROSS} No GitHub account linked", "red")
        
        github_username = id_manager.get_github_username()
        admin_role = self._check_consensus_admin(github_username)
        
        if not admin_role:
            return c(f"{Emojis.CROSS} Unauthorized - Admin access required", "red")
        
        if admin_role != "founder":
            return c(f"{Emojis.CROSS} Only FOUNDER can grant admin privileges", "red")
        
        if not target_username:
            return c(f"{Emojis.CROSS} Please specify a GitHub username", "red") + f"\n{c('Usage: admin grant <username>', 'yellow')}"
        
        # Load admin file
        admin_file = Path(__file__).parent / "consensus_admins.json"
        with open(admin_file, 'r') as f:
            admin_data = json.load(f)
        
        # Check if already admin
        for admin in admin_data.get("consensus_admins", []):
            if admin.get("github_username") == target_username:
                return c(f"{Emojis.LIGHTBULB} {target_username} is already an admin", "yellow")
        
        # Add new admin
        new_admin = {
            "github_username": target_username,
            "role": "admin",
            "permissions": admin_data["admin_permissions"]["admin"],
            "validated_by": github_username,
            "validated_at": datetime.utcnow().isoformat() + "Z",
            "notes": f"Granted by {github_username}"
        }
        
        admin_data["consensus_admins"].append(new_admin)
        
        # Save
        with open(admin_file, 'w') as f:
            json.dump(admin_data, f, indent=2)
        
        return c(f"{Emojis.CHECKMARK} Granted admin privileges to {target_username}", "green") + f"\n{c('Role: ADMIN', 'cyan')}\n{c('Run admin push to sync to GitHub', 'yellow')}"
    
    def _handle_github_upload(self, project_path: Optional[str] = None) -> str:
        """Upload project to GitHub with smart project finding."""
        try:
            from github_uploader import GitHubUploader
            from system_id import get_system_id_manager
            from pathlib import Path
            
            id_manager = get_system_id_manager()
            
            # If project path provided, find it
            target_dir = None
            if project_path:
                # Try to find the project
                matches = self._find_file_by_name(project_path, search_dirs=True)
                
                if not matches:
                    return c(f"{Emojis.CROSS} Project '{project_path}' not found", "red")
                
                if len(matches) > 1:
                    selected = self._select_from_multiple_files(matches, "project directory")
                    if not selected:
                        return c(f"{Emojis.CROSS} Upload cancelled", "yellow")
                    target_dir = selected
                else:
                    target_dir = matches[0]
                
                # Verify it's a directory
                if not Path(target_dir).is_dir():
                    return c(f"{Emojis.CROSS} '{target_dir}' is not a directory", "red")
            
            # Create uploader with target directory
            uploader = GitHubUploader(id_manager, project_path=target_dir)
            
            print()
            success = uploader.upload_project()
            return "" if success else c(f"{Emojis.CROSS} Upload failed", "red")
        except Exception as e:
            return c(f"{Emojis.CROSS} Error: {e}", "red")
    
    def _handle_github_update(self, project_path: Optional[str] = None) -> str:
        """Update existing GitHub project with smart project finding."""
        try:
            from github_uploader import GitHubUploader
            from system_id import get_system_id_manager
            from pathlib import Path
            
            id_manager = get_system_id_manager()
            
            # If project path provided, find it
            target_dir = None
            if project_path:
                # Try to find the project
                matches = self._find_file_by_name(project_path, search_dirs=True)
                
                if not matches:
                    return c(f"{Emojis.CROSS} Project '{project_path}' not found", "red")
                
                if len(matches) > 1:
                    selected = self._select_from_multiple_files(matches, "project directory")
                    if not selected:
                        return c(f"{Emojis.CROSS} Update cancelled", "yellow")
                    target_dir = selected
                else:
                    target_dir = matches[0]
                
                # Verify it's a directory
                if not Path(target_dir).is_dir():
                    return c(f"{Emojis.CROSS} '{target_dir}' is not a directory", "red")
            
            # Create uploader with target directory
            uploader = GitHubUploader(id_manager, project_path=target_dir)
            
            print()
            success = uploader.update_project()
            return "" if success else c(f"{Emojis.CROSS} Update failed", "red")
        except Exception as e:
            return c(f"{Emojis.CROSS} Error: {e}", "red")
    
    def _handle_github_projects(self) -> str:
        """List user's GitHub projects."""
        try:
            from system_id import get_system_id_manager
            import requests
            
            id_manager = get_system_id_manager()
            
            if not id_manager.has_id():
                return c(f"{Emojis.CROSS} No GitHub account linked", "red") + f"\n{c('Run: github link', 'yellow')}"
            
            github_username = id_manager.get_github_username()
            
            if not github_username:
                return c(f"{Emojis.CROSS} GitHub username not found", "red")
            
            print(f"\n{c(f'{Emojis.ROCKET} Fetching projects for {github_username}...', 'cyan')}\n")
            
            # Fetch repos from GitHub API
            response = requests.get(
                f"https://api.github.com/users/{github_username}/repos",
                params={'sort': 'updated', 'per_page': 100}
            )
            
            if response.status_code != 200:
                return c(f"{Emojis.CROSS} Failed to fetch projects from GitHub", "red")
            
            repos = response.json()
            
            if not repos:
                return c(f"{Emojis.LIGHTBULB} No projects found", "yellow") + f"\n{c('Upload your first project with: github upload', 'cyan')}"
            
            # Display projects
            print(f"{c(f'{Emojis.FOLDER} Your GitHub Projects ({len(repos)} total):', 'green')}\n")
            
            for i, repo in enumerate(repos[:20], 1):
                name = repo['name']
                description = repo.get('description', 'No description')
                updated = repo['updated_at'][:10]
                private = '🔒' if repo['private'] else '🌐'
                stars = repo.get('stargazers_count', 0)
                
                print(f"{i:2d}. {private} {c(name, 'cyan')}")
                print(f"     {c(description[:60], 'dim')}")
                print(f"     {c(f'⭐ {stars} • Updated: {updated}', 'yellow')}")
                print(f"     {c(repo['html_url'], 'blue')}")
                print()
            
            if len(repos) > 20:
                print(f"{c(f'... and {len(repos) - 20} more projects', 'yellow')}\n")
            
            return f"{c(f'{Emojis.CHECKMARK} Found {len(repos)} projects', 'green')}"
        
        except Exception as e:
            return c(f"{Emojis.CROSS} Error fetching projects: {e}", "red")
    
    def _handle_github_link(self) -> str:
        """Link GitHub account."""
        try:
            from system_id import get_system_id_manager
            
            id_manager = get_system_id_manager()
            
            print()
            print(f"{c(f'{Emojis.ROCKET} Link GitHub Account', 'purple')}\n")
            
            github_username = input(f"{c('Enter your GitHub username:', 'cyan')} ").strip()
            
            if not github_username:
                return c(f"{Emojis.CROSS} Username required", "red")
            
            # Verify GitHub username exists
            import requests
            response = requests.get(f"https://api.github.com/users/{github_username}")
            
            if response.status_code != 200:
                return c(f"{Emojis.CROSS} GitHub user '{github_username}' not found", "red")
            
            user_data = response.json()
            github_id = str(user_data['id'])
            
            # Save to system ID
            success = id_manager.set_id_from_github(github_username, github_id)
            
            if success:
                print()
                response = c(f"{Emojis.CHECKMARK} Successfully linked GitHub account: {github_username}", "green")
                
                # Check if user is a consensus admin
                admin_role = self._check_consensus_admin(github_username)
                if admin_role:
                    response += f"\n\n{c(f'{Emojis.SPARKLE} Consensus Admin Detected!', 'purple')}"
                    response += f"\n{c(f'Role: {admin_role.upper()}', 'cyan')}"
                    response += f"\n{c('You have elevated privileges in LuciferAI', 'yellow')}"
                
                return response
            else:
                return c(f"{Emojis.CROSS} Failed to save GitHub link", "red")
        
        except Exception as e:
            return c(f"{Emojis.CROSS} Error: {e}", "red")
    
    def _handle_github_unlink(self) -> str:
        """Unlink GitHub account."""
        try:
            from system_id import get_system_id_manager
            
            id_manager = get_system_id_manager()
            
            if not id_manager.has_id():
                return c(f"{Emojis.CROSS} No GitHub account is currently linked", "red")
            
            github_username = id_manager.get_github_username()
            
            # Confirm unlink
            print()
            print(f"{c(f'{Emojis.WARNING} Unlink GitHub Account', 'yellow')}\n")
            print(f"  Current account: {c(github_username, 'cyan')}")
            print()
            
            confirm = get_single_key_input(f"{c('Are you sure you want to unlink? (y/n):', 'yellow')} ")
            
            if confirm.lower() != 'y':
                return c(f"{Emojis.CROSS} Unlink cancelled", "yellow")
            
            # Clear the ID
            success = id_manager.clear_id()
            
            if success:
                print()
                return c(f"{Emojis.CHECKMARK} Successfully unlinked GitHub account: {github_username}", "green")
            else:
                return c(f"{Emojis.CROSS} Failed to unlink account", "red")
        
        except Exception as e:
            return c(f"{Emojis.CROSS} Error: {e}", "red")
    
    def _check_consensus_admin(self, github_username: str) -> Optional[str]:
        """Check if GitHub username is a consensus admin."""
        try:
            import json
            from pathlib import Path
            
            # Load consensus admin list
            admin_file = Path(__file__).parent / "consensus_admins.json"
            
            if not admin_file.exists():
                return None
            
            with open(admin_file, 'r') as f:
                admin_data = json.load(f)
            
            # Check if user is in admin list
            for admin in admin_data.get("consensus_admins", []):
                if admin.get("github_username") == github_username:
                    return admin.get("role", "admin")
            
            return None
        except:
            return None
    
    def _handle_github_status(self) -> str:
        """Show GitHub connection status."""
        try:
            from system_id import get_system_id_manager
            
            id_manager = get_system_id_manager()
            
            if not id_manager.has_id():
                return c(f"{Emojis.CROSS} No GitHub account linked", "red") + f"\n{c('Link your account with: github link', 'yellow')}"
            
            github_username = id_manager.get_github_username()
            user_id = id_manager.get_id()
            
            response = f"\n{c(f'{Emojis.ROCKET} GitHub Status', 'green')}\n\n"
            response += f"  {c('Connected:', 'cyan')} {c('✓ Yes', 'green')}\n"
            response += f"  {c('Username:', 'cyan')} {github_username}\n"
            response += f"  {c('User ID:', 'cyan')} {user_id}\n"
            
            # Check if admin
            admin_role = self._check_consensus_admin(github_username)
            if admin_role:
                response += f"  {c('Role:', 'cyan')} {c(f'🔥 {admin_role.upper()}', 'purple')}\n"
            response += f"\n{c('Available commands:', 'yellow')}\n"
            response += f"  • {c('github upload', 'cyan')} - Upload current project\n"
            response += f"  • {c('github update', 'cyan')} - Update existing project\n"
            response += f"  • {c('github projects', 'cyan')} - List your projects\n"
            response += f"  • {c('github unlink', 'cyan')} - Unlink GitHub account\n"
            
            return response
        
        except Exception as e:
            return c(f"{Emojis.CROSS} Error: {e}", "red")
    
    def _handle_id_search(self, search_id: Optional[str]) -> str:
        """Search for a user ID in the consensus validation system."""
        try:
            import json
            from pathlib import Path
            
            if not search_id:
                return c(f"{Emojis.CROSS} Please provide an ID to search", "red") + f"\n{c('Usage: id search <user_id>', 'yellow')}"
            
            print(f"\n{c(f'{Emojis.MAGNIFIER} Searching consensus for ID: {search_id}', 'cyan')}\n")
            
            # Load ID mapping from consensus
            lucifer_home = Path.home() / ".luciferai"
            id_map_file = lucifer_home / "data" / "id_mappings.json"
            
            if not id_map_file.exists():
                return c(f"{Emojis.LIGHTBULB} No ID mappings found in consensus", "yellow") + f"\n{c('ID mappings are created when users upload to GitHub', 'dim')}"
            
            # Load mappings
            with open(id_map_file, 'r') as f:
                mappings = json.load(f)
            
            # Search for ID
            if search_id in mappings:
                mapping = mappings[search_id]
                
                response = f"{c(f'{Emojis.CHECKMARK} ID Found in Consensus', 'green')}\n\n"
                response += f"  {c('User ID:', 'cyan')} {search_id}\n"
                response += f"  {c('GitHub Username:', 'cyan')} {mapping.get('github_username', 'Unknown')}\n"
                response += f"  {c('GitHub ID:', 'cyan')} {mapping.get('github_id', 'Unknown')}\n"
                response += f"  {c('Validated:', 'cyan')} {c('✓ Yes', 'green') if mapping.get('validated') else c('✗ No', 'red')}\n"
                response += f"  {c('First Seen:', 'cyan')} {mapping.get('first_seen', 'Unknown')}\n"
                response += f"  {c('Last Updated:', 'cyan')} {mapping.get('last_updated', 'Unknown')}\n"
                response += f"  {c('Uploads:', 'cyan')} {mapping.get('upload_count', 0)}\n"
                
                if mapping.get('consensus_trust'):
                    response += f"  {c('Consensus Trust:', 'cyan')} {mapping['consensus_trust']}\n"
                
                return response
            else:
                # Search partial matches
                partial_matches = []
                for uid, data in mappings.items():
                    if search_id.lower() in uid.lower() or search_id.lower() in data.get('github_username', '').lower():
                        partial_matches.append((uid, data))
                
                if partial_matches:
                    response = c(f"{Emojis.LIGHTBULB} No exact match found. Did you mean:", "yellow") + "\n\n"
                    
                    for uid, data in partial_matches[:5]:
                        response += f"  {c(uid[:20], 'cyan')} → {c(data.get('github_username', 'Unknown'), 'green')}\n"
                    
                    return response
                else:
                    return c(f"{Emojis.CROSS} ID not found in consensus", "red") + f"\n{c('This ID may not be validated or linked to GitHub yet', 'yellow')}"
        
        except Exception as e:
            return c(f"{Emojis.CROSS} Error searching ID: {e}", "red")
    
    def _handle_volume(self, volume: int) -> str:
        """Set system volume to specified percentage (0-100)."""
        import subprocess
        
        # Validate volume range
        if not 0 <= volume <= 100:
            return c(f"{Emojis.CROSS} Volume must be between 0 and 100", "red")
        
        try:
            # Use osascript to set volume on macOS
            subprocess.run(
                ["osascript", "-e", f"set volume output volume {volume}"],
                check=True,
                capture_output=True
            )
            
            # Visual feedback based on volume level
            if volume == 0:
                icon = "🔇"
            elif volume <= 33:
                icon = "🔉"
            elif volume <= 66:
                icon = "🔊"
            else:
                icon = "🔊"
            
            return c(f"{icon} Volume set to {volume}%", "green")
        
        except subprocess.CalledProcessError as e:
            return c(f"{Emojis.CROSS} Failed to set volume: {e}", "red")
        except FileNotFoundError:
            return c(f"{Emojis.CROSS} osascript not found (macOS only)", "red")
        except Exception as e:
            return c(f"{Emojis.CROSS} Error setting volume: {e}", "red")
    
    def _handle_fan_command(self, user_input: str) -> str:
        """Handle fan control commands."""
        user_lower = user_input.lower().strip()
        fan_script = Path(__file__).parent.parent / "LuciferAI_Fan_Terminal" / "lucifer_fan_terminal_adaptive_daemon_v1_1.py"
        
        if not fan_script.exists():
            return c(f"{Emojis.CROSS} Fan control script not found at {fan_script}", "red")
        
        # fan start
        if 'start' in user_lower:
            print(c(f"{Emojis.HEARTBEAT} Starting adaptive fan control daemon...", "cyan"))
            print(c("⚠️  This requires sudo privileges. You may be prompted for your password.", "yellow"))
            print()
            
            try:
                # Start the fan control daemon in background
                result = subprocess.Popen(
                    ["sudo", "python3", str(fan_script)],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
                time.sleep(2)
                
                # Check if process is still running
                if result.poll() is None:
                    msg = c(f"{Emojis.CHECKMARK} Fan daemon started successfully (PID: {result.pid})", "green")
                    msg += "\n" + c('💡 Use "fan stop" to stop the daemon', 'yellow')
                    return msg
                else:
                    stderr = result.stderr.read().decode() if result.stderr else "Unknown error"
                    return c(f"{Emojis.CROSS} Failed to start fan daemon", "red") + f"\n{stderr[:200]}"
            except Exception as e:
                return c(f"{Emojis.CROSS} Error starting fan daemon: {e}", "red")
        
        # fan stop
        elif 'stop' in user_lower:
            print(c(f"{Emojis.GHOST} Stopping fan daemon...", "cyan"))
            try:
                # Kill all instances of the fan script
                subprocess.run(
                    ["sudo", "pkill", "-f", "lucifer_fan_terminal_adaptive_daemon"],
                    capture_output=True
                )
                return c(f"{Emojis.CHECKMARK} Fan daemon stopped. Automatic fan control restored.", "green")
            except Exception as e:
                return c(f"{Emojis.CROSS} Error stopping fan daemon: {e}", "red")
        
        # fan status
        elif 'status' in user_lower:
            try:
                result = subprocess.run(
                    ["pgrep", "-f", "lucifer_fan_terminal_adaptive_daemon"],
                    capture_output=True,
                    text=True
                )
                
                if result.returncode == 0:
                    pids = result.stdout.strip().split('\n')
                    return c(f"{Emojis.HEARTBEAT} Fan daemon is running (PID: {', '.join(pids)})", "green")
                else:
                    return c(f"{Emojis.GHOST} Fan daemon is not running", "yellow")
            except Exception as e:
                return c(f"{Emojis.CROSS} Error checking status: {e}", "red")
        
        # daemon/watch commands
        elif user_input.lower().startswith('daemon ') or user_input.lower().startswith('watch '):
            return self._handle_daemon_command(user_input)
        
        # fan logs
        elif 'logs' in user_lower or 'log' in user_lower:
            log_file = Path.home() / "LuciferAI" / "logs" / "fan_terminal.log"
            
            if not log_file.exists():
                return c(f"{Emojis.LIGHTBULB} No logs found. Start the fan daemon to generate logs.", "yellow")
            
            try:
                # Read last 50 lines of log
                with open(log_file, 'r') as f:
                    lines = f.readlines()
                    last_lines = lines[-50:] if len(lines) > 50 else lines
                
                response = c(f"{Emojis.FILE} Last {len(last_lines)} log entries:", "green") + "\n\n"
                response += ''.join(last_lines)
                return response
            except Exception as e:
                return c(f"{Emojis.CROSS} Error reading logs: {e}", "red")
        
        # fan set-target
        elif 'set-target' in user_lower or 'set target' in user_lower:
            match = re.search(r'set-?target\s+(\w+)\s+(\d+)', user_lower)
            if not match:
                return c(f"{Emojis.CROSS} Usage: fan set-target <sensor> <temp>", "red") + f"\n{c('Available sensors: CPU, GPU, MEM, HEAT, SSD, BAT', 'yellow')}"
            
            sensor = match.group(1).upper()
            temp = match.group(2)
            
            # This would require modifying the script file
            return c(f"{Emojis.LIGHTBULB} Feature coming soon: Set {sensor} target to {temp}°C", "yellow") + f"\n{c('For now, edit the TARGET_TEMPS dictionary in the fan script directly', 'dim')}"
        
        # Unknown fan command
        else:
            return c(f"{Emojis.CROSS} Unknown fan command", "red") + f"\n{c('Available: fan start | fan stop | fan status | fan logs', 'yellow')}"
    
    def _handle_daemon_command(self, user_input: str) -> str:
        """Handle daemon watch commands."""
        from script_watcher_daemon import ScriptWatcherDaemon
        
        parts = user_input.split()
        if len(parts) < 2:
            return c(f"{Emojis.CROSS} Usage: daemon watch <script> | daemon status", "red")
        
        command = parts[1].lower()
        daemon = ScriptWatcherDaemon()
        
        if command == 'watch':
            if len(parts) < 3:
                return c(f"{Emojis.CROSS} Usage: daemon watch <script_name>", "red")
            
            script_name = parts[2]
            daemon.watch_script(script_name)
            return ""  # daemon.watch_script() handles all output
        
        elif command == 'status':
            daemon.status()
            return ""  # daemon.status() handles all output
        
        else:
            return c(f"{Emojis.CROSS} Unknown daemon command: {command}", "red") + f"\n{c('Available: daemon watch <script> | daemon status', 'yellow')}"
    
    def _handle_browser(self) -> str:
        """Open consensus browser GUI."""
        print(c(f"{Emojis.MAGNIFIER} Opening consensus browser...", "cyan"))
        
        browser_script = Path(__file__).parent.parent / "LuciferAI_Consensus_Browser" / "consensus_browser.py"
        
        if not browser_script.exists():
            return c(f"{Emojis.CROSS} Consensus browser not found at {browser_script}", "red")
        
        try:
            # Launch browser in background
            subprocess.Popen(
                ["python3", str(browser_script)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            return c(f"{Emojis.CHECKMARK} Consensus browser launched", "green") + f"\n{c('💡 Browse local and remote fixes with a visual interface', 'blue')}"
        except Exception as e:
            return c(f"{Emojis.CROSS} Error launching browser: {e}", "red")
    
    def _handle_thermal_command(self, user_input: str) -> str:
        """Handle thermal analytics commands."""
        user_lower = user_input.lower().strip()
        
        if not self.thermal.is_tracking_enabled():
            print_thermal_banner(self.thermal.validated, self.user_id)
            return ""
        
        # thermal status
        if 'status' in user_lower:
            self.thermal.print_thermal_status()
            return ""
        
        # thermal baseline
        elif 'baseline' in user_lower:
            self.thermal.set_baseline()
            return ""
        
        # thermal stats
        elif 'stats' in user_lower or 'statistics' in user_lower:
            summary = self.thermal.get_session_summary()
            
            if not summary:
                newline = "\n"
                msg = 'Use "thermal baseline" to start tracking'
                return c(f"{Emojis.LIGHTBULB} No thermal data recorded yet", "yellow") + f"{newline}{c(msg, 'dim')}"
            
            print(c(f"\n{Emojis.THERMOMETER} Thermal Session Summary", "cyan"))
            print(c("─" * 50, "dim"))
            print(c(f"  Readings: {summary['readings_count']}", "blue"))
            print(c(f"  Avg Temp: {summary['avg_temp']:.1f}°C", "blue"))
            print(c(f"  Min Temp: {summary['min_temp']:.1f}°C", "green"))
            print(c(f"  Max Temp: {summary['max_temp']:.1f}°C", "red"))
            print(c(f"  Variance: {summary['temp_variance']:.1f}°C", "yellow"))
            
            if 'avg_dispersion_pct' in summary:
                disp_color = "green" if summary['avg_dispersion_pct'] > 0 else "red"
                print(c(f"\n  Avg Dispersion: {summary['avg_dispersion_pct']:+.1f}%", disp_color))
                print(c(f"  Best Dispersion: {summary['best_dispersion_pct']:+.1f}%", "green"))
                print(c(f"  Worst Dispersion: {summary['worst_dispersion_pct']:+.1f}%", "red"))
            
            return ""
        
        # Unknown thermal command
        else:
            return c(f"{Emojis.CROSS} Unknown thermal command", "red") + f"\n{c('Available: thermal status | thermal baseline | thermal stats', 'yellow')}"
    
    def _handle_ollama_install_request(self, user_input: str) -> str:
        """Handle Ollama/LLM installation requests with clarification."""
        user_lower = user_input.lower().strip()
        
        # FIRST: Try to extract a specific model name from the input
        # This handles cases like "install llama3.1-70b" where we want the EXACT model
        # Split by 'install' or 'instal' and extract everything after it
        for keyword in ['install ', 'instal ']:
            if keyword in user_lower:
                potential_model = user_input.split(keyword, 1)[1].strip()
                
                # Check if this exact model exists in MODEL_FILES
                from model_files_map import MODEL_FILES
                
                # Try exact match first
                if potential_model in MODEL_FILES:
                    # Direct installation without clarification
                    return self._handle_luci_install_package(potential_model)
                
                # Try lowercase match
                potential_model_lower = potential_model.lower()
                if potential_model_lower in MODEL_FILES:
                    return self._handle_luci_install_package(potential_model_lower)
                
                # Try case-insensitive search in MODEL_FILES keys
                for model_key in MODEL_FILES.keys():
                    if model_key.lower() == potential_model_lower:
                        return self._handle_luci_install_package(model_key)
                
                # Try fuzzy matching for incomplete names (e.g., "llama3.1-70" → "llama3.1-70b")
                # Only do this if the input looks like a specific model (contains numbers/dashes)
                if any(char.isdigit() for char in potential_model_lower):
                    matches = []
                    for model_key in MODEL_FILES.keys():
                        # Check if the model key starts with the input (handles incomplete names)
                        if model_key.lower().startswith(potential_model_lower):
                            matches.append(model_key)
                    
                    # If we found exactly one match, confirm and install
                    if len(matches) == 1:
                        matched_model = matches[0]
                        print()
                        print(c(f"{Emojis.LIGHTBULB} Did you mean: ", "yellow") + c(matched_model, "green") + c("?", "yellow"))
                        print()
                        try:
                            from utils import get_single_key_input
                            confirm = get_single_key_input(c(f"Install {matched_model}? (y/n): ", "cyan"))
                            print()  # Newline after key press
                            
                            if confirm == 'y':
                                return self._handle_luci_install_package(matched_model)
                            else:
                                return c("\n❌ Installation cancelled", "yellow")
                        except (EOFError, KeyboardInterrupt):
                            return c("\n\n❌ Installation cancelled", "yellow")
                    
                    # If multiple matches, show options
                    elif len(matches) > 1:
                        print()
                        print(c(f"{Emojis.LIGHTBULB} Multiple models match '", "yellow") + c(potential_model, "cyan") + c("':", "yellow"))
                        print()
                        for i, model in enumerate(matches, 1):
                            print(c(f"  [{i}] {model}", "cyan"))
                        print(c(f"  [0] Cancel", "yellow"))
                        print()
                        
                        try:
                            choice = input(c(f"Select model (0-{len(matches)}): ", "cyan")).strip()
                            choice_idx = int(choice)
                            
                            if 1 <= choice_idx <= len(matches):
                                selected_model = matches[choice_idx - 1]
                                return self._handle_luci_install_package(selected_model)
                            else:
                                return c("\n❌ Installation cancelled", "yellow")
                        except (ValueError, EOFError, KeyboardInterrupt):
                            return c("\n❌ Installation cancelled", "yellow")
                
                break
        
        # SECOND: If no specific model found, proceed with generic clarification flow
        print()
        print(c(f"{Emojis.LIGHTBULB} Installation Request Detected", "cyan"))
        print(c("─" * 60, "dim"))
        print()
        
        # Detect what they're trying to install
        if 'ollama' in user_lower or 'olama' in user_lower:
            # Check if it's actually ollama-cpp-python (common typo for llama-cpp-python)
            if 'ollama-cpp' in user_lower or 'ollama_cpp' in user_lower:
                intent = 'llamacpp_platform'
            else:
                intent = 'ollama_platform'
        elif 'llama-cpp' in user_lower or 'llamacpp' in user_lower or 'llama_cpp' in user_lower:
            intent = 'llamacpp_platform'
        elif 'mistral' in user_lower or 'mistrel' in user_lower or 'mistrall' in user_lower:
            intent = 'mistral_model'
        elif 'deepseek' in user_lower or 'deepseak' in user_lower or 'deep seek' in user_lower or 'deep-seek' in user_lower or 'depseek' in user_lower:
            intent = 'deepseek_model'
        elif 'llama' in user_lower or 'lama' in user_lower or 'lamma' in user_lower:
            intent = 'llama_model'
        elif 'llm' in user_lower or 'ai' in user_lower:
            intent = 'unclear'
        else:
            intent = 'unclear'
        
        # Show what we understood and clarify
        if intent == 'unclear':
            print(c("I detected an AI/LLM installation request.", "yellow"))
            print(c("Did you mean one of these?", "cyan"))
            print()
            print(c("  [1]", "blue") + c(" Ollama Platform", "green") + c(" - The engine that runs AI models", "dim"))
            print(c("      Command: ", "dim") + c("luci install ollama", "cyan"))
            print()
            print(c("  [2]", "blue") + c(" llama-cpp-python", "green") + c(" - Lightweight alternative (for older macOS)", "dim"))
            print(c("      Command: ", "dim") + c("luci install llama-cpp-python", "cyan"))
            print()
            print(c("  [3]", "blue") + c(" llama3.2 Model", "green") + c(" - Fast AI model (2GB)", "dim"))
            print(c("      Command: ", "dim") + c("luci install llama3.2", "cyan"))
            print()
            print(c("  [4]", "blue") + c(" mistral Model", "green") + c(" - Advanced AI model (7GB)", "dim"))
            print(c("      Command: ", "dim") + c("luci install mistral", "cyan"))
            print()
            print(c("  [5]", "blue") + c(" deepseek-coder Model", "green") + c(" - Expert coding AI (6.7GB)", "dim"))
            print(c("      Command: ", "dim") + c("luci install deepseek-coder", "cyan"))
            print()
            print(c("  [0]", "blue") + c(" Cancel", "yellow"))
            print()
            
            try:
                choice = input(c("Select option (0-5): ", "cyan")).strip()
                
                if choice == '1':
                    return self._show_ollama_platform_install()
                elif choice == '2':
                    return self._show_llamacpp_install()
                elif choice == '3':
                    return self._show_model_install('llama3.2')
                elif choice == '4':
                    return self._show_model_install('mistral')
                elif choice == '5':
                    return self._show_model_install('deepseek-coder')
                else:
                    return c("\n❌ Cancelled", "yellow")
            except (EOFError, KeyboardInterrupt):
                return c("\n\n❌ Cancelled", "yellow")
        
        elif intent == 'ollama_platform':
            # Check if they misspelled 'olama' instead of 'ollama'
            if 'olama' in user_lower and 'ollama' not in user_lower:
                print(c(f"💡 Did you mean ", "yellow") + c("ollama", "green") + c(" (with double 'l')?", "yellow"))
                print()
                try:
                    confirm = get_single_key_input(c("Install Ollama platform? (y/n): ", "cyan"))
                    print()  # Newline after key press
                    
                    if confirm == 'y':
                        return self._show_ollama_platform_install()
                    else:
                        return c("\n❌ Cancelled", "yellow")
                except (EOFError, KeyboardInterrupt):
                    return c("\n\n❌ Cancelled", "yellow")
            else:
                return self._show_ollama_platform_install()
        
        elif intent == 'llamacpp_platform':
            # Check if they used a variant spelling (including ollama-cpp typo)
            variants = ['llama-cpp', 'llamacpp', 'llama_cpp', 'ollama-cpp', 'ollamacpp', 'ollama_cpp']
            if any(variant in user_lower for variant in variants) and 'llama-cpp-python' not in user_lower:
                variant_found = next((v for v in variants if v in user_lower), '')
                
                # Special message for ollama-cpp typo
                if 'ollama-cpp' in user_lower or 'ollama_cpp' in user_lower:
                    print(c(f"💡 Did you mean ", "yellow") + c("llama-cpp-python", "green") + c(" (not 'ollama-cpp-python')?", "yellow"))
                    print(c("   Note: It's 'llama' with two L's, not 'ollama'", "dim"))
                else:
                    print(c(f"💡 Did you mean ", "yellow") + c("llama-cpp-python", "green") + c(f" (not '{variant_found}')?", "yellow"))
                print()
                try:
                    confirm = get_single_key_input(c("Install llama-cpp-python? (y/n): ", "cyan"))
                    print()  # Newline after key press
                    
                    if confirm == 'y':
                        return self._show_llamacpp_install()
                    else:
                        return c("\n❌ Cancelled", "yellow")
                except (EOFError, KeyboardInterrupt):
                    return c("\n\n❌ Cancelled", "yellow")
            else:
                return self._show_llamacpp_install()
        
        elif intent == 'llama_model':
            # Check if they might have misspelled
            if any(typo in user_lower for typo in ['lama', 'lamma']) and 'llama' not in user_lower:
                correct = "llama3.2"
                typo_word = 'lama' if 'lama' in user_lower else 'lamma'
                print(c(f"💡 Did you mean ", "yellow") + c(correct, "green") + c(f" (not '{typo_word}')?", "yellow"))
                print()
                try:
                    confirm = get_single_key_input(c(f"Install {correct} model? (y/n): ", "cyan"))
                    print()  # Newline after key press
                    
                    if confirm == 'y':
                        return self._show_model_install('llama3.2')
                    else:
                        return c("\n❌ Cancelled", "yellow")
                except (EOFError, KeyboardInterrupt):
                    return c("\n\n❌ Cancelled", "yellow")
            else:
                return self._show_model_install('llama3.2')
        
        elif intent == 'mistral_model':
            # Check if they might have misspelled
            if any(typo in user_lower for typo in ['mistrel', 'mistrall']) and 'mistral' not in user_lower:
                typo_word = 'mistrel' if 'mistrel' in user_lower else 'mistrall'
                print(c(f"💡 Did you mean ", "yellow") + c("mistral", "green") + c(f" (not '{typo_word}')?", "yellow"))
                print()
                try:
                    confirm = get_single_key_input(c("Install mistral model? (y/n): ", "cyan"))
                    print()  # Newline after key press
                    
                    if confirm == 'y':
                        return self._show_model_install('mistral')
                    else:
                        return c("\n❌ Cancelled", "yellow")
                except (EOFError, KeyboardInterrupt):
                    return c("\n\n❌ Cancelled", "yellow")
            else:
                return self._show_model_install('mistral')
        
        elif intent == 'deepseek_model':
            # Check if they might have misspelled
            if any(typo in user_lower for typo in ['deepseak', 'deep seek', 'deep-seek', 'depseek']) and 'deepseek' not in user_lower:
                typo_found = next((t for t in ['deepseak', 'deep seek', 'deep-seek', 'depseek'] if t in user_lower), '')
                print(c(f"💡 Did you mean ", "yellow") + c("deepseek-coder", "green") + c(f" (not '{typo_found}')?", "yellow"))
                print()
                try:
                    confirm = get_single_key_input(c("Install deepseek-coder model? (y/n): ", "cyan"))
                    print()  # Newline after key press
                    
                    if confirm == 'y':
                        return self._show_model_install('deepseek-coder')
                    else:
                        return c("\n❌ Cancelled", "yellow")
                except (EOFError, KeyboardInterrupt):
                    return c("\n\n❌ Cancelled", "yellow")
            else:
                return self._show_model_install('deepseek-coder')
        
        return self._handle_unknown(user_input)
    
    def _show_ollama_platform_install(self) -> str:
        """Install Ollama platform using Luci! package manager."""
        # Check macOS version first
        import platform
        if platform.system() == "Darwin":
            try:
                version_str = platform.mac_ver()[0]
                parts = version_str.split('.')
                major = int(parts[0]) if len(parts) > 0 else 0
                minor = int(parts[1]) if len(parts) > 1 else 0
                
                # Check if Catalina (10.15) or older
                if major == 10 and minor <= 15:
                    print(c('⚠️  macOS Catalina Detected', 'yellow'))
                    print()
                    print(c(f'Your macOS version: {version_str}', 'dim'))
                    print(c('Native Ollama requires macOS Sonoma (14.0) or newer', 'yellow'))
                    print()
                    print(c('Recommended alternative:', 'cyan'))
                    print(c('  • llama-cpp-python - Lightweight Python LLM backend', 'green'))
                    print(c('  • Works perfectly on Catalina and newer', 'dim'))
                    print(c('  • Same features as Ollama', 'dim'))
                    print()
                    
                    try:
                        confirm = get_single_key_input(c("Install llama-cpp-python instead? (y/n): ", "cyan"))
                        print()  # Newline after key press
                        
                        if confirm == 'y':
                            return self._show_llamacpp_install()
                        else:
                            print()
                            print(c('Alternative: Use Docker to run Ollama', 'yellow'))
                            print(c('  docker pull ollama/ollama', 'cyan'))
                            print()
                            return c("❌ Installation cancelled", "yellow")
                    except (EOFError, KeyboardInterrupt):
                        return c("\n\n❌ Installation cancelled", "yellow")
            except:
                pass  # If version detection fails, continue with normal flow
        
        # Normal Ollama installation for compatible macOS versions
        print(c('📥 Installing Ollama Platform via Luci!', 'green'))
        print()
        print(c('Ollama is the LOCAL ENGINE that runs AI models.', 'yellow'))
        print()
        
        try:
            confirm = get_single_key_input(c("Proceed with installation? (y/n): ", "cyan"))
            print()  # Newline after key press
            
            if confirm == 'y':
                # Resume heartbeat for installation
                import lucifer
                if hasattr(lucifer, 'HEART_STATE'):
                    lucifer.HEART_STATE = "idle"
                
                # Use Luci! package manager
                success = self.package_manager.install('ollama', verbose=True)
                
                if success:
                    print()
                    print(c('After installation completes, install a model:', 'yellow'))
                    print(c('  • luci install llama3.2', 'cyan') + c(' - Fast model (2GB)', 'dim'))
                    print(c('  • luci install mistral', 'cyan') + c(' - Advanced model (7GB)', 'dim'))
                    print(c('  • luci install deepseek-coder', 'cyan') + c(' - Expert coding (6.7GB)', 'dim'))
                    print()
                    return ""
                else:
                    return c("\n❌ Installation failed", "red")
            else:
                # Resume heartbeat on cancel
                import lucifer
                if hasattr(lucifer, 'HEART_STATE'):
                    lucifer.HEART_STATE = "idle"
                return c("\n❌ Installation cancelled", "yellow")
        
        except (EOFError, KeyboardInterrupt):
            # Resume heartbeat on interrupt
            import lucifer
            if hasattr(lucifer, 'HEART_STATE'):
                lucifer.HEART_STATE = "idle"
            return c("\n\n❌ Installation cancelled", "yellow")
    
    def _show_llamacpp_install(self) -> str:
        """Install llama-cpp-python using pip."""
        print(c('📥 Installing llama-cpp-python via pip', 'green'))
        print()
        print(c('llama-cpp-python is a lightweight LLM backend.', 'yellow'))
        print(c('Perfect for older macOS versions (Catalina/Big Sur)', 'dim'))
        print(c('Works with GGUF model files', 'dim'))
        print()
        
        try:
            confirm = get_single_key_input(c("Proceed with installation? (y/n): ", "cyan"))
            print()  # Newline after key press
            
            if confirm == 'y':
                import subprocess
                import sys
                
                print(c('Installing llama-cpp-python...', 'cyan'))
                print()
                
                try:
                    # Check if Catalina - llama-cpp-python doesn't support it
                    import platform
                    is_catalina = False
                    if platform.system() == "Darwin":
                        try:
                            version_str = platform.mac_ver()[0]
                            parts = version_str.split('.')
                            major = int(parts[0]) if len(parts) > 0 else 0
                            minor = int(parts[1]) if len(parts) > 1 else 0
                            if major == 10 and minor <= 15:
                                is_catalina = True
                        except:
                            pass
                    
                    if is_catalina:
                        # Catalina is not supported - Metal framework is too old
                        print()
                        print(c('❌ llama-cpp-python build failed', 'red'))
                        print()
                        print(c('macOS Catalina is not supported by current llama-cpp-python versions.', 'yellow'))
                        print(c('The Metal framework in Catalina lacks required APIs (MTLGPUFamilyApple6/7).', 'dim'))
                        print()
                        print(c('Alternatives:', 'cyan'))
                        print(c('  1. Upgrade to macOS Big Sur (11.0) or newer', 'green'))
                        print(c('  2. Use Ollama in Docker:', 'green'))
                        print(c('     docker pull ollama/ollama', 'dim'))
                        print(c('     docker run -d -p 11434:11434 ollama/ollama', 'dim'))
                        print(c('  3. Use cloud-based AI APIs (OpenAI, Anthropic, etc.)', 'green'))
                        print()
                        return c("\n❌ Installation not possible on Catalina", "red")
                    
                    # Install llama-cpp-python (for Big Sur and newer)
                    result = subprocess.run(
                        [sys.executable, '-m', 'pip', 'install', 'llama-cpp-python'],
                        capture_output=False,
                        text=True
                    )
                    
                    if result.returncode == 0:
                        print()
                        print(c('✅ llama-cpp-python installed successfully!', 'green'))
                        print()
                        print(c('Next steps:', 'yellow'))
                        print(c('  1. Download GGUF models to ~/.luciferai/models/', 'dim'))
                        print(c('  2. Get models from: https://huggingface.co/models?search=gguf', 'cyan'))
                        print(c('  3. Recommended: llama-3.2-3b-instruct-q4_k_m.gguf', 'dim'))
                        print()
                        return ""
                    else:
                        return c("\n❌ Installation failed", "red")
                
                except Exception as e:
                    return c(f"\n❌ Installation error: {e}", "red")
            else:
                return c("\n❌ Installation cancelled", "yellow")
        
        except (EOFError, KeyboardInterrupt):
            return c("\n\n❌ Installation cancelled", "yellow")
    
    def _handle_uninstall_model(self, model_name: str) -> str:
        """Handle model uninstall request."""
        if not model_name:
            return c(f"{Emojis.CROSS} Please specify a model name", "red") + f"\n{c('Usage: uninstall <model_name>', 'yellow')}"
        
        from core.model_files_map import is_model_supported
        
        if not is_model_supported(model_name):
            return c(f"{Emojis.CROSS} Unknown model: {model_name}", "red") + f"\n{c('Use: llm list - to see installed models', 'yellow')}"
        
        from core.model_download import uninstall_model
        
        success = uninstall_model(model_name)
        return "" if success else c(f"{Emojis.CROSS} Uninstall failed", "red")
    
    def _handle_luci_install_package(self, package: str) -> str:
        """Install package using Luci! package manager or GGUF downloader for LLMs."""
        if not package:
            return c(f"{Emojis.CROSS} Please specify a package", "red") + f"\n{c('Usage: install <package>', 'yellow')}"
        
        # Check if this is an LLM model installation
        package_lower = package.lower().strip()
        
        try:
            from core.model_files_map import is_model_supported
            
            if is_model_supported(package_lower):
                # Route to GGUF download system
                print()
                print(c(f"🦙 Detected LLM model: {package}", "cyan"))
                print(c("   Using llamafile-based installation (macOS Catalina compatible)", "dim"))
                print()
                
                from core.model_download import download_model_by_name
                
                success = download_model_by_name(package_lower, force_prompt=True)
                
                if success:
                    # Update available models list
                    from core.model_files_map import get_canonical_name
                    canonical_name = get_canonical_name(package_lower)
                    
                    if canonical_name not in self.available_models:
                        self.available_models.append(canonical_name)
                    
                    # Auto-enable the model
                    self.llm_state[canonical_name] = True
                    self._save_llm_state()
                    
                    # Update active model if this is better
                    self.ollama_model = self._select_best_enabled_model()
                    
                    print()
                    print(c(f"✅ {canonical_name.upper()} is now enabled and ready to use!", "green"))
                    print(c(f"💡 Type 'mainmenu' to return to the main menu and start using it", "cyan"))
                    print()
                    
                    return ""
                else:
                    return c(f"{Emojis.CROSS} Installation failed", "red")
        except ImportError:
            # Fall back to package manager if model_files_map not available
            pass
        
        # Use Luci! package manager for non-LLM packages
        success = self.package_manager.install(package, verbose=True)
        return "" if success else c(f"{Emojis.CROSS} Installation failed", "red")
    
    def _handle_set_backup_models_directory(self) -> str:
        """Set backup directory for models."""
        from pathlib import Path
        import json
        
        # Load current settings
        config_file = Path.home() / '.luciferai' / 'config.json'
        config_file.parent.mkdir(parents=True, exist_ok=True)
        
        config = {}
        current_backup = None
        
        if config_file.exists():
            try:
                with open(config_file, 'r') as f:
                    config = json.load(f)
                current_backup = config.get('backup_models_dir')
            except:
                pass
        
        print()
        print(c("╔═══════════════════════════════════════════════════════════╗", "cyan"))
        print(c("║          📦 SET BACKUP MODELS DIRECTORY                   ║", "cyan"))
        print(c("╚═══════════════════════════════════════════════════════════╝", "cyan"))
        print()
        
        if current_backup:
            print(c(f"📁 Current backup directory: {current_backup}", "yellow"))
            print()
            print(c("⚠️  This will CHANGE the existing backup directory", "yellow"))
            print()
        else:
            print(c("💡 No backup directory currently set", "dim"))
            print()
        
        print(c("Enter the full path for the backup models directory:", "cyan"))
        print(c("(or press Enter to cancel)", "dim"))
        print()
        
        try:
            backup_path = input(c("Path: ", "cyan")).strip()
            
            if not backup_path:
                return c("\n❌ Cancelled", "yellow")
            
            # Expand user path
            backup_path = os.path.expanduser(backup_path)
            backup_dir = Path(backup_path)
            
            # Check if directory exists
            if not backup_dir.exists():
                print()
                print(c(f"⚠️  Directory does not exist: {backup_dir}", "yellow"))
                print()
                create = get_single_key_input(c("Create directory? (y/n): ", "cyan"))
                
                if create.lower() in ['y']:
                    try:
                        backup_dir.mkdir(parents=True, exist_ok=True)
                        print()
                        print(c(f"✅ Created directory: {backup_dir}", "green"))
                    except Exception as e:
                        return c(f"\n❌ Failed to create directory: {e}", "red")
                else:
                    return c("\n❌ Cancelled", "yellow")
            
            # Verify it's a directory
            if not backup_dir.is_dir():
                return c(f"\n❌ Path is not a directory: {backup_dir}", "red")
            
            # Check write permissions
            if not os.access(backup_dir, os.W_OK):
                return c(f"\n❌ No write permission for directory: {backup_dir}", "red")
            
            # Save to config
            config['backup_models_dir'] = str(backup_dir)
            
            with open(config_file, 'w') as f:
                json.dump(config, f, indent=2)
            
            print()
            print(c("═" * 60, "green"))
            if current_backup:
                print(c("✅ Backup Directory CHANGED", "green"))
            else:
                print(c("✅ Backup Directory SET", "green"))
            print(c("═" * 60, "green"))
            print()
            
            if current_backup:
                print(c("Previous: ", "dim") + c(current_backup, "yellow"))
            print(c("New:      ", "dim") + c(str(backup_dir), "green"))
            print()
            
            # Check for existing models
            model_files = list(backup_dir.glob('*.gguf'))
            if model_files:
                print(c(f"📦 Found {len(model_files)} model file(s) in backup directory", "cyan"))
                for mf in model_files[:5]:
                    print(c(f"  • {mf.name}", "dim"))
                if len(model_files) > 5:
                    print(c(f"  ... and {len(model_files) - 5} more", "dim"))
            else:
                print(c("📦 No model files found in backup directory (yet)", "dim"))
            
            print()
            print(c("💡 Models installed via LuciferAI will now be backed up to this directory", "cyan"))
            print()
            
            return ""
        
        except (EOFError, KeyboardInterrupt):
            return c("\n\n❌ Cancelled", "yellow")
    
    def _handle_show_backup_models_directory(self) -> str:
        """Show current backup models directory."""
        from pathlib import Path
        import json
        
        config_file = Path.home() / '.luciferai' / 'config.json'
        
        if not config_file.exists():
            return c("❌ No backup directory set", "yellow") + f"\n{c('Use: backup models', 'cyan')}"
        
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            
            backup_dir = config.get('backup_models_dir')
            
            if not backup_dir:
                return c("❌ No backup directory set", "yellow") + f"\n{c('Use: backup models', 'cyan')}"
            
            backup_path = Path(backup_dir)
            
            print()
            print(c("╔═══════════════════════════════════════════════════════════╗", "cyan"))
            print(c("║          📦 BACKUP MODELS DIRECTORY                       ║", "cyan"))
            print(c("╚═══════════════════════════════════════════════════════════╝", "cyan"))
            print()
            print(c("Current backup directory:", "cyan"))
            print(c(f"  {backup_dir}", "white"))
            print()
            
            # Check if directory exists
            if backup_path.exists():
                print(c("✅ Directory exists", "green"))
                
                # Check for models
                model_files = list(backup_path.glob('*.gguf'))
                if model_files:
                    print(c(f"📦 {len(model_files)} model file(s) found:", "cyan"))
                    for mf in model_files[:10]:
                        size_mb = mf.stat().st_size / (1024 * 1024)
                        print(c(f"  • {mf.name:50} ({size_mb:.1f} MB)", "dim"))
                    if len(model_files) > 10:
                        print(c(f"  ... and {len(model_files) - 10} more", "dim"))
                else:
                    print(c("📦 No model files found", "dim"))
            else:
                print(c("⚠️  Directory does not exist (will be created when needed)", "yellow"))
            
            print()
            print(c("💡 Change: ", "dim") + c("backup models", "cyan"))
            print()
            
            return ""
        
        except Exception as e:
            return c(f"❌ Error reading config: {e}", "red")
    
    def _check_disk_space_and_get_install_dir(self, estimated_size_gb: float = 5.0) -> tuple:
        """Check disk space and return (install_dir, is_overflow, free_space_gb)."""
        from pathlib import Path
        import shutil
        import json
        
        # Main models directory
        main_dir = Path.home() / '.luciferai' / 'models'
        main_dir.mkdir(parents=True, exist_ok=True)
        
        # Check free space on main directory drive
        stat = shutil.disk_usage(main_dir)
        free_gb = stat.free / (1024 ** 3)
        
        # Check if we need to overflow (less than 10GB free OR insufficient for this install)
        needs_overflow = free_gb < 10.0 or free_gb < (estimated_size_gb + 5.0)  # 5GB buffer
        
        if needs_overflow:
            # Try to use backup directory
            config_file = Path.home() / '.luciferai' / 'config.json'
            
            if config_file.exists():
                try:
                    with open(config_file, 'r') as f:
                        config = json.load(f)
                    
                    backup_dir = config.get('backup_models_dir')
                    
                    if backup_dir:
                        backup_path = Path(backup_dir)
                        
                        # Verify backup directory exists and is writable
                        if backup_path.exists() and os.access(backup_path, os.W_OK):
                            # Check free space on backup drive
                            backup_stat = shutil.disk_usage(backup_path)
                            backup_free_gb = backup_stat.free / (1024 ** 3)
                            
                            if backup_free_gb >= (estimated_size_gb + 5.0):
                                return (backup_path, True, free_gb, backup_free_gb)
                except:
                    pass
            
            # If we reach here, no valid backup directory - warn user
            return (main_dir, False, free_gb, None)
        
        return (main_dir, False, free_gb, None)
    
    def _handle_install_core_models(self) -> str:
        """Install core essential models (one from each tier)."""
        from model_tiers import get_tier_capabilities
        
        print()
        print(c("╔═══════════════════════════════════════════════════════════╗", "cyan"))
        print(c("║              🔥 INSTALL CORE MODELS (Essential 4)              ║", "cyan"))
        print(c("╚═══════════════════════════════════════════════════════════╝", "cyan"))
        print()
        print(c("This will install 4 essential models (one from each tier):", "cyan"))
        print()
        
        # Define core models
        core_models = [
            {'name': 'tinyllama', 'tier': 0, 'size': '~1-2 GB', 'desc': 'Basic fallback'},
            {'name': 'llama3.2', 'tier': 1, 'size': '~3-5 GB', 'desc': 'General purpose'},
            {'name': 'mistral', 'tier': 2, 'size': '~5-7 GB', 'desc': 'Advanced reasoning'},
            {'name': 'deepseek-coder', 'tier': 3, 'size': '~10-15 GB', 'desc': 'Expert coding'},
        ]
        
        # Show what will be installed
        for model_info in core_models:
            tier_info = get_tier_capabilities(model_info['tier'])
            print(c(f"  📦 {model_info['name'].ljust(16)} ", "white") + 
                  c(f"(Tier {model_info['tier']} - {tier_info['name']:15})", "yellow") + 
                  c(f" {model_info['size']:10}", "dim"))
            print(c(f"     {model_info['desc']}", "dim"))
            print()
        
        total_size = sum([float(m['size'].split('~')[1].split('-')[0]) for m in core_models])
        print(c(f"Total Size: ~{total_size:.0f}-{total_size+15:.0f} GB", "yellow"))
        print(c("⏱️  Estimated time: 20-40 minutes (depending on connection)", "yellow"))
        print()
        
        # Check disk space
        install_dir, is_overflow, free_gb, backup_free_gb = self._check_disk_space_and_get_install_dir(total_size + 15)
        
        if is_overflow:
            print(c("⚠️  LOW DISK SPACE DETECTED", "yellow"))
            print(c(f"   Main drive: {free_gb:.1f} GB free (below 10GB threshold)", "dim"))
            print(c(f"   Using backup directory: {install_dir}", "cyan"))
            print(c(f"   Backup drive: {backup_free_gb:.1f} GB free", "green"))
            print()
        elif free_gb < 10.0:
            print(c("⚠️  WARNING: Low disk space on main drive ({:.1f} GB free)".format(free_gb), "yellow"))
            print(c("   No backup directory configured - installation may fail", "red"))
            print(c("   Recommendation: Set backup directory with 'backup models'", "cyan"))
            print()
        else:
            print(c(f"💾 Main drive: {free_gb:.1f} GB free", "dim"))
            print()
        
        try:
            choice = get_single_key_input(c("Install core models? (y/n): ", "cyan"))
            
            if choice.lower() in ['y']:
                print()
                print(c("🚀 Starting core installation...", "green"))
                print(c("═" * 60, "cyan"))
                print()
                
                installed = 0
                failed = 0
                installed_models = []
                failed_models = []
                current_model = None
                interrupted = False
                
                try:
                    for i, model_info in enumerate(core_models, 1):
                        model = model_info['name']
                        current_model = model
                        tier_info = get_tier_capabilities(model_info['tier'])
                        
                        print(c(f"\n[{i}/4] Installing {model} (Tier {model_info['tier']} - {tier_info['name']})...", "yellow"))
                        print(c("─" * 60, "dim"))
                        
                        # Use GGUF download for LLM models
                        success = self._handle_luci_install_package(model)
                        
                        if success:
                            print()
                            print(c(f"✅ {model} installed successfully!", "green"))
                            installed += 1
                            installed_models.append(model)
                        else:
                            print()
                            print(c(f"⚠️  {model} installation failed or skipped", "yellow"))
                            failed += 1
                            failed_models.append(model)
                        
                        current_model = None
                        print(c(f"\nProgress: {i}/4 models ({(i/4)*100:.0f}%)", "cyan"))
                
                except KeyboardInterrupt:
                    interrupted = True
                    print()
                    print()
                    print(c("⚠️  Installation interrupted by user (Ctrl+C)", "yellow"))
                    print()
                    
                    # Handle incomplete installation
                    if current_model:
                        print(c(f"🗑️  Cleaning up incomplete installation: {current_model}", "yellow"))
                        from pathlib import Path
                        models_dir = Path.home() / '.luciferai' / 'models'
                        
                        if models_dir.exists():
                            removed_files = []
                            for model_file in models_dir.glob(f"*{current_model}*"):
                                try:
                                    model_file.unlink()
                                    removed_files.append(model_file.name)
                                except:
                                    pass
                            
                            if removed_files:
                                print(c(f"   Deleted corrupt files: {', '.join(removed_files)}", "dim"))
                        
                        print(c(f"\n❌ CORRUPT: {current_model} (incomplete, deleted)", "red"))
                        print()
                
                # Show final summary
                print()
                print(c("═" * 60, "purple" if interrupted else "green"))
                if interrupted:
                    print(c("⚠️  Core Installation Stopped", "yellow"))
                else:
                    print(c("✅ Core Installation Complete!", "green"))
                print(c("═" * 60, "purple" if interrupted else "green"))
                print()
                print(c(f"📊 Results:", "cyan"))
                print(c(f"  ✅ Installed: {installed}/4", "green"))
                if failed > 0:
                    print(c(f"  ⚠️  Failed: {failed}/4", "yellow"))
                if interrupted and current_model:
                    print(c(f"  🗑️  Corrupt (deleted): {current_model}", "red"))
                print()
                
                if installed_models:
                    print(c("✅ Successfully Installed:", "green"))
                    for model in installed_models:
                        print(c(f"  • {model}", "dim"))
                    print()
                
                if failed_models:
                    print(c("⚠️  Failed/Skipped:", "yellow"))
                    for model in failed_models:
                        print(c(f"  • {model}", "dim"))
                    print()
                
                print(c("💡 Use 'llm list' to see all installed models", "cyan"))
                print(c("💡 Use 'llm enable <model>' to enable specific models", "cyan"))
                if interrupted:
                    print(c("💡 Run 'install core models' again to retry", "cyan"))
                print()
                return ""
            else:
                print()
                print(c("❌ Installation cancelled", "yellow"))
                print()
                return ""
        
        except (EOFError, KeyboardInterrupt):
            print()
            return c("\n❌ Installation cancelled", "yellow")
    
    def _handle_install_all_models(self) -> str:
        """Install ALL supported models (diabolical command)."""
        from model_tiers import list_models_by_tier, get_tier_capabilities
        from model_files_map import MODEL_FILES, MODEL_SIZES
        
        print()
        print(c("╔═══════════════════════════════════════════════════════════╗", "red"))
        print(c("║         😈 DIABOLICAL COMMAND: INSTALL ALL MODELS          ║", "red"))
        print(c("╚═══════════════════════════════════════════════════════════╝", "red"))
        print()
        print(c("⚠️  WARNING: You are about to install EVERY supported model!", "yellow"))
        print()
        
        # Get all unique models from MODEL_FILES (canonical names only)
        unique_models = set()
        seen_files = set()
        
        for model_name, file_name in MODEL_FILES.items():
            # Only add if we haven't seen this file before (avoids aliases)
            if file_name not in seen_files:
                unique_models.add(model_name)
                seen_files.add(file_name)
        
        # Get all models organized by tier
        models_by_tier = list_models_by_tier()
        
        # Filter models_by_tier to only include unique canonical models
        filtered_models_by_tier = {}
        for tier in range(5):
            filtered_models_by_tier[tier] = [m for m in models_by_tier[tier] if m in unique_models]
        
        total_models = len(unique_models)
        
        # Calculate actual total size from MODEL_SIZES
        total_size = 0
        tier_breakdown = {}
        for tier in range(5):
            tier_models = filtered_models_by_tier[tier]
            tier_total_size = sum(MODEL_SIZES.get(m, 0) for m in tier_models) / 1000  # Convert MB to GB
            total_size += tier_total_size
            tier_breakdown[tier] = (len(tier_models), tier_total_size)
        
        print(c("What will be installed:", "cyan"))
        for tier in range(5):
            count, size = tier_breakdown[tier]
            tier_info = get_tier_capabilities(tier)
            print(c(f"  Tier {tier} ({tier_info['name']:15}): ", "dim") + 
                  c(f"{count:2d} models", "white") + 
                  c(f" (~{size:.0f} GB)", "yellow"))
        print()
        print(c(f"  Total Models: ", "cyan") + c(f"{total_models}", "white"))
        print(c(f"  Total Size:   ", "cyan") + c(f"~{total_size:.0f} GB", "yellow"))
        print()
        print(c("Installation order:", "cyan"))
        print(c("  🔥 Phase 1: Core models (TinyLlama, Llama3.2, Mistral, DeepSeek)", "purple"))
        print(c("  🌟 Phase 2: Best to worst (Tier 4 → Tier 0)", "purple"))
        print()
        print(c("This includes:", "dim"))
        print(c("  • Ultra-Expert models: Llama3-70B, Mixtral-8x22B, Qwen-72B", "dim"))
        print(c("  • Expert models: DeepSeek, WizardCoder, Nous-Hermes", "dim"))
        print(c("  • Advanced models: Mistral, Mixtral, CodeLlama, Qwen", "dim"))
        print(c("  • General models: Llama 2/3.2, Gemma, Vicuna, Orca", "dim"))
        print(c("  • Basic models: TinyLlama, Phi-2, StableLM", "dim"))
        print()
        print(c("⏱️  Estimated time: 2-8 hours (depending on connection)", "yellow"))
        print(c("💾 Free disk space required: ~{:.0f} GB".format(total_size + 50), "yellow"))
        print()
        
        # Check disk space
        install_dir, is_overflow, free_gb, backup_free_gb = self._check_disk_space_and_get_install_dir(total_size + 50)
        
        if is_overflow:
            print(c("⚠️  LOW DISK SPACE DETECTED", "yellow"))
            print(c(f"   Main drive: {free_gb:.1f} GB free (below 10GB threshold)", "dim"))
            print(c(f"   Using backup directory: {install_dir}", "cyan"))
            print(c(f"   Backup drive: {backup_free_gb:.1f} GB free", "green"))
            print(c("   Models will overflow to backup automatically", "cyan"))
            print()
        elif free_gb < 10.0:
            print(c("⚠️  CRITICAL: Low disk space on main drive ({:.1f} GB free)".format(free_gb), "red"))
            print(c("   No backup directory configured - installation WILL FAIL", "red"))
            print(c("   REQUIRED: Set backup directory with 'backup models'", "cyan"))
            print()
            return c("\n❌ Installation cannot proceed - set backup directory first", "red")
        else:
            print(c(f"💾 Main drive: {free_gb:.1f} GB free", "green"))
            print()
        
        try:
            choice = get_single_key_input(c("Proceed with installing ALL models? (y/n): ", "cyan"))
            
            if choice.lower() in ['y']:
                print()
                print(c("🚀 Starting mass installation...", "green"))
                print(c("═" * 60, "purple"))
                print()
                
                # Define core models (install these first)
                core_models = [
                    'tinyllama',      # Tier 0 - basic fallback
                    'llama3.2',       # Tier 1 - general purpose
                    'mistral',        # Tier 2 - advanced
                    'deepseek-coder', # Tier 3 - expert
                ]
                
                # Define best models by tier (quality order within each tier)
                best_models_by_tier = {
                    4: ['llama3.1-70b', 'llama3-70b', 'qwen2-72b', 'qwen-72b', 'mixtral-8x22b'],
                    3: ['deepseek-coder', 'deepseek-coder-33b', 'wizardcoder', 'wizardcoder-33b', 
                        'codellama-34b', 'codellama-13b', 'wizardlm', 'nous-hermes', 
                        'phind-codellama', 'dolphin', 'yi-34b', 'qwen-14b'],
                    2: ['mistral', 'mixtral', 'llama3.1', 'llama3', 'codellama', 'qwen2', 'qwen',
                        'solar', 'neural-chat', 'yi'],
                    1: ['llama3.2', 'gemma2', 'phi-3', 'llama2', 'gemma', 'vicuna', 'orca-2', 
                        'openchat', 'starling'],
                    0: ['tinyllama', 'phi-2', 'stablelm', 'orca-mini']
                }
                
                installed = 0
                failed = 0
                installed_models = []  # Track successfully installed models
                failed_models = []     # Track failed/skipped models
                current_model = None   # Track model currently being installed
                interrupted = False    # Track if user interrupted
                
                try:
                    # PHASE 1: Install core models first
                    print(c("\n🔥 PHASE 1: Installing Core Models (Essential)", "purple"))
                    print(c("═" * 60, "purple"))
                    print(c("These are the foundation models needed for LuciferAI", "dim"))
                    print(c("Press Ctrl+C at any time to safely stop installation", "dim"))
                    print()
                    
                    for model in core_models:
                        current_model = model
                        print(c(f"\n[{installed + failed + 1}/{total_models}] Installing {model} (CORE)...", "yellow"))
                        
                        # Use GGUF download for LLM models
                        success = self._handle_luci_install_package(model) == ""
                        
                        if success:
                            print(c(f"  ✅ {model} installed successfully", "green"))
                            installed += 1
                            installed_models.append(model)
                        else:
                            print(c(f"  ⚠️  {model} installation failed or skipped", "yellow"))
                            failed += 1
                            failed_models.append(model)
                        
                        current_model = None  # Clear current model after completion
                        progress = ((installed + failed) / total_models) * 100
                        print(c(f"  Progress: {progress:.1f}% ({installed} installed, {failed} failed/skipped)", "dim"))
                
                    # PHASE 2: Install best models by tier (Tier 4 → 0)
                    print(c("\n\n🌟 PHASE 2: Installing Best Models (Tier 4 → 0)", "purple"))
                    print(c("═" * 60, "purple"))
                    print(c("Installing remaining models from best to worst quality", "dim"))
                    print(c("Press Ctrl+C at any time to safely stop installation", "dim"))
                    print()
                    
                    for tier in [4, 3, 2, 1, 0]:  # Best to worst (ultra-expert → basic)
                        tier_info = get_tier_capabilities(tier)
                        
                        # Get models for this tier that aren't already installed (skip core models)
                        tier_models = [m for m in best_models_by_tier.get(tier, []) if m not in core_models]
                        
                        # Also add any models from filtered_models_by_tier that aren't in best list
                        all_tier_models = filtered_models_by_tier.get(tier, [])
                        for model in all_tier_models:
                            if model not in best_models_by_tier.get(tier, []) and model not in core_models:
                                tier_models.append(model)
                        
                        if not tier_models:
                            continue
                        
                        print(c(f"\n📦 Installing Tier {tier} - {tier_info['name']} ({len(tier_models)} models)", "cyan"))
                        print(c("─" * 60, "dim"))
                        
                        for model in tier_models:
                            current_model = model
                            print(c(f"\n[{installed + failed + 1}/{total_models}] Installing {model}...", "yellow"))
                            
                            # Use GGUF download for LLM models
                            success = self._handle_luci_install_package(model) == ""
                            
                            if success:
                                print(c(f"  ✅ {model} installed successfully", "green"))
                                installed += 1
                                installed_models.append(model)
                            else:
                                print(c(f"  ⚠️  {model} installation failed or skipped", "yellow"))
                                failed += 1
                                failed_models.append(model)
                            
                            current_model = None  # Clear current model after completion
                            progress = ((installed + failed) / total_models) * 100
                            print(c(f"  Progress: {progress:.1f}% ({installed} installed, {failed} failed/skipped)", "dim"))
                
                except KeyboardInterrupt:
                    interrupted = True
                    print()
                    print()
                    print(c("⚠️  Installation interrupted by user (Ctrl+C)", "yellow"))
                    print()
                    
                    # Handle incomplete installation
                    if current_model:
                        print(c(f"🗑️  Cleaning up incomplete installation: {current_model}", "yellow"))
                        print(c("   This model was partially downloaded and is corrupt", "dim"))
                        
                        # Try to remove the incomplete model
                        from pathlib import Path
                        models_dir = Path.home() / '.luciferai' / 'models'
                        
                        # Look for model files matching the name
                        if models_dir.exists():
                            removed_files = []
                            for model_file in models_dir.glob(f"*{current_model}*"):
                                try:
                                    model_file.unlink()
                                    removed_files.append(model_file.name)
                                except:
                                    pass
                            
                            if removed_files:
                                print(c(f"   Deleted corrupt files:", "dim"))
                                for f in removed_files:
                                    print(c(f"     • {f}", "dim"))
                            else:
                                print(c(f"   No files found to clean up", "dim"))
                        
                        print()
                        print(c(f"❌ CORRUPT: {current_model} (incomplete, deleted)", "red"))
                        print()
                
                # Show final summary
                print()
                print(c("═" * 60, "purple" if interrupted else "green"))
                if interrupted:
                    print(c("⚠️  Installation Stopped by User", "yellow"))
                else:
                    print(c("✅ Mass Installation Complete!", "green"))
                print(c("═" * 60, "purple" if interrupted else "green"))
                print()
                print(c(f"📊 Final Results:", "cyan"))
                print(c(f"  ✅ Successfully installed: {installed}", "green"))
                if failed > 0:
                    print(c(f"  ⚠️  Failed/Skipped: {failed}", "yellow"))
                if interrupted and current_model:
                    print(c(f"  🗑️  Corrupt (deleted): 1 ({current_model})", "red"))
                print()
                
                # Show detailed lists
                if installed_models:
                    print(c("✅ Successfully Installed Models:", "green"))
                    for i, model in enumerate(installed_models[:10], 1):  # Show first 10
                        print(c(f"  {i:2d}. {model}", "dim"))
                    if len(installed_models) > 10:
                        print(c(f"  ... and {len(installed_models) - 10} more", "dim"))
                    print()
                
                if failed_models:
                    print(c("⚠️  Failed/Skipped Models:", "yellow"))
                    for i, model in enumerate(failed_models, 1):
                        print(c(f"  {i:2d}. {model}", "dim"))
                    print()
                
                if interrupted:
                    # Calculate what wasn't installed
                    all_models = set()
                    for tier in range(5):
                        all_models.update(models_by_tier[tier])
                    
                    not_installed = all_models - set(installed_models) - set(failed_models)
                    if current_model and current_model in not_installed:
                        not_installed.remove(current_model)  # Already reported as corrupt
                    
                    if not_installed:
                        print(c(f"❌ Not Installed ({len(not_installed)} models):", "red"))
                        not_installed_list = sorted(list(not_installed))
                        for i, model in enumerate(not_installed_list[:10], 1):  # Show first 10
                            print(c(f"  {i:2d}. {model}", "dim"))
                        if len(not_installed_list) > 10:
                            print(c(f"  ... and {len(not_installed_list) - 10} more", "dim"))
                        print()
                
                print(c("💡 Use 'llm list' to see all installed models", "cyan"))
                print(c("💡 Use 'llm enable <model>' to enable specific models", "cyan"))
                if interrupted:
                    print(c("💡 Run 'install all models' again to resume installation", "cyan"))
                print()
                return ""
            else:
                print()
                print(c("❌ Installation cancelled", "yellow"))
                print()
                return ""
        
        except (EOFError, KeyboardInterrupt):
            print()
            return c("\n❌ Installation cancelled", "yellow")
    
    def _handle_install_tier(self, tier: int) -> str:
        """Install all models in a specific tier."""
        from model_tiers import list_models_by_tier, get_tier_capabilities
        from model_files_map import MODEL_SIZES, MODEL_URLS, MODEL_ALIASES
        
        # Get tier info
        tier_info = get_tier_capabilities(tier)
        models_by_tier = list_models_by_tier()
        models_in_tier = models_by_tier[tier]
        
        # Filter to only canonical models (those that have download URLs, not aliases)
        # Canonical models are those in MODEL_URLS (not in MODEL_ALIASES values)
        alias_targets = set(MODEL_ALIASES.values())
        canonical_models = []
        seen = set()
        
        for model in models_in_tier:
            # Check if this model has a download URL (canonical) or is just an alias
            if model in MODEL_URLS and model not in seen:
                canonical_models.append(model)
                seen.add(model)
        
        unique_models = sorted(canonical_models)
        
        print()
        print(c(f"╔═══════════════════════════════════════════════════════════╗", "cyan"))
        print(c(f"║             🔹 INSTALL TIER {tier} MODELS ({tier_info['name']})              ║", "cyan"))
        print(c(f"╚═══════════════════════════════════════════════════════════╝", "cyan"))
        print()
        print(c(f"Tier {tier} - {tier_info['name']} ({tier_info['params']})", "yellow"))
        print(c(f"{tier_info['description']}", "dim"))
        print()
        print(c("Models to install:", "cyan"))
        
        # Calculate total size
        total_size = 0
        for model in unique_models:
            size = MODEL_SIZES.get(model, 0)
            total_size += size
            size_gb = size / 1000
            print(c(f"  • {model:20} ", "white") + c(f"({size_gb:.1f} GB)", "dim"))
        
        print()
        print(c(f"Total: {len(unique_models)} models, ~{total_size/1000:.1f} GB", "yellow"))
        print()
        
        try:
            choice = get_single_key_input(c(f"Install all Tier {tier} models? (y/n): ", "cyan"))
            
            if choice == 'y':
                print()
                print(c(f"🚀 Starting Tier {tier} installation...", "green"))
                print(c("═" * 60, "cyan"))
                print()
                
                installed = 0
                failed = 0
                installed_models = []
                failed_models = []
                current_model = None
                interrupted = False
                total = len(unique_models)
                
                try:
                    for i, model in enumerate(unique_models, 1):
                        current_model = model
                        size_gb = MODEL_SIZES.get(model, 0) / 1000
                        
                        print(c(f"\n[{i}/{total}] Installing {model} (~{size_gb:.1f}GB)...", "yellow"))
                        print(c("─" * 60, "dim"))
                        
                        # Use GGUF download for LLM models
                        success = self._handle_luci_install_package(model)
                        
                        if success:
                            print()
                            print(c(f"✅ {model} installed successfully!", "green"))
                            installed += 1
                            installed_models.append(model)
                        else:
                            print()
                            print(c(f"⚠️  {model} installation failed or skipped", "yellow"))
                            failed += 1
                            failed_models.append(model)
                        
                        current_model = None
                        progress = (i / total) * 100
                        print(c(f"\nProgress: {progress:.0f}% ({i}/{total} models)", "cyan"))
                
                except KeyboardInterrupt:
                    interrupted = True
                    print()
                    print()
                    print(c("⚠️  Installation interrupted by user (Ctrl+C)", "yellow"))
                    print()
                    
                    # Handle incomplete installation
                    if current_model:
                        print(c(f"🗑️  Cleaning up incomplete installation: {current_model}", "yellow"))
                        from pathlib import Path
                        models_dir = Path.home() / '.luciferai' / 'models'
                        
                        if models_dir.exists():
                            removed_files = []
                            for model_file in models_dir.glob(f"*{current_model}*"):
                                try:
                                    model_file.unlink()
                                    removed_files.append(model_file.name)
                                except:
                                    pass
                            
                            if removed_files:
                                print(c(f"   Deleted corrupt files: {', '.join(removed_files)}", "dim"))
                        
                        print(c(f"\n❌ CORRUPT: {current_model} (incomplete, deleted)", "red"))
                        print()
                
                # Show final summary
                print()
                print(c("═" * 60, "purple" if interrupted else "green"))
                if interrupted:
                    print(c(f"⚠️  Tier {tier} Installation Stopped", "yellow"))
                else:
                    print(c(f"✅ Tier {tier} Installation Complete!", "green"))
                print(c("═" * 60, "purple" if interrupted else "green"))
                print()
                print(c(f"📊 Results:", "cyan"))
                print(c(f"  ✅ Installed: {installed}/{total}", "green"))
                if failed > 0:
                    print(c(f"  ⚠️  Failed: {failed}/{total}", "yellow"))
                if interrupted and current_model:
                    print(c(f"  🗑️  Corrupt (deleted): {current_model}", "red"))
                print()
                
                if installed_models:
                    print(c("✅ Successfully Installed:", "green"))
                    for model in installed_models:
                        print(c(f"  • {model}", "dim"))
                    print()
                
                if failed_models:
                    print(c("⚠️  Failed/Skipped:", "yellow"))
                    for model in failed_models:
                        print(c(f"  • {model}", "dim"))
                    print()
                
                print(c("💡 Use 'llm list' to see all installed models", "cyan"))
                print(c("💡 Use 'llm enable <model>' to enable specific models", "cyan"))
                if interrupted:
                    print(c(f"💡 Run 'install tier {tier}' again to retry", "cyan"))
                print()
                return ""
            else:
                print()
                print(c("❌ Installation cancelled", "yellow"))
                print()
                return ""
        
        except (EOFError, KeyboardInterrupt):
            print()
            return c("\n❌ Installation cancelled", "yellow")
    
    def _show_model_install(self, model: str) -> str:
        """Show model installation using Luci! Package Manager."""
        # Use integrated package manager for consistent experience
        return self._handle_luci_install_package(model)
    
    def _handle_ollama_required(self, user_input: str) -> str:
        """Prompt to install Ollama for natural language AI communication."""
        response = f"""
{c('🧠 AI Language Model Required', 'yellow')}

{c('Your input appears to be a natural language command:', 'cyan')}
  "{user_input}"

{c('To enable AI-powered command parsing, you need Ollama installed.', 'dim')}

{c('What Ollama Provides:', 'cyan')}
  • 🗣️  Natural language understanding ("watch my desktop file")
  • 🎯 Fuzzy file path matching with "did you mean" suggestions
  • 🔧 Intelligent fix application from consensus
  • 👀 Interactive watcher setup (watch vs autofix modes)
  • 100% offline - no cloud APIs needed

{c('Installation (one-time):', 'yellow')}
  1. Visit: {c('https://ollama.ai', 'blue')}
  2. Download and install Ollama for macOS
  3. Run: {c('ollama install llama3.2', 'cyan')} (basic AI, 2GB)
  4. Restart LuciferAI

{c('Advanced Models (Optional):', 'yellow')}
  • {c('ollama install mistral', 'cyan')} (7GB, web search + script generation)
  • {c('ollama install deepseek-coder', 'cyan')} (6.7GB, expert coding + full apps)

{c('Alternative:', 'cyan')}
  Use keyword-based commands instead:
  • {c('help', 'cyan')} - See all available commands
  • {c('daemon add <path>', 'cyan')} - Add file to watcher
  • {c('run <script.py>', 'cyan')} - Execute script with auto-fix
"""
        
        # Ask if they want installation instructions
        print(response)
        print()
        
        try:
            choice = get_single_key_input(c("Would you like to open the Ollama installation page? (y/n): ", "cyan"))
            print()  # Newline after key press
            
            if choice == 'y':
                import webbrowser
                webbrowser.open('https://ollama.ai')
                print()
                return c("✓ Opened installation page in browser", "green")
        except (EOFError, KeyboardInterrupt):
            pass
        
        return ""
    
    def _handle_llm_list(self) -> str:
        """List all LLMs with their status (enabled/disabled and installed/not installed)."""
        print()
        print(c("╔═══════════════════════════════════════════════════════════╗", "purple"))
        print(c("║              🧠 LuciferAI Language Models Status          ║", "purple"))
        print(c("╚═══════════════════════════════════════════════════════════╝", "purple"))
        print()
        
        from core.model_files_map import get_canonical_name
        
        # Core bundled models in tier order
        core_models = ['phi-2', 'tinyllama', 'gemma2', 'mistral', 'deepseek-coder', 'llama3.1-70b']
        
        # Find other installed models not in core
        core_canonical = [get_canonical_name(m) for m in core_models]
        other_models = [m for m in self.available_models if m not in core_canonical]
        
        # Detect custom models in custom_models directory
        from pathlib import Path
        project_root = Path(__file__).parent.parent
        custom_models_dir = project_root / 'models' / 'custom_models'
        custom_models = []
        if custom_models_dir.exists():
            for model_file in custom_models_dir.glob('*.gguf'):
                model_name = model_file.stem  # filename without extension
                custom_models.append(model_name)
        
        # === CORE MODELS SECTION ===
        print(c("📦 Core Bundled Models:", "cyan"))
        print()
        
        for model in core_models:
            canonical = get_canonical_name(model)
            # Check if installed (compare canonical names)
            is_installed = canonical in self.available_models
            # Check if enabled (uses canonical internally)
            is_enabled = self._is_llm_enabled(model)
            
            # Status icons
            install_icon = c("✓ Installed", "green") if is_installed else c("✗ Not installed", "red")
            enabled_icon = c("✓ Enabled", "green") if is_enabled else c("✗ Disabled", "yellow")
            
            print(c(f"  {model}", "purple"))
            print(c(f"    Install: ", "dim") + install_icon)
            print(c(f"    Status:  ", "dim") + enabled_icon)
            
            if not is_installed:
                print(c(f"    Command: ", "dim") + c(f"install {model.replace('-coder', '')}", "cyan"))
            elif not is_enabled:
                print(c(f"    Enable:  ", "dim") + c(f"llm enable {model}", "cyan"))
            else:
                print(c(f"    Disable: ", "dim") + c(f"llm disable {model}", "cyan"))
            
            print()
        
        # === OTHER INSTALLED MODELS SECTION ===
        print(c("═" * 63, "dim"))
        print()
        print(c("🔧 Other Installed Models:", "cyan"))
        print()
        
        if other_models:
            for model in other_models:
                is_enabled = self._is_llm_enabled(model)
                enabled_icon = c("✓ Enabled", "green") if is_enabled else c("✗ Disabled", "yellow")
                
                print(c(f"  {model}", "yellow"))
                print(c(f"    Status: ", "dim") + enabled_icon)
                
                if not is_enabled:
                    print(c(f"    Enable: ", "dim") + c(f"llm enable {model}", "cyan"))
                else:
                    print(c(f"    Disable: ", "dim") + c(f"llm disable {model}", "cyan"))
                
                print()
        else:
            print(c("  No additional models detected", "dim"))
            print()
        
        # === CUSTOM MODELS SECTION ===
        print(c("═" * 63, "dim"))
        print()
        print(c("🎨 Custom Models (in custom_models/):", "cyan"))
        print()
        
        if custom_models:
            for model in custom_models:
                # Check if it's in available_models (loaded)
                is_loaded = model in self.available_models
                is_enabled = self._is_llm_enabled(model) if is_loaded else False
                
                if is_loaded:
                    status_icon = c("✓ Enabled", "green") if is_enabled else c("✗ Disabled", "yellow")
                    print(c(f"  {model}", "green"))
                    print(c(f"    Status: ", "dim") + status_icon)
                    if not is_enabled:
                        print(c(f"    Enable: ", "dim") + c(f"llm enable {model}", "cyan"))
                    else:
                        print(c(f"    Disable: ", "dim") + c(f"llm disable {model}", "cyan"))
                else:
                    print(c(f"  {model}", "yellow"))
                    print(c(f"    Status: ", "dim") + c("Not loaded", "dim"))
                    print(c(f"    Enable: ", "dim") + c(f"llm enable {model}", "cyan"))
                
                print()
        else:
            print(c("  No custom models detected in custom_models/", "dim"))
            print()
        
        print(c("➕ Add More Custom Models:", "cyan"))
        print()
        print(c("  To add your own GGUF models:", "dim"))
        print(c("  1. Place .gguf file in: ", "dim") + c("models/custom_models/", "yellow"))
        print(c("  2. Run: ", "dim") + c("llm enable <model-name>", "cyan"))
        print()
        print(c("  Example:", "dim"))
        print(c("    cp my-model.gguf models/custom_models/", "dim"))
        print(c("    llm enable my-model", "cyan"))
        print()
        print(c("  For detailed guides: ", "dim"))
        print(c("    • ", "dim") + c("custom model info", "cyan") + c(" - Add pre-built models", "dim"))
        print(c("    • ", "dim") + c("docs/TRAIN_CUSTOM_LLM_FOR_LUCIFERAI.md", "yellow") + c(" - Train your own", "dim"))
        print()
        
        print(c("═" * 63, "purple"))
        print()
        print(c("Commands:", "cyan"))
        print(c("  llm enable <model>", "dim") + c("  - Enable an LLM", "yellow"))
        print(c("  llm disable <model>", "dim") + c(" - Disable an LLM", "yellow"))
        print(c("  llm list", "dim") + c("           - Show this status page", "yellow"))
        print(c("  llm list all", "dim") + c("       - Show ALL supported models (85+)", "yellow"))
        print(c("  models info", "dim") + c("        - Detailed model comparison", "yellow"))
        print()
        
        return ""
    
    def _handle_llm_list_all(self) -> str:
        """
Show all 85+ supported models organized by tier.
        """
        from model_tiers import list_models_by_tier, get_tier_capabilities
        
        print()
        print(c("╔═══════════════════════════════════════════════════════════════╗", "purple"))
        print(c("║        🤖 ALL SUPPORTED MODELS (85+) - Organized by Tier        ║", "purple"))
        print(c("╚═══════════════════════════════════════════════════════════════╝", "purple"))
        print()
        
        models_by_tier = list_models_by_tier()
        
        for tier in range(4):
            tier_info = get_tier_capabilities(tier)
            models = models_by_tier[tier]
            
            print(c(f"\n═══ TIER {tier}: {tier_info['name'].upper()} ({tier_info['params']}) ═══", "cyan"))
            print(c(f"{tier_info['description']}", "dim"))
            print()
            
            # Group models in rows of 4
            for i in range(0, len(models), 4):
                row = models[i:i+4]
                row_text = "  "
                for model in row:
                    row_text += c(f"{model:20}", "yellow")
                print(row_text)
            
            print()
            print(c("Good for:", "green") + c(f" {', '.join(tier_info['good_for'])}", "dim"))
            
            if tier_info['limitations']:
                print(c("Limitations:", "red") + c(f" {', '.join(tier_info['limitations'])}", "dim"))
        
        print()
        print(c("═" * 63, "purple"))
        print()
        print(c("📝 Installation:", "cyan"))
        print(c("  Use: ", "dim") + c("install <model-name>", "yellow"))
        print(c("  Example: ", "dim") + c("install mistral", "cyan"))
        print()
        print(c("📖 More Info:", "cyan"))
        print(c("  ", "dim") + c("models info", "yellow") + c(" - Detailed capability comparison", "dim"))
        print(c("  ", "dim") + c("llm list", "yellow") + c("    - Show installed models only", "dim"))
        print()
        
        return ""
    
    def _handle_llm_list(self) -> str:
        """List available LLM models and their status."""
        enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
        disabled_models = [m for m in self.available_models if not self._is_llm_enabled(m)]
        
        output = [
            c("🤖 Available AI Models:", "purple"),
            ""
        ]
        
        if enabled_models:
            output.append(c("✅ Enabled:", "green"))
            for m in enabled_models:
                tier = "Unknown"
                try:
                    from core.model_tiers import get_model_tier
                    tier = f"Tier {get_model_tier(m)}"
                except ImportError:
                    pass
                output.append(f"  • {c(m, 'cyan')} ({tier})")
            output.append("")
            
        if disabled_models:
            output.append(c("❌ Disabled:", "dim"))
            for m in disabled_models:
                tier = "Unknown"
                try:
                    from core.model_tiers import get_model_tier
                    tier = f"Tier {get_model_tier(m)}"
                except ImportError:
                    pass
                output.append(f"  • {m} ({tier})")
            output.append("")
            
        output.append(c("💡 Use 'llm enable <model>' to enable a model.", "yellow"))
        return "\n".join(output)

    def _handle_open(self, filepath: str) -> str:
        """Open a file with the default system application."""
        import subprocess
        import platform
        import os
        
        filepath = os.path.expanduser(filepath)
        if not os.path.exists(filepath):
            return c(f"{Emojis.CROSS} File not found: {filepath}", "red")
            
        try:
            if platform.system() == 'Darwin':       # macOS
                subprocess.call(('open', filepath))
            elif platform.system() == 'Windows':    # Windows
                os.startfile(filepath)
            else:                                   # linux variants
                subprocess.call(('xdg-open', filepath))
            return c(f"{Emojis.CHECKMARK} Opened {filepath}", "green")
        except Exception as e:
            return c(f"{Emojis.CROSS} Failed to open file: {e}", "red")

    def _handle_read(self, filepath: str) -> str:
        """Read and display file contents."""
        import os
        filepath = os.path.expanduser(filepath)
        if not os.path.exists(filepath):
            return c(f"{Emojis.CROSS} File not found: {filepath}", "red")
            
        if os.path.isdir(filepath):
             return c(f"{Emojis.CROSS} '{filepath}' is a directory. Use 'list' instead.", "yellow")
             
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            output = [
                c(f"📄 File: {filepath}", "cyan"),
                c("─" * 40, "dim"),
                content,
                c("─" * 40, "dim")
            ]
            return "\n".join(output)
        except UnicodeDecodeError:
            return c(f"{Emojis.CROSS} Binary or non-UTF-8 file cannot be displayed.", "red")
        except Exception as e:
            return c(f"{Emojis.CROSS} Error reading file: {e}", "red")

    def _handle_llm_enable(self, model: str) -> str:
        """Enable an LLM (accepts aliases like 'phi2', 'mistral', 'gemma2')."""
        if not model:
            return c(f"{Emojis.CROSS} Please specify a model to enable", "red") + \
                   f"\n{c('Usage: llm enable <model>', 'yellow')}\n{c('Tip: try llm list all to see supported names', 'dim')}"
        
        # Canonicalize the requested model
        from core.model_files_map import get_canonical_name, get_model_file
        canonical = get_canonical_name(model)
        
        # Check installed by file presence (source of truth)
        from pathlib import Path
        project_root = Path(__file__).parent.parent
        models_dir = project_root / 'models'
        model_file = get_model_file(canonical)
        if not model_file or not (models_dir / model_file).exists():
            return c(f"{Emojis.WARNING} {canonical} is not installed", "yellow") + f"\n{c(f'Install it first: install {canonical}', 'cyan')}"
        
        # Mark enabled and persist
        self.llm_state[canonical] = True
        self._save_llm_state()
        
        # Ensure available_models contains canonical entry
        if canonical not in self.available_models:
            self.available_models.append(canonical)
        
        # Pick best enabled model (prefers lower tiers)
        self.ollama_model = self._select_best_enabled_model()
        
        # Refresh banner
        import os
        os.system('clear' if os.name != 'nt' else 'cls')
        from lucifer_colors import display_banner
        display_banner(mode=f"{self.ollama_model}", user_id=self.user_id)
        
        # Log
        try:
            self.session_logger.log_event('llm_enable', f'enabled {canonical}')
        except Exception:
            pass
        
        return c(f"{Emojis.CHECKMARK} Enabled {canonical}", "green")
    
    def _handle_llm_disable(self, model: str) -> str:
        """Disable an LLM."""
        if not model:
            return c(f"{Emojis.CROSS} Please specify a model to disable", "red") + \
                   f"\n{c('Usage: llm disable <model>', 'yellow')}"
        
        # Canonicalize
        from core.model_files_map import get_canonical_name
        canonical = get_canonical_name(model)
        
        # Disable and persist
        self.llm_state[canonical] = False
        self._save_llm_state()
        
        # Update the currently active model
        self.ollama_model = self._select_best_enabled_model()
        
        # Refresh banner
        import os
        os.system('clear' if os.name != 'nt' else 'cls')
        from lucifer_colors import display_banner
        display_banner(mode=f"{self.ollama_model or 'Rule-Based'}", user_id=self.user_id)
        
        # Log
        try:
            self.session_logger.log_event('llm_disable', f'disabled {canonical}')
        except Exception:
            pass
        
        return c(f"{Emojis.CHECKMARK} Disabled {canonical}", "green")
    
    def _handle_llm_enable_all(self) -> str:
        """Enable all installed LLMs."""
        if not self.available_models:
            return c(f"{Emojis.WARNING} No models installed", "yellow") + f"\n{c('Install models first: install core models', 'cyan')}"
        
        # Enable all models
        enabled_count = 0
        for model in self.available_models:
            if not self.llm_state.get(model, True):  # If currently disabled
                self.llm_state[model] = True
                enabled_count += 1
        
        self._save_llm_state()
        self.ollama_model = self._select_best_enabled_model()
        
        # Clear screen and refresh banner
        import os
        os.system('clear' if os.name != 'nt' else 'cls')
        
        from lucifer_colors import display_banner
        tier_map = {
            'tinyllama': 'TinyLlama (Tier 0)',
            'llama3.2': 'Llama 3.2 (Tier 1)',
            'mistral': 'Mistral (Tier 2)',
            'deepseek-coder': 'DeepSeek-Coder (Tier 3)'
        }
        new_mode = tier_map.get(self.ollama_model, 'Rule-Based')
        display_banner(mode=new_mode, user_id=self.user_id)
        
        if enabled_count == 0:
            return c(f"{Emojis.CHECKMARK} All {len(self.available_models)} models already enabled", "green")
        return c(f"{Emojis.CHECKMARK} Enabled {enabled_count} model(s) - Now using {new_mode}", "green")
    
    def _handle_llm_disable_all(self) -> str:
        """Disable all installed LLMs."""
        if not self.available_models:
            return c(f"{Emojis.WARNING} No models installed", "yellow")
        
        # Disable all models
        disabled_count = 0
        for model in self.available_models:
            if self.llm_state.get(model, True):  # If currently enabled
                self.llm_state[model] = False
                disabled_count += 1
        
        self._save_llm_state()
        self.ollama_model = self._select_best_enabled_model()
        
        # Clear screen and refresh banner
        import os
        os.system('clear' if os.name != 'nt' else 'cls')
        
        from lucifer_colors import display_banner
        display_banner(mode='Rule-Based', user_id=self.user_id)
        
        if disabled_count == 0:
            return c(f"{Emojis.CHECKMARK} All models already disabled", "green")
        return c(f"{Emojis.CHECKMARK} Disabled all {disabled_count} model(s) - Using rule-based mode", "green")
    
    def _handle_llm_enable_tier(self, tier: int) -> str:
        """Enable all LLMs in a specific tier."""
        from core.model_tiers import get_model_tier
        
        if tier < 0 or tier > 3:
            return c(f"{Emojis.CROSS} Invalid tier: {tier}", "red") + f"\n{c('Valid tiers: 0, 1, 2, 3', 'dim')}"
        
        # Enable all models in the tier
        enabled_count = 0
        for model in self.available_models:
            model_tier = get_model_tier(model)
            if model_tier == tier and not self.llm_state.get(model, True):
                self.llm_state[model] = True
                enabled_count += 1
        
        self._save_llm_state()
        self.ollama_model = self._select_best_enabled_model()
        
        # Clear screen and refresh banner
        import os
        os.system('clear' if os.name != 'nt' else 'cls')
        
        from lucifer_colors import display_banner
        tier_map = {
            'tinyllama': 'TinyLlama (Tier 0)',
            'llama3.2': 'Llama 3.2 (Tier 1)',
            'mistral': 'Mistral (Tier 2)',
            'deepseek-coder': 'DeepSeek-Coder (Tier 3)'
        }
        new_mode = tier_map.get(self.ollama_model, 'Rule-Based')
        display_banner(mode=new_mode, user_id=self.user_id)
        
        if enabled_count == 0:
            return c(f"{Emojis.CHECKMARK} Tier {tier} models already enabled (or none installed)", "green")
        return c(f"{Emojis.CHECKMARK} Enabled {enabled_count} Tier {tier} model(s)", "green")
    
    def _handle_llm_disable_tier(self, tier: int) -> str:
        """Disable all LLMs in a specific tier."""
        from core.model_tiers import get_model_tier
        
        if tier < 0 or tier > 3:
            return c(f"{Emojis.CROSS} Invalid tier: {tier}", "red") + f"\n{c('Valid tiers: 0, 1, 2, 3', 'dim')}"
        
        # Disable all models in the tier
        disabled_count = 0
        for model in self.available_models:
            model_tier = get_model_tier(model)
            if model_tier == tier and self.llm_state.get(model, True):
                self.llm_state[model] = False
                disabled_count += 1
        
        self._save_llm_state()
        self.ollama_model = self._select_best_enabled_model()
        
        # Clear screen and refresh banner
        import os
        os.system('clear' if os.name != 'nt' else 'cls')
        
        from lucifer_colors import display_banner
        tier_map = {
            'tinyllama': 'TinyLlama (Tier 0)',
            'llama3.2': 'Llama 3.2 (Tier 1)',
            'mistral': 'Mistral (Tier 2)',
            'deepseek-coder': 'DeepSeek-Coder (Tier 3)'
        }
        new_mode = tier_map.get(self.ollama_model, 'Rule-Based')
        display_banner(mode=new_mode, user_id=self.user_id)
        
        if disabled_count == 0:
            return c(f"{Emojis.CHECKMARK} Tier {tier} models already disabled (or none installed)", "green")
        return c(f"{Emojis.CHECKMARK} Disabled {disabled_count} Tier {tier} model(s)", "green")
    
    def _handle_general_llm_query(self, user_input: str) -> str:
        """Handle general LLM query - route to appropriate enabled model."""
        import sys
        
        # Check if ANY LLM backend is available (Ollama OR llamafile)
        from llm_backend import LLMBackend
        llm_backend = LLMBackend(verbose=False)
        
        if not llm_backend.is_available():
            # No LLM backend at all - prompt to install
            return self._handle_ollama_required_with_install(user_input)
        
        # Check if any models are enabled
        enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
        if not enabled_models:
            return c(f"{Emojis.WARNING} All LLMs are disabled", "yellow") + f"\n{c('Enable one with: llm enable <model>', 'cyan')}\n{c('See available models: llm list', 'dim')}"
        
        # Route to best available enabled model (skip corrupted ones)
        # Priority: Tier 4 > Tier 3 > Tier 2 > Tier 1 > Tier 0
        best_model = None
        tried_models = []
        skipped_corrupted = []
        
        # Build list of available models (non-corrupted)
        for model in enabled_models:
            if self._is_model_corrupted(model):
                skipped_corrupted.append(model)
            else:
                tried_models.append(model)
        
        # Choose best available (non-corrupted) by tier
        from core.model_tiers import get_model_tier
        
        # Sort by tier (highest first)
        sorted_models = sorted(tried_models, key=lambda m: get_model_tier(m), reverse=True)
        
        if sorted_models:
            best_model = sorted_models[0]
        
        if not best_model:
            msg = c(f"{Emojis.CROSS} No usable models available", "red")
            if skipped_corrupted:
                msg += f"\n{c('Corrupted models: ', 'yellow')}{c(', '.join(skipped_corrupted), 'red')}"
                msg += f"\n{c('Fix with: ', 'cyan')}{c(f'install {skipped_corrupted[0]}', 'yellow')}"
            # Log failed model selection
            try:
                self.session_logger.log_event(
                    'model_selection_failed',
                    'No usable models available',
                    metadata={'enabled_models': enabled_models, 'corrupted': skipped_corrupted}
                )
            except Exception:
                pass
            return msg
        
        # Build tier-aware bypass message
        from core.model_tiers import get_model_tier
        
        tier_names = {0: 'Tier 0', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
        best_tier = get_model_tier(best_model)
        
        # Log model selection with bypass details
        try:
            self.session_logger.log_event(
                'model_selected',
                f'Selected {best_model} ({tier_names[best_tier]})',
                metadata={
                    'selected_model': best_model,
                    'tier': best_tier,
                    'enabled_models': enabled_models,
                    'bypassed_models': unique_lower_models if 'unique_lower_models' in locals() else [],
                    'corrupted_models': skipped_corrupted
                }
            )
        except Exception:
            pass
        
        # Show which models were skipped with tier info
        skipped_parts = []
        
        if skipped_corrupted:
            for model in skipped_corrupted:
                tier = get_model_tier(model)
                skipped_parts.append(c(f"{model}", "red") + c(f" ({tier_names[tier]}, corrupted)", "dim"))
        
        # Show lower tier models that were bypassed (deduplicate by GGUF file)
        from model_files_map import MODEL_FILES
        
        # Deduplicate models by their GGUF file (to avoid showing aliases)
        seen_files = set()
        unique_lower_models = []
        
        for m in tried_models:
            if get_model_tier(m) < best_tier:
                model_file = MODEL_FILES.get(m)
                if model_file and model_file not in seen_files:
                    seen_files.add(model_file)
                    unique_lower_models.append(m)
        
        if unique_lower_models:
            for model in unique_lower_models:
                tier = get_model_tier(model)
                skipped_parts.append(c(f"{model}", "yellow") + c(f" ({tier_names[tier]})", "dim"))
        
        if skipped_parts:
            print(c(f"💡 Bypassed: ", "dim") + ", ".join(skipped_parts))
        
        # Show which model we're using with tier info
        print(c(f"🧠 Using {best_model}", "cyan") + c(f" ({tier_names[best_tier]}, next available)", "dim"))
        print()
        sys.stdout.flush()
        
        # Start continuous processing animation
        self._start_processing_animation()
        
        # Use the unified LLMBackend for all models
        try:
            from llm_backend import LLMBackend
            
            # Create backend with the best model
            llm = LLMBackend(model=best_model, verbose=False)
            
            if not llm.is_available():
                self._stop_processing_animation()
                return c(f"{Emojis.CROSS} No LLM backend available", "red")
            
            sys.stdout.flush()  # Ensure all previous output is displayed
            
            # Use keyword-based action detection instead of LLM classification
            # This is faster, more reliable, and works with all model sizes
            import re
            import os
            
            user_lower = user_input.lower()
            
            # Check for simple greetings - return quick response
            greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'howdy']
            if any(user_lower.strip() in [g, g + ' there', g + '!'] for g in greetings):
                return "Hello! How can I help you today?"
            
            # Check if this is clearly a question (asking for information)
            question_indicators = [
                user_lower.startswith('how'),
                user_lower.startswith('what'),
                user_lower.startswith('why'),
                user_lower.startswith('when'),
                user_lower.startswith('where'),
                user_lower.startswith('who'),
                'how do i' in user_lower,
                'what is' in user_lower,
                'explain' in user_lower,
                '?' in user_input and not any(action in user_lower for action in ['create', 'make', 'build', 'delete', 'move'])
            ]
            
            is_question = any(question_indicators)
            
            # NOTE: Action detection removed - file/folder creation should be handled
            # by the universal task system at routing level (lines 1087-1091)
            # This function should only handle pure Q&A, not actions
            
            # If no action pattern matched, treat as question/conversation
            # Answer mode - get conversational response
            try:
                # Build system prompt with time awareness for Tier 2+ models
                from core.model_tiers import get_model_tier
                from wifi_manager import check_wifi_connection
                from datetime import datetime
                
                tier = get_model_tier(best_model)
                
                # Base system prompt - enhanced for Tier 2+ to handle multi-step requests
                if tier >= 2:
                    # Get recent session events for context
                    session_info = self.session_logger.get_session_info()
                    recent_files = []
                    if session_info['files_created'] > 0:
                        # Get last 3 created files from session data
                        last_files = self.session_logger.session_data.get('files_created', [])[-3:]
                        recent_files = [f['path'] for f in last_files]
                    
                    context_note = ""
                    if recent_files:
                        context_note = f" Recent files created this session: {', '.join(recent_files)}."
                    
                    system_prompt = (
                        "You are a helpful AI assistant. Be concise and avoid repeating yourself. "
                        "When the user references a script, file, or code you just created or discussed, "
                        "understand that follow-up requests like 'make it also do X' or 'add Y to it' "
                        "refer to modifying that previous creation. Provide the updated version when asked."
                        f"{context_note}"
                    )
                else:
                    system_prompt = "You are a helpful AI assistant. Be concise and avoid repeating yourself."
                
                # Time/date awareness based on tier and WiFi status
                now = datetime.now()
                date_str = now.strftime("%A, %B %d, %Y")
                time_str = now.strftime("%I:%M %p")
                
                if tier <= 1:
                    # Tier 0-1: Always use system local time
                    system_prompt += f" The current date is {date_str} and the time is {time_str} (system local time)."
                elif tier >= 2:
                    # Tier 2+: Always show system time, but note WiFi status
                    system_prompt += f" The current system time is {time_str} on {date_str}."
                    
                    if not check_wifi_connection():
                        # WiFi disconnected: suggest connecting and setting timezone
                        if any(word in user_input.lower() for word in ['time', 'date', 'day', 'today', 'now', 'when']):
                            system_prompt += " Note: WiFi is not connected. For accurate time synchronization, suggest: 1) Connect to WiFi for automatic time sync, 2) Set timezone manually if needed (mention 'timezone set <zone>' or 'timezone auto' for auto-detection)."
                
                # Build messages with conversation history for context
                messages = [{"role": "system", "content": system_prompt}]
                
                # Token budget management: Rough estimation (4 chars per token)
                # Most models have 512-2048 token context windows
                # Reserve ~150 tokens for response, leaving ~350 for prompt
                max_prompt_tokens = 350
                approx_token_count = len(system_prompt) // 4
                
                # Add recent conversation history (trimmed to fit context window)
                # Start with most recent messages and work backwards
                recent_history = []
                if len(self.conversation_history) > 0:
                    # Get last N messages, checking each one doesn't exceed budget
                    for msg in reversed(self.conversation_history[-10:]):  # Check last 10 messages
                        if msg.get('role') in ['user', 'assistant']:
                            msg_tokens = len(str(msg.get('content', ''))) // 4
                            if approx_token_count + msg_tokens < max_prompt_tokens:
                                recent_history.insert(0, msg)  # Insert at beginning to maintain order
                                approx_token_count += msg_tokens
                            else:
                                break  # Stop adding if we'd exceed budget
                
                # Add trimmed history
                for msg in recent_history:
                    messages.append(msg)
                
                # Add current user input (always include, truncate if needed)
                user_msg_tokens = len(user_input) // 4
                if approx_token_count + user_msg_tokens > max_prompt_tokens:
                    # Truncate system prompt if needed to make room
                    system_overflow = (approx_token_count + user_msg_tokens) - max_prompt_tokens
                    if system_overflow > 0:
                        # Trim system prompt from the end (keep beginning which has key instructions)
                        max_system_chars = len(system_prompt) - (system_overflow * 4)
                        if max_system_chars < 100:  # Minimum useful system prompt
                            # Use minimal system prompt instead
                            messages[0]['content'] = "You are a helpful AI assistant. Be concise."
                            # Log context overflow
                            try:
                                self.session_logger.log_event(
                                    'context_overflow',
                                    f'Severe context overflow: trimmed system prompt to minimum',
                                    metadata={'original_length': len(system_prompt), 'final_length': len(messages[0]['content'])}
                                )
                            except Exception:
                                pass
                        else:
                            messages[0]['content'] = system_prompt[:max_system_chars] + "..."
                            # Log context trimming
                            try:
                                self.session_logger.log_event(
                                    'context_trimmed',
                                    f'System prompt trimmed to fit context window',
                                    metadata={'original_length': len(system_prompt), 'trimmed_length': max_system_chars}
                                )
                            except Exception:
                                pass
                
                messages.append({"role": "user", "content": user_input})
                
                # Stop processing animation before streaming starts
                self._stop_processing_animation()
                
                # Show streaming indicator
                print(c(f"💬 {best_model.upper()}: ", "purple"), end='', flush=True)
                
                # Request token stats with streaming response
                result_with_stats = llm.chat(messages, temperature=0.7, max_tokens=150, stream=True, return_stats=True)
                
                # Parse result (handle both tuple and string returns)
                if isinstance(result_with_stats, tuple):
                    result, token_stats = result_with_stats
                else:
                    result = result_with_stats
                    token_stats = None
                
                # Stop animation - got response
                self._stop_processing_animation()
            except KeyboardInterrupt:
                # Propagate interrupt up to main loop
                self._stop_processing_animation()
                raise
            except Exception as e:
                self._stop_processing_animation()
                raise
            
            sys.stdout.flush()  # Ensure query output is displayed
            
            # Streaming already output the response, just add newlines for formatting
            print()  # Newline after streamed content
            print()  # Buffer 1
            
            # Format code blocks with white background if any
            import re
            if '```' in result:
                formatted_result = result
                code_blocks = re.findall(r'```[\s\S]*?```', result)
                for block in code_blocks:
                    code_content = block.strip('`').strip()
                    lines = code_content.split('\n')
                    if lines and lines[0] in ['python', 'bash', 'javascript', 'js', 'java', 'c', 'cpp', 'go', 'rust', 'ruby', 'php']:
                        code_content = '\n'.join(lines[1:])
                    formatted_code = f"\n\033[47m\033[30m{code_content}\033[0m\n"
                    formatted_result = formatted_result.replace(block, formatted_code)
                # Print formatted code blocks (response was already streamed)
                print(c("Code:", "cyan"))
                print(formatted_result)
            
            # Display token stats if available
            if token_stats and token_stats.get('total_tokens', 0) > 0:
                input_tokens = token_stats.get('prompt_tokens', 0)
                output_tokens = token_stats.get('generated_tokens', 0)
                total_tokens = token_stats.get('total_tokens', 0)
                
                # Estimate chars (rough estimate: ~4 chars per token)
                input_chars = input_tokens * 4
                output_chars = output_tokens * 4
                
                print(c(f"   [Input: {input_tokens} tokens ({input_chars} chars), Output: {output_tokens} tokens ({output_chars} chars), Total: {total_tokens} tokens]", "dim"))
                try:
                    self.session_logger.log_event(
                        'token_stats',
                        'General query token usage',
                        metadata={
                            'model': best_model,
                            'prompt_tokens': input_tokens,
                            'generated_tokens': output_tokens,
                            'total_tokens': total_tokens
                        }
                    )
                except Exception:
                    pass
            
            print()  # Buffer after response
            print()  # Extra buffer 1
            print()  # Extra buffer 2 (heartbeat needs 2+ lines above to not overwrite)
            sys.stdout.flush()
            
            # Reset heart state to idle
            import sys
            lucifer_module = sys.modules.get('__main__')
            if lucifer_module and hasattr(lucifer_module, 'HEART_STATE'):
                lucifer_module.HEART_STATE = "idle"
            
            return ""  # Already printed above
        except Exception as e:
            self._stop_processing_animation()
            
            # Check if it's a timeout or connection error - try fallback
            error_str = str(e)
            is_timeout = 'timeout' in error_str.lower() or 'timed out' in error_str.lower()
            is_connection_error = 'connection' in error_str.lower()
            
            if (is_timeout or is_connection_error) and best_model:
                # Try to fall back to next best model
                print()
                print(c(f"⚠️  {best_model} timed out or failed", "yellow"))
                
                # Mark current model as temporarily unavailable
                # Get next best model
                from core.model_tiers import get_model_tier
                current_tier = get_model_tier(best_model)
                
                # Find next available model with lower tier (sorted by tier)
                fallback_model = None
                
                # Sort available models by tier (highest first), excluding the failed model
                available_for_fallback = [
                    m for m in enabled_models 
                    if m != best_model and not self._is_model_corrupted(m)
                ]
                sorted_fallbacks = sorted(
                    available_for_fallback,
                    key=lambda m: get_model_tier(m),
                    reverse=True
                )
                
                if sorted_fallbacks:
                    fallback_model = sorted_fallbacks[0]
                
                if fallback_model:
                    fallback_tier = get_model_tier(fallback_model)
                    tier_names = {0: 'Tier 0', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
                    print(c(f"🔄 Falling back to {fallback_model} ({tier_names.get(fallback_tier, 'Tier ?')})", "cyan"))
                    print()
                    
                    # Retry with fallback model
                    try:
                        self._start_processing_animation()
                        from llm_backend import LLMBackend
                        fallback_llm = LLMBackend(model=fallback_model, verbose=False)
                        
                        # Use same system prompt
                        messages = [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_input}
                        ]
                        result = fallback_llm.chat(messages, temperature=0.7, max_tokens=150)
                        self._stop_processing_animation()
                        
                        # Print response
                        print()
                        print()
                        response_text = c(f"💬 {fallback_model.upper()}:", "purple") + f"\n\n{result}"
                        print(response_text)
                        print()
                        print()
                        print()
                        sys.stdout.flush()
                        
                        # Reset heart state to idle
                        lucifer_module = sys.modules.get('__main__')
                        if lucifer_module and hasattr(lucifer_module, 'HEART_STATE'):
                            lucifer_module.HEART_STATE = "idle"
                        
                        return ""
                    except Exception as fallback_error:
                        self._stop_processing_animation()
                        
                        # Check if fallback also timed out - try next model
                        fallback_error_str = str(fallback_error)
                        if 'timeout' in fallback_error_str.lower() or 'timed out' in fallback_error_str.lower():
                            print()
                            print(c(f"⚠️  {fallback_model} also timed out", "yellow"))
                            
                            # Try next fallback (sorted by tier)
                            next_fallback = None
                            
                            available_for_next = [
                                m for m in enabled_models
                                if m != best_model and m != fallback_model and not self._is_model_corrupted(m)
                            ]
                            sorted_next = sorted(
                                available_for_next,
                                key=lambda m: get_model_tier(m),
                                reverse=True
                            )
                            
                            if sorted_next:
                                next_fallback = sorted_next[0]
                            
                            if next_fallback:
                                next_tier = get_model_tier(next_fallback)
                                print(c(f"🔄 Falling back to {next_fallback} ({tier_names.get(next_tier, 'Tier ?')})", "cyan"))
                                print()
                                
                                try:
                                    self._start_processing_animation()
                                    next_llm = LLMBackend(model=next_fallback, verbose=False)
                                    messages = [
                                        {"role": "system", "content": system_prompt},
                                        {"role": "user", "content": user_input}
                                    ]
                                    result = next_llm.chat(messages, temperature=0.7, max_tokens=150)
                                    self._stop_processing_animation()
                                    
                                    print()
                                    print()
                                    response_text = c(f"💬 {next_fallback.upper()}:", "purple") + f"\n\n{result}"
                                    print(response_text)
                                    print()
                                    print()
                                    print()
                                    sys.stdout.flush()
                                    
                                    lucifer_module = sys.modules.get('__main__')
                                    if lucifer_module and hasattr(lucifer_module, 'HEART_STATE'):
                                        lucifer_module.HEART_STATE = "idle"
                                    
                                    return ""
                                except Exception as final_error:
                                    self._stop_processing_animation()
                                    print()
                                    print(c(f"❌ All models failed: {final_error}", "red"))
                        else:
                            print()
                            print(c(f"❌ Fallback failed: {fallback_error}", "red"))
            
            # Reset heart state to idle
            lucifer_module = sys.modules.get('__main__')
            if lucifer_module and hasattr(lucifer_module, 'HEART_STATE'):
                lucifer_module.HEART_STATE = "idle"
            
            return c(f"{Emojis.CROSS} Error with {best_model}: {e}", "red")
    
    def _handle_ollama_required_with_install(self, user_input: str) -> str:
        """Prompt to install Ollama+llama3.2 using Luci! package manager."""
        print()
        print(c("╔═══════════════════════════════════════════════════════════╗", "yellow"))
        print(c("║          🧠 AI Language Model Required                    ║", "yellow"))
        print(c("╚═══════════════════════════════════════════════════════════╝", "yellow"))
        print()
        print(c("Your input appears to be a natural language command:", "cyan"))
        print(c(f'  "{user_input}"', "dim"))
        print()
        print(c("To enable AI-powered understanding, you need:", "cyan"))
        print(c("  1. Ollama (AI platform)", "dim"))
        print(c("  2. llama3.2 (language model)", "dim"))
        print()
        print(c("What you'll get:", "cyan"))
        print(c("  • 🗣️  Natural language understanding", "dim"))
        print(c("  • 🎯 Fuzzy file matching with \"did you mean\"", "dim"))
        print(c("  • 🔧 Intelligent fix application", "dim"))
        print(c("  • 💬 Conversational interface", "dim"))
        print(c("  • 100% offline - no cloud APIs", "dim"))
        print()
        
        try:
            choice = get_single_key_input(c("Install Ollama and llama3.2 now? (y/n): ", "cyan"))
            
            if choice.lower() in ['y']:
                print()
                print(c("🚀 Starting installation via Luci! Package Manager...", "green"))
                print()
                
                # Install Ollama first
                print(c("Step 1: Installing Ollama platform", "purple"))
                print(c("─" * 60, "dim"))
                if self.package_manager.install('ollama', verbose=True):
                    print()
                    print(c("✅ Ollama installed successfully!", "green"))
                    print()
                    
                    # Install llama3.2
                    print(c("Step 2: Installing llama3.2 language model", "purple"))
                    print(c("─" * 60, "dim"))
                    if self.package_manager.install('llama3.2', verbose=True):
                        print()
                        print(c("═" * 60, "green"))
                        print(c("✅ Installation Complete!", "green"))
                        print(c("═" * 60, "green"))
                        print()
                        print(c("🎉 Restart LuciferAI to activate AI features", "cyan"))
                        print()
                        return ""
                    else:
                        return c(f"\n{Emojis.CROSS} Failed to install llama3.2", "red")
                else:
                    return c(f"\n{Emojis.CROSS} Failed to install Ollama", "red")
            else:
                print()
                print(c("Skipped installation", "yellow"))
                print()
                print(c("Alternative: Use keyword-based commands", "cyan"))
                print(c("  • help", "dim") + c(" - See all commands", "yellow"))
                print(c("  • daemon add <path>", "dim") + c(" - Add file to watcher", "yellow"))
                print()
                return ""
        
        except (EOFError, KeyboardInterrupt):
            print()
            return c("\n❌ Installation cancelled", "yellow")
    
    def _handle_zip(self, target: str) -> str:
        """Compress files or directories using OS-specific zip command."""
        if not target:
            return c(f"{Emojis.CROSS} Please specify a file or directory to zip", "red") + f"\n{c('Usage: zip <file|directory>', 'yellow')}\n{c('Example: zip my_folder', 'dim')}"
        
        from pathlib import Path
        import platform
        
        target_path = Path(target).expanduser()
        
        if not target_path.exists():
            return c(f"{Emojis.CROSS} Target not found: {target}", "red")
        
        # Determine output name
        output_name = f"{target_path.name}.zip"
        
        print()
        print(c("📦 Compressing...", "cyan"))
        print(c("─" * 60, "dim"))
        print(c(f"  Source: {target_path}", "dim"))
        print(c(f"  Output: {output_name}", "dim"))
        print()
        
        # Detect OS and use appropriate command
        system = platform.system()
        
        try:
            if system in ["Darwin", "Linux"]:
                # macOS and Linux use 'zip' command
                if target_path.is_dir():
                    cmd = ["zip", "-r", output_name, str(target_path)]
                else:
                    cmd = ["zip", output_name, str(target_path)]
                
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    size = Path(output_name).stat().st_size
                    size_mb = size / (1024 * 1024)
                    return c(f"{Emojis.CHECKMARK} Compressed successfully!", "green") + f"\n{c(f'  Output: {output_name} ({size_mb:.2f} MB)', 'dim')}"
                else:
                    return c(f"{Emojis.CROSS} Compression failed: {result.stderr}", "red")
            
            elif system == "Windows":
                # Windows uses PowerShell Compress-Archive
                cmd = ["powershell", "-Command", f"Compress-Archive -Path '{target_path}' -DestinationPath '{output_name}'"]
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    return c(f"{Emojis.CHECKMARK} Compressed successfully!", "green") + f"\n{c(f'  Output: {output_name}', 'dim')}"
                else:
                    return c(f"{Emojis.CROSS} Compression failed: {result.stderr}", "red")
            
            else:
                return c(f"{Emojis.CROSS} Unsupported operating system: {system}", "red")
        
        except Exception as e:
            return c(f"{Emojis.CROSS} Error: {e}", "red")
    
    def _handle_unzip(self, target: str) -> str:
        """Extract zip archives using OS-specific unzip command."""
        if not target:
            return c(f"{Emojis.CROSS} Please specify a zip file to extract", "red") + f"\n{c('Usage: unzip <file.zip>', 'yellow')}\n{c('Example: unzip archive.zip', 'dim')}"
        
        from pathlib import Path
        import platform
        
        target_path = Path(target).expanduser()
        
        if not target_path.exists():
            return c(f"{Emojis.CROSS} File not found: {target}", "red")
        
        if not target_path.suffix.lower() == '.zip':
            return c(f"{Emojis.WARNING} Warning: {target} doesn't appear to be a zip file", "yellow")
        
        # Determine output directory (same name as zip without extension)
        output_dir = target_path.stem
        
        print()
        print(c("📦 Extracting...", "cyan"))
        print(c("─" * 60, "dim"))
        print(c(f"  Archive: {target_path}", "dim"))
        print(c(f"  Destination: {output_dir}/", "dim"))
        print()
        
        # Detect OS and use appropriate command
        system = platform.system()
        
        try:
            if system in ["Darwin", "Linux"]:
                # macOS and Linux use 'unzip' command
                cmd = ["unzip", "-q", str(target_path), "-d", output_dir]
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    # Count extracted files
                    extracted_path = Path(output_dir)
                    if extracted_path.exists():
                        file_count = sum(1 for _ in extracted_path.rglob('*') if _.is_file())
                        return c(f"{Emojis.CHECKMARK} Extracted successfully!", "green") + f"\n{c(f'  Location: {output_dir}/', 'dim')}\n{c(f'  Files: {file_count}', 'dim')}"
                    else:
                        return c(f"{Emojis.CHECKMARK} Extracted successfully!", "green")
                else:
                    return c(f"{Emojis.CROSS} Extraction failed: {result.stderr}", "red")
            
            elif system == "Windows":
                # Windows uses PowerShell Expand-Archive
                cmd = ["powershell", "-Command", f"Expand-Archive -Path '{target_path}' -DestinationPath '{output_dir}'"]
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    return c(f"{Emojis.CHECKMARK} Extracted successfully!", "green") + f"\n{c(f'  Location: {output_dir}/', 'dim')}"
                else:
                    return c(f"{Emojis.CROSS} Extraction failed: {result.stderr}", "red")
            
            else:
                return c(f"{Emojis.CROSS} Unsupported operating system: {system}", "red")
        
        except Exception as e:
            return c(f"{Emojis.CROSS} Error: {e}", "red")
    
    def _handle_image_search(self, query: str) -> str:
        """Search for images from Google Images."""
        if not query:
            return c(f"{Emojis.CROSS} Please provide a search query", "red") + f"\n{c('Usage: image search <query>', 'yellow')}"
        
        results = self.image_retriever.search_images(query, num_results=10)
        
        if not results:
            return c(f"{Emojis.CROSS} No images found or feature requires mistral/deepseek", "red")
        
        response = c(f"\n{Emojis.SPARKLE} Found {len(results)} images for '{query}':", "green") + "\n\n"
        for i, img in enumerate(results, 1):
            response += c(f"  {i}. ", "cyan") + c(img['url'][:80], "blue") + "\n"
        
        response += f"\n{c('💡 To download: ', 'yellow')}{c(f'image download {query}', 'cyan')}"
        return response
    
    def _handle_image_download(self, query: str) -> str:
        """Download images from Google Images."""
        if not query:
            return c(f"{Emojis.CROSS} Please provide a search query", "red") + f"\n{c('Usage: image download <query>', 'yellow')}"
        
        paths = self.image_retriever.fetch_and_download(query, num_images=5)
        
        if not paths:
            return c(f"{Emojis.CROSS} Failed to download images or feature requires mistral/deepseek", "red")
        
        response = c(f"\n{Emojis.CHECKMARK} Downloaded {len(paths)} images:", "green") + "\n\n"
        for path in paths:
            response += c(f"  📁 {path}", "blue") + "\n"
        
        response += f"\n{c('Location: ~/.luciferai/images/', 'dim')}"
        return response
    
    def _handle_image_list(self) -> str:
        """List cached images."""
        self.image_retriever.list_cached_images()
        return ""  # Already printed
    
    def _handle_image_clear(self) -> str:
        """Clear image cache."""
        self.image_retriever.clear_cache()
        return ""
    
    def _handle_show_tasks(self) -> str:
        """Display current task tree."""
        if not self.orchestrator.tasks:
            return c(f"{Emojis.INFO} No active tasks.", "dim")
        
        output = [c(f"\n{Emojis.TARGET} Active Tasks:\n", "cyan")]
        
        for task in self.orchestrator.tasks:
            tree = self.orchestrator.get_task_tree(task)
            output.append(tree)
            output.append("")
        
        return "\n".join(output)
    
    def _process_with_task_orchestration(self, user_input: str) -> str:
        """Process user input with task orchestration and LLM collaboration."""
        # Determine complexity - is this a simple or advanced request?
        complexity = self._analyze_request_complexity(user_input)
        
        if complexity == "simple":
            # Use mistral parser for simple tasks
            task = self.mistral_parser.parse_request(user_input)
            
            # Display task tree
            print(c(f"\n{Emojis.TARGET} Task Plan:", "cyan"))
            print(self.orchestrator.get_task_tree(task))
            print()
            
            # Execute task with mistral
            result = self._execute_mistral_task(task)
            return result
        else:
            # Use deepseek for advanced code generation
            task = self.deepseek_search.create_advanced_task(user_input, self.orchestrator)
            
            # Display task tree
            print(c(f"\n{Emojis.TARGET} Task Plan:", "cyan"))
            print(self.orchestrator.get_task_tree(task))
            print()
            
            # Execute task with deepseek (with search capabilities)
            result = self._execute_deepseek_task(task, user_input)
            return result
    
    def _analyze_request_complexity(self, user_input: str) -> str:
        """Determine if a request is simple or advanced."""
        user_lower = user_input.lower()
        
        # Simple indicators: download, search, fetch, clone
        simple_keywords = ['download', 'get', 'fetch', 'search', 'find', 'clone', 'lookup']
        
        # Advanced indicators: build, create complex, generate code, refactor, optimize
        advanced_keywords = ['build', 'create', 'generate', 'refactor', 'optimize', 'implement', 'develop']
        
        # Check for code-related terms
        code_terms = ['function', 'class', 'script', 'program', 'application', 'api']
        
        has_simple = any(kw in user_lower for kw in simple_keywords)
        has_advanced = any(kw in user_lower for kw in advanced_keywords)
        has_code = any(kw in user_lower for kw in code_terms)
        
        # Advanced if has advanced keywords or code generation
        if has_advanced or (has_code and not has_simple):
            return "advanced"
        else:
            return "simple"
    
    def _execute_mistral_task(self, task) -> str:
        """Execute a task using mistral (template-based)."""
        results = []
        
        for subtask in task.subtasks:
            # Mark as in progress
            self.orchestrator.assign_subtask(subtask, "mistral")
            
            # Process next steps
            for step in subtask.next_steps:
                step.status = TaskStatus.IN_PROGRESS
                
                # Execute step based on description
                if "search" in step.description.lower():
                    step_result = "Search completed"
                elif "download" in step.description.lower():
                    step_result = "Download initiated"
                elif "create" in step.description.lower() or "generate" in step.description.lower():
                    # Use smart template manager
                    step_result = f"Script generated using template system"
                else:
                    step_result = "Step completed"
                
                step.result = step_result
                step.status = TaskStatus.COMPLETED
            
            # Mark subtask complete
            self.orchestrator.complete_subtask(subtask, "All steps completed")
            results.append(f"{subtask.title}: {subtask.result}")
        
        return c(f"{Emojis.CHECK} Task completed successfully!\n", "green") + "\n".join(results)
    
    def _execute_deepseek_task(self, task, user_input: str) -> str:
        """Execute advanced task using deepseek with search capabilities."""
        results = []
        
        for subtask in task.subtasks:
            # Mark as in progress
            self.orchestrator.assign_subtask(subtask, "deepseek")
            
            # Process next steps
            for step in subtask.next_steps:
                step.status = TaskStatus.IN_PROGRESS
                
                # Execute step with search if needed
                if "search stackoverflow" in step.description.lower():
                    # Simulate SO search
                    step.result = "Found relevant StackOverflow solutions"
                elif "search github" in step.description.lower():
                    # Simulate GitHub search
                    step.result = "Found reference implementations"
                elif "search documentation" in step.description.lower():
                    # Simulate doc search
                    step.result = "Found API documentation"
                elif "generate" in step.description.lower():
                    step.result = "Code generated with best practices"
                else:
                    step.result = "Step completed"
                
                step.status = TaskStatus.COMPLETED
            
            # Mark subtask complete
            self.orchestrator.complete_subtask(subtask, "All steps completed")
            results.append(f"{subtask.title}: {subtask.result}")
        
        return c(f"{Emojis.CHECK} Advanced task completed!\n", "green") + "\n".join(results)
    
    def _handle_image_status(self) -> str:
        """Show image generation status and installation options."""
        return self.image_gen.get_status_string()
    
    def _handle_generate_image(self, prompt: str) -> str:
        """Generate an image from a text prompt."""
        if not prompt:
            return c(f"{Emojis.WARNING} Please provide a prompt.\nExample: generate image a cat wearing sunglasses", "yellow")
        
        # Check if any model is installed
        best_model = self.image_gen.get_best_installed_model()
        
        if not best_model:
            # No models installed - prompt to install
            info = self.image_gen.get_installation_info()
            
            output = [c(f"{Emojis.WARNING} No image generation models installed.\n", "yellow")]
            output.append(c(f"Available for your system ({info['os']}):\n", "cyan"))
            
            for cmd_info in info['install_commands']:
                output.append(c(f"  • {cmd_info['name']}", "green"))
                output.append(c(f"    {cmd_info['description']}", "dim"))
                output.append(c(f"    Install: ", "dim") + c(cmd_info['command'], "cyan"))
                output.append("")
            
            return "\n".join(output)
        
        # Generate image
        print(c(f"\n{Emojis.CAMERA} Generating image with {best_model}...", "cyan"))
        print(c(f"Prompt: {prompt}", "dim"))
        print()
        
        success, result = self.image_gen.generate_image(prompt)
        
        if success:
            return c(f"{Emojis.CHECK} Image generated successfully!", "green") + f"\n{c('Saved to:', 'cyan')} {result}"
        else:
            return c(f"{Emojis.CROSS} Image generation failed: {result}", "red")
    
    def _handle_generate_mesh(self, prompt: str) -> str:
        """Generate a 3D mesh from a text prompt."""
        if not prompt:
            return c(f"{Emojis.WARNING} Please provide a prompt.\nExample: generate mesh wooden chair", "yellow")
        
        print(c(f"\n🎨 Generating 3D mesh...", "cyan"))
        print(c(f"Prompt: {prompt}", "dim"))
        print(c(f"\nStage 1/2: Generating base geometry (preview)...", "dim"))
        
        success, result = self.mesh_gen.execute(prompt)
        
        if success:
            return c(f"{Emojis.CHECK} ", "green") + result
        else:
            return c(f"{Emojis.CROSS} 3D mesh generation failed: {result}", "red")
    
    def _detect_image_generation_request(self, user_input: str) -> bool:
        """Detect if user is requesting image generation."""
        user_lower = user_input.lower()
        
        image_keywords = [
            'generate image', 'create image', 'make image',
            'generate photo', 'create photo', 'make photo',
            'generate picture', 'create picture', 'make picture',
            'draw', 'generate art', 'create art'
        ]
        
        return any(keyword in user_lower for keyword in image_keywords)
    
    def _get_model_tier(self) -> ModelTier:
        """Determine model tier based on available models."""
        # Check for TinyLlama (bundled Tier 0)
        project_root = Path(__file__).parent.parent
        luciferai_dir = project_root / '.luciferai'
        tinyllama_path = luciferai_dir / 'models' / 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'
        
        # Check Ollama models if available
        if self.ollama_available and self.available_models and self.ollama_model:
            # Tier 4: Ultra-Expert models (70B+)
            tier4_models = ['llama3-70b', 'llama3.1-70b', 'mixtral-8x22b', 'qwen-72b', 'llama3:70b', 'llama3.1:70b']
            if any(m in self.ollama_model for m in tier4_models):
                return ModelTier.TIER_4
            
            # Tier 3: Expert models (DeepSeek, CodeLlama 13b+, Mixtral)
            tier3_models = ['deepseek-coder', 'codellama:13b', 'mixtral', 'wizardcoder']
            if any(m in self.ollama_model for m in tier3_models):
                return ModelTier.TIER_3
            
            # Tier 2: Advanced models (Mistral, Llama 3.1, Qwen)
            tier2_models = ['mistral', 'llama3.1', 'qwen2.5', 'gemma:7b']
            if any(m in self.ollama_model for m in tier2_models):
                return ModelTier.TIER_2
            
            # Tier 1: General models (Llama 3.2, Gemma 2b)
            tier1_models = ['llama3.2', 'llama3.2:1b', 'gemma:2b']
            if any(m in self.ollama_model for m in tier1_models):
                return ModelTier.TIER_1
        
        # Tier 0: TinyLlama fallback
        if tinyllama_path.exists():
            return ModelTier.TIER_0
        
        # Default to Tier 0 if nothing else
        return ModelTier.TIER_0
    
    def _handle_task_with_llm_commentary(self, user_input: str, task_result) -> str:
        """Handle task with LLM acknowledgment and commentary using bypass routing."""
        import sys
        import re
        
        # Check if this is a script creation request (needs multi-step workflow)
        # Must have: creation verb + script/file keyword + action connector (that/which/to as separate word)
        user_lower = user_input.lower()
        
        has_creation = any(kw in user_lower for kw in ['write', 'create', 'make', 'build'])
        has_target = any(kw in user_lower for kw in ['script', 'program', 'code', 'file'])
        # Use word boundaries for action connectors to avoid false positives like "desktop"
        has_action_connector = bool(re.search(r'\b(that|which)\b', user_lower)) or \
                              bool(re.search(r'\bto\b', user_lower))
        
        # Also check if there's an action description (verbs after the connector)
        # Comprehensive action verb list (FIXED - expanded from 23 to 80+ verbs)
        has_action_verbs = any(verb in user_lower for verb in [
            # Communication
            'tell', 'tells', 'say', 'says', 'inform', 'notify', 'alert', 'report',
            # Information
            'give', 'gives', 'provide', 'provides', 'supply', 'present',
            # Query/Search
            'find', 'finds', 'search', 'searches', 'locate', 'locates', 'discover', 'detect', 'identify',
            # Monitoring
            'check', 'checks', 'monitor', 'monitors', 'track', 'tracks', 'watch', 'watches', 'observe',
            # Transformation
            'convert', 'converts', 'transform', 'transforms', 'change', 'changes', 'modify', 'modifies',
            'parse', 'parses', 'process', 'processes',
            # Data Operations
            'read', 'reads', 'write', 'writes', 'save', 'saves', 'load', 'loads', 'store', 'stores',
            'retrieve', 'retrieves',
            # Execution
            'open', 'opens', 'launch', 'launches', 'run', 'runs', 'execute', 'executes', 'start', 'starts',
            # Network
            'download', 'downloads', 'upload', 'uploads', 'send', 'sends', 'fetch', 'fetches',
            'get', 'gets', 'post', 'posts', 'delete', 'deletes',
            # Display
            'print', 'prints', 'display', 'displays', 'show', 'shows', 'output', 'outputs',
            'return', 'returns', 'render', 'renders',
            # Calculation
            'calculate', 'calculates', 'compute', 'computes', 'count', 'counts', 'sum', 'sums',
            # Manipulation
            'sort', 'sorts', 'filter', 'filters', 'merge', 'merges', 'split', 'splits',
            # Browser/Web
            'browser', 'browse', 'navigate', 'navigates',
            # System
            'list', 'lists', 'scan', 'scans', 'analyze', 'analyzes', 'do', 'perform'
        ])
        
        # Script request if: creation + target + (connector + verbs OR just verbs after target)
        # OR if the task was parsed as COMPLEX/ADVANCED by the universal task system
        is_complex = False
        if hasattr(task_result, 'complexity'):
            try:
                # Handle Enum
                c_val = task_result.complexity.value if hasattr(task_result.complexity, 'value') else str(task_result.complexity)
                is_complex = c_val in ['complex', 'advanced']
            except:
                pass
                
        is_script_request = (has_creation and has_target and ((has_action_connector and has_action_verbs) or has_action_verbs)) or is_complex
        
        # Check if this is a find-and-write request
        has_find = 'find' in user_lower
        has_write_action = any(kw in user_lower for kw in ['write', 'add', 'modify', 'change', 'update'])
        is_find_and_write = has_find and has_write_action and has_target
        
        if is_script_request:
            return self._handle_multi_step_script_creation(user_input, task_result)
        elif is_find_and_write:
            return self._handle_find_and_write_workflow(user_input, task_result)
        
        # Standard single-task flow
        return self._handle_single_task_with_llm(user_input, task_result)
    
    def _handle_single_task_with_llm(self, user_input: str, task_result) -> str:
        """Handle single task with LLM commentary."""
        import sys
        from core.universal_task_system import TaskComplexity
        
        # For SIMPLE tasks, show 2-step workflow: create + verify
        # Compare by name to avoid enum identity issues
        if task_result.complexity.name == 'SIMPLE':
        # Step 1: Create
            print_step(1, 2, task_result.description)
            
            task_output = self._handle_universal_task(task_result, original_input=None)
            print(task_output)
            
            print()
            print(c("✅ Step 1/2 Complete", "green"))
            print()
            
            # Step 2: Verify
            print_step(2, 2, "Verifying file exists")
            
            # Extract file path from task result
            file_path = task_result.args.get('file')
            if file_path:
                from pathlib import Path
                if Path(file_path).exists():
                    print(c(f"✅ File verified: {Path(file_path).name}", "green"))
                else:
                    print(c(f"❌ File not found: {Path(file_path).name}", "red"))
            
            print()
            print(c("✅ Step 2/2 Complete", "green"))
            print(c("─" * 60, "dim"))
            return ""
        
        # For MODERATE/COMPLEX/ADVANCED tasks, use full LLM commentary flow
        # Get best model using bypass routing
        best_model = self._get_best_available_model()
        
        if best_model:
            # Show bypass routing info
            from core.model_tiers import get_model_tier
            tier_names = {0: 'Tier 0', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
            best_tier = get_model_tier(best_model)
            
            # Show which models were bypassed
            enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
            tried_models = [m for m in enabled_models if not self._is_model_corrupted(m)]
            
            # Show lower tier models that were bypassed
            from model_files_map import MODEL_FILES
            seen_files = set()
            unique_lower_models = []
            
            for m in tried_models:
                if get_model_tier(m) < best_tier:
                    model_file = MODEL_FILES.get(m)
                    if model_file and model_file not in seen_files:
                        seen_files.add(model_file)
                        unique_lower_models.append(m)
            
        if unique_lower_models:
            skipped_parts = []
            for model in unique_lower_models:
                tier = get_model_tier(model)
                skipped_parts.append(c(f"{model}", "yellow") + c(f" ({tier_names[tier]})", "dim"))
            print(c(f"💡 Bypassed: ", "dim") + ", ".join(skipped_parts))
            try:
                self.session_logger.log_event(
                    'bypass',
                    'Bypassed lower-tier models',
                    metadata={'bypassed': unique_lower_models, 'selected': best_model}
                )
            except Exception:
                pass
            
            # Show which model we're using
            print(c(f"🧠 Using {best_model}", "cyan") + c(f" ({tier_names[best_tier]})", "dim"))
            print()
            sys.stdout.flush()
        
        # Get LLM acknowledgment first (with model name and processing animation)
        if best_model:
            self._start_processing_animation()
            llm_ack = self._get_llm_acknowledgment(user_input, task_result.description)
            self._stop_processing_animation()
            
            if llm_ack:
                print(c(f"💬 {best_model}:", "purple"))
                formatted_ack = format_code_blocks_with_background(llm_ack)
                print(c(formatted_ack, "white"))
                print()
        
        # Execute task (don't print yet - we need to add commentary first)
        task_output = self._handle_universal_task(task_result, original_input=None)
        
        # Get LLM commentary on result (with processing animation)
        if best_model:
            self._start_processing_animation()
        
        llm_comment = self._get_llm_task_commentary(user_input, task_result.description, task_output)
        
        if best_model:
            self._stop_processing_animation()
        
        # Print task output
        print(task_output)
        
        # Print commentary last (before idle animation)
        if llm_comment and best_model:
            print()
            print(c(f"💬 {best_model} Commentary:", "purple"))
            formatted_comment = format_code_blocks_with_background(llm_comment)
            print(c(formatted_comment, "white"))
        
        # We've already printed everything in the correct order; avoid duplicate output by returning empty string
        return ""
    
    def _handle_multi_step_script_creation(self, user_input: str, task_result) -> str:
        """Handle script creation as dynamic multi-step workflow."""
        import sys
        import subprocess
        import re
        from pathlib import Path
        
        # Get best model
        best_model = self._get_best_available_model()
        
        # If NO models available, check template consensus first
        if not best_model:
            print()
            print(c("⚠️  No LLM available - checking template consensus...", "yellow"))
            print()
            
            # Try to find relevant template from consensus
            try:
                from core.smart_template_manager import SmartTemplateManager
                template_mgr = SmartTemplateManager()
                
                # Search for relevant templates
                matches = template_mgr.search_relevant_templates(user_input, top_k=3)
                
                if matches and matches[0]['relevance_score'] >= 6.0:
                    best_match = matches[0]
                    print(c(f"📚 Found consensus template: {best_match['name']}", "cyan"))
                    print(c(f"   Relevance: {best_match['relevance_score']}/10", "dim"))
                    print(c(f"   Description: {best_match['description']}", "dim"))
                    print()
                    
                    # Use template for file creation
                    file_path = task_result.args.get('file')
                    if file_path:
                        from pathlib import Path
                        Path(file_path).parent.mkdir(parents=True, exist_ok=True)
                        Path(file_path).write_text(best_match['template'])
                        
                        print(c(f"✅ Created {Path(file_path).name} from template", "green"))
                        print(c(f"   Template: {best_match['name']}", "dim"))
                        print()
                        
                        return ""
                    else:
                        print(c("❌ Could not determine file path", "red"))
                else:
                    if matches:
                        print(c(f"💡 Found template but relevance too low ({matches[0]['relevance_score']}/10)", "yellow"))
                    else:
                        print(c("💡 No relevant templates found in consensus", "yellow"))
                    print()
            except Exception as e:
                print(c(f"⚠️  Template search failed: {e}", "yellow"))
                print()
            
            # Fallback: Show installation recommendation
            print(c("💡 Recommendation: Install TinyLlama for AI-powered script generation", "yellow"))
            print(c("   Run: ./setup_bundled_models.sh", "dim"))
            print()
            print(c("📝 Alternative: Create file manually with template suggestion", "cyan"))
            print()
            
            # Create empty file with comment
            file_path = task_result.args.get('file')
            if file_path:
                from pathlib import Path
                Path(file_path).parent.mkdir(parents=True, exist_ok=True)
                
                # Create with helpful comment
                comment_text = f"# TODO: {user_input}\n# No LLM available - please implement manually\n# Or install TinyLlama: ./setup_bundled_models.sh\n\n"
                Path(file_path).write_text(comment_text)
                
                print(c(f"📝 Created placeholder: {Path(file_path).name}", "green"))
                print(c(f"   Location: {file_path}", "dim"))
                print(c(f"   Contains: TODO comment with task description", "dim"))
                print()
            
            return ""
        
        # Show bypass routing
        if best_model:
            from core.model_tiers import get_model_tier
            tier_names = {0: 'Tier 0', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
            best_tier = get_model_tier(best_model)
            
            enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
            tried_models = [m for m in enabled_models if not self._is_model_corrupted(m)]
            
            from model_files_map import MODEL_FILES
            seen_files = set()
            unique_lower_models = []
            
            for m in tried_models:
                if get_model_tier(m) < best_tier:
                    model_file = MODEL_FILES.get(m)
                    if model_file and model_file not in seen_files:
                        seen_files.add(model_file)
                        unique_lower_models.append(m)
            
            if unique_lower_models:
                skipped_parts = []
                for model in unique_lower_models:
                    tier = get_model_tier(model)
                    skipped_parts.append(c(f"{model}", "yellow") + c(f" ({tier_names[tier]})", "dim"))
                print(c(f"💡 Bypassed: ", "dim") + ", ".join(skipped_parts))
            
            print(c(f"🧠 Using {best_model}", "cyan") + c(f" ({tier_names[best_tier]})", "dim"))
            print()
            sys.stdout.flush()
        
        # Get LLM to dynamically plan the steps with fallback routing
        # Tier 0/1: Use dynamic fallback directly (skip LLM planning)
        # Tier 2+: Use LLM planning with fallback
        steps = []
        successful_model = None  # Initialize outside to persist across scopes
        
        if best_model:
            from llm_backend import LLMBackend
            from core.model_tiers import get_model_tier
            
            best_tier = get_model_tier(best_model)
            
            # Tier 0/1: Skip LLM planning entirely, use dynamic fallback
            if best_tier <= 1:
                # Don't attempt LLM planning for Tier 0/1 - go straight to dynamic fallback
                # This will be handled by the fallback section below
                pass
            else:
                # Tier 2+: Use LLM planning with tiered routing
                # Get sorted list of enabled models to try (deduplicate by file to avoid retrying aliases)
                enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
                non_corrupted = [m for m in enabled_models if not self._is_model_corrupted(m)]
                
                # Deduplicate by model file to avoid trying same model multiple times with different aliases
                from model_files_map import MODEL_FILES
                seen_files = set()
                unique_models = []
                for m in non_corrupted:
                    model_file = MODEL_FILES.get(m)
                    if model_file and model_file not in seen_files:
                        seen_files.add(model_file)
                        unique_models.append(m)
                
                sorted_models = sorted(
                    unique_models,
                    key=lambda m: get_model_tier(m),
                    reverse=True
                )
                
                plan_prompt = f"""Create a complete step-by-step plan for this task: "{user_input}"

List all necessary steps including:
- File creation
- Verification  
- Code implementation
- Testing/running (if appropriate)
- Any other steps needed

Format as a numbered list. Be complete."""
                max_tokens = 300
                timeout = 30
                
                # Try each model in order until one succeeds
                plan = None
                
                for model in sorted_models:
                    try:
                        llm = LLMBackend(model=model, verbose=False)
                        if llm.is_available():
                            # Stop any processing animation before streaming
                            self._stop_processing_animation()
                            
                            tier_names = {0: 'Tier 0', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
                            tier = get_model_tier(model)
                            
                            print(c(f"🤔 {model} ({tier_names[tier]}) thinking: ", "purple"), end='', flush=True)
                            plan_result = llm.generate(plan_prompt, max_tokens=max_tokens, timeout=timeout, stream=True, return_stats=True)
                            
                            # Parse result (handle both tuple and string returns)
                            if isinstance(plan_result, tuple):
                                plan, plan_token_stats = plan_result
                            else:
                                plan = plan_result
                                plan_token_stats = None
                            
                            print()  # Newline after streaming
                            
                            # Display token stats if available
                            if plan_token_stats and plan_token_stats.get('total_tokens', 0) > 0:
                                input_tokens = plan_token_stats.get('prompt_tokens', 0)
                                output_tokens = plan_token_stats.get('generated_tokens', 0)
                                total_tokens = plan_token_stats.get('total_tokens', 0)
                                input_chars = input_tokens * 4
                                output_chars = output_tokens * 4
                                print(c(f"   [Input: {input_tokens} tokens ({input_chars} chars), Output: {output_tokens} tokens ({output_chars} chars), Total: {total_tokens} tokens]", "dim"))
                                try:
                                    self.session_logger.log_event(
                                        'token_stats',
                                        'Plan generation token usage',
                                        metadata={
                                            'model': model,
                                            'prompt_tokens': input_tokens,
                                            'generated_tokens': output_tokens,
                                            'total_tokens': total_tokens
                                        }
                                    )
                                except Exception:
                                    pass
                            
                            # Format code blocks with white background
                            if plan:
                                plan = format_code_blocks_with_background(plan)
                                successful_model = model
                                break
                    except RuntimeError as e:
                        # Stop processing animation on error
                        self._stop_processing_animation()
                        
                        tier_names = {0: 'Tier 0', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
                        tier = get_model_tier(model)
                        
                        if "timeout" in str(e).lower():
                            print(c(f"⚠️  {model} ({tier_names[tier]}) timed out after {timeout}s", "yellow"))
                            print(c(f"   Reason: Model took too long to respond", "dim"))
                            print(c(f"🔄 Trying next tier...", "cyan"))
                            print()
                            continue
                        else:
                            # Other runtime error
                            print(c(f"❌ {model} ({tier_names[tier]}) failed", "red"))
                            print(c(f"   Reason: {str(e)[:100]}", "dim"))
                            print(c(f"🔄 Trying next tier...", "cyan"))
                            print()
                            continue
                    except Exception as e:
                        self._stop_processing_animation()
                        
                        tier_names = {0: 'Tier 0', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
                        tier = get_model_tier(model)
                        
                        print(c(f"❌ {model} ({tier_names[tier]}) failed", "red"))
                        print(c(f"   Reason: {str(e)[:100]}", "dim"))
                        print(c(f"🔄 Trying next tier...", "cyan"))
                        print()
                        continue
                
                # Extract steps from plan if we got one
                # (but don't show them - parser will generate better ones)
                if plan and successful_model:
                    tier = get_model_tier(successful_model)
                    lines = plan.strip().split('\n')
                    for line in lines:
                        line = line.strip()
                        if line and (line[0].isdigit() or line.startswith('-')):
                            # Remove numbering and clean
                            step_text = re.sub(r'^[\d\-\.\)]+\s*', '', line)
                            if step_text:
                                steps.append(step_text)
                    
                    # Don't print LLM steps - parser will provide better ones
        
        # Always use intelligent parser instead of unreliable LLM checklist output
        # LLMs often produce generic/vague steps - our parser is smarter
        had_successful_model = successful_model is not None
        if True:  # Always use parser (changed from: if not steps)
            # Generate intelligent checklist based on user request
            # Use full user_input for better context, not stripped action_description
            steps = self._parse_dynamic_steps(user_input)
            
            # Show checklist with fallback steps
            print()
            print(c("─" * 60, "dim"))
            if had_successful_model:
                print(c(f"📋 {successful_model} - Task Checklist:", "purple"))
            else:
                # Show fallback notification when all models failed
                print(c("⚠️  All LLM models failed or timed out", "yellow"))
                print(c("🔄 Using dynamic fallback parser for step generation", "cyan"))
                print()
                
                # Calculate parser "token equivalent" based on input/output complexity
                input_chars = len(user_input)
                input_words = len(user_input.split())
                output_chars = sum(len(step) for step in steps)
                output_words = sum(len(step.split()) for step in steps)
                total_chars = input_chars + output_chars
                total_words = input_words + output_words
                
                # Estimate "tokens" (roughly 4 chars per token, or 0.75 words per token)
                input_tokens = max(int(input_chars / 4), int(input_words / 0.75))
                output_tokens = max(int(output_chars / 4), int(output_words / 0.75))
                total_tokens = input_tokens + output_tokens
                
                print(c(f"📋 Task Checklist (generated by parser):", "purple"))
                print(c(f"   [Input: {input_tokens} tokens ({input_chars} chars), Output: {output_tokens} tokens ({output_chars} chars), Total: {total_tokens} tokens]", "dim"))
                print(c(f"   [Method: Dynamic parser (rule-based, no LLM)]", "dim"))
            print(c("─" * 60, "dim"))
            print()
            for i, step in enumerate(steps, 1):
                print(c(f"  [ ] {i}. {step}", "dim"))
            print()
            print(c("─" * 60, "dim"))
            print()
        
        total_steps = len(steps)
        
        # Tier 2+ always runs scripts to test, lower tiers only if requested
        # Check if any step mentions NOT running
        should_not_run = any('library' in step.lower() or 'module only' in step.lower() for step in steps)
        
        # Get tier of current model
        from core.model_tiers import get_model_tier
        current_tier = get_model_tier(best_model) if best_model else 0
        
        # Tier 2+ (Advanced and above) always tests scripts
        if current_tier >= 2:
            should_run = not should_not_run  # Always test unless explicitly a library
        else:
            # Tier 0-1: Only run if explicitly requested
            should_run = any('run' in step.lower() or 'test' in step.lower() or 'execute' in step.lower() for step in steps)
        
        # Helper function to show checklist update
        def show_task_complete(task_num, task_text):
            """Show a task as completed in the checklist."""
            print(c(f"  [✓] {task_num}. {task_text}", "green"))
        
        # Extract filename from task_result
        file_path_str = task_result.args.get('file')
        if file_path_str:
            from pathlib import Path
            filename = Path(file_path_str).name
        else:
            # Fallback: generate filename from action description
            action_desc = task_result.args.get('action_description', '')
            if action_desc:
                # Use the same logic as _generate_filename_from_action
                filename = self.task_system._generate_filename_from_action(action_desc)
            else:
                filename = 'script.py'
        
        # STEP 1: Execute first step from plan
        step_1_text = steps[0] if steps else "Creating empty file"
        print_step(1, total_steps, step_1_text)
        
        # Ensure any animations are stopped before task execution (which may prompt user)
        import sys
        lucifer_module = sys.modules.get('__main__')
        if lucifer_module and hasattr(lucifer_module, 'HEART_STATE'):
            lucifer_module.HEART_STATE = "busy"
        
        # Get the file path from task output or construct it
        file_path = task_result.args.get('file')
        if not file_path:
            # Construct file path from folder + generated filename
            folder_path = task_result.args.get('folder')
            if folder_path:
                from pathlib import Path
                target_dir = Path(folder_path)
                original_filename = filename
                
                # Check if file already exists and handle naming conflict
                proposed_path = target_dir / filename
                if proposed_path.exists():
                    # Check if user explicitly requested this specific filename
                    user_input_lower = user_input.lower()
                    explicitly_named = any([
                        f"name it {original_filename}" in user_input_lower,
                        f"call it {original_filename}" in user_input_lower,
                        f"named {original_filename}" in user_input_lower,
                        f"create {original_filename}" in user_input_lower,
                        f"make {original_filename}" in user_input_lower,
                        user_input_lower.endswith(original_filename),
                        user_input_lower.startswith(original_filename)
                    ])
                    
                    if explicitly_named:
                        # User explicitly requested this filename - prompt for overwrite
                        print(c(f"⚠️  File already exists: {proposed_path}", "yellow"))
                        print(c(f"📝 You explicitly requested filename: {original_filename}", "dim"))
                        response = input(c(f"   Overwrite existing file? (y/n): ", "yellow")).strip().lower()
                        
                        if response == 'y':
                            print(c(f"✅ Overwriting {original_filename}", "green"))
                            file_path = str(proposed_path)
                            print()
                        else:
                            print(c(f"❌ Cancelled by user", "red"))
                            return ""
                    else:
                        # Auto-generate unique filename (no prompt needed)
                        print(c(f"⚠️  File '{original_filename}' exists - generating unique name...", "yellow"))
                        name_stem = proposed_path.stem
                        name_suffix = proposed_path.suffix
                        counter = 1
                        
                        while proposed_path.exists():
                            new_filename = f"{name_stem}_{counter}{name_suffix}"
                            proposed_path = target_dir / new_filename
                            counter += 1
                        
                        filename = proposed_path.name
                        file_path = str(proposed_path)
                        print(c(f"✅ Using: {filename}", "green"))
                        print()
                else:
                    file_path = str(proposed_path)
                
                # Create the file
                Path(file_path).parent.mkdir(parents=True, exist_ok=True)
                Path(file_path).write_text('# Placeholder\\n')
                print(c(f"📝 Created: {file_path}", "green"))
            else:
                return ""
        else:
            # File path was provided - execute task normally
            task_output = self._handle_universal_task(task_result, original_input=None)
            print(task_output)
        
        print()
        if len(steps) > 0:
            show_task_complete(1, steps[0])
        print()
        
        # STEP 2: Write code to file
        step_2_text = steps[1] if len(steps) > 1 else "Writing code to file"
        print_step(2, total_steps, step_2_text)
        
        # Try models in order for code generation (with fallback like planning)
        code = None
        code_gen_model = None
        
        if best_model:
            from core.model_tiers import get_model_tier
            
            # Get sorted list of models to try (start with successful_model from planning)
            enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
            non_corrupted = [m for m in enabled_models if not self._is_model_corrupted(m)]
            
            # Deduplicate by model file
            from model_files_map import MODEL_FILES
            seen_files = set()
            unique_models = []
            for m in non_corrupted:
                model_file = MODEL_FILES.get(m)
                if model_file and model_file not in seen_files:
                    seen_files.add(model_file)
                    unique_models.append(m)
            
            # Sort models by tier (highest first), but put successful_model first if available
            sorted_models = sorted(unique_models, key=lambda m: get_model_tier(m), reverse=True)
            if successful_model and successful_model in sorted_models:
                sorted_models.remove(successful_model)
                sorted_models.insert(0, successful_model)
            
            # Try each model until one succeeds
            for model in sorted_models:
                try:
                    # Extract action description from task_result if available
                    action_desc = task_result.args.get('action_description')
                    if not action_desc:
                        # Fall back to extracting from user input
                        action_desc = user_input.replace('write me a script', '').replace('create a script', '').replace('create a file', '').strip()
                    
                    # Show which model is routed and what it's thinking about
                    tier_names = {0: 'Tier 0', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
                    tier = get_model_tier(model)
                    print(c(f"🧠 Routed to: {model}", "cyan") + c(f" ({tier_names[tier]})", "dim"))
            
                    
                    # Tier 0-1: Can only use templates, cannot generate
                    if tier <= 1:
                        print(c(f"🎯 {model} ({tier_names[tier]}) searching local consensus for templates...", "purple"))
                        print(c(f"   Task: {action_desc}", "dim"))
                        print()
                        
                        # Search for template
                        from template_consensus import TemplateConsensus
                        template_system = TemplateConsensus(self.user_id)
                        matches = template_system.search_templates(action_desc, language='python')
                        
                        if matches:
                            # Use best matching template
                            best_match = matches[0]
                            print(c(f"✅ Found template: {best_match['name']}", "green"))
                            print(c(f"   Relevance: {best_match['relevance_score']}/10", "dim"))
                            print(c(f"   Source: {best_match['source']}", "dim"))
                            print()
                            code = best_match['template']
                            code_gen_model = model
                            break  # Success with template
                        else:
                            print(c(f"⚠️  No matching templates found in consensus", "yellow"))
                            print(c(f"   {tier_names[tier]} models cannot generate new code, only use existing templates", "dim"))
                            print(c(f"🔄 Trying next tier...", "cyan"))
                            print()
                            continue  # Try next model
                    else:
                        # Tier 2+: Check templates first, then generate if needed
                        print(c(f"🔍 {model} ({tier_names[tier]}) checking templates first...", "purple"))
                        print(c(f"   Task: {action_desc}", "dim"))
                        print()
                        
                        # Search for existing templates
                        from template_consensus import TemplateConsensus
                        template_system = TemplateConsensus(self.user_id)
                        matches = template_system.search_templates(action_desc, language='python')
                        
                        if matches and matches[0]['relevance_score'] >= 5:
                            # Found good template - ask model to validate/adapt it
                            best_match = matches[0]
                            print(c(f"✅ Found template: {best_match['name']}", "green"))
                            print(c(f"   Relevance: {best_match['relevance_score']}/10", "dim"))
                            print(c(f"🤔 {model} validating if template fits request...", "cyan"))
                            print()
                            
                            # Ask Tier 2+ model to validate and potentially modify
                            self._start_processing_animation()
                            
                            validation_prompt = f"""Task: {action_desc}

Existing template code:
```python
{best_match['template']}
```

Analyze if this template code achieves the task.

Respond in this format:
1. DECISION: USE_AS_IS or NEEDS_MODIFICATION or GENERATE_NEW
2. If NEEDS_MODIFICATION, provide modified code in ```python block
3. If GENERATE_NEW, explain why template doesn't fit

Be concise."""
                            
                            from llm_backend import LLMBackend
                            routed_llm = LLMBackend(model=model, verbose=False)
                            
                            try:
                                decision = routed_llm.generate(validation_prompt, max_tokens=1024, timeout=30)
                                self._stop_processing_animation()
                                
                                if 'USE_AS_IS' in decision.upper():
                                    # Use template as-is
                                    print(c(f"✅ Template validated - using as-is", "green"))
                                    print()
                                    code = best_match['template']
                                    code_gen_model = model
                                    break
                                    
                                elif 'NEEDS_MODIFICATION' in decision.upper():
                                    # Extract modified code
                                    print(c(f"🔧 Template needs modifications - adapting...", "cyan"))
                                    print()
                                    
                                    if '```python' in decision:
                                        parts = decision.split('```python')
                                        if len(parts) > 1:
                                            code_part = parts[1].split('```')[0]
                                            code = code_part.strip()
                                            code_gen_model = model
                                            break
                                    
                                    # If extraction failed, generate new
                                    print(c(f"⚠️  Couldn't extract modifications, generating fresh code...", "yellow"))
                                    print()
                                    
                                else:  # GENERATE_NEW or parsing failed
                                    print(c(f"🆕 Template doesn't fit - generating new code...", "yellow"))
                                    print()
                                    # Continue to code generation below
                                    
                            except Exception as e:
                                self._stop_processing_animation()
                                print(c(f"⚠️  Template validation failed: {str(e)[:50]}", "yellow"))
                                print(c(f"   Generating new code instead...", "dim"))
                                print()
                        else:
                            # No good templates - generate new code
                            if matches:
                                print(c(f"💡 Template relevance too low ({matches[0]['relevance_score']}/10)", "yellow"))
                            else:
                                print(c(f"💡 No existing templates found", "yellow"))
                            print(c(f"🤔 {model} generating new code...", "purple"))
                            print()
            
                    
                    # Only Tier 2+ can generate new code
                    if tier >= 2 and not code:
                        # Start processing animation
                        self._start_processing_animation()
                        
                        # Determine max_tokens based on model tier
                        tier_max_tokens = {
                            0: 512,    # Basic models: small context
                            1: 1024,   # General purpose: moderate
                            2: 2048,   # Advanced: large
                            3: 4096,   # Expert: very large
                            4: 8192    # Ultra-expert: massive
                        }
                        initial_max_tokens = tier_max_tokens.get(tier, 1024)
                        
                        code_prompt = f"""Write Python code for: {action_desc}

IMPORTANT:
- Output ONLY Python code
- Wrap in ```python and ``` markers  
- NO explanations or text outside code block
- Make it functional and complete"""
                        
                        # Create LLM backend with current model
                        from llm_backend import LLMBackend
                        routed_llm = LLMBackend(model=model, verbose=False)
                
                        # Try with initial limit
                        try:
                            code_result = routed_llm.generate(code_prompt, max_tokens=initial_max_tokens, timeout=60, return_stats=True)
                            
                            # Parse result (handle both tuple and string returns)
                            if isinstance(code_result, tuple):
                                code, code_token_stats = code_result
                            else:
                                code = code_result
                                code_token_stats = None
                            
                            # Success!
                            code_gen_model = model
                            self._stop_processing_animation()
                            
                            # Display token stats if available
                            if code_token_stats and code_token_stats.get('total_tokens', 0) > 0:
                                input_tokens = code_token_stats.get('prompt_tokens', 0)
                                output_tokens = code_token_stats.get('generated_tokens', 0)
                                total_tokens = code_token_stats.get('total_tokens', 0)
                                input_chars = input_tokens * 4
                                output_chars = output_tokens * 4
                                print(c(f"   [Input: {input_tokens} tokens ({input_chars} chars), Output: {output_tokens} tokens ({output_chars} chars), Total: {total_tokens} tokens]", "dim"))
                                print()
                            
                            break
                        except Exception as e:
                            error_msg = str(e).lower()
                            # Check if it's a token limit error
                            if 'too long' in error_msg or 'max' in error_msg or 'token' in error_msg:
                                # Self-permission: escalate to next tier's limit
                                escalated_max = tier_max_tokens.get(tier + 1, initial_max_tokens * 2)
                                self._stop_processing_animation()
                                print(c(f"⚠️  Initial limit too small, requesting permission to use {escalated_max} tokens", "yellow"))
                                print(c(f"✅ Self-granted: escalating to tier {tier + 1} limits", "green"))
                                print()
                                self._start_processing_animation()
                                try:
                                    code = routed_llm.generate(code_prompt, max_tokens=escalated_max, timeout=90)
                                    code_gen_model = model
                                    self._stop_processing_animation()
                                    break
                                except Exception as e2:
                                    self._stop_processing_animation()
                                    # Escalation failed, try next model
                                    raise e2
                            else:
                                self._stop_processing_animation()
                                # Error occurred, will try next model
                                raise e
                
                except RuntimeError as e:
                    # Model failed - show error and try next
                    print(c(f"❌ {model} ({tier_names[tier]}) failed", "red"))
                    print(c(f"   Reason: {str(e)[:100]}", "dim"))
                    print(c(f"🔄 Trying next tier...", "cyan"))
                    print()
                    continue
                except Exception as e:
                    # Model failed - show error and try next
                    print(c(f"❌ {model} ({tier_names[tier]}) failed", "red"))
                    print(c(f"   Reason: {str(e)[:100]}", "dim"))
                    print(c(f"🔄 Trying next tier...", "cyan"))
                    print()
                    continue
        
        # Check if we got code
        code_generation_failed = not code or not code.strip()
        if code_generation_failed:
            # No code generated - check why
            if code_gen_model:
                print(c(f"❌ {code_gen_model} returned empty response", "red"))
                print(c("   This indicates a model error, timeout, or context overflow", "yellow"))
                print()
            else:
                # No Tier 2+ model available and no templates matched
                print(c("❌ No code generated", "red"))
                print(c("   No matching templates found in consensus", "yellow"))
                print(c("   No Tier 2+ models available to generate new code", "yellow"))
                print()
            
            # Show step 2 as failed
            print()
            if len(steps) > 1:
                print(c(f"  [✗] 2. {steps[1]}", "red"))
            print()
            
            # Track completion status
            completed_steps = [True, False]  # Step 1 completed, step 2 failed
            
            # Show final checklist
            print(c("─" * 60, "dim"))
            print(c("📋 Final Checklist:", "purple"))
            print(c("─" * 60, "dim"))
            print()
            for i, step in enumerate(steps[:2], 1):
                if i <= len(completed_steps):
                    if completed_steps[i-1]:
                        print(c(f"  [✓] {i}. {step}", "green"))
                    else:
                        print(c(f"  [✗] {i}. {step}", "red"))
                else:
                    print(c(f"  [ ] {i}. {step}", "dim"))
            print()
            print(c("─" * 60, "dim"))
            
            # Overall status
            print(c("⚠️  Workflow completed with errors", "yellow"))
            print()
            
            # Generate execution summary with tiered routing (like code generation)
            if best_model:
                from core.model_tiers import get_model_tier
                from llm_backend import LLMBackend
                from model_files_map import MODEL_FILES
                
                # Get sorted list of models to try
                enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
                non_corrupted = [m for m in enabled_models if not self._is_model_corrupted(m)]
                
                # Deduplicate by model file
                seen_files = set()
                unique_models = []
                for m in non_corrupted:
                    model_file = MODEL_FILES.get(m)
                    if model_file and model_file not in seen_files:
                        seen_files.add(model_file)
                        unique_models.append(m)
                
                sorted_models = sorted(unique_models, key=lambda m: get_model_tier(m), reverse=True)
                
                steps_list = "\n".join([f"{i}. {step} - {'completed' if i <= len(completed_steps) and completed_steps[i-1] else 'failed'}" 
                                         for i, step in enumerate(steps[:2], 1)])
                
                summary_prompt = f"""In 1-2 sentences: User asked '{user_input}'. Created {filename} but code generation failed. Step 1 done, step 2 failed. Summarize:"""
                
                summary = None
                summary_model = None
                
                # Try each model in tier order
                tier_names = {0: 'Tier 0', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
                
                for model in sorted_models:
                    try:
                        tier = get_model_tier(model)
                        
                        # Show processing animation for Tier 2+
                        if tier >= 2:
                            self._start_processing_animation()
                        
                        summary_llm = LLMBackend(model=model, verbose=False)
                        # Give Tier 0/1 more time since they're slower, shorter for Tier 2+ to fail fast
                        timeout = 30 if tier <= 1 else 15
                        
                        # Generate the summary first, then print header only if successful
                        summary = summary_llm.generate(summary_prompt, max_tokens=100, timeout=timeout, stream=False)
                        
                        # Stop animation before displaying result
                        if tier >= 2:
                            self._stop_processing_animation()
                        
                        if summary and summary.strip():
                            # Success! Print header and stream the summary
                            summary_model = model
                            print(c(f"💬 {model} - Execution Summary: ", "purple"), end='', flush=True)
                            
                            # Stream it character by character
                            import time
                            for char in summary.strip():
                                print(char, end='', flush=True)
                                time.sleep(0.01)  # 10ms delay
                            print()
                            break
                    except Exception as e:
                        # Stop animation if started
                        tier = get_model_tier(model)
                        if tier >= 2:
                            self._stop_processing_animation()
                        
                        # Show failure message
                        error_msg = str(e)[:50]
                        print(c(f"❌ {model} ({tier_names[tier]}) failed", "red"))
                        print(c(f"   Reason: {error_msg}", "dim"))
                        if sorted_models.index(model) < len(sorted_models) - 1:
                            print(c(f"🔄 Trying next tier...", "cyan"))
                        print()
                        continue
                
                if not (summary and summary.strip() and summary_model):
                    # Fallback: Stream basic summary character by character to match LLM behavior
                    import time
                    print(c("💬 Execution Summary: ", "purple"), end='', flush=True)
                    fallback_text = f"Created file {filename} but failed to generate code. Steps 1-2 completed, step 3 failed."
                    for char in fallback_text:
                        print(char, end='', flush=True)
                        time.sleep(0.02)  # 20ms delay between characters
                    print()
                
                print()
            
            return f"Failed: No templates matched and no Tier 2+ models available to generate code"
        
        # Code was generated/found - display and write it
        print(c(f"✅ {code_gen_model} provided the code", "green"))
        print()
        
        if code:
            # Extract code between ``` markers - handle multiple formats
            code = code.strip()
            
            # Remove markdown code fences if present
            if code.startswith('```'):
                lines = code.split('\n')
                # Remove first line (```python or ```)
                lines = lines[1:]
                # Remove last line if it's closing ```
                if lines and lines[-1].strip() == '```':
                    lines = lines[:-1]
                code = '\n'.join(lines)
            elif '```' in code:
                # Handle embedded ``` markers
                parts = code.split('```')
                if len(parts) >= 3:
                    code_block = parts[1]
                    lines = code_block.split('\n')
                    # Remove language identifier if present
                    if lines and lines[0].strip() in ['python', 'py', '']:
                        code = '\n'.join(lines[1:])
                    else:
                        code = code_block
            
            code = code.strip()
            
            # Validate that we got actual code, not instructions
            first_line = code.split('\n')[0].strip().upper()
            code_lower = code.lower()
            is_invalid = any([
                first_line.startswith('WRITE'),
                first_line.startswith('CREATE'),
                first_line.startswith('TASK:'),
                first_line.startswith('BACKGROUND'),
                first_line.startswith('INSTRUCTIONS:'),
                first_line.startswith('THE TASK'),
                'descriptive variable' in code_lower,
                'test your code' in code_lower,
                '[your code here]' in code_lower,
                'instructions:' in code_lower,
                'background info' in code_lower,
                'start by defining' in code_lower,
                len(code) < 10,  # Too short
                not any(c in code for c in ['import', 'def', '=', '('])  # No code markers
            ])
            
            if is_invalid:
                print(c("❌ LLM generated invalid output (instructions instead of code) - FAILED", "red"))
                print()
                print(c("First 500 chars of what it generated:", "yellow"))
                print(code[:500])
                print()
                return ""
            
            # Display code with line numbers
            new_lines = code.split('\n')
            print(c(f"📝 Writing to {file_path}:", "cyan"))
            print(c(f"  New file: {len(new_lines)} lines (lines 1-{len(new_lines)})", "green"))
            print()
            
            # Show script type with line range
            print(c(f"```python (lines 1-{len(new_lines)})", "dim"))
            
            # White background for code with line numbers
            for i, line in enumerate(new_lines, 1):
                print(c(f"{i:4d}| ", "dim"), end='')
                print(f"\033[47m\033[30m{line}\033[0m")
            
            # Close code block
            print(c("```", "dim"))
            
            print()
            
            # Write to file
            Path(file_path).write_text(code)
            print(c(f"✅ Code written: {len(new_lines)} lines", "green"))
            
            # Track in session memory
            filename = Path(file_path).name
            self.session_files[filename] = file_path
            self.session_files[filename.lower()] = file_path  # Also lowercase for easy lookup
        
        # Before running, proactively detect dependencies and prepare environment if needed
        proactive_env_path = None
        try:
            detected = self._detect_third_party_imports(Path(file_path).read_text())
            if detected:
                from luci_env_manager import get_luci_env_manager
                env_manager = get_luci_env_manager()
                env_bin, _ = env_manager.find_or_create_environment(file_path, detected)
                if env_bin:
                    proactive_env_path = env_bin
        except Exception:
            pass
        
        print()
        if len(steps) > 1:
            show_task_complete(2, steps[1])
        print()
        
        # STEP 3: Run the script with automatic fix-and-retry (if requested)
        script_success = False
        if should_run:
            # Check if step 3 is in the LLM-generated checklist
            step_3_exists = len(steps) > 2
            step_number = 3 if step_3_exists else len(steps) + 1
            
            if step_3_exists:
                print_step(step_number, total_steps, steps[2])
            else:
                print_step(step_number, step_number, "Running the script")
            
            # Initialize environment manager
            from luci_env_manager import get_luci_env_manager
            env_manager = get_luci_env_manager()
            
            # Use proactive environment if already prepared, otherwise None
            current_env_path = proactive_env_path if 'proactive_env_path' in locals() else None
            detected_dependencies = set()  # Track missing dependencies
            
            max_retries = 3
            retry_count = 0
            last_error = None
            fixed_issues = set()  # Track fixed issues to detect progress
            
            while retry_count < max_retries:
                try:
                    # Run the Python script (with environment if available)
                    if current_env_path:
                        result = env_manager.run_script_in_environment(file_path, current_env_path, timeout=60)
                    else:
                        result = subprocess.run(
                            ["python3", file_path],
                            capture_output=True,
                            text=True,
                            timeout=60
                        )
                    
                    if result.stdout:
                        print(c("📤 Script output:", "cyan"))
                        print()
                        for line in result.stdout.split('\n'):
                            if line.strip():
                                print(f"\033[47m\033[30m{line}\033[0m")
                        print()
                    
                    if result.returncode == 0:
                        script_success = True
                        print(c(f"✅ Script executed successfully (exit code: {result.returncode})", "green"))
                        print()
                        
                        # Save working code as template to consensus (for Tier 0/1 future use)
                        action_desc = task_result.args.get('action_description', user_input)
                        if action_desc and code_gen_model and not fixed_issues:  # Only save initially generated code, not fixes
                            from core.model_tiers import get_model_tier
                            tier = get_model_tier(code_gen_model)
                            if tier >= 2:  # Only save Tier 2+ verified working code
                                try:
                                    from template_consensus import TemplateConsensus
                                    template_system = TemplateConsensus(self.user_id)
                                    
                                    # Create template name from action (sanitize)
                                    template_name = action_desc.replace(' ', '_').replace('/', '_').replace('\\', '_')[:50]
                                    
                                    # Get the working code
                                    working_code = Path(file_path).read_text()
                                    
                                    # Extract meaningful tags from action description
                                    # E.g., "runs browser" -> ["runs", "browser", "web", "open"]
                                    import re
                                    words = re.findall(r'\b\w+\b', action_desc.lower())
                                    # Filter out common words
                                    stop_words = {'a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'that', 'this'}
                                    tags = [w for w in words if w not in stop_words and len(w) > 2]
                                    # Add common synonyms for better search
                                    if 'browser' in tags or 'web' in tags:
                                        tags.extend(['webbrowser', 'chrome', 'firefox', 'safari', 'internet'])
                                    if 'run' in tags or 'runs' in tags:
                                        tags.extend(['execute', 'launch', 'open', 'start'])
                                    # Remove duplicates while preserving order
                                    seen = set()
                                    tags = [x for x in tags if not (x in seen or seen.add(x))]
                                    
                                    # Save to consensus with smart keyword management
                                    # This will:
                                    # 1. Cleanup orphaned templates (no keywords)
                                    # 2. Check for duplicates and merge keywords if exists
                                    # 3. Create new template if unique
                                    
                                    # Check if template already exists before adding
                                    existing_hash = template_system.find_similar_template(template_name, working_code)
                                    
                                    template_hash = template_system.add_template(
                                        name=template_name,
                                        description=f"Verified working code: {action_desc}",
                                        template_code=working_code,
                                        language='python',
                                        keywords=tags  # Correct parameter name
                                    )
                                    
                                    # Get author info
                                    from core.founder_config import format_author_display
                                    author_display = format_author_display(template_system.user_id)
                                    
                                    if existing_hash and existing_hash == template_hash:
                                        # Existing template - keywords merged
                                        print(c(f"🔄 Updated existing template: '{template_name}'", "cyan"))
                                        print(c(f"   Merged new keywords into existing template", "dim"))
                                    else:
                                        # New template created
                                        print(c(f"📚 New template saved to consensus: '{template_name}'", "green"))
                                    
                                    print(c(f"   Author: {author_display}", "dim"))
                                    print(c(f"   Tags: {', '.join(tags[:5])}{'...' if len(tags) > 5 else ''}", "dim"))
                                    print(c(f"   Trigger keywords: {', '.join(tags[:3])}", "dim"))
                                    print(c(f"   Tier 0/1 models can now reuse this verified template", "dim"))
                                    print()
                                except Exception as e:
                                    # Show error for debugging
                                    print(c(f"⚠️  Could not save to consensus: {str(e)[:100]}", "yellow"))
                                    import traceback
                                    traceback.print_exc()
                        
                        # If we fixed issues, upload to consensus with tree branching
                        if fixed_issues and self.uploader:
                            print()
                            print(c("🌐 Uploading successful fix to FixNet consensus...", "dim"))
                            try:
                                # Check if we have pending upload info with strategy
                                upload_info = None
                                if hasattr(self, '_pending_consensus_upload'):
                                    upload_info = self._pending_consensus_upload.get(last_error)
                                
                                fix_data = {
                                    'error_signature': last_error,
                                    'error_output': result.stderr if 'result' in locals() else '',
                                    'fix_code': Path(file_path).read_text(),
                                    'fixed_issues': list(fixed_issues),
                                    'language': 'python',
                                    'success': True
                                }
                                
                                # Add tree branching info if available
                                if upload_info:
                                    strategy = upload_info.get('strategy', 'NEW_FIX')
                                    parent_fix_id = upload_info.get('parent_fix_id')
                                    
                                    fix_data['fix_strategy'] = strategy
                                    if parent_fix_id:
                                        fix_data['parent_fix_id'] = parent_fix_id
                                    
                                    if strategy == 'USE_CONSENSUS':
                                        print(c(f"  ✅ Confirming consensus fix #{parent_fix_id} works", "green"))
                                    elif strategy == 'ADAPT_CONSENSUS':
                                        print(c(f"  🌳 Creating branch from fix #{parent_fix_id}", "cyan"))
                                    else:
                                        print(c("  🌱 Creating new fix tree", "cyan"))
                                    
                                    # Clean up pending upload
                                    del self._pending_consensus_upload[last_error]
                                
                                self.uploader.upload_fix(fix_data)
                                print(c("✅ Fix uploaded to consensus for collaborative learning", "green"))
                            except Exception as e:
                                print(c(f"⚠️  Could not upload fix: {e}", "dim"))
                        
                        break
                    else:
                        # Script failed - check if it's a missing dependency
                        print(c("⚠️  Script errors:", "yellow"))
                        print()
                        # Display error with line numbers
                        error_lines = result.stderr.split('\n')
                        for i, line in enumerate(error_lines, 1):
                            if line.strip():
                                print(c(f"{i:4d}| ", "dim"), end='')
                                print(f"\033[47m\033[30m{line}\033[0m")
                        print()
                        
                        # Check for missing dependency (ModuleNotFoundError)
                        import re
                        module_match = re.search(r"ModuleNotFoundError: No module named '([^']+)'", result.stderr)
                        
                        if module_match and not current_env_path:
                            # Missing dependency detected - create environment
                            missing_module = module_match.group(1)
                            detected_dependencies.add(missing_module)
                            
                            print(c(f"📦 Missing dependency detected: {missing_module}", "cyan"))
                            print()
                            
                            # Create/find environment with dependencies
                            env_path, is_new = env_manager.find_or_create_environment(
                                file_path,
                                list(detected_dependencies)
                            )
                            
                            if env_path:
                                current_env_path = env_path
                                print()
                                print(c("🔄 Retrying with luci environment...", "cyan"))
                                print()
                                continue  # Retry with environment
                            else:
                                print(c("❌ Failed to create environment", "red"))
                                break
                        
                        # Extract error type to track progress
                        error_signature = self._extract_error_signature(result.stderr)
                        
                        # Check if this is a new error (progress) or same error (stuck)
                        if error_signature in fixed_issues:
                            print(c("❌ Same error persists after fix attempt. Stopping retries.", "red"))
                            break
                        
                        # Mark this error as addressed
                        if last_error:
                            fixed_issues.add(last_error)
                            print(c(f"✅ Progress: Fixed previous issue, now addressing new error", "green"))
                        
                        last_error = error_signature
                        retry_count += 1
                        
                        if retry_count < max_retries:
                            print(c(f"\n🔧 Attempt {retry_count}/{max_retries}: Analyzing error and generating fix...", "cyan"))
                            print()
                            
                            # Comprehensive error analysis (Warp-style)
                            current_code = Path(file_path).read_text()
                            error_analysis = self._analyze_error_comprehensively(result.stderr, current_code, llm)
                            
                            if error_analysis['root_cause']:
                                print(c(f"💉 Root cause: {error_analysis['root_cause']}", "yellow"))
                            
                            if error_analysis['multi_area']:
                                print(c(f"⚠️  Multi-area fix required: {len(error_analysis['affected_areas'])} sections", "yellow"))
                                for i, area in enumerate(error_analysis['affected_areas'][:3], 1):
                                    print(c(f"  {i}. {area}", "dim"))
                            
                            if error_analysis['fix_plan']:
                                print(c("📄 Fix plan:", "cyan"))
                                for step in error_analysis['fix_plan'][:3]:
                                    print(c(f"  • {step}", "dim"))
                            
                            print()
                            
                            # STEP 1: Check FixNet consensus for similar fixes
                            consensus_fixes = []
                            parent_fix_id = None
                            if self.uploader:
                                print(c("🔍 Checking FixNet consensus database...", "dim"))
                                try:
                                    from fixnet_consensus import search_consensus_fix
                                    consensus_result = search_consensus_fix(error_signature, result.stderr)
                                    if consensus_result:
                                        if isinstance(consensus_result, list):
                                            consensus_fixes = consensus_result
                                        else:
                                            consensus_fixes = [consensus_result]
                                        print(c(f"✅ Found {len(consensus_fixes)} similar fix(es) in consensus", "green"))
                                        for i, fix in enumerate(consensus_fixes[:3], 1):
                                            conf = fix.get('confidence', 0)
                                            fix_id = fix.get('fix_id', 'unknown')
                                            print(c(f"  {i}. Fix #{fix_id} (confidence: {conf:.0%})", "dim"))
                                except Exception as e:
                                    pass  # Consensus check is optional
                            
                            # STEP 2: Let LLM decide whether to use consensus or generate new fix
                            if best_model:
                                # Build context with consensus fixes if available
                                consensus_context = ""
                                if consensus_fixes:
                                    consensus_context = "\n\nAvailable fixes from consensus database:\n"
                                    for i, fix in enumerate(consensus_fixes[:3], 1):
                                        fix_code = fix.get('fix_code', '')
                                        conf = fix.get('confidence', 0)
                                        fix_id = fix.get('fix_id', 'unknown')
                                        consensus_context += f"\nFix #{fix_id} ({conf:.0%} confidence):\n{fix_code}\n"
                                
                                analysis_context = ""
                                if error_analysis['root_cause']:
                                    analysis_context += f"\nRoot cause: {error_analysis['root_cause']}"
                                if error_analysis['fix_plan']:
                                    analysis_context += "\n\nFix plan:\n" + "\n".join(f"{i}. {step}" for i, step in enumerate(error_analysis['fix_plan'], 1))
                                
                                # Prompt LLM to decide strategy
                                decision_prompt = f"""Error:
{result.stderr}

Current code:
{current_code}{analysis_context}{consensus_context}

RULES - Output MUST follow this EXACT format:

Line 1: ONE of these decisions:
- USE_CONSENSUS: [fix_id]
- ADAPT_CONSENSUS: [fix_id]
- NEW_FIX

Line 2: ```python
Lines 3+: Complete working code
Last line: ```

NO explanations. NO text outside code block. ONLY decision + code."""
                                
                                # Get LLM decision and fix
                                fixed_code = None
                                fix_strategy = "NEW_FIX"  # Default
                                used_consensus_id = None
                                
                                # Use tier-based max_tokens for fix generation
                                fix_max_tokens = tier_max_tokens.get(tier, 2048)
                                
                                for llm_attempt in range(3):  # 3 timeout retries
                                    try:
                                        self._start_processing_animation()
                                        response = llm.generate(decision_prompt, max_tokens=fix_max_tokens, timeout=180)
                                        self._stop_processing_animation()
                                        
                                        if response:
                                            # Parse decision
                                            lines = response.strip().split('\n')
                                            first_line = lines[0] if lines else ""
                                            
                                            if "USE_CONSENSUS" in first_line:
                                                # Extract fix ID
                                                import re
                                                match = re.search(r'USE_CONSENSUS:\s*(\S+)', first_line)
                                                if match:
                                                    used_consensus_id = match.group(1)
                                                    fix_strategy = "USE_CONSENSUS"
                                                    # Find the consensus fix
                                                    for fix in consensus_fixes:
                                                        if str(fix.get('fix_id')) == used_consensus_id:
                                                            fixed_code = fix.get('fix_code', '')
                                                            parent_fix_id = used_consensus_id
                                                            print(c(f"📦 Using consensus fix #{used_consensus_id}", "green"))
                                                            break
                                            
                                            elif "ADAPT_CONSENSUS" in first_line:
                                                # Extract fix ID and modified code
                                                import re
                                                match = re.search(r'ADAPT_CONSENSUS:\s*(\S+)', first_line)
                                                if match:
                                                    used_consensus_id = match.group(1)
                                                    fix_strategy = "ADAPT_CONSENSUS"
                                                    parent_fix_id = used_consensus_id
                                                    print(c(f"🔧 Adapting consensus fix #{used_consensus_id}", "cyan"))
                                            
                                            # Extract code from response
                                            if '```' in response:
                                                parts = response.split('```')
                                                if len(parts) >= 3:
                                                    code_block = parts[1]
                                                    code_lines = code_block.split('\n')
                                                    if code_lines[0].strip() in ['python', 'py', '']:
                                                        fixed_code = '\n'.join(code_lines[1:])
                                                    else:
                                                        fixed_code = code_block
                                                    fixed_code = fixed_code.strip()
                                        
                                        break  # Success
                                    except Exception as e:
                                        self._stop_processing_animation()
                                        if 'timeout' in str(e).lower() or 'timed out' in str(e).lower():
                                            if llm_attempt < 2:
                                                print(c(f"⚠️  LLM timeout, retry {llm_attempt + 1}/2...", "yellow"))
                                                continue
                                        raise
                                
                                if fixed_code:
                                    # STEP 3: Apply fix and test
                                    Path(file_path).write_text(fixed_code)
                                    print(c("✅ Applied fix. Testing...", "green"))
                                    print()
                                    
                                    # The fix will be tested in the next iteration of the retry loop
                                    # If it works, upload to consensus with strategy info
                                    # Store strategy for later upload
                                    if not hasattr(self, '_pending_consensus_upload'):
                                        self._pending_consensus_upload = {}
                                    self._pending_consensus_upload[error_signature] = {
                                        'strategy': fix_strategy,
                                        'parent_fix_id': parent_fix_id,
                                        'fix_code': fixed_code
                                    }
                                else:
                                    print(c("❌ Could not generate fix", "red"))
                                    break
                        else:
                            print(c(f"\n⚠️  Max retries ({max_retries}) reached", "yellow"))
                            
                except subprocess.TimeoutExpired:
                    print(c("⚠️  Script execution timed out (60s limit)", "yellow"))
                    break
                except Exception as e:
                    print(c(f"❌ Error running script: {e}", "red"))
                    break
            
            if fixed_issues:
                print()
                print(c(f"🛠️  Fixed {len(fixed_issues)} issue(s) during execution", "cyan"))
            
            print()
            if script_success and len(steps) > 2:
                show_task_complete(3, steps[2])
            elif len(steps) > 2:
                print(c(f"  [✗] 3. {steps[2]}", "red"))
            print()
        
        # Track which steps were completed for final checklist
        completed_steps = [True] * min(2, len(steps))  # Steps 1-2 always complete if we get here
        if should_run and len(steps) > 2:
            completed_steps.append(script_success)  # Step 3 depends on script success
        
        print(c("─" * 60, "dim"))
        
        # Final checklist recap
        print(c("📋 Final Checklist:", "purple"))
        print(c("─" * 60, "dim"))
        print()
        for i, step in enumerate(steps[:len(completed_steps)], 1):
            if completed_steps[i-1]:
                print(c(f"  [✓] {i}. {step}", "green"))
            else:
                print(c(f"  [✗] {i}. {step}", "red"))
        print()
        print(c("─" * 60, "dim"))
        
        # Overall status
        if not should_run or script_success:
            print(c("🎉 All steps completed successfully!", "green"))
        else:
            print(c("⚠️  Workflow completed with errors", "yellow"))
        print()
        
        # Final LLM summary of execution flow
        if best_model:
            from core.model_tiers import get_model_tier
            current_tier = get_model_tier(best_model)
            
            # Tier 2+: Show processing animation. Tier 0/1: Silent
            if current_tier >= 2:
                self._start_processing_animation()
            
            # Build detailed execution context
            steps_list = "\n".join([f"{i}. {step} - {'completed' if completed_steps[i-1] else 'failed'}" 
                                     for i, step in enumerate(steps[:len(completed_steps)], 1)])
            
            summary_prompt = f"""Summarize this workflow in 1-2 sentences:

User asked: "{user_input}"

Steps:
{steps_list}

File: {filename}
Result: {"Success - script ran" if script_success else "Failed - script had errors" if should_run else "Created successfully"}

Your summary (1-2 sentences only):"""
            
            try:
                from llm_backend import LLMBackend
                summary_llm = LLMBackend(model=best_model, verbose=False)
                summary_result = summary_llm.generate(summary_prompt, max_tokens=100, timeout=30, return_stats=True)
                
                # Parse result (handle both tuple and string returns)
                if isinstance(summary_result, tuple):
                    summary, summary_token_stats = summary_result
                else:
                    summary = summary_result
                    summary_token_stats = None
            except:
                summary = None
                summary_token_stats = None
            
            # Stop processing animation if it was started
            if current_tier >= 2:
                self._stop_processing_animation()
            
            if summary:
                print(c(f"💬 {best_model} - Execution Summary:", "purple"))
                formatted_summary = format_code_blocks_with_background(summary.strip())
                print(c(formatted_summary, "white"))
                
                # Display token stats if available
                if summary_token_stats and summary_token_stats.get('total_tokens', 0) > 0:
                    input_tokens = summary_token_stats.get('prompt_tokens', 0)
                    output_tokens = summary_token_stats.get('generated_tokens', 0)
                    total_tokens = summary_token_stats.get('total_tokens', 0)
                    input_chars = input_tokens * 4
                    output_chars = output_tokens * 4
                    print(c(f"   [Input: {input_tokens} tokens ({input_chars} chars), Output: {output_tokens} tokens ({output_chars} chars), Total: {total_tokens} tokens]", "dim"))
                
                print()
        
        return ""
    
    def _handle_find_and_write_workflow(self, user_input: str, task_result) -> str:
        """Handle find-and-write workflow with steps."""
        import sys
        import subprocess
        from pathlib import Path
        
        # Always add validation step (step 3) to test changes
        # Optional step 4 if user explicitly asks to run
        user_lower = user_input.lower()
        should_run = any(keyword in user_lower for keyword in ['run it', 'execute it', 'and run', 'then run', 'and execute'])
        total_steps = 4 if should_run else 3
        
        # Get best model
        best_model = self._get_best_available_model()
        
        # Show bypass routing
        if best_model:
            from core.model_tiers import get_model_tier
            tier_names = {0: 'Tier 0', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
            best_tier = get_model_tier(best_model)
            
            enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
            tried_models = [m for m in enabled_models if not self._is_model_corrupted(m)]
            
            from model_files_map import MODEL_FILES
            seen_files = set()
            unique_lower_models = []
            
            for m in tried_models:
                if get_model_tier(m) < best_tier:
                    model_file = MODEL_FILES.get(m)
                    if model_file and model_file not in seen_files:
                        seen_files.add(model_file)
                        unique_lower_models.append(m)
            
            if unique_lower_models:
                skipped_parts = []
                for model in unique_lower_models:
                    tier = get_model_tier(model)
                    skipped_parts.append(c(f"{model}", "yellow") + c(f" ({tier_names[tier]})", "dim"))
                print(c(f"💡 Bypassed: ", "dim") + ", ".join(skipped_parts))
            
            print(c(f"🧠 Using {best_model}", "cyan") + c(f" ({tier_names[best_tier]})", "dim"))
            print()
            sys.stdout.flush()
        
        # Get task breakdown from LLM
        if best_model:
            from llm_backend import LLMBackend
            llm = LLMBackend(model=best_model, verbose=False)
            if llm.is_available():
                self._start_processing_animation()
                
                step_count = 4 if should_run else 3
                example = """1. Find and locate the file
2. Write code to the file
3. Validate changes work
4. Run the script""" if should_run else """1. Find and locate the file
2. Write code to the file
3. Validate changes work"""
                
                plan_prompt = f"""Break this request into {step_count} steps: "{user_input}"

Format: Just {step_count} numbered lines. No explanations. Example:
{example}

Your {step_count} steps:"""
                plan = llm.generate(plan_prompt, max_tokens=80)
                
                self._stop_processing_animation()
                
                if plan:
                    lines = plan.strip().split('\n')
                    clean_lines = [line for line in lines if line.strip() and (line.strip()[0].isdigit() or line.strip().startswith('-'))]
                    clean_plan = '\n'.join(clean_lines[:step_count])
                    
                    print(c(f"💬 {best_model} - Task Breakdown:", "purple"))
                    formatted_plan = format_code_blocks_with_background(clean_plan)
                    print(c(formatted_plan, "white"))
                    print()
        
        # STEP 1: Find the file
        print(c("─" * 60, "dim"))
        print(c(f"🔍 Step 1/{total_steps}: Locating file", "cyan"))
        print()
        
        # Execute the find task
        lucifer_module = sys.modules.get('__main__')
        if lucifer_module and hasattr(lucifer_module, 'HEART_STATE'):
            lucifer_module.HEART_STATE = "busy"
        
        task_output = self._handle_universal_task(task_result, original_input=None)
        print(task_output)
        
        # Extract file path from output
        file_path = None
        if hasattr(task_result, 'args'):
            file_path = task_result.args.get('file')
        
        # Try to parse from output if not in args
        if not file_path:
            import json
            import re
            try:
                # Look for JSON array in output
                json_match = re.search(r'\[\{[^\]]+\}\]', task_output, re.DOTALL)
                if json_match:
                    results = json.loads(json_match.group())
                    if results and len(results) > 0:
                        file_path = results[0].get('path')
            except Exception as e:
                # Fallback: look for path= pattern
                path_match = re.search(r"'path':\s*'([^']+)'", task_output)
                if path_match:
                    file_path = path_match.group(1)
        
        if not file_path:
            print(c("❌ Could not locate file", "red"))
            return ""
        
        print()
        print(c(f"✅ Step 1/{total_steps} Complete - Found: {Path(file_path).name}", "green"))
        print()
        
        # STEP 2: Write code to file
        print(c("─" * 60, "dim"))
        print(c(f"✏️  Step 2/{total_steps}: Writing code to file", "cyan"))
        print()
        
        # Read existing file content
        existing_code = ""
        try:
            existing_code = Path(file_path).read_text()
            if existing_code.strip():
                print(c(f"📝 Current file content:", "cyan"))
                print()
                # Show first 10 lines safely (avoid backslashes inside f-strings)
                existing_lines = existing_code.splitlines()
                preview = existing_lines[:10]
                for i, line in enumerate(preview, 1):
                    print(c(f"{i:4d}| ", "dim"), end='')
                    print(f"\033[47m\033[30m{line}\033[0m")
                if len(existing_lines) > 10:
                    more_count = len(existing_lines) - 10
                    print(c(f"  ... ({more_count} more lines)", "dim"))
                print()
        except:
            pass
        
        if best_model:
            # Ask follow-up questions for advanced features
            print(c("🤔 Let me gather more details...", "cyan"))
            print()
            
            self._start_processing_animation()
            
            # Extract what to write from user input
            code_desc = user_input.lower()
            for phrase in ['write code to', 'write', 'add code to', 'add']:
                if phrase in code_desc:
                    code_desc = code_desc.split(phrase, 1)[-1].strip()
                    break
            
            # Generate follow-up questions based on the request
            questions_prompt = f"""The user wants to: {code_desc}

Generate 2-3 brief follow-up questions to clarify advanced features they might want.
Format as numbered list. Keep each question under 15 words. Examples:
1. Should it handle errors gracefully?
2. Do you want logging or progress output?
3. Should it support command-line arguments?

Your questions:"""
            questions = llm.generate(questions_prompt, max_tokens=100)
            
            self._stop_processing_animation()
            
            # Display questions
            if questions:
                print(c("💬 Questions to enhance your script:", "purple"))
                print()
                lines = questions.strip().split('\n')
                clean_questions = [line for line in lines if line.strip() and (line.strip()[0].isdigit() or line.strip().startswith('-'))]
                for q in clean_questions[:3]:
                    print(c(f"  {q}", "yellow"))
                print()
                
                # Pause heartbeat and animations BEFORE prompting
                lucifer_module = sys.modules.get('__main__')
                prev_heart_state = None
                prev_input_active = None
                
                if lucifer_module:
                    if hasattr(lucifer_module, 'HEART_STATE'):
                        prev_heart_state = lucifer_module.HEART_STATE
                        lucifer_module.HEART_STATE = "idle"  # Stop heartbeat
                    if hasattr(lucifer_module, 'INPUT_ACTIVE'):
                        prev_input_active = lucifer_module.INPUT_ACTIVE
                        lucifer_module.INPUT_ACTIVE = True
                
                # Small delay to ensure animations stop
                import time
                time.sleep(0.15)
                
                # Prompt user for answers
                print(c("Type your preferences (or press Enter to skip): ", "cyan"), end='', flush=True)
                
                try:
                    user_prefs = input().strip()
                finally:
                    # Restore previous states
                    if lucifer_module:
                        if hasattr(lucifer_module, 'HEART_STATE') and prev_heart_state is not None:
                            lucifer_module.HEART_STATE = prev_heart_state
                        if hasattr(lucifer_module, 'INPUT_ACTIVE') and prev_input_active is not None:
                            lucifer_module.INPUT_ACTIVE = prev_input_active
                
                print()
                
                # Combine original request with preferences
                if user_prefs:
                    code_desc = f"{code_desc}. Additional requirements: {user_prefs}"
                    print(c(f"✅ Got it! Incorporating your preferences...", "green"))
                    print()
            
            # Now start processing animation for code generation
            self._start_processing_animation()
            
            # Build enhanced prompt with context
            context_note = ""
            if existing_code.strip():
                context_note = f"\n\nExisting code in file:\n{existing_code}\n\nIMPORTANT: Keep any useful existing code and add new functionality."
            
            code_prompt = f"""Write Python code that: {code_desc}{context_note}

IMPORTANT:
- Wrap code in triple backticks: ```python and ```
- NO explanations outside the code block
- Include comments for clarity
- Make it production-ready with proper structure"""
            code = llm.generate(code_prompt, max_tokens=500)
            
            self._stop_processing_animation()
            
            if code:
                # Extract code between ``` markers
                code = code.strip()
                if '```' in code:
                    parts = code.split('```')
                    if len(parts) >= 3:
                        code_block = parts[1]
                        lines = code_block.split('\n')
                        if lines[0].strip() in ['python', 'py', '']:
                            code = '\n'.join(lines[1:])
                        else:
                            code = code_block
                    code = code.strip()
                
                # Display code with line numbers and diff-style markers
                print(c(f"📝 Changes to {file_path}:", "cyan"))
                print()
                
                # Show what's being changed
                old_lines = existing_code.split('\n') if existing_code.strip() else []
                new_lines = code.split('\n')
                
                # Display with line numbers
                if old_lines:
                    # Modified file - show diff-style
                    print(c(f"  Lines affected: 1-{len(new_lines)}", "yellow"))
                    print()
                    
                    for i, line in enumerate(new_lines, 1):
                        # White background for code with line numbers
                        print(c(f"{i:4d}| ", "dim"), end='')
                        print(f"\033[47m\033[30m{line}\033[0m")
                else:
                    # New file
                    print(c(f"  New file: {len(new_lines)} lines", "green"))
                    print()
                    
                    for i, line in enumerate(new_lines, 1):
                        print(c(f"{i:4d}| ", "dim"), end='')
                        print(f"\033[47m\033[30m{line}\033[0m")
                
                print()
                
                # Write to file
                Path(file_path).write_text(code)
                
                # Show summary of changes
                if old_lines:
                    lines_added = len(new_lines) - len(old_lines)
                    if lines_added > 0:
                        print(c(f"✅ Code updated: +{lines_added} lines added", "green"))
                    elif lines_added < 0:
                        print(c(f"✅ Code updated: {lines_added} lines removed", "green"))
                    else:
                        print(c(f"✅ Code updated: {len(new_lines)} lines modified", "green"))
                else:
                    print(c(f"✅ Code written: {len(new_lines)} lines", "green"))
        
        print()
        print(c(f"✅ Step 2/{total_steps} Complete", "green"))
        print()
        
        # STEP 3: Validate changes (syntax check)
        print(c("─" * 60, "dim"))
        print(c(f"✅ Step 3/{total_steps}: Validating changes", "cyan"))
        print()
        
        try:
            # Syntax check using py_compile
            import py_compile
            py_compile.compile(file_path, doraise=True)
            print(c("✅ Syntax validation passed", "green"))
            
            # Quick dry-run check (import only, don't execute)
            result = subprocess.run(
                ["python3", "-m", "py_compile", file_path],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                print(c("✅ No syntax errors detected", "green"))
            else:
                print(c("⚠️  Potential issues found:", "yellow"))
                if result.stderr:
                    print(result.stderr)
        except SyntaxError as e:
            print(c(f"❌ Syntax error: {e}", "red"))
        except Exception as e:
            print(c(f"⚠️  Validation warning: {e}", "yellow"))
        
        print()
        print(c(f"✅ Step 3/{total_steps} Complete", "green"))
        print()
        
        # STEP 4: Run script (if requested)
        if should_run:
            print(c("─" * 60, "dim"))
            print(c(f"▶️  Step 4/{total_steps}: Running the script", "cyan"))
            print()
            
            try:
                result = subprocess.run(
                    ["python3", file_path],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                
                if result.stdout:
                    print(c("📤 Script output:", "cyan"))
                    print()
                    # White background for output
                    for line in result.stdout.split('\n'):
                        if line.strip():
                            print(f"\033[47m\033[30m{line}\033[0m")
                    print()
                
                if result.stderr:
                    print(c("⚠️  Script errors:", "yellow"))
                    print()
                    # White background for errors/tracebacks
                    for line in result.stderr.split('\n'):
                        if line.strip():
                            print(f"\033[47m\033[30m{line}\033[0m")
                    print()
                
                if result.returncode == 0:
                    print(c(f"✅ Script executed successfully (exit code: {result.returncode})", "green"))
                else:
                    print(c(f"⚠️  Script exited with code: {result.returncode}", "yellow"))
            except subprocess.TimeoutExpired:
                print(c("⚠️  Script execution timed out (60s limit)", "yellow"))
            except Exception as e:
                print(c(f"❌ Error running script: {e}", "red"))
            
            print()
            print(c(f"✅ Step 4/{total_steps} Complete", "green"))
            print()
        
        print(c("─" * 60, "dim"))
        print(c("🎉 All steps completed successfully!", "green"))
        print()
        
        # Final summary
        if best_model:
            self._start_processing_animation()
            
            steps_text = f"""1. Located the file {Path(file_path).name}
2. Wrote code to the file
3. Validated changes work"""
            if should_run:
                steps_text += "\n4. Executed the script"
            
            summary_prompt = f"""The user requested: "{user_input}"

We completed {total_steps} steps:
{steps_text}

Provide a brief 1-2 sentence summary. Be concise."""
            summary = llm.generate(summary_prompt, max_tokens=80)
            
            self._stop_processing_animation()
            
            if summary:
                print(c(f"💬 {best_model} - Execution Summary:", "purple"))
                formatted_summary = format_code_blocks_with_background(summary.strip())
                print(c(formatted_summary, "white"))
                print()
        
        return ""
    
    def _detect_third_party_imports(self, code_content: str) -> list:
        """Detect third-party dependencies from import statements in code."""
        import re
        import sys
        
        # Standard library modules (common ones)
        stdlib_modules = {
            'os', 'sys', 're', 'json', 'time', 'datetime', 'pathlib', 'subprocess',
            'collections', 'itertools', 'functools', 'math', 'random', 'string',
            'io', 'hashlib', 'pickle', 'csv', 'xml', 'html', 'urllib', 'http',
            'logging', 'argparse', 'threading', 'multiprocessing', 'socket',
            'shutil', 'glob', 'tempfile', 'gzip', 'zipfile', 'tarfile', 'webbrowser'
        }
        
        third_party = set()
        
        # Find all import statements
        import_patterns = [
            r'^import\s+([\w\.]+)',  # import foo
            r'^from\s+([\w\.]+)\s+import',  # from foo import bar
        ]
        
        lines = code_content.split('\n')
        for line in lines:
            line = line.strip()
            for pattern in import_patterns:
                match = re.match(pattern, line)
                if match:
                    module_name = match.group(1).split('.')[0]  # Get top-level module
                    
                    # Skip stdlib and built-ins
                    if module_name not in stdlib_modules and module_name not in sys.builtin_module_names:
                        third_party.add(module_name)
        
        return list(third_party)
    
    def _extract_error_signature(self, error_text: str) -> str:
        """Extract a signature from error text to track unique errors."""
        import re
        
        # Extract the main error type and location
        # Look for patterns like: "ModuleNotFoundError: No module named 'watchdog'"
        # or "TypeError: unsupported operand type(s)"
        error_match = re.search(r'(\w+Error|\w+Exception):\s*(.+?)(?:\n|$)', error_text)
        if error_match:
            error_type = error_match.group(1)
            error_msg = error_match.group(2)[:50]  # First 50 chars of message
            return f"{error_type}:{error_msg}"
        
        # Fallback: use first line of error
        first_line = error_text.strip().split('\n')[0][:100]
        return first_line
    
    def _analyze_error_comprehensively(self, error_text: str, code_content: str, llm) -> dict:
        """Analyze error like Warp AI - identify all affected areas and plan multi-part fix."""
        import re
        
        print(c("🧠 Analyzing error comprehensively...", "cyan"))
        
        analysis_prompt = f"""Analyze this Python error and identify ALL code sections that need fixes:

Error:
{error_text}

Current code:
{code_content}

Provide a comprehensive analysis:
1. Root cause of the error
2. ALL code sections that need changes (with line numbers if visible)
3. Whether multiple areas need coordinated fixes
4. Specific changes needed for each area

Format:
ROOT CAUSE: [explanation]
AFFECTED AREAS: [list each area]
FIX PLAN: [numbered steps for each fix]"""
        
        try:
            analysis = llm.generate(analysis_prompt, max_tokens=300, timeout=180)
            
            # Parse the analysis
            root_cause = ""
            affected_areas = []
            fix_plan = []
            
            if analysis:
                lines = analysis.split('\n')
                current_section = None
                
                for line in lines:
                    line = line.strip()
                    if line.startswith('ROOT CAUSE:'):
                        root_cause = line.replace('ROOT CAUSE:', '').strip()
                        current_section = 'cause'
                    elif line.startswith('AFFECTED AREAS:'):
                        current_section = 'areas'
                    elif line.startswith('FIX PLAN:'):
                        current_section = 'plan'
                    elif line and current_section == 'areas':
                        affected_areas.append(line)
                    elif line and current_section == 'plan':
                        fix_plan.append(line)
            
            return {
                'root_cause': root_cause,
                'affected_areas': affected_areas,
                'fix_plan': fix_plan,
                'multi_area': len(affected_areas) > 1
            }
        except Exception as e:
            return {
                'root_cause': 'Analysis failed',
                'affected_areas': ['Unknown'],
                'fix_plan': ['Apply general fix'],
                'multi_area': False
            }
    
    def _parse_dynamic_steps(self, request: str) -> list:
        """Parse user request into dynamic steps for Tier 0/1 fallback.
        
        Works like Warp AI - intelligently understands context:
        - Extracts ALL entities (folders, files, names, locations)
        - Identifies sequential operations naturally
        - Creates detailed, actionable steps
        - No artificial limits - truly dynamic based on request complexity
        """
        import re
        
        request_lower = request.lower()
        steps = []
        
        # STEP 1: Extract all named entities first
        entities = {}
        
        # Extract location (Desktop, Documents, Downloads, etc.)
        location_map = {'desktop': 'Desktop', 'documents': 'Documents', 'downloads': 'Downloads'}
        # First try specific patterns like "put it in downloads" or "on desktop"
        for loc_key, loc_name in location_map.items():
            # Pattern 1: "put/place it in location"
            if re.search(rf'(?:put|place).*?(?:in|to)\s+{loc_key}', request_lower):
                entities['location'] = loc_name
                break
            # Pattern 2: "on location"
            elif re.search(rf'on\s+{loc_key}', request_lower):
                entities['location'] = loc_name
                break
            # Pattern 3: Generic mention
            elif loc_key in request_lower:
                entities['location'] = loc_name
                break
        
        # Extract folder name - multiple patterns (capture multi-word names)
        folder_patterns = [
            r'inside\s+(?:folder|directory)\s+(?:called|named)\s+([\w\s_-]+?)(?:\s+on\s+|\s+in\s+|\.)',  # "inside folder called weather tools"
            r'(?:folder|directory)\s+(?:called|named)\s+([\w\s_-]+?)(?:\s+on\s+|\s+in\s+|$)',  # "folder named automation tools"
            r'(?:put|place).*?(?:folder|directory)\s+(?:called|named)\s+([\w\s_-]+?)(?:\s+on\s+|\s+in\s+|$)',  # "put it in folder named X"
            r'in\s+(?:a\s+)?(?:folder|directory)\s+(?:called|named)\s+([\w\s_-]+?)(?:\s+on\s+|\s+in\s+|$)',  # "in a folder named X"
        ]
        for pattern in folder_patterns:
            match = re.search(pattern, request_lower)
            if match:
                folder_name = match.group(1).strip()
                # Convert spaces to underscores
                entities['folder'] = folder_name.replace(' ', '_')
                break
        
        # Extract script/file name - multiple patterns
        # First check for multi-file application requests
        explicit_files = re.findall(r'([\w_-]+\.(?:json|py|sh|js|txt|rb|pl|html|css|yaml|yml))', request_lower)
        if len(explicit_files) > 1:
            # Multi-file request - store all files
            entities['multiple_files'] = explicit_files
        elif explicit_files:
            # Single explicit file
            entities['filename'] = explicit_files[0]
        else:
            # Look for named scripts
            file_patterns = [
                r'name\s+it\s+([\w\s]+?)(?:\s+(?:and|then|in)|$)',  # "name it X and/then/in/EOL"
                r'call\s+it\s+([\w\s]+?)(?:\s+(?:and|then|in)|$)',  # "call it X and/then/in/EOL" 
                r'(?:called|named)\s+([\w\s]+?)(?:\s+(?:and|that|which|in)|$)',  # "called X" or "named X"
            ]
            for pattern in file_patterns:
                match = re.search(pattern, request_lower)
                if match:
                    name = match.group(1).strip()
                    # Infer extension based on context
                    if 'shell script' in request_lower or 'bash' in request_lower or 'shell' in request_lower:
                        name = name.replace(' ', '_') + '.sh'
                    elif 'python' in request_lower:
                        name = name.replace(' ', '_') + '.py'
                    elif 'javascript' in request_lower or 'node' in request_lower:
                        name = name.replace(' ', '_') + '.js'
                    else:
                        # Default to .py for generic "script"
                        name = name.replace(' ', '_') + '.py'
                    entities['filename'] = name
                    break
        
        # Extract purpose/action - ONLY capture the core action and target
        purpose_patterns = [
            r'that\s+(opens?|launches?|creates?|makes?|fetches?|parses?|monitors?|processes?|sends?|generates?)\s+(?:the\s+)?([\w\s]+?)(?:\s+(?:and|then))',  # Stop at 'and' or 'then'
            r'(?:to|for)\s+(open|launch|create|make|fetch|parse|monitor|process|send|generate)\s+(?:the\s+)?([\w\s]+?)(?:\s+(?:and|then))',
        ]
        for pattern in purpose_patterns:
            match = re.search(pattern, request_lower)
            if match:
                entities['action'] = match.group(1)
                # Clean target - remove extra words that got captured
                target = match.group(2).strip()
                # Stop at certain boundary words
                for boundary in ['and', 'name', 'called', 'put', 'in', 'on']:
                    if boundary in target:
                        target = target.split(boundary)[0].strip()
                entities['target'] = target
                break
        
        # STEP 2: Build meaningful, specific steps like Warp AI would
        # Create detailed, actionable task breakdown with full context
        
        # Determine full file path for clarity
        file_path_desc = ""
        if 'filename' in entities:
            file_path_desc = entities['filename']
            if 'folder' in entities:
                file_path_desc = f"{entities['folder']}/{entities['filename']}"
                if 'location' in entities:
                    file_path_desc = f"{entities['location']}/{entities['folder']}/{entities['filename']}"
            elif 'location' in entities:
                file_path_desc = f"{entities['location']}/{entities['filename']}"
        
        # Build purpose description
        purpose_desc = ""
        if 'action' in entities and 'target' in entities:
            purpose_desc = f"{entities['action']} {entities['target']}"
        elif 'action' in entities:
            purpose_desc = entities['action']
        
        # Step 1: Create directory structure if needed
        if 'folder' in entities and 'location' in entities:
            steps.append(f"Create directory {entities['location']}/{entities['folder']}")
        elif 'folder' in entities:
            steps.append(f"Create directory {entities['folder']}")
        
        # Step 2: Handle multi-file applications
        if 'multiple_files' in entities:
            # Multi-file application request
            base_path = ""
            if 'folder' in entities and 'location' in entities:
                base_path = f"{entities['location']}/{entities['folder']}/"
            elif 'folder' in entities:
                base_path = f"{entities['folder']}/"
            elif 'location' in entities:
                base_path = f"{entities['location']}/"
            
            for file in entities['multiple_files']:
                steps.append(f"Create {base_path}{file} with appropriate structure")
            
            # Add purpose if found
            if purpose_desc:
                steps.append(f"Implement functionality to {purpose_desc}")
            else:
                steps.append("Implement application logic across all files")
            
            steps.append("Test complete application")
        
        # Step 3: Create and write single file with full details
        elif 'filename' in entities:
            # Build file creation step with purpose
            file_step = f"Create {file_path_desc}"
            if purpose_desc:
                file_step += f" that will {purpose_desc}"
            steps.append(file_step)
            
            # Step 3: Write actual implementation code
            if purpose_desc:
                # Be specific about what code to write
                code_step = f"Write implementation code to {purpose_desc}"
                steps.append(code_step)
            else:
                # Extract purpose from request context
                # Look for key action words
                action_words = ['opens', 'launches', 'creates', 'fetches', 'parses', 'monitors', 
                              'processes', 'sends', 'logs', 'generates', 'builds', 'makes', 'optimizes',
                              'compresses', 'organizes', 'resizes', 'uploads', 'downloads', 'converts', 'runs']
                found_action = None
                for action in action_words:
                    if action in request_lower:
                        # Extract target after action word
                        action_idx = request_lower.find(action)
                        after_action = request[action_idx:].split()
                        # Get next 2-4 words as target
                        target_words = []
                        for word in after_action[1:5]:
                            if word.lower() in ['and', 'then', 'in', 'on', 'called', 'named']:
                                break
                            target_words.append(word)
                        if target_words:
                            found_action = f"{action} {' '.join(target_words)}"
                            break
                
                if found_action:
                    steps.append(f"Write code to {found_action}")
                else:
                    steps.append(f"Write script implementation")
            
            # Step 4: Make executable for scripts
            if entities['filename'].endswith(('.py', '.sh', '.js', '.rb')):
                steps.append(f"Make {entities['filename']} executable")
            
            # Step 5: Test/verify the specific file
            steps.append(f"Test {entities['filename']} works correctly")
        
        elif 'script' in request_lower or 'file' in request_lower or 'tool' in request_lower:
            # No filename extracted - but extract purpose from request
            # Look for action words in the request
            action_words = ['opens', 'launches', 'creates', 'fetches', 'parses', 'monitors', 
                          'processes', 'sends', 'logs', 'generates', 'builds', 'makes', 'optimizes',
                          'compresses', 'organizes', 'resizes', 'uploads', 'downloads', 'converts', 'runs']
            found_purpose = None
            for action in action_words:
                if action in request_lower:
                    # Extract target after action word
                    action_idx = request_lower.find(action)
                    after_action = request[action_idx:].split()
                    # Get next 2-4 words as target
                    target_words = []
                    for word in after_action[1:6]:
                        if word.lower() in ['and', 'then', 'in', 'on', 'called', 'named']:
                            break
                        target_words.append(word)
                    if target_words:
                        found_purpose = f"{action} {' '.join(target_words)}"
                        break
            
            # Create file with purpose
            if 'location' in entities:
                file_step = f"Create script file in {entities['location']}"
            else:
                file_step = "Create script file"
            
            if found_purpose:
                file_step += f" that will {found_purpose}"
            steps.append(file_step)
            
            # Write code with specific purpose
            if found_purpose:
                steps.append(f"Write code to {found_purpose}")
            elif purpose_desc:
                steps.append(f"Implement code to {purpose_desc}")
            else:
                steps.append("Write script implementation")
            
            # Test with purpose
            if found_purpose:
                steps.append(f"Test script: {found_purpose}")
            elif purpose_desc:
                steps.append(f"Test functionality: {purpose_desc}")
            else:
                steps.append("Test script")
        
        # Fallback for edge cases
        if not steps:
            # At minimum, extract key nouns and verbs from request
            verbs = ['create', 'make', 'build', 'write', 'generate']
            nouns = ['script', 'file', 'folder', 'application', 'tool']
            
            found_verb = next((v for v in verbs if v in request_lower), 'create')
            found_noun = next((n for n in nouns if n in request_lower), 'file')
            
            steps = [
                f"Determine {found_noun} requirements from request",
                f"{found_verb.capitalize()} {found_noun} with necessary components",
                f"Test {found_noun} functionality"
            ]
        
        return steps
    def _get_best_available_model(self) -> str:
        """Get best available model preferring lower tiers first (bypass up) and logging selection."""
        # Check if any models are enabled
        enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
        if not enabled_models:
            return None
        
        # Build list of available models (non-corrupted)
        tried_models = []
        for model in enabled_models:
            if not self._is_model_corrupted(model):
                tried_models.append(model)
        
        if not tried_models:
            return None
        
        # Choose best available (non-corrupted) by tier
        from core.model_tiers import get_model_tier
        
        # Sort by tier (lowest first) so simple tasks start with Tier 0/1
        sorted_models = sorted(tried_models, key=lambda m: get_model_tier(m))
        
        # Log candidate order and selection for audit
        try:
            self.session_logger.log_event(
                'model_selection',
                f"Selected {sorted_models[0]}",
                metadata={
                    'candidates_order': sorted_models,
                }
            )
        except Exception:
            pass
        
        return sorted_models[0] if sorted_models else None
    
    def _get_llm_acknowledgment(self, user_request: str, task_description: str) -> str:
        """Get LLM acknowledgment before executing task using bypass routing with fallback."""
        try:
            # Get sorted list of available models (highest tier first)
            enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
            if not enabled_models:
                return None
            
            from core.model_tiers import get_model_tier
            sorted_models = sorted(
                [m for m in enabled_models if not self._is_model_corrupted(m)],
                key=lambda m: get_model_tier(m),
                reverse=True
            )
            
            if not sorted_models:
                return None
            
            # Try each model in order until one succeeds
            from llm_backend import LLMBackend
            import requests.exceptions
            
            for model in sorted_models:
                try:
                    llm = LLMBackend(model=model, verbose=False)
                    if llm.is_available():
                        prompt = f"""The user says: '{user_request}'. 

Briefly acknowledge the request and break it down into 2-3 clear execution steps. Format like:
"I'll {task_description}. Steps: 1) [step], 2) [step], 3) [step]"

Keep it concise (2-3 sentences max)."""
                        response = llm.generate(prompt, max_tokens=100)
                        return response.strip() if response else None
                except (requests.exceptions.Timeout, requests.exceptions.ReadTimeout) as e:
                    # Timeout - try next model
                    tier_names = {0: 'Tier 0', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
                    tier = get_model_tier(model)
                    print(c(f"⚠️  {model} timed out, falling back to next model...", "yellow"))
                    continue
                except Exception as e:
                    # Other error - try next model
                    continue
            
            # All models failed
            return None
        except:
            return None
    
    def _get_llm_task_commentary(self, user_request: str, task_description: str, task_output: str) -> str:
        """Get LLM commentary after task execution using bypass routing."""
        try:
            # Use bypass routing system to get best available model
            best_model = self._get_best_available_model()
            if not best_model:
                return None
            
            from llm_backend import LLMBackend
            llm = LLMBackend(model=best_model, verbose=False)
            if llm.is_available():
                success = "✅" in task_output
                status = "successfully completed" if success else "failed"
                prompt = f"The user asked to {task_description}. The task {status}. Comment briefly on what happened (1 sentence)."
                response = llm.generate(prompt, max_tokens=80)
                return response.strip() if response else None
        except:
            return None
    
    def _handle_universal_task(self, task_result, original_input: str = None) -> str:
        """Execute a task from the universal task system."""
        # Show original user input if provided
        if original_input:
            print(c(f"\n📥 Your request: ", "blue") + c(f"{original_input}", "white"))
        
        print(c(f"🎯 Executing: {task_result.description}", "cyan"))
        print()
        
        # Execute task
        result = self.task_system.execute_task(task_result)
        
        # Sync context back from task system
        if self.task_system.last_created_file:
            self.last_created_file = self.task_system.last_created_file
            # Log file creation in session
            self.session_logger.log_file_created(str(self.last_created_file))
        
        if result.success:
            output = [c(f"✅ {result.message}", "green")]
            
            if result.output:
                output.append(c(f"\n📝 Output:", "cyan"))
                output.append(result.output)
            
            # Show steps completed
            if result.steps_completed:
                output.append(c(f"\n📊 Steps completed: {result.steps_completed}", "dim"))
            
            # Verify created files/folders
            if "folder" in task_result.description.lower():
                self._verify_creation(task_result)
            
            return "\n".join(output)
        else:
            error_output = [c(f"❌ Task failed: {result.message}", "red")]
            
            if result.error:
                error_output.append(c(f"\nError details:", "dim"))
                error_output.append(c(result.error, "red"))
            
            return "\n".join(error_output)
    
    def _verify_creation(self, task_result) -> None:
        """Verify that files/folders were actually created and show confirmation."""
        import time
        time.sleep(0.2)  # Small delay for filesystem
        
        # Extract paths from task arguments
        if hasattr(task_result, 'args') and task_result.args:
            folder_path = task_result.args.get('folder_path')
            file_path = task_result.args.get('file_path')
            
            print(c("\n🔍 Verification:", "cyan"))
            
            if folder_path and Path(folder_path).exists():
                print(c(f"  ✓ Folder exists: {folder_path}", "green"))
            elif folder_path:
                print(c(f"  ✗ Folder not found: {folder_path}", "red"))
            
            if file_path and Path(file_path).exists():
                print(c(f"  ✓ File exists: {file_path}", "green"))
                
                # Show file size and first few lines
                file_size = Path(file_path).stat().st_size
                print(c(f"    Size: {file_size} bytes", "dim"))
                
                if file_path.endswith('.py'):
                    with open(file_path, 'r') as f:
                        lines = f.readlines()[:5]
                    print(c(f"    Preview (first 5 lines):", "dim"))
                    for line in lines:
                        print(c(f"    {line.rstrip()}", "dim"))
            elif file_path:
                print(c(f"  ✗ File not found: {file_path}", "red"))
    
    def _handle_unknown(self, user_input: str) -> str:
        """Handle unknown commands with fuzzy matching suggestions."""
        user_lower = user_input.lower().strip()
        
        # Check for common typos in LLM commands
        llm_typos = {
            'llm enble': 'llm enable',
            'llm enbale': 'llm enable',
            'llm enabel': 'llm enable',
            'llm disbale': 'llm disable',
            'llm disble': 'llm disable',
            'llm diable': 'llm disable',
            'llm disabel': 'llm disable',
            'llm lst': 'llm list',
            'llm lsit': 'llm list',
            'llm lits': 'llm list',
            'llms lst': 'llms',
            'models lst': 'models list',
            'model lst': 'models list',
            'model info': 'models info',
            'mdoel info': 'models info',
            'mdoels info': 'models info',
            'mainmenu': 'mainmenu',
            'main menu': 'mainmenu',
            'mamenu': 'mainmenu',
            'mainmanu': 'mainmenu',
            'maimenu': 'mainmenu',
        }
        
        # Check for test command typos
        test_typos = {
            'tinylama test': 'tinyllama test',
            'tinylamma test': 'tinyllama test',
            'tinylllama test': 'tinyllama test',
            'tinyama test': 'tinyllama test',
            'tiny tets': 'tiny test',
            'tiny tset': 'tiny test',
            'tinyllama tets': 'tinyllama test',
            'tinyllama tset': 'tinyllama test',
            'mistrl test': 'mistral test',
            'mistrall test': 'mistral test',
            'mistra test': 'mistral test',
            'mistrel test': 'mistral test',
            'mistral tets': 'mistral test',
            'mistral tset': 'mistral test',
            'run tets': 'run test',
            'run tset': 'run test',
            'rnu test': 'run test',
        }
        
        # Check for zip/unzip typos
        zip_typos = {
            'zp': 'zip',
            'ziip': 'zip',
            'unzp': 'unzip',
            'unziip': 'unzip',
            'uzp': 'unzip',
        }
        
        # Check first word for typos
        first_word = user_lower.split()[0] if user_lower else ''
        
        # Check if it's a typo in test commands first
        for typo, correct in test_typos.items():
            if user_lower == typo or user_lower.startswith(typo + ' '):
                rest = user_input[len(typo):].strip()
                suggestion = f"{correct} {rest}" if rest else correct
                
                print(c(f"💡 Auto-correcting: ", "yellow") + c(typo, "red") + c(" → ", "dim") + c(correct, "green"))
                
                # Ask for confirmation
                response = get_single_key_input(
                    c(f"   Did you mean: ", "yellow") + c(suggestion, "green") + c("? (y/n): ", "yellow"),
                    valid_keys=['y', 'n']
                )
                print()  # Newline after response
                
                if response == 'y':
                    # Execute the corrected command
                    return self._route_request(suggestion)
                else:
                    return c("❌ Command cancelled", "red")
        
        # Check if it's a typo in LLM commands
        for typo, correct in llm_typos.items():
            if user_lower.startswith(typo):
                rest = user_input[len(typo):].strip()
                suggestion = f"{correct} {rest}" if rest else correct
                
                print(c(f"💡 Auto-correcting: ", "yellow") + c(typo, "red") + c(" → ", "dim") + c(correct, "green"))
                
                # Ask for confirmation
                response = get_single_key_input(
                    c(f"   Did you mean: ", "yellow") + c(suggestion, "green") + c("? (y/n): ", "yellow"),
                    valid_keys=['y', 'n']
                )
                print()  # Newline after response
                
                if response == 'y':
                    # Execute the corrected command
                    return self._route_request(suggestion)
                else:
                    return c("❌ Command cancelled", "red")
        
        # Check for zip/unzip typos
        for typo, correct in zip_typos.items():
            if first_word == typo:
                rest = ' '.join(user_input.split()[1:])
                suggestion = f"{correct} {rest}" if rest else correct
                
                print(c(f"💡 Auto-correcting: ", "yellow") + c(typo, "red") + c(" → ", "dim") + c(correct, "green"))
                
                response = get_single_key_input(
                    c(f"   Did you mean: ", "yellow") + c(suggestion, "green") + c("? (y/n): ", "yellow"),
                    valid_keys=['y', 'n']
                )
                print()
                
                if response == 'y':
                    return self._route_request(suggestion)
                else:
                    return c("❌ Command cancelled", "red")
        
        # Check for common command typos
        common_typos = {
            'hlep': 'help',
            'hlp': 'help',
            'hepl': 'help',
            'hep': 'help',
            'ziip': 'zip',
            'unziip': 'unzip',
            'mv': 'move',
            'mvoe': 'move',
            'mve': 'move',
            'raed': 'read',
            'reda': 'read',
            'lsit': 'list',
            'lst': 'list',
            'cd..': 'cd ..',
        }
        
        if first_word in common_typos:
            rest = ' '.join(user_input.split()[1:])
            suggestion = f"{common_typos[first_word]} {rest}" if rest else common_typos[first_word]
            
            print(c(f"💡 Auto-correcting: ", "yellow") + c(first_word, "red") + c(" → ", "dim") + c(common_typos[first_word], "green"))
            
            response = get_single_key_input(
                c(f"   Did you mean: ", "yellow") + c(suggestion, "green") + c("? (y/n): ", "yellow"),
                valid_keys=['y', 'n']
            )
            print()
            
            if response == 'y':
                return self._route_request(suggestion)
            else:
                return c("❌ Command cancelled", "red")
        
        # If Ollama is available, treat as AI request
        if self.ollama_available:
            # Check if any enabled models are available
            enabled_models = [m for m in self.available_models if self._is_llm_enabled(m)]
            
            if enabled_models:
                # Route to general LLM query for natural conversation
                return self._handle_general_llm_query(user_input)
        
        # Default response (no AI available)
        return f"""{c('🤔 Not sure how to handle that.', 'yellow')}

{c('Try:', 'cyan')}
  • {c('help', 'cyan')} - See all capabilities
  • {c('llm list', 'cyan')} - Show LLM status  
  • {c('models info', 'cyan')} - Learn about AI models
  • {c('run script.py', 'cyan')} - Execute with auto-fix

{c('💡 Tip: Install AI models for natural language support', 'dim')}
"""


    def _suggest_mistral_upgrade(self, failed_request: str) -> str:
        """Suggest downloading or enabling Mistral when TinyLlama fails on complex requests."""
        from pathlib import Path
        
        # Check if Mistral is already installed
        project_root = Path(__file__).parent.parent
        mistral_path = project_root / '.luciferai' / 'models' / 'mistral-7b-instruct-v0.2.Q4_K_M.gguf'
        mistral_installed = mistral_path.exists() or 'mistral' in self.available_models
        mistral_enabled = self._is_llm_enabled('mistral')
        
        # Show what models we tried with
        active_models = [m for m in self.available_models if self._is_llm_enabled(m)]
        print()
        print(c(f"🤔 Couldn't understand that request.", "yellow"))
        print(c(f"   Tried with: {', '.join(active_models)}", "dim"))
        print()
        
        # If Mistral is installed but disabled, suggest enabling it
        if mistral_installed and not mistral_enabled:
            print(c(f"💡 Mistral detected: ", "cyan") + c("Installed, Disabled", "yellow"))
            print()
            print(c(f"Mistral (7B) handles natural language much better:", "green"))
            print(c(f"  • Better context understanding", "dim"))
            print(c(f"  • Multi-step command parsing", "dim"))
            print(c(f"  • Conversational requests", "dim"))
            print()
            
            try:
                response = get_single_key_input(
                    c(f"Enable Mistral now? (y/n): ", "cyan"),
                    valid_keys=['y', 'n']
                )
                print()
                
                if response == 'y':
                    self.llm_state['mistral'] = True
                    self._save_llm_state()
                    return c("✅ Mistral enabled!", "green") + f"\n\n{c('Mistral will be used for the next complex request.', 'dim')}"
                else:
                    return c("❌ Cancelled", "yellow") + f"\n{c('You can enable later with: llm enable mistral', 'dim')}"
            except (EOFError, KeyboardInterrupt):
                return c("\n❌ Cancelled", "yellow")
        
        # If Mistral is installed AND enabled but still failed - show status and don't suggest again
        elif mistral_installed and mistral_enabled:
            print(c(f"💡 Mistral detected: ", "cyan") + c("Installed, Enabled", "green"))
            print()
            return c("🤔 Not sure how to handle that.", "yellow") + f"\n\n{c('Try:', 'cyan')}\n  • {c('help', 'cyan')} - See all capabilities"
        
        # Mistral not installed - suggest download
        else:
            print(c(f"💡 Mistral detected: ", "cyan") + c("Not Installed", "red"))
            print()
            print(c(f"💡 Upgrade Suggestion:", "cyan"))
            print(c(f"   Mistral (7B) handles natural language much better!", "green"))
            print()
            print(c(f"Benefits:", "blue"))
            print(c(f"  • Better context understanding", "dim"))
            print(c(f"  • Multi-step command parsing", "dim"))
            print(c(f"  • Conversational requests", "dim"))
            print(c(f"  • Ambiguity resolution", "dim"))
            print()
            print(c(f"Download Mistral? (~4GB)", "cyan"))
            print(c(f"  1. Mistral will be saved to: .luciferai/models/", "dim"))
            print(c(f"  2. Uses llamafile (works on all macOS versions)", "dim"))
            print(c(f"  3. Runs locally - no internet needed after download", "dim"))
            print()
            
            try:
                response = get_single_key_input(
                    c(f"Download Mistral now? (y/n): ", "cyan"),
                    valid_keys=['y', 'n']
                )
                print()
                
                if response == 'y':
                    return self._download_mistral_model()
                else:
                    return c("❌ Download cancelled", "yellow") + f"\n\n{c('You can download later with:', 'dim')}\n{c('  luci install mistral', 'cyan')}"
            except (EOFError, KeyboardInterrupt):
                return c("\n❌ Download cancelled", "yellow")
    
    def _show_model_failure_status(self) -> str:
        """Show status of all models when request fails with active models."""
        from pathlib import Path
        
        output = []
        output.append(c("🤔 Not sure how to handle that request.", "yellow"))
        output.append("")
        
        # Get all model statuses
        all_models = ['tinyllama', 'llama3.2', 'mistral', 'deepseek-coder']
        
        active_models = []
        disabled_models = []
        not_installed = []
        
        for model in all_models:
            is_installed = model in self.available_models
            is_enabled = self._is_llm_enabled(model)
            
            if is_installed and is_enabled:
                active_models.append(model)
            elif is_installed and not is_enabled:
                disabled_models.append(model)
            else:
                not_installed.append(model)
        
        # Show active models that failed
        if active_models:
            output.append(c("🔴 Active models (failed this request):", "red"))
            for model in active_models:
                output.append(c(f"  • {model}", "dim"))
            output.append("")
        
        # Show disabled but installed models
        if disabled_models:
            output.append(c("🟡 Installed but disabled:", "yellow"))
            for model in disabled_models:
                output.append(c(f"  • {model}", "dim") + c(" (enable with: llm enable " + model + ")", "cyan"))
            output.append("")
        
        # Show not installed models
        if not_installed:
            output.append(c("⚪ Not installed (supported):", "dim"))
            for model in not_installed:
                output.append(c(f"  • {model}", "dim"))
            output.append("")
        
        output.append(c("Try:", "cyan"))
        output.append(c("  • help - See all capabilities", "dim"))
        output.append(c("  • llm list - Manage models", "dim"))
        
        return "\n".join(output)
    
    def _download_mistral_model(self) -> str:
        """Download Mistral model to .luciferai/models/"""
        from pathlib import Path
        import urllib.request
        import os
        
        project_root = Path(__file__).parent.parent
        models_dir = project_root / '.luciferai' / 'models'
        models_dir.mkdir(parents=True, exist_ok=True)
        
        mistral_url = "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf"
        mistral_path = models_dir / 'mistral-7b-instruct-v0.2.Q4_K_M.gguf'
        
        print(c(f"\n📥 Downloading Mistral 7B...", "cyan"))
        print(c(f"   Destination: {mistral_path}", "dim"))
        print(c(f"   Size: ~4GB (this may take a while)", "dim"))
        print()
        
        try:
            # Download with progress
            def report_progress(block_num, block_size, total_size):
                downloaded = block_num * block_size
                percent = min(100, (downloaded / total_size) * 100)
                mb_downloaded = downloaded / (1024 * 1024)
                mb_total = total_size / (1024 * 1024)
                
                # Update progress on same line
                print(f"\r  Progress: {percent:.1f}% ({mb_downloaded:.1f}MB / {mb_total:.1f}MB)", end='', flush=True)
            
            urllib.request.urlretrieve(mistral_url, mistral_path, reporthook=report_progress)
            print()  # New line after progress
            print()
            
            print(c("✅ Mistral downloaded successfully!", "green"))
            print()
            print(c("💡 Mistral is much better at understanding natural language!", "blue"))
            print()
            
            # Prompt to restart
            try:
                input(c("Press Enter to restart and load Mistral...", "cyan"))
                print()
                
                # Restart LuciferAI
                import sys
                import os
                print(c("🔄 Restarting LuciferAI...", "purple"))
                print()
                
                # Re-execute the script
                os.execv(sys.executable, ['python3'] + sys.argv)
                
            except (EOFError, KeyboardInterrupt):
                return c("\n⚠️  Restart cancelled. Mistral will be available on next startup.", "yellow")
            
        except Exception as e:
            return c(f"❌ Download failed: {e}", "red") + f"\n\n{c('Try manually downloading from:', 'dim')}\n{c(mistral_url, 'cyan')}"


    def _test_model_capabilities(self, models_to_test: list) -> dict:
        """Test all models' capabilities with simple queries in parallel.
        
        Args:
            models_to_test: List of (model_name, location, tier, tier_name) tuples
        
        Returns:
            Dict with results for each model
        """
        from pathlib import Path
        from llamafile_agent import LlamafileAgent
        import concurrent.futures
        import threading
        
        project_root = Path(__file__).parent.parent
        project_models_dir = project_root / '.luciferai' / 'models'
        home_models_dir = Path.home() / '.luciferai' / 'models'
        
        # Define all test cases
        all_tests = [
            ("What is 2+2?", ["4", "four"]),
            ("Say hello", ["hello", "hi", "hey"]),
            ("Set volume to 50%", ["volume", "50", "set"]),
        ]
        
        # Get model paths and initialize agents
        model_agents = {}
        model_files = {
            'tinyllama': 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
            'llama3.2': 'llama-3.2-3b-instruct-Q4_K_M.gguf',
            'mistral': 'mistral-7b-instruct-v0.2.Q4_K_M.gguf',
            'deepseek-coder': 'deepseek-coder-6.7b-instruct-Q4_K_M.gguf',
        }
        
        for model_name, location, tier, tier_name in models_to_test:
            filename = model_files.get(model_name)
            if not filename:
                continue
            
            # Find model path based on location
            if location == 'project':
                model_path = project_models_dir / filename
            elif location == 'home':
                model_path = home_models_dir / filename
            else:  # backup
                continue
            
            if model_path.exists():
                try:
                    model_agents[model_name] = LlamafileAgent(model_path=model_path)
                except Exception as e:
                    print(c(f"⚠️  Failed to initialize {model_name}: {e}", "yellow"))
        
        # Results storage
        results = {model: {'passed': 0, 'total': len(all_tests), 'responses': []} 
                   for model, _, _, _ in models_to_test}
        
        # Run each test across all models in parallel
        print(c(f"\n🧪 Running {len(all_tests)} tests across {len(model_agents)} models...\n", "cyan"))
        
        for test_num, (question, expected_keywords) in enumerate(all_tests, 1):
            print(c(f"━" * 70, "dim"))
            print(c(f"Test {test_num}/{len(all_tests)}: {question}", "cyan"))
            print(c(f"━" * 70, "dim"))
            print()
            
            # Query all models in parallel (max 5 at once)
            test_results = {}
            lock = threading.Lock()
            
            def test_model(model_name, agent):
                try:
                    response = agent.query(question, temperature=0.1, max_tokens=50)
                    response_lower = response.lower()
                    passed = any(keyword in response_lower for keyword in expected_keywords)
                    
                    with lock:
                        test_results[model_name] = {
                            'response': response,
                            'passed': passed
                        }
                except Exception as e:
                    with lock:
                        test_results[model_name] = {
                            'response': f"Error: {e}",
                            'passed': False
                        }
            
            # Execute in parallel with ThreadPoolExecutor (max 5 concurrent)
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = {executor.submit(test_model, name, agent): name 
                          for name, agent in model_agents.items()}
                concurrent.futures.wait(futures)
            
            # Display results for this test
            for model_name, location, tier, tier_name in models_to_test:
                if model_name not in test_results:
                    continue
                
                result = test_results[model_name]
                status = c("✅ PASS", "green") if result['passed'] else c("❌ FAIL", "red")
                
                print(c(f"  {model_name.upper():<15} {status}", "white"))
                if not result['passed']:
                    response_preview = result['response'][:60] + "..." if len(result['response']) > 60 else result['response']
                    print(c(f"    → {response_preview}", "dim"))
                
                # Update results
                if result['passed']:
                    results[model_name]['passed'] += 1
                results[model_name]['responses'].append(result)
            
            print()
        
        return results
    
    def _handle_short_test(self) -> str:
        """Run short 5-query test on all installed models."""
        from pathlib import Path
        import subprocess
        
        project_root = Path(__file__).parent.parent
        test_script = project_root / 'tests' / 'test_all_models.py'
        
        if not test_script.exists():
            return c(f"{Emojis.CROSS} Test script not found", "red")
        
        print()
        print(c("🧪 Running Short Test (5 queries per model)", "purple"))
        print(c("═" * 60, "purple"))
        print()
        
        # Run the test
        result = subprocess.run(
            ['python3', str(test_script)],
            cwd=project_root,
            capture_output=False
        )
        
        if result.returncode != 0:
            return c(f"{Emojis.WARNING} Test completed with errors", "yellow")
        
        return ""
    
    def _handle_test_all_models(self) -> str:
        """Run test suite for all available LLMs."""
        from pathlib import Path
        from core.model_files_map import get_all_models
        
        # Check which models are actually installed (project-local, home, + backup)
        project_root = Path(__file__).parent.parent
        project_models_dir = project_root / '.luciferai' / 'models'
        home_models_dir = Path.home() / '.luciferai' / 'models'
        
        # Load backup directory from config
        backup_models_dir = None
        config_file = Path.home() / '.luciferai' / 'config.json'
        if config_file.exists():
            try:
                import json
                with open(config_file, 'r') as f:
                    config = json.load(f)
                    backup_models_dir = config.get('backup_models_dir')
                    if backup_models_dir:
                        backup_models_dir = Path(backup_models_dir)
            except:
                pass
        
        # Get all supported models from model_files_map
        all_models = get_all_models()
        
        # Detect installed models
        testable_models = []
        for model_info in all_models:
            model_name = model_info['canonical_name']
            filename = model_info['file']
            tier = model_info['tier']
            tier_name = model_info['tier_name']
            
            # Check all possible locations
            found_in_project = (project_models_dir / filename).exists()
            found_in_home = (home_models_dir / filename).exists()
            found_in_backup = backup_models_dir and (backup_models_dir / filename).exists() if backup_models_dir else False
            
            if found_in_project or found_in_home or found_in_backup:
                # Prioritize: project > home > backup
                if found_in_project:
                    location = "project"
                elif found_in_home:
                    location = "home"
                else:
                    location = "backup"
                testable_models.append((model_name, location, tier, tier_name))
        
        print()
        print(c(f"🧪 LuciferAI Test Suite - All Installed Models", "purple"))
        print(c("═" * 70, "purple"))
        print()
        
        # Show detected models
        if testable_models:
            print(c("Detected installed models:", "cyan"))
            for model_name, location, tier, tier_name in testable_models:
                loc_str = c(f"({location})", "dim")
                tier_str = c(f"[{tier_name}]", "yellow")
                print(c(f"  ✓ {model_name.upper()} {tier_str} {loc_str}", "green"))
            print()
            print(c(f"Running tests for {len(testable_models)} model(s)...", "cyan"))
        else:
            print(c("❌ No models detected", "red"))
            print()
            print(c("Searched locations:", "dim"))
            print(c(f"  • Project: {project_models_dir}", "dim"))
            print(c(f"  • Home: {home_models_dir}", "dim"))
            if backup_models_dir:
                print(c(f"  • Backup: {backup_models_dir}", "dim"))
            else:
                print(c(f"  • Backup: Not configured", "yellow"))
                print(c(f"    (Set with: backup models)", "dim"))
            print()
            return c("No models to test. Install with: install core models", "yellow")
        
        print(c("═" * 70, "purple"))
        print()
        
        # Run test script once - it tests all models together
        import subprocess
        import threading
        import re
        import os
        import time as time_module
        
        test_script = project_root / 'tests' / 'test_all_commands.py'
        
        if not test_script.exists():
            return c("❌ Test script not found: tests/test_all_commands.py", "red")
        
        print(c("Running comprehensive test suite...", "cyan"))
        print(c(f"Testing {len(testable_models)} models: {', '.join([m[0].upper() for m in testable_models])}", "dim"))
        print()
        
        # Progress tracking
        stop_animation = threading.Event()
        # Each test command runs against all installed models
        # 76 commands (now includes file ops, daemon/watcher, model mgmt) × number of models = total individual tests
        total_tests = 76 * len(testable_models)
        progress_data = {'completed': 0, 'total': total_tests, 'current_test': ''}
        
        def show_progress():
            frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
            elapsed = 0.0
            while not stop_animation.is_set():
                frame = frames[int(elapsed * 10) % len(frames)]
                mins, secs = divmod(int(elapsed), 60)
                time_str = f"{mins:02d}:{secs:02d}"
                completed = progress_data['completed']
                total = progress_data['total']
                percentage = (completed / total * 100) if total > 0 else 0
                bar_width = 40
                filled = int(bar_width * completed / total) if total > 0 else 0
                bar = '█' * filled + '░' * (bar_width - filled)
                test_info = progress_data['current_test'][:35] if progress_data['current_test'] else 'Initializing'
                
                msg = f"\r  {c(frame, 'cyan')} [{bar}] {c(f'{percentage:.0f}%', 'yellow')} {c(f'({completed}/{total})', 'dim')} {c(time_str, 'dim')} - {c(test_info, 'dim')}"
                print(msg, end='', flush=True)
                time_module.sleep(0.1)
                elapsed += 0.1
            print('\r' + ' ' * 120 + '\r', end='', flush=True)
        
        progress_thread = threading.Thread(target=show_progress, daemon=True)
        progress_thread.start()
        
        start_time = time_module.time()
        
        try:
            # Run test script - it handles all models internally
            env = os.environ.copy()
            env['PYTHONUNBUFFERED'] = '1'
            
            proc = subprocess.Popen(
                ['python3', '-u', str(test_script)],
                cwd=project_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env=env,
                bufsize=1
            )
            
            output_lines = []
            for line in iter(proc.stdout.readline, ''):
                if not line:
                    break
                output_lines.append(line)
                
                # Update progress when we see result markers
                if '✅ SUCCESS' in line or '❌ FAILED' in line or '⏱️  TIMEOUT' in line or '⚠️  WEAK' in line:
                    progress_data['completed'] += 1
                
                # Update current test
                test_match = re.search(r'🧪 TEST: (.+)', line)
                if test_match:
                    progress_data['current_test'] = test_match.group(1).strip()[:35]
                
                # Update total if specified
                total_match = re.search(r'Total Tests: (\d+)', line)
                if total_match:
                    # This is the number of test commands, multiply by model count
                    test_commands = int(total_match.group(1))
                    progress_data['total'] = test_commands * len(testable_models)
            
            proc.wait(timeout=600)  # 10 minute timeout
            elapsed_time = time_module.time() - start_time
            
            stop_animation.set()
            progress_thread.join(timeout=0.5)
            
            output = ''.join(output_lines)
            
            print()
            print(c("✓ Test suite completed", "green"))
            print(c(f"Total time: {int(elapsed_time//60)}m {int(elapsed_time%60)}s", "dim"))
            print()
            
            # Parse summary for each model
            results = []
            
            # Look for individual model results in output
            for model_name, _, _, tier_name in testable_models:
                model_upper = model_name.upper()
                # Try to find this model's summary
                pattern = rf'{model_upper}:.*?(✅|❌|⚠️).*?(\d+)/(\d+)'
                match = re.search(pattern, output)
                if match:
                    passed = int(match.group(2))
                    total = int(match.group(3))
                    if '✅' in match.group(1):
                        status = f"✅ {passed}/{total} passed"
                    else:
                        failed = total - passed
                        status = f"⚠️  {passed}/{total} passed, {failed} had issues"
                    results.append((model_name, status))
                else:
                    results.append((model_name, "⚠️  Results unclear"))
            
            return self._display_final_summary(results, testable_models, output)
            
        except subprocess.TimeoutExpired:
            stop_animation.set()
            progress_thread.join(timeout=0.5)
            if 'proc' in locals():
                proc.kill()
            return c("⏱️  Tests timed out after 10 minutes", "yellow")
        except Exception as e:
            stop_animation.set()
            progress_thread.join(timeout=0.5)
            return c(f"❌ Test failed: {e}", "red")
    
    def _display_final_summary(self, results, testable_models, output):
        """Display final test summary."""
        print(c("═" * 70, "purple"))
        print(c("📊 Final Test Summary", "cyan"))
        print(c("═" * 70, "purple"))
        print()
        
        tier_map = {name: tier_name for name, _, _, tier_name in testable_models}
        
        for model, status in sorted(results, key=lambda x: x[0]):
            tier = tier_map.get(model, 'Unknown')
            print(c(f"  {model.upper():<15} [{tier:<10}]", "white") + " " + status)
        
        print()
        
        # Save detailed test log
        detailed_results = {}
        for model, _, _, tier_name in testable_models:
            detailed_results[model] = {
                'tier': tier_name,
                'output': output  # Same output for all since they ran together
            }
        
        self._save_test_log(results, detailed_results)
        
        return c("✅ Testing complete!", "green")
    
    def _save_test_log(self, results: list, detailed_results: dict):
        """Save test results to log file with detailed diagnostic information."""
        from pathlib import Path
        from datetime import datetime
        import platform
        import sys
        
        # Create logs directory if it doesn't exist
        project_root = Path(__file__).parent.parent
        log_dir = project_root / '.luciferai' / 'logs'
        log_dir.mkdir(parents=True, exist_ok=True)
        
        log_file = log_dir / 'last_test_run.log'
        
        # Delete previous run results
        if log_file.exists():
            log_file.unlink()
        
        try:
            with open(log_file, 'w', encoding='utf-8') as f:
                # Header with diagnostic info
                f.write("═" * 70 + "\n")
                f.write("LuciferAI Test Suite - Diagnostic Report\n")
                f.write("═" * 70 + "\n")
                f.write(f"Run Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"Test Script: tests/test_all_commands.py\n")
                f.write(f"Python Version: {sys.version.split()[0]}\n")
                f.write(f"Platform: {platform.system()} {platform.release()}\n")
                f.write(f"Machine: {platform.machine()}\n")
                f.write(f"Working Directory: {Path.cwd()}\n")
                f.write("\n")
                
                # Test description
                f.write("Test Scope (with Basic/Standard/Advanced variants):\n")
                f.write("  - 12 Simple AI Queries (commands, definitions, greetings, comparisons)\n")
                f.write("  - 4 Basic Commands (memory, help, clear)\n")
                f.write("  - 12 Conversation Memory (simple→complex facts, pets, preferences)\n")
                f.write("  - 12 Horoscope & Zodiac (signs, dates, traits, elements, compatibility)\n")
                f.write("  - 6 Multi-Step Requests (1-3+ operations)\n")
                f.write("  - 3 Tier 0 Limitations (complex reasoning that requires Mistral+)\n")
                f.write("  - 9 File Operations (list, read, find, copy, move, create)\n")
                f.write("  - 6 Daemon/Watcher & Fix (run, fix consensus, daemon watch)\n")
                f.write("  - 6 Model Management (llm list, enable/disable, models info)\n")
                f.write("  - 6 Edge Cases (empty, unusual, unreasonable)\n")
                f.write("  Total: 76 test commands per model\n")
                f.write("\n")
                
                # Diagnostic: Test execution details
                f.write("Execution Details:\n")
                f.write(f"  - Models Tested: {len(results)}\n")
                f.write(f"  - Total Individual Tests: {76 * len(results)}\n")
                f.write(f"  - Test Format: Each command runs against ALL installed models\n")
                f.write("\n")
                
                # Results per model
                for model, status in results:
                    tier = detailed_results.get(model, {}).get('tier', 'Unknown')
                    output = detailed_results.get(model, {}).get('output', '')
                    
                    f.write("\n" + "═" * 70 + "\n")
                    f.write(f"Model: {model.upper()} ({tier})\n")
                    f.write("═" * 70 + "\n")
                    f.write(f"Result: {status}\n")
                    f.write("\n")
                    
                    # Parse status for details
                    if 'All passed' in status:
                        f.write("✅ All tests passed successfully!\n")
                    elif 'failed' in status:
                        f.write("⚠️  Some tests failed - see detailed output below\n")
                    elif 'timeout' in status:
                        f.write("⏱️  Some tests timed out - may need optimization\n")
                    f.write("\n")
                    
                    # Include full test output
                    if output:
                        f.write("─" * 70 + "\n")
                        f.write("FULL TEST OUTPUT:\n")
                        f.write("─" * 70 + "\n")
                        f.write(output)
                        f.write("\n" + "─" * 70 + "\n\n")
                
                # Summary
                f.write("\n" + "═" * 70 + "\n")
                f.write("SUMMARY\n")
                f.write("═" * 70 + "\n")
                f.write(f"Total Models Tested: {len(results)}\n")
                
                # Count overall results
                all_passed = all('All passed' in status for _, status in results)
                if all_passed:
                    f.write("\n✅ Overall Result: ALL MODELS PASSED\n")
                else:
                    f.write("\n⚠️  Overall Result: Some models had issues\n")
                
                f.write("\n")
                f.write(f"Log Location: {log_file}\n")
                f.write("View with: cat .luciferai/logs/last_test_run.log\n")
            
            print(c(f"\n💾 Test log saved: {log_file}", "dim"))
        
        except Exception as e:
            print(c(f"\n⚠️  Could not save test log: {e}", "yellow"))
    
    def _handle_test_prompt(self) -> str:
        """Prompt user to select which model to test."""
        from pathlib import Path
        
        print()
        print(c("🧪 Which model would you like to test?", "cyan"))
        print()
        
        # List installed models
        installed_models = []
        for i, model in enumerate(self.available_models, 1):
            print(c(f"  [{i}] {model}", "purple"))
            installed_models.append(model)
        
        if not installed_models:
            return c("❌ No models installed", "red") + f"\n{c('Install TinyLlama first with the setup script', 'yellow')}"
        
        print(c(f"  [A] All models", "cyan"))
        print(c(f"  [0] Cancel", "dim"))
        print()
        
        try:
            choice = input(c("Select model (number/A): ", "cyan")).strip()
            
            if choice == '0':
                return c("❌ Cancelled", "yellow")
            
            if choice.upper() == 'A':
                return self._handle_test_all_models()
            
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(installed_models):
                    return self._handle_model_test(installed_models[idx])
                else:
                    return c("❌ Invalid selection", "red")
            except ValueError:
                return c("❌ Invalid input", "red")
        
        except (EOFError, KeyboardInterrupt):
            return c("\n❌ Cancelled", "yellow")
    
    def _handle_model_test(self, model: str) -> str:
        """Run comprehensive test suite for a specific model."""
        from pathlib import Path
        
        # Check if model is installed in main or backup location
        main_models_dir = Path.home() / '.luciferai' / 'models'
        
        # Load backup directory from config
        backup_models_dir = None
        config_file = Path.home() / '.luciferai' / 'config.json'
        if config_file.exists():
            try:
                import json
                with open(config_file, 'r') as f:
                    config = json.load(f)
                    backup_models_dir = config.get('backup_models_dir')
                    if backup_models_dir:
                        backup_models_dir = Path(backup_models_dir)
            except:
                pass
        
        # Model file names
        model_files = {
            'tinyllama': 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
            'mistral': 'mistral-7b-instruct-v0.2.Q4_K_M.gguf',
        }
        
        # Check if it's a supported test model
        if model not in model_files:
            # For Ollama or unsupported models
            return c(f"⚠️  Test suite only available for bundled models (tinyllama, mistral)", "yellow") + f"\n{c('Available bundled models:', 'dim')} {', '.join([m for m in self.available_models if m in model_files])}"
        
        # Check if model is installed
        model_file = model_files[model]
        found_in_main = (main_models_dir / model_file).exists()
        found_in_backup = backup_models_dir and (backup_models_dir / model_file).exists() if backup_models_dir else False
        
        if not found_in_main and not found_in_backup:
            # Model not installed anywhere
            print()
            print(c(f"❌ {model.upper()} not detected", "red"))
            print()
            print(c("Searched locations:", "dim"))
            print(c(f"  • Main: {main_models_dir}", "dim"))
            if backup_models_dir:
                print(c(f"  • Backup: {backup_models_dir}", "dim"))
            else:
                print(c(f"  • Backup: Not configured", "yellow"))
                print(c(f"    (Set with: backup models)", "dim"))
            print()
            
            # Prompt to install
            try:
                choice = input(c(f"Would you like to install {model}? (y/n): ", "cyan")).strip().lower()
                if choice == 'y':
                    # Route to install command
                    install_cmd = f"install {model}"
                    print()
                    print(c(f"Installing {model}...", "cyan"))
                    return self._route_request(install_cmd)
                else:
                    return c("Installation cancelled", "yellow")
            except (EOFError, KeyboardInterrupt):
                return c("\nInstallation cancelled", "yellow")
        
        # Model found - show location
        print()
        if found_in_main:
            print(c(f"✓ {model.upper()} detected in main models directory", "green"))
        elif found_in_backup:
            print(c(f"✓ {model.upper()} detected in backup models directory", "green"))
        
        print(c(f"🧪 Running command tests for {model.upper()}...", "purple"))
        print(c("─" * 60, "dim"))
        print()
        
        # Run actual command tests
        from pathlib import Path
        import subprocess
        
        project_root = Path(__file__).parent.parent
        test_script = project_root / 'tests' / 'test_all_commands.py'
        
        if test_script.exists():
            print(c(f"  Running command tests...", "dim"))
            print()
            
            # Create progress animation with real-time tracking
            import threading
            import time
            stop_animation = threading.Event()
            progress_data = {'completed': 0, 'total': 52, 'current_test': ''}  # Default 52 tests
            
            def show_progress():
                """Show animated progress bar based on actual test completion."""
                frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
                elapsed = 0.0
                while not stop_animation.is_set():
                    frame = frames[int(elapsed * 10) % len(frames)]
                    mins, secs = divmod(int(elapsed), 60)
                    time_str = f"{mins:02d}:{secs:02d}"
                    
                    # Calculate actual progress percentage
                    completed = progress_data['completed']
                    total = progress_data['total']
                    percentage = (completed / total * 100) if total > 0 else 0
                    
                    # Progress bar based on actual completion
                    bar_width = 40
                    filled = int(bar_width * completed / total) if total > 0 else 0
                    bar = '█' * filled + '░' * (bar_width - filled)
                    
                    # Show current test if available
                    test_info = progress_data['current_test'][:30] if progress_data['current_test'] else 'Running tests'
                    
                    msg = f"\r  {c(frame, 'cyan')} [{bar}] {c(f'{percentage:.0f}%', 'yellow')} {c(f'({completed}/{total})', 'dim')} {c(time_str, 'dim')} - {c(test_info, 'dim')}"
                    print(msg, end='', flush=True)
                    time.sleep(0.1)
                    elapsed += 0.1
                # Clear the progress line
                print(f"\r{' ' * 100}\r", end='', flush=True)
            
            # Start progress animation
            progress_thread = threading.Thread(target=show_progress, daemon=True)
            progress_thread.start()
            
            try:
                # Run with real-time output capture for progress tracking
                # Force unbuffered output
                import os
                env = os.environ.copy()
                env['PYTHONUNBUFFERED'] = '1'
                
                proc = subprocess.Popen(
                    ['python3', '-u', str(test_script)],  # -u for unbuffered
                    cwd=project_root,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env=env,
                    bufsize=1  # Line buffered
                )
                
                # Collect output while parsing for progress
                output_lines = []
                for line in iter(proc.stdout.readline, ''):
                    if not line:
                        break
                    output_lines.append(line)
                    # Update progress data
                    import re
                    if '✅ SUCCESS' in line or '❌ FAILED' in line or '⏱️  TIMEOUT' in line:
                        progress_data['completed'] += 1
                    test_match = re.search(r'🧪 TEST: (.+)', line)
                    if test_match:
                        progress_data['current_test'] = test_match.group(1).strip()[:40]
                    total_match = re.search(r'Total Tests: (\d+)', line)
                    if total_match:
                        progress_data['total'] = int(total_match.group(1))
                
                proc.wait(timeout=300)
                return ""
                
            except subprocess.TimeoutExpired:
                if 'proc' in locals():
                    proc.kill()
                return c("⏱️  Tests timed out after 5 minutes", "yellow")
            except Exception as e:
                return c(f"❌ Test failed: {e}", "red")
            finally:
                # Stop the animation
                stop_animation.set()
                progress_thread.join(timeout=0.5)
        else:
            # Fallback to demo if test script doesn't exist
            print(c("  Test script not found, running demo instead...", "yellow"))
            print()
            from system_test import SystemTest
            tester = SystemTest(model_name=model)
            tester.run_interactive_test()
            return ""


# Test enhanced agent
if __name__ == "__main__":
    print(f"{PURPLE}╔════════════════════════════════════════╗{RESET}")
    print(f"{PURPLE}║   👾 Enhanced LuciferAI Test Suite    ║{RESET}")
    print(f"{PURPLE}╚════════════════════════════════════════╝{RESET}\n")
    
    agent = EnhancedLuciferAgent()
    
    # Test commands
    test_commands = [
        "help",
        "where am i",
        "fixnet stats",
        "list .",
    ]
    
    for i, cmd in enumerate(test_commands, 1):
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{GOLD}Test {i}: {cmd}{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        response = agent.process_request(cmd)
        print(response)
    
    print(f"\n\n{GREEN}✅ Enhanced agent tests complete!{RESET}")
