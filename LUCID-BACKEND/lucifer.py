#!/usr/bin/env python3
"""
👾 LuciferAI - Local Warp AI Clone
Interactive terminal assistant
"""
import sys
import os
import readline
import threading
import time
import subprocess
import urllib.request
from datetime import datetime
from pathlib import Path

# Add core to path
sys.path.insert(0, str(Path(__file__).parent / "core"))

# Use enhanced agent with FixNet integration
from enhanced_agent import EnhancedLuciferAgent as LuciferAgent

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
DIM = "\033[2m"
RESET = "\033[0m"
BOLD = "\033[1m"

# Heartbeat animation state
HEARTBEAT_ACTIVE = False
HEARTBEAT_THREAD = None
UPLOAD_SPEED = "--"
DOWNLOAD_SPEED = "--"

# Processing animation state
PROCESSING_ACTIVE = False
PROCESSING_THREAD = None
PROCESSING_MESSAGE = "Processing..."

def update_speeds(upload: str = None, download: str = None):
    """Update upload/download speeds for display."""
    global UPLOAD_SPEED, DOWNLOAD_SPEED
    if upload:
        UPLOAD_SPEED = upload
    if download:
        DOWNLOAD_SPEED = download


def heartbeat_animation():
    """Idle heartbeat animation with status line."""
    hearts = ['💀', '🩸', '💜', '🩸']
    colors = [PURPLE, RED, CYAN, GREEN, GOLD]
    CLEAR_LINE = "\033[K"
    idx = 0
    
    while HEARTBEAT_ACTIVE:
        color = colors[idx % len(hearts)]
        heart = hearts[idx % len(hearts)]
        # Save cursor, move UP 1 line, clear line, print status, restore cursor
        # \0337 = save cursor, \033[1A = move up 1 line, \0338 = restore cursor
        status_line = f"\0337\033[1A\r{color}{heart} Idle, awaiting commands... ↑{UPLOAD_SPEED} ↓{DOWNLOAD_SPEED}{RESET}{CLEAR_LINE}\0338"
        os.write(1, status_line.encode())
        time.sleep(0.5)
        idx += 1
    
    # Clear the status line when done
    clear_msg = f"\0337\033[1A\r{CLEAR_LINE}\0338"
    os.write(1, clear_msg.encode())

def start_heartbeat():
    """Start idle heartbeat animation."""
    global HEARTBEAT_ACTIVE, HEARTBEAT_THREAD
    if not HEARTBEAT_ACTIVE:
        HEARTBEAT_ACTIVE = True
        HEARTBEAT_THREAD = threading.Thread(target=heartbeat_animation, daemon=True)
        HEARTBEAT_THREAD.start()

def stop_heartbeat():
    """Stop idle heartbeat animation."""
    global HEARTBEAT_ACTIVE, HEARTBEAT_THREAD
    HEARTBEAT_ACTIVE = False
    if HEARTBEAT_THREAD and HEARTBEAT_THREAD.is_alive():
        HEARTBEAT_THREAD.join(timeout=1)
    HEARTBEAT_THREAD = None

def processing_animation():
    """Processing animation while model is loading/generating."""
    spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    idx = 0
    
    while PROCESSING_ACTIVE:
        spinner = spinners[idx % len(spinners)]
        # Print on same line with carriage return
        sys.stdout.write(f"\r{CYAN}{spinner} {PROCESSING_MESSAGE}{RESET}")
        sys.stdout.flush()
        time.sleep(0.1)
        idx += 1
    
    # Clear the line when done
    sys.stdout.write("\r" + " " * 80 + "\r")
    sys.stdout.flush()

def start_processing(message="Processing..."):
    """Start processing animation."""
    global PROCESSING_ACTIVE, PROCESSING_THREAD, PROCESSING_MESSAGE
    PROCESSING_MESSAGE = message
    if not PROCESSING_ACTIVE:
        PROCESSING_ACTIVE = True
        PROCESSING_THREAD = threading.Thread(target=processing_animation, daemon=True)
        PROCESSING_THREAD.start()

def stop_processing():
    """Stop processing animation."""
    global PROCESSING_ACTIVE, PROCESSING_THREAD
    PROCESSING_ACTIVE = False
    if PROCESSING_THREAD and PROCESSING_THREAD.is_alive():
        PROCESSING_THREAD.join(timeout=1)
    PROCESSING_THREAD = None

def print_main_menu():
    """Print main menu screen."""
    print(f"\n{PURPLE}╔{'═'*60}╗{RESET}")
    print(f"{PURPLE}║{BOLD}              👾  LuciferAI Terminal{' '*19}║{RESET}")
    print(f"{PURPLE}║{BOLD}     Self-Healing • Authenticated • Reflective AI Core{' '*5}║{RESET}")
    print(f"{PURPLE}║{' '*60}║{RESET}")
    print(f"{PURPLE}║{GOLD}{BOLD}              \"Forged in Silence, Born of Neon.\"{' '*14}║{RESET}")
    print(f"{PURPLE}╚{'═'*60}╝{RESET}\n")
    
    print(f"{CYAN}Mode:{RESET} Mistral (Tier 2)")
    print(f"{CYAN}Output:{RESET} Interactive mode with idle heartbeat animation")
    print(f"{CYAN}Perfect for:{RESET} Real-time command execution and monitoring\n")
    
    print(f"{GOLD}💡 Type 'help' to see what I can do, 'exit' to quit{RESET}\n")
    print(f"{DIM}────────────────────────────────────────────────────────────{RESET}\n")

def print_banner():
    """Print startup banner."""
    print(f"\n{PURPLE}{'═'*70}{RESET}")
    print(f"{PURPLE}║{' '*68}║{RESET}")
    print(f"{PURPLE}║{BOLD}    👾 LuciferAI - Local Terminal Assistant (Warp AI Clone){RESET}{PURPLE}     ║{RESET}")
    print(f"{PURPLE}║{' '*68}║{RESET}")
    print(f"{PURPLE}{'═'*70}{RESET}\n")
    print(f"{GOLD}💡 Type 'help' to see what I can do, 'exit' to quit{RESET}\n")


# ═══════════════════════════════════════════════════════════════════════════════
# AUTO-INSTALL: Check and install TinyLlama + llamafile on startup
# ═══════════════════════════════════════════════════════════════════════════════

LUCIFER_HOME = Path.home() / ".luciferai"  # user state only (history, llm_state) — NOT models
# Canonical model layout (see core/lucifer_paths.py — the single source of truth):
#   binary: <project>/.luciferai/bin/llamafile
#   models: <project>/models/*.gguf
try:
    from core.lucifer_paths import llamafile_path as _canonical_llamafile_path
    from core.lucifer_paths import models_dir as _canonical_models_dir
except ImportError:  # core/ already on sys.path (run as a script)
    from lucifer_paths import llamafile_path as _canonical_llamafile_path
    from lucifer_paths import models_dir as _canonical_models_dir
MODELS_DIR = _canonical_models_dir()
BIN_DIR = _canonical_llamafile_path().parent

# Model URLs — GGUF file + llamafile binary (NOT a self-contained .llamafile:
# nothing in the runtime executes .llamafile model files, that was a dead end).
TINYLLAMA_URL = "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
TINYLLAMA_FILE = "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
LLAMAFILE_URL = "https://github.com/Mozilla-Ocho/llamafile/releases/download/0.10.6/llamafile-0.10.6"
LLAMAFILE_FILE = "llamafile"


def download_with_progress(url: str, dest: Path, description: str) -> bool:
    """Download a file with progress indicator."""
    try:
        print(f"{BLUE}   Downloading {description}...{RESET}")
        print(f"{DIM}   URL: {url[:60]}...{RESET}")
        
        # Use curl for better progress (if available)
        if os.system("which curl > /dev/null 2>&1") == 0:
            result = subprocess.run(
                ["curl", "-L", "-o", str(dest), url, "--progress-bar"],
                capture_output=False
            )
            if result.returncode == 0:
                return True
        
        # Fallback to urllib
        print(f"{DIM}   This may take a few minutes...{RESET}")
        urllib.request.urlretrieve(url, dest)
        return True
        
    except Exception as e:
        print(f"{RED}   ❌ Download failed: {e}{RESET}")
        return False


def assemble_llamafile_from_parts() -> bool:
    """Assemble llamafile from split parts if needed.

    Vendored parts live in <project>/bin/; the assembled binary goes to the
    canonical location <project>/.luciferai/bin/llamafile (see
    core/lucifer_paths.py). The old behaviour assembled it into
    <project>/bin/, a directory no component ever looked in.
    """
    project_bin = Path(__file__).parent / "bin"
    llamafile_path = _canonical_llamafile_path()
    part_aa = project_bin / "llamafile.part.aa"
    
    # If llamafile exists, we're good
    if llamafile_path.exists():
        return True
    
    # Check if parts exist
    if not part_aa.exists():
        return False
    
    print(f"{BLUE}🔧 Assembling llamafile from parts...{RESET}")
    try:
        import glob
        llamafile_path.parent.mkdir(parents=True, exist_ok=True)
        parts = sorted(glob.glob(str(project_bin / "llamafile.part.*")))
        with open(llamafile_path, 'wb') as outfile:
            for part in parts:
                with open(part, 'rb') as infile:
                    outfile.write(infile.read())
        os.chmod(llamafile_path, 0o755)
        print(f"{GREEN}✅ llamafile assembled → {llamafile_path}{RESET}")
        return True
    except Exception as e:
        print(f"{RED}❌ Failed to assemble llamafile: {e}{RESET}")
        return False


def check_and_install_models() -> bool:
    """
    Check if TinyLlama and llamafile are installed in the canonical layout
    (see core/lucifer_paths.py). Returns True if both are present, False
    otherwise — the caller continues without a model, but no longer claims
    success when nothing is installed.
    """
    # First try to assemble llamafile from parts (if cloned from repo)
    assemble_llamafile_from_parts()
    
    binary = _canonical_llamafile_path()
    tinyllama_path = MODELS_DIR / TINYLLAMA_FILE
    
    llamafile_exists = binary.exists()
    tinyllama_exists = tinyllama_path.exists()

    # If both exist, we're good
    if llamafile_exists and tinyllama_exists:
        return True
    
    # Show what's missing
    print(f"\n{GOLD}🔧 LLM Setup Check{RESET}")
    print(f"{DIM}{'─'*50}{RESET}")
    
    missing = []
    if not llamafile_exists:
        print(f"   {RED}●{RESET} llamafile binary: {RED}Not installed{RESET}")
        missing.append("llamafile")
    else:
        print(f"   {GREEN}●{RESET} llamafile binary: {GREEN}Installed{RESET} ({binary})")
    
    if not tinyllama_exists:
        print(f"   {RED}●{RESET} TinyLlama model:  {RED}Not installed{RESET} (670MB)")
        missing.append("TinyLlama")
    else:
        print(f"   {GREEN}●{RESET} TinyLlama model:  {GREEN}Installed{RESET} ({tinyllama_path})")
    
    if not missing:
        return True
    
    print(f"\n{GOLD}💡 Recommendation: Install TinyLlama for AI-powered features{RESET}")
    print(f"{DIM}Without it, LuciferAI works but with limited LLM capabilities.{RESET}")
    print()
    print(f"{CYAN}📦 To install (binary + model, canonical layout):{RESET}")
    print(f"   {GOLD}./setup_bundled_models.sh{RESET}")
    print()
    print(f"{CYAN}🚀 Continuing without a model...{RESET}")
    print(f"{DIM}   LuciferAI will use rule-based command parsing.{RESET}")
    print()
    
    return False


def main():
    """Main interactive loop."""
    # Check and install TinyLlama/llamafile if needed
    check_and_install_models()
    
    # Initialize agent
    agent = LuciferAgent()
    
    # Check if command was passed as argument
    if len(sys.argv) > 1:
        # Join all arguments after script name as the command
        pre_input_command = ' '.join(sys.argv[1:])
        
        # Show startup banner briefly
        print(f"\n{PURPLE}{'═'*70}{RESET}")
        print(f"{PURPLE}║{BOLD}    👾 LuciferAI - Processing Command{RESET}{PURPLE}{' '*29}║{RESET}")
        print(f"{PURPLE}{'═'*70}{RESET}\n")
        
        # Show user request with timestamp
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"{DIM}[{timestamp}]{RESET}")
        print(f"{CYAN}You:{RESET} {pre_input_command}")
        
        # Process the command and exit
        print(f"\n{BLUE}LuciferAI >{RESET}", end=" ")
        response = agent.process_request(pre_input_command)
        print(response)
        print()  # Extra newline
        return  # Exit after processing
    
    # Show main menu (uses agent's built-in display) and print any selection result
    menu_response = agent._handle_main_menu()
    if menu_response:
        print(menu_response)
    
    # Setup command history (last 120 commands)
    histfile = Path.home() / ".luciferai_history"
    try:
        readline.read_history_file(histfile)
        readline.set_history_length(120)
    except (FileNotFoundError, OSError, IOError) as e:
        # History file doesn't exist or is corrupted/unreadable
        # This is fine - it will be created on exit
        pass
    
    # Interactive loop
    while True:
        try:
            # Start heartbeat animation (shows status line below prompt)
            start_heartbeat()
            
            # Prompt
            user_input = input(f"\n{PURPLE}LuciferAI >{RESET} ").strip()
            
            # Stop heartbeat
            stop_heartbeat()
            
            if not user_input:
                continue
            
            # Show user request with timestamp
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"\n{DIM}[{timestamp}]{RESET}")
            print(f"{CYAN}You:{RESET} {user_input}")
            
            # Handle exit
            if user_input.lower() in ['exit', 'quit', 'q']:
                stop_heartbeat()  # Ensure heartbeat is stopped
                print(f"\n{PURPLE}👋 Farewell, mortal. LuciferAI signing off.{RESET}\n")
                break
            
            # Handle clear
            if user_input.lower() in ['clear', 'cls']:
                os.system('clear' if os.name != 'nt' else 'cls')
                print_main_menu()
                continue
            
            # Handle history clear
            if user_input.lower() == 'clear history':
                agent.clear_history()
                continue
            
            # Process request
            print(f"\n{BLUE}LuciferAI >{RESET}", end=" ")
            response = agent.process_request(user_input)
            print(response)
        
        except KeyboardInterrupt:
            stop_heartbeat()  # Stop animation
            print(f"\n\n{GOLD}⚠️  Interrupted.{RESET}")
            # Next Ctrl+C will exit
            try:
                next_input = input(f"\n{PURPLE}LuciferAI >{RESET} ").strip()
                if not next_input:
                    continue
                # Process the input normally
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                print(f"\n{DIM}[{timestamp}]{RESET}")
                print(f"{CYAN}You:{RESET} {next_input}")
                if next_input.lower() in ['exit', 'quit', 'q']:
                    print(f"\n{PURPLE}👋 Farewell, mortal. LuciferAI signing off.{RESET}\n")
                    break
                print(f"\n{BLUE}LuciferAI >{RESET}", end=" ")
                response = agent.process_request(next_input)
                print(response)
            except KeyboardInterrupt:
                # Second Ctrl+C exits
                print(f"\n\n{PURPLE}👋 Exiting LuciferAI{RESET}\n")
                break
        
        except EOFError:
            stop_heartbeat()  # Stop animation on EOF
            print(f"\n{PURPLE}👋 EOF detected. Exiting.{RESET}\n")
            break
        
        except Exception as e:
            print(f"\n{RED}❌ Error: {e}{RESET}")
            print(f"{GOLD}💡 Please try again or type 'help'{RESET}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        stop_heartbeat()
        print(f"\n{PURPLE}👋 Exiting LuciferAI{RESET}\n")
        sys.exit(0)
    finally:
        # Save command history
        histfile = Path.home() / ".luciferai_history"
        try:
            # Ensure parent directory exists
            histfile.parent.mkdir(parents=True, exist_ok=True)
            readline.write_history_file(histfile)
        except (OSError, IOError, PermissionError) as e:
            # Silently fail if history file can't be written
            # This can happen if filesystem is readonly or corrupted
            pass
        except Exception:
            # Catch any other unexpected exceptions
            pass
