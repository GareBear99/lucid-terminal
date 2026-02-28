#!/usr/bin/env python3
"""
☠️ LuciferAI Emergency CLI Mode
Minimal survival shell for catastrophic environment failures
"""
import os
import sys
from pathlib import Path

# Minimal ANSI colors (fallback safe)
try:
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    CYAN = '\033[36m'
    DIM = '\033[2m'
    RESET = '\033[0m'
except:
    RED = GREEN = YELLOW = CYAN = DIM = RESET = ""


class EmergencyCLI:
    """Minimal CLI with core survival commands."""
    
    def __init__(self):
        self.running = True
        self.lucifer_home = Path.home() / ".luciferai"
    
    def display_banner(self):
        """Display emergency mode banner."""
        print(f"\n{RED}╔═══════════════════════════════════════════╗{RESET}")
        print(f"{RED}║  ☠️  LUCIFERAI EMERGENCY MODE  ☠️         ║{RESET}")
        print(f"{RED}╚═══════════════════════════════════════════╝{RESET}\n")
        print(f"{YELLOW}Environment failure detected. Running minimal CLI.{RESET}")
        print(f"{DIM}Type 'help' for available commands{RESET}\n")
    
    def run(self):
        """Main emergency CLI loop."""
        self.display_banner()
        
        while self.running:
            try:
                command = input(f"{RED}lucifer>{RESET} ").strip().lower()
                
                if not command:
                    continue
                
                if command == "exit":
                    self.cmd_exit()
                elif command == "help":
                    self.cmd_help()
                elif command == "fix":
                    self.cmd_fix()
                elif command == "analyze":
                    self.cmd_analyze()
                elif command == "status":
                    self.cmd_status()
                elif command == "logs":
                    self.cmd_logs()
                else:
                    print(f"{RED}Unknown command: {command}{RESET}")
                    print(f"{DIM}Type 'help' for available commands{RESET}")
            
            except KeyboardInterrupt:
                print(f"\n{YELLOW}Use 'exit' to quit{RESET}")
            except EOFError:
                break
            except Exception as e:
                print(f"{RED}Error: {e}{RESET}")
    
    def cmd_help(self):
        """Display help."""
        print(f"\n{CYAN}Available Commands:{RESET}")
        print(f"  {GREEN}fix{RESET}      - Attempt automated system repair")
        print(f"  {GREEN}analyze{RESET}  - Analyze environment failures")
        print(f"  {GREEN}status{RESET}   - Show system status")
        print(f"  {GREEN}logs{RESET}     - View emergency logs")
        print(f"  {GREEN}help{RESET}     - Show this help")
        print(f"  {GREEN}exit{RESET}     - Exit emergency mode\n")
    
    def cmd_fix(self):
        """Trigger system repair."""
        print(f"\n{YELLOW}Initiating system repair...{RESET}\n")
        
        try:
            from core.fallback_system import get_fallback_system
            system = get_fallback_system()
            
            if system.system_repair():
                print(f"{GREEN}✅ System repair completed{RESET}")
                print(f"{CYAN}You may restart LuciferAI normally{RESET}\n")
            else:
                print(f"{RED}❌ System repair failed{RESET}")
                print(f"{YELLOW}Check logs for details{RESET}\n")
        
        except Exception as e:
            print(f"{RED}❌ Repair failed: {e}{RESET}\n")
    
    def cmd_analyze(self):
        """Analyze system failures."""
        print(f"\n{CYAN}Analyzing system environment...{RESET}\n")
        
        try:
            from core.fallback_system import get_fallback_system
            system = get_fallback_system()
            env = system.check_system_env()
            
            print(f"{CYAN}OS:{RESET} {env['os']}")
            print(f"{CYAN}Python:{RESET} {env['python']}")
            print(f"{CYAN}PATH Integrity:{RESET} {env['path_integrity']}\n")
            
            print(f"{CYAN}Package Managers:{RESET}")
            for mgr, available in env['package_managers'].items():
                status = f"{GREEN}✓{RESET}" if available else f"{RED}✗{RESET}"
                print(f"  {status} {mgr}")
            
            print(f"\n{CYAN}Dependencies:{RESET}")
            for dep, available in env['dependencies'].items():
                status = f"{GREEN}✓{RESET}" if available else f"{RED}✗{RESET}"
                print(f"  {status} {dep}")
            
            print()
        
        except Exception as e:
            print(f"{RED}❌ Analysis failed: {e}{RESET}\n")
    
    def cmd_status(self):
        """Show system status."""
        print(f"\n{CYAN}System Status:{RESET}")
        
        try:
            from core.fallback_system import get_fallback_system
            system = get_fallback_system()
            
            tier_icons = ["🟢", "🩹", "🔄", "🧩", "☠️"]
            tier_names = ["Native", "Virtual Env", "Mirror", "Stub", "Emergency"]
            
            tier = system.current_tier
            print(f"  OS Fallback: {tier_icons[tier]} Tier {tier} ({tier_names[tier]})")
            print(f"  Fallback Streak: {system.fallback_streak}")
            
            # Show AI model status
            from pathlib import Path
            project_root = Path(__file__).parent.parent
            luciferai_dir = project_root / '.luciferai'
            llamafile_path = luciferai_dir / 'bin' / 'llamafile'
            tinyllama_path = luciferai_dir / 'models' / 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'
            models_dir = luciferai_dir / 'models'
            
            print(f"\n  {CYAN}AI Models:{RESET}")
            
            # Check llamafile
            if llamafile_path.exists():
                print(f"    {GREEN}✓{RESET} llamafile (bundled)")
            else:
                print(f"    {RED}✗{RESET} llamafile")
            
            # Check TinyLlama
            if tinyllama_path.exists():
                print(f"    {GREEN}✓{RESET} TinyLlama 1.1B (Tier 0, bundled)")
            else:
                print(f"    {RED}✗{RESET} TinyLlama")
            
            # Check Ollama
            import shutil
            if shutil.which('ollama'):
                print(f"    {GREEN}✓{RESET} Ollama available")
                
                # Count installed models
                if models_dir.exists():
                    model_count = len([d for d in models_dir.iterdir() if d.is_dir() and (d / '.installed').exists()])
                    if model_count > 0:
                        print(f"       {CYAN}{model_count} model(s) installed{RESET}")
            else:
                print(f"    {RED}✗{RESET} Ollama")
            
            if system.should_auto_repair():
                print(f"\n  {YELLOW}⚠️  Auto-repair recommended{RESET}")
            
            print()
        
        except Exception as e:
            print(f"{RED}❌ Status check failed: {e}{RESET}\n")
    
    def cmd_logs(self):
        """View emergency logs."""
        print(f"\n{CYAN}Recent Emergency Logs:{RESET}\n")
        
        try:
            log_file = self.lucifer_home / "logs" / "fallback_trace.log"
            
            if log_file.exists():
                with open(log_file, 'r') as f:
                    lines = f.readlines()
                    # Show last 20 lines
                    for line in lines[-20:]:
                        print(f"{DIM}{line.strip()}{RESET}")
            else:
                print(f"{YELLOW}No logs found{RESET}")
            
            print()
        
        except Exception as e:
            print(f"{RED}❌ Failed to read logs: {e}{RESET}\n")
    
    def cmd_exit(self):
        """Exit emergency mode."""
        print(f"\n{YELLOW}Exiting emergency mode...{RESET}\n")
        self.running = False


def start_emergency_mode():
    """Start emergency CLI."""
    cli = EmergencyCLI()
    cli.run()


if __name__ == "__main__":
    start_emergency_mode()
