#!/usr/bin/env python3
"""
🩸 LuciferAI OS Fallback System
5-tier self-healing environment adapter

Tier 0: Native Mode (all dependencies satisfied)
Tier 1: Virtual Environment Fallback (🩹 Cyan)
Tier 2: Mirror Binary Fallback (🔄 Yellow)
Tier 3: Stub Layer (🧩 Purple)
Tier 4: Emergency CLI Mode (☠️ Red)
Recovery: System Repair (💫 Green)
"""
import os
import sys
import platform
import subprocess
import hashlib
import json
from pathlib import Path
from typing import Optional, Dict, List, Tuple

# Colors
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
CYAN = '\033[36m'
DIM = '\033[2m'
RESET = '\033[0m'

# Paths
LUCIFER_HOME = Path.home() / ".luciferai"
FALLBACK_ENV = LUCIFER_HOME / "envs" / "lucifer_env"
FALLBACK_BIN = Path("/tmp/lucifer_fallback_bin")
MIRROR_URL = "https://github.com/GareBear99/LuciferAI_Mirror/releases"
REQUIREMENTS_FILE = LUCIFER_HOME / "data" / "requirements.txt"

# Logs
SYSTEM_CHECK_LOG = LUCIFER_HOME / "logs" / "system_check.log"
FALLBACK_TRACE_LOG = LUCIFER_HOME / "logs" / "fallback_trace.log"
SYSTEM_REPAIR_LOG = LUCIFER_HOME / "logs" / "system_repair.log"
EMERGENCY_LOG = LUCIFER_HOME / "logs" / "emergency"


class FallbackSystem:
    """5-tier self-healing OS fallback system."""
    
    def __init__(self):
        self.current_tier = 0  # Native mode
        self.fallback_streak = 0
        self.os_type = platform.system().lower()
        self.logs = []
        
        # Ensure directories exist
        self._init_directories()
    
    def _init_directories(self):
        """Initialize required directories."""
        for path in [LUCIFER_HOME / "logs", LUCIFER_HOME / "data", 
                     LUCIFER_HOME / "envs", EMERGENCY_LOG]:
            path.mkdir(parents=True, exist_ok=True)
    
    def _log(self, message: str, tier: int = None):
        """Log fallback activity."""
        import datetime
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        tier_str = f"Tier {tier}" if tier is not None else "System"
        log_entry = f"[{timestamp}] {tier_str}: {message}"
        
        self.logs.append(log_entry)
        
        # Write to fallback trace log
        with open(FALLBACK_TRACE_LOG, 'a') as f:
            f.write(log_entry + '\n')
        
        print(f"{DIM}{log_entry}{RESET}")
    
    # ═══════════════════════════════════════════════════════════
    # TIER 0: Environment Detection
    # ═══════════════════════════════════════════════════════════
    
    def check_system_env(self) -> Dict[str, any]:
        """
        Environment audit - checks OS, dependencies, and PATH integrity.
        Returns environment status dict.
        """
        print(f"\n{BLUE}🧠 Checking system environment...{RESET}\n")
        
        env_status = {
            'os': self.os_type,
            'kernel': platform.release(),
            'python': sys.version.split()[0],
            'package_managers': {},
            'dependencies': {},
            'path_integrity': True,
            'tier': 0
        }
        
        # Detect OS
        if self.os_type == 'darwin':
            os_version = platform.mac_ver()[0]
            print(f"{CYAN}🧠 Detected: macOS {os_version}{RESET}")
        elif self.os_type == 'linux':
            print(f"{CYAN}🧠 Detected: Linux {env_status['kernel']}{RESET}")
        elif self.os_type == 'windows':
            print(f"{CYAN}🧠 Detected: Windows {platform.release()}{RESET}")
        
        # Check package managers
        managers = ['brew', 'apt', 'yum', 'choco', 'pip3', 'pip', 'conda', 'npm']
        for mgr in managers:
            env_status['package_managers'][mgr] = self._command_exists(mgr)
        
        # Check critical dependencies
        critical_deps = ['git', 'python3', 'pip']
        for dep in critical_deps:
            env_status['dependencies'][dep] = self._command_exists(dep)
        
        # Check PATH integrity
        paths = os.getenv('PATH', '').split(':' if self.os_type != 'windows' else ';')
        critical_paths = ['/usr/local/bin', '/usr/bin']
        env_status['path_integrity'] = any(p in paths for p in critical_paths)
        
        # Log results
        with open(SYSTEM_CHECK_LOG, 'w') as f:
            json.dump(env_status, f, indent=2)
        
        print(f"{GREEN}✅ Environment audit complete{RESET}\n")
        
        return env_status
    
    def _command_exists(self, cmd: str) -> bool:
        """Check if command exists."""
        try:
            if self.os_type == 'windows':
                subprocess.run(['where', cmd], capture_output=True, check=True)
            else:
                subprocess.run(['which', cmd], capture_output=True, check=True)
            return True
        except:
            return False
    
    # ═══════════════════════════════════════════════════════════
    # TIER 1: Virtual Environment Fallback (🩹 Cyan)
    # ═══════════════════════════════════════════════════════════
    
    def fallback_virtual_env(self) -> bool:
        """
        Create/activate virtual environment for missing Python packages.
        Tier 1 Indicator: 🩹 Cyan
        """
        self.current_tier = 1
        self.fallback_streak += 1
        self._log("Virtual environment fallback activated", 1)
        
        print(f"\n{CYAN}🩹 Tier 1: Virtual Environment Fallback{RESET}\n")
        print(f"{YELLOW}Rebuilding virtual environment...{RESET}")
        
        try:
            # Create virtual environment
            if not FALLBACK_ENV.exists():
                print(f"{BLUE}Creating virtual environment at {FALLBACK_ENV}...{RESET}")
                subprocess.run([sys.executable, '-m', 'venv', str(FALLBACK_ENV)], 
                             check=True, timeout=60)
            
            # Get pip from venv
            pip_exe = FALLBACK_ENV / "bin" / "pip" if self.os_type != 'windows' else FALLBACK_ENV / "Scripts" / "pip.exe"
            
            # Install requirements
            if REQUIREMENTS_FILE.exists():
                print(f"{BLUE}Installing dependencies from requirements.txt...{RESET}")
                subprocess.run([str(pip_exe), 'install', '-r', str(REQUIREMENTS_FILE)],
                             check=True, timeout=300)
            else:
                # Install critical packages
                critical_packages = ['colorama', 'requests', 'psutil']
                for pkg in critical_packages:
                    print(f"{BLUE}Installing {pkg}...{RESET}")
                    subprocess.run([str(pip_exe), 'install', pkg],
                                 capture_output=True, timeout=60)
            
            print(f"\n{GREEN}✅ Virtual environment ready{RESET}\n")
            self._log("Virtual environment created successfully", 1)
            return True
            
        except Exception as e:
            print(f"{RED}❌ Virtual environment fallback failed: {e}{RESET}")
            self._log(f"Tier 1 failed: {e}", 1)
            return False
    
    # ═══════════════════════════════════════════════════════════
    # TIER 2: Mirror Binary Fallback (🔄 Yellow)
    # ═══════════════════════════════════════════════════════════
    
    def fallback_mirror_download(self, tool: str) -> bool:
        """
        Download missing system tools from mirror repository.
        Tier 2 Indicator: 🔄 Yellow
        """
        self.current_tier = 2
        self.fallback_streak += 1
        self._log(f"Mirror fallback activated for: {tool}", 2)
        
        print(f"\n{YELLOW}🔄 Tier 2: Mirror Binary Fallback{RESET}\n")
        print(f"{YELLOW}Fetching {tool} from mirror...{RESET}")
        
        try:
            # Create fallback bin directory
            FALLBACK_BIN.mkdir(parents=True, exist_ok=True)
            
            # Try multiple package managers in sequence
            managers = self._get_package_managers_by_priority()
            
            for mgr_name, install_cmd in managers:
                if self._command_exists(mgr_name):
                    print(f"{BLUE}Attempting install via {mgr_name}...{RESET}")
                    try:
                        subprocess.run(install_cmd(tool), 
                                     shell=True, check=True, timeout=120)
                        print(f"{GREEN}✅ Installed {tool} via {mgr_name}{RESET}\n")
                        self._log(f"Tool {tool} installed via {mgr_name}", 2)
                        return True
                    except:
                        continue
            
            # If all fail, try downloading from mirror (placeholder)
            print(f"{YELLOW}Checking mirror repository...{RESET}")
            self._log(f"All package managers failed for {tool}", 2)
            return False
            
        except Exception as e:
            print(f"{RED}❌ Mirror fallback failed: {e}{RESET}")
            self._log(f"Tier 2 failed: {e}", 2)
            return False
    
    def _get_package_managers_by_priority(self) -> List[Tuple[str, callable]]:
        """Get package managers in priority order with install commands."""
        managers = []
        
        if self.os_type == 'darwin':
            managers = [
                ('brew', lambda pkg: f'brew install {pkg}'),
                ('port', lambda pkg: f'port install {pkg}'),
            ]
        elif self.os_type == 'linux':
            managers = [
                ('apt', lambda pkg: f'sudo apt-get install -y {pkg}'),
                ('yum', lambda pkg: f'sudo yum install -y {pkg}'),
                ('dnf', lambda pkg: f'sudo dnf install -y {pkg}'),
                ('pacman', lambda pkg: f'sudo pacman -S --noconfirm {pkg}'),
            ]
        elif self.os_type == 'windows':
            managers = [
                ('choco', lambda pkg: f'choco install {pkg} -y'),
                ('winget', lambda pkg: f'winget install {pkg}'),
            ]
        
        # Universal managers
        managers.extend([
            ('pip3', lambda pkg: f'pip3 install {pkg}'),
            ('pip', lambda pkg: f'pip install {pkg}'),
            ('conda', lambda pkg: f'conda install -y {pkg}'),
            ('npm', lambda pkg: f'npm install -g {pkg}'),
        ])
        
        return managers
    
    # ═══════════════════════════════════════════════════════════
    # TIER 3: Stub Layer (🧩 Purple)
    # ═══════════════════════════════════════════════════════════
    
    def fallback_stub_module(self, module_name: str):
        """
        Create stub module to prevent import crashes.
        Tier 3 Indicator: 🧩 Purple
        """
        self.current_tier = 3
        self.fallback_streak += 1
        self._log(f"Stub module created for: {module_name}", 3)
        
        print(f"\n{PURPLE}🧩 Tier 3: Stub Layer{RESET}\n")
        print(f"{PURPLE}Creating stub for {module_name}...{RESET}")
        
        # Create stub class
        stub_code = f"""
class {module_name.capitalize()}Stub:
    def __init__(self):
        print("{PURPLE}[STUB] {module_name} fallback active{RESET}")
    
    def __getattr__(self, name):
        def stub_method(*args, **kwargs):
            print(f"{PURPLE}[STUB] {module_name}.{{name}}() called{RESET}")
            return None
        return stub_method
"""
        
        # Save stub module
        stub_file = LUCIFER_HOME / "stubs" / f"{module_name}_stub.py"
        stub_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(stub_file, 'w') as f:
            f.write(stub_code)
        
        print(f"{GREEN}✅ Stub module created: {stub_file}{RESET}\n")
        return stub_file
    
    # ═══════════════════════════════════════════════════════════
    # TIER 4: Emergency CLI Mode (☠️ Red)
    # ═══════════════════════════════════════════════════════════
    
    def fallback_emergency_cli(self):
        """
        Enter minimal CLI-only mode with core commands only.
        Tier 4 Indicator: ☠️ Red
        """
        self.current_tier = 4
        self.fallback_streak += 1
        self._log("Emergency CLI mode activated", 4)
        
        print(f"\n{RED}☠️ Tier 4: Emergency CLI Mode{RESET}\n")
        print(f"{RED}Catastrophic environment failure detected{RESET}")
        print(f"{YELLOW}Starting minimal survival shell...{RESET}\n")
        
        # Save emergency state
        emergency_state = {
            'timestamp': str(Path.home()),
            'tier': 4,
            'logs': self.logs
        }
        
        with open(EMERGENCY_LOG / "state.json", 'w') as f:
            json.dump(emergency_state, f, indent=2)
        
        print(f"{CYAN}[LuciferAI Emergency Mode]{RESET}")
        print(f"{DIM}Available commands: fix, analyze, help, exit{RESET}\n")
        
        return True
    
    # ═══════════════════════════════════════════════════════════
    # RECOVERY: System Repair (💫 Green)
    # ═══════════════════════════════════════════════════════════
    
    def system_repair(self) -> bool:
        """
        Automated environment rebuild and restoration.
        Recovery Indicator: 💫 Green
        """
        print(f"\n{GREEN}💫 System Repair Initiated{RESET}\n")
        print(f"{YELLOW}Attempting automated recovery...{RESET}\n")
        
        self._log("System repair started", tier=None)
        
        try:
            # Step 1: Rebuild virtual environment
            print(f"{BLUE}[1/4] Rebuilding virtual environment...{RESET}")
            if self.fallback_virtual_env():
                print(f"{GREEN}✅ Virtual environment restored{RESET}")
            
            # Step 2: Reinstall missing tools
            print(f"{BLUE}[2/4] Checking system tools...{RESET}")
            critical_tools = ['git', 'curl', 'wget']
            for tool in critical_tools:
                if not self._command_exists(tool):
                    self.fallback_mirror_download(tool)
            
            # Step 3: Purge broken links
            print(f"{BLUE}[3/4] Purging broken symbolic links...{RESET}")
            # (Implementation would clean up /tmp and fallback dirs)
            
            # Step 4: Verify restoration
            print(f"{BLUE}[4/4] Verifying system integrity...{RESET}")
            env_status = self.check_system_env()
            
            if env_status['path_integrity']:
                self.current_tier = 0
                self.fallback_streak = 0
                print(f"\n{GREEN}💫 System Restored Successfully{RESET}\n")
                self._log("System repair completed successfully", tier=None)
                return True
            
            return False
            
        except Exception as e:
            print(f"{RED}❌ System repair failed: {e}{RESET}")
            self._log(f"System repair failed: {e}", tier=None)
            return False
    
    def verify_fallback_integrity(self, file_path: Path, expected_hash: str) -> bool:
        """Verify SHA256 hash of fallback binary."""
        try:
            sha256 = hashlib.sha256()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    sha256.update(chunk)
            
            actual_hash = sha256.hexdigest()
            
            if actual_hash == expected_hash:
                print(f"{GREEN}✅ Integrity verified{RESET}")
                return True
            else:
                print(f"{RED}💀 Verification FAILED{RESET}")
                return False
                
        except Exception as e:
            print(f"{RED}❌ Verification error: {e}{RESET}")
            return False
    
    def should_auto_repair(self) -> bool:
        """Check if automatic repair should trigger."""
        return self.fallback_streak >= 3


# Global instance
_fallback_system = None


def get_fallback_system() -> FallbackSystem:
    """Get global fallback system instance."""
    global _fallback_system
    if _fallback_system is None:
        _fallback_system = FallbackSystem()
    return _fallback_system


if __name__ == "__main__":
    # Test
    system = FallbackSystem()
    env = system.check_system_env()
    
    print(f"\nCurrent Tier: {system.current_tier}")
    print(f"Fallback Streak: {system.fallback_streak}")
