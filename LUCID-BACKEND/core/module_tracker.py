#!/usr/bin/env python3
"""
🩸 LuciferAI Module Tracker
Track and display packages from all sources:
- System (pip, brew, conda)
- LuciferAI Global Environment
- Active Luci Environment
"""
import os
import sys
import json
import subprocess
from pathlib import Path
from typing import Dict, List, Optional

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
LUCIFERAI_HOME = Path.home() / ".luciferai"
LUCIFERAI_GLOBAL_ENV = LUCIFERAI_HOME / "global_env"
LUCI_HOME = Path.home() / ".luci_environments"
ACTIVE_ENV_FILE = LUCI_HOME / ".active_env"


class ModuleTracker:
    """Track and display packages from all sources."""
    
    def __init__(self):
        self.system_packages = {}
        self.luciferai_packages = {}
        self.active_env_packages = {}
        self.active_env_name = None
        
        # External package managers
        self.brew_packages = []
        self.conda_packages = []
    
    def scan_all(self):
        """Scan all package sources."""
        print(f"{YELLOW}🔍 Scanning module environments...{RESET}\n")
        
        self._scan_system_pip()
        self._scan_brew()
        self._scan_conda()
        self._scan_luciferai_global()
        self._scan_active_luci_env()
    
    def _scan_system_pip(self):
        """Scan system-wide pip packages."""
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "list", "--format", "json"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                packages = json.loads(result.stdout)
                self.system_packages = {
                    pkg['name']: pkg['version'] for pkg in packages
                }
        except Exception as e:
            print(f"{DIM}⚠️  Could not scan system pip: {e}{RESET}")
    
    def _scan_brew(self):
        """Scan Homebrew packages."""
        try:
            result = subprocess.run(
                ["brew", "list", "--versions"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if line:
                        parts = line.split()
                        if len(parts) >= 2:
                            name = parts[0]
                            version = parts[1]
                            self.brew_packages.append({
                                'name': name,
                                'version': version
                            })
        except FileNotFoundError:
            pass  # Brew not installed
        except Exception as e:
            print(f"{DIM}⚠️  Could not scan brew: {e}{RESET}")
    
    def _scan_conda(self):
        """Scan conda packages if conda is active."""
        conda_prefix = os.environ.get('CONDA_PREFIX')
        if not conda_prefix:
            return
        
        try:
            result = subprocess.run(
                ["conda", "list", "--json"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                packages = json.loads(result.stdout)
                self.conda_packages = [
                    {'name': pkg['name'], 'version': pkg['version']}
                    for pkg in packages
                ]
        except Exception as e:
            print(f"{DIM}⚠️  Could not scan conda: {e}{RESET}")
    
    def _scan_luciferai_global(self):
        """Scan LuciferAI global environment."""
        if not LUCIFERAI_GLOBAL_ENV.exists():
            # Create it if it doesn't exist
            self._create_luciferai_global_env()
            return
        
        pip_exe = LUCIFERAI_GLOBAL_ENV / "bin" / "pip"
        if not pip_exe.exists():
            return
        
        try:
            result = subprocess.run(
                [str(pip_exe), "list", "--format", "json"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                packages = json.loads(result.stdout)
                self.luciferai_packages = {
                    pkg['name']: pkg['version'] for pkg in packages
                }
        except Exception as e:
            print(f"{DIM}⚠️  Could not scan LuciferAI global env: {e}{RESET}")
    
    def _create_luciferai_global_env(self):
        """Create LuciferAI global environment."""
        print(f"{PURPLE}🩸 Creating LuciferAI global environment...{RESET}")
        
        try:
            subprocess.run(
                [sys.executable, "-m", "venv", str(LUCIFERAI_GLOBAL_ENV)],
                check=True,
                capture_output=True
            )
            
            # Upgrade pip
            pip_exe = LUCIFERAI_GLOBAL_ENV / "bin" / "pip"
            subprocess.run(
                [str(pip_exe), "install", "--upgrade", "pip", "setuptools"],
                check=True,
                capture_output=True
            )
            
            print(f"{GREEN}✅ LuciferAI global environment created{RESET}\n")
        except Exception as e:
            print(f"{RED}❌ Failed to create global environment: {e}{RESET}\n")
    
    def _scan_active_luci_env(self):
        """Scan active Luci environment if any."""
        if not ACTIVE_ENV_FILE.exists():
            return
        
        self.active_env_name = ACTIVE_ENV_FILE.read_text().strip()
        env_path = LUCI_HOME / "envs" / self.active_env_name
        
        if not env_path.exists():
            self.active_env_name = None
            return
        
        pip_exe = env_path / "bin" / "pip"
        if not pip_exe.exists():
            return
        
        try:
            result = subprocess.run(
                [str(pip_exe), "list", "--format", "json"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                packages = json.loads(result.stdout)
                self.active_env_packages = {
                    pkg['name']: pkg['version'] for pkg in packages
                }
        except Exception as e:
            print(f"{DIM}⚠️  Could not scan active Luci env: {e}{RESET}")
    
    def display_summary(self):
        """Display summary of all packages."""
        print(f"{PURPLE}╔════════════════════════════════════════════════════════════╗{RESET}")
        print(f"{PURPLE}║           🩸 LuciferAI Module Overview                    ║{RESET}")
        print(f"{PURPLE}╚════════════════════════════════════════════════════════════╝{RESET}\n")
        
        # Summary counts
        print(f"{CYAN}📊 Summary:{RESET}\n")
        
        print(f"  {BLUE}System (pip):{RESET}           {len(self.system_packages)} packages")
        print(f"  {BLUE}Homebrew:{RESET}               {len(self.brew_packages)} packages")
        
        if self.conda_packages:
            print(f"  {BLUE}Conda (active):{RESET}         {len(self.conda_packages)} packages")
        
        print(f"  {PURPLE}LuciferAI Global:{RESET}       {len(self.luciferai_packages)} packages")
        
        if self.active_env_name:
            print(f"  {GREEN}Luci Env ({self.active_env_name}):{RESET} {len(self.active_env_packages)} packages")
        else:
            print(f"  {DIM}Luci Env:{RESET}               {DIM}None active{RESET}")
        
        print()
    
    def display_detailed(self, filter_text: Optional[str] = None):
        """Display detailed package list."""
        self.display_summary()
        
        print(f"{PURPLE}═══════════════════════════════════════════════════════════{RESET}\n")
        
        # Active Luci Environment (highest priority)
        if self.active_env_name and self.active_env_packages:
            print(f"{GREEN}🎯 Active Luci Environment: {self.active_env_name}{RESET}\n")
            self._display_package_list(
                self.active_env_packages,
                filter_text,
                max_display=20
            )
            print()
        
        # LuciferAI Global Environment
        if self.luciferai_packages:
            print(f"{PURPLE}🩸 LuciferAI Global Packages:{RESET}\n")
            self._display_package_list(
                self.luciferai_packages,
                filter_text,
                max_display=20
            )
            print()
        
        # System pip
        if self.system_packages:
            print(f"{BLUE}🐍 System Python Packages:{RESET}\n")
            self._display_package_list(
                self.system_packages,
                filter_text,
                max_display=15
            )
            print()
        
        # Homebrew
        if self.brew_packages:
            print(f"{YELLOW}🍺 Homebrew Packages:{RESET}\n")
            brew_dict = {pkg['name']: pkg['version'] for pkg in self.brew_packages}
            self._display_package_list(
                brew_dict,
                filter_text,
                max_display=15
            )
            print()
        
        # Conda (if active)
        if self.conda_packages:
            print(f"{CYAN}🐍 Conda Packages (Active Environment):{RESET}\n")
            conda_dict = {pkg['name']: pkg['version'] for pkg in self.conda_packages}
            self._display_package_list(
                conda_dict,
                filter_text,
                max_display=15
            )
            print()
        
        print(f"{PURPLE}═══════════════════════════════════════════════════════════{RESET}\n")
        print(f"{DIM}💡 Tip: Use 'modules search <name>' to search for specific packages{RESET}")
        print(f"{DIM}💡 Tip: Use 'luci-install <pkg>' to install in LuciferAI global{RESET}")
        print()
    
    def _display_package_list(self, packages: Dict[str, str], filter_text: Optional[str], max_display: int = 20):
        """Display a list of packages."""
        if not packages:
            print(f"  {DIM}No packages installed{RESET}")
            return
        
        # Filter if needed
        if filter_text:
            filtered = {
                name: ver for name, ver in packages.items()
                if filter_text.lower() in name.lower()
            }
        else:
            filtered = packages
        
        if not filtered:
            print(f"  {DIM}No packages match filter: {filter_text}{RESET}")
            return
        
        # Sort and display
        sorted_packages = sorted(filtered.items())
        displayed = 0
        
        for name, version in sorted_packages[:max_display]:
            print(f"  • {CYAN}{name}{RESET} {DIM}({version}){RESET}")
            displayed += 1
        
        remaining = len(sorted_packages) - displayed
        if remaining > 0:
            print(f"  {DIM}... and {remaining} more{RESET}")
    
    def search_package(self, query: str):
        """Search for a package across all sources."""
        print(f"{PURPLE}🔍 Searching for: {CYAN}{query}{RESET}\n")
        
        found_any = False
        
        # Search in active Luci env
        if self.active_env_name and self.active_env_packages:
            matches = {k: v for k, v in self.active_env_packages.items() if query.lower() in k.lower()}
            if matches:
                print(f"{GREEN}✅ Found in Active Luci Env ({self.active_env_name}):{RESET}")
                for name, ver in matches.items():
                    print(f"  • {CYAN}{name}{RESET} {DIM}({ver}){RESET}")
                print()
                found_any = True
        
        # Search in LuciferAI global
        if self.luciferai_packages:
            matches = {k: v for k, v in self.luciferai_packages.items() if query.lower() in k.lower()}
            if matches:
                print(f"{PURPLE}✅ Found in LuciferAI Global:{RESET}")
                for name, ver in matches.items():
                    print(f"  • {CYAN}{name}{RESET} {DIM}({ver}){RESET}")
                print()
                found_any = True
        
        # Search in system
        if self.system_packages:
            matches = {k: v for k, v in self.system_packages.items() if query.lower() in k.lower()}
            if matches:
                print(f"{BLUE}✅ Found in System:{RESET}")
                for name, ver in matches.items():
                    print(f"  • {CYAN}{name}{RESET} {DIM}({ver}){RESET}")
                print()
                found_any = True
        
        # Search in brew
        if self.brew_packages:
            matches = [pkg for pkg in self.brew_packages if query.lower() in pkg['name'].lower()]
            if matches:
                print(f"{YELLOW}✅ Found in Homebrew:{RESET}")
                for pkg in matches:
                    print(f"  • {CYAN}{pkg['name']}{RESET} {DIM}({pkg['version']}){RESET}")
                print()
                found_any = True
        
        if not found_any:
            print(f"{RED}❌ Package '{query}' not found in any environment{RESET}\n")
            print(f"{YELLOW}💡 Install it with:{RESET}")
            print(f"  {BLUE}luci-install {query}{RESET}  # Install to LuciferAI global")
            print(f"  {BLUE}luci install {query}{RESET}   # Install to active Luci env")
            print(f"  {BLUE}pip install {query}{RESET}    # Install to system")
            print()
    
    def install_to_luciferai_global(self, package: str):
        """Install package to LuciferAI global environment."""
        if not LUCIFERAI_GLOBAL_ENV.exists():
            self._create_luciferai_global_env()
        
        pip_exe = LUCIFERAI_GLOBAL_ENV / "bin" / "pip"
        
        print(f"{PURPLE}🩸 Installing {package} to LuciferAI Global...{RESET}\n")
        
        try:
            subprocess.run(
                [str(pip_exe), "install", package],
                check=True
            )
            print(f"\n{GREEN}✅ Successfully installed {package} to LuciferAI Global{RESET}")
            return True
        except subprocess.CalledProcessError:
            print(f"\n{RED}❌ Failed to install {package}{RESET}")
            return False


def show_modules_help():
    """Show modules help command."""
    tracker = ModuleTracker()
    tracker.scan_all()
    tracker.display_detailed()


def search_module(query: str):
    """Search for a module."""
    tracker = ModuleTracker()
    tracker.scan_all()
    tracker.search_package(query)


def install_luciferai_global(package: str):
    """Install to LuciferAI global environment."""
    tracker = ModuleTracker()
    return tracker.install_to_luciferai_global(package)


if __name__ == "__main__":
    # Test
    show_modules_help()
