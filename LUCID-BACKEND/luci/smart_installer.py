#!/usr/bin/env python3
"""
🩸 Luci Smart Installer
Intelligent package installation with fallback cascade

Priority Order:
1. Luci package manager (LuciferAI's conda-like system)
2. First available system package manager (brew/apt/choco/etc)
3. Prompt user to install appropriate package manager
"""
import os
import sys
import platform
import subprocess
from pathlib import Path
from typing import Optional, List, Tuple

# Colors
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
CYAN = '\033[36m'
DIM = '\033[2m'
BOLD = '\033[1m'
RESET = '\033[0m'

# Luc! home - Internal global environment (inside project)
# Get project root directory
PROJECT_ROOT = Path(__file__).parent.parent  # Go up from luci/ to project root
LUCI_HOME = PROJECT_ROOT / ".luc"
LUCI_ENV = LUCI_HOME / "env"  # Global internal environment (like conda base)
LUCI_PACKAGES = LUCI_HOME / "packages"
LUCI_CACHE = LUCI_HOME / "cache"


class SmartInstaller:
    """Intelligent package installer with multi-tier fallback."""
    
    def __init__(self):
        self.os_type = platform.system().lower()
        self.is_raspberry_pi = self._detect_raspberry_pi()
        self.available_managers = []
        self._detect_package_managers()
        
        # Ensure luci directories exist
        LUCI_HOME.mkdir(exist_ok=True)
        LUCI_ENV.mkdir(exist_ok=True)
        LUCI_PACKAGES.mkdir(exist_ok=True)
        LUCI_CACHE.mkdir(exist_ok=True)
        
        # Initialize internal environment if needed
        self._init_internal_environment()
    
    def _init_internal_environment(self):
        """Initialize LuciferAI's internal global environment."""
        venv_path = LUCI_ENV / "venv"
        
        if not venv_path.exists():
            try:
                # Create internal virtual environment
                subprocess.run(
                    [sys.executable, '-m', 'venv', str(venv_path)],
                    capture_output=True,
                    timeout=60
                )
            except:
                pass
    
    def _check_external_availability(self, package_name: str) -> bool:
        """Check if package is already available externally."""
        
        # For Python packages, try importing
        try:
            __import__(package_name)
            return True
        except ImportError:
            pass
        
        # For system commands, check if command exists
        try:
            if self.os_type == 'windows':
                result = subprocess.run(['where', package_name], capture_output=True, timeout=5)
            else:
                result = subprocess.run(['which', package_name], capture_output=True, timeout=5)
            return result.returncode == 0
        except:
            return False
    
    def _detect_raspberry_pi(self) -> bool:
        """Detect if running on Raspberry Pi."""
        try:
            # Check for Raspberry Pi hardware
            if Path('/proc/device-tree/model').exists():
                with open('/proc/device-tree/model', 'r') as f:
                    model = f.read().lower()
                    if 'raspberry' in model:
                        return True
            
            # Check for RPi-specific files
            if Path('/proc/cpuinfo').exists():
                with open('/proc/cpuinfo', 'r') as f:
                    cpuinfo = f.read().lower()
                    if 'raspberry' in cpuinfo or 'bcm' in cpuinfo:
                        return True
        except:
            pass
        return False
    
    def _detect_package_managers(self):
        """Detect available package managers on the system."""
        managers = {
            'darwin': [
                ('brew', 'Homebrew'),
                ('port', 'MacPorts'),
            ],
            'linux': [
                ('apt', 'APT'),
                ('apt-get', 'APT-GET'),
                ('yum', 'YUM'),
                ('dnf', 'DNF'),
                ('pacman', 'Pacman'),
                ('zypper', 'Zypper'),
            ],
            'windows': [
                ('choco', 'Chocolatey'),
                ('winget', 'WinGet'),
                ('scoop', 'Scoop'),
            ]
        }
        
        # Raspberry Pi optimized manager priority
        if self.is_raspberry_pi:
            managers['linux'] = [
                ('apt', 'APT'),  # Primary for Raspberry Pi OS
                ('apt-get', 'APT-GET'),
                ('pip3', 'pip3'),  # Lightweight Python packages
            ]
        
        # Universal managers
        universal = [
            ('pip3', 'pip3'),
            ('pip', 'pip'),
            ('conda', 'Conda'),
            ('npm', 'npm'),
        ]
        
        # Get OS-specific + universal (skip universal on RPi if already added)
        if self.is_raspberry_pi:
            to_check = managers.get(self.os_type, [])
        else:
            to_check = managers.get(self.os_type, []) + universal
        
        for cmd, name in to_check:
            if self._command_exists(cmd):
                self.available_managers.append((cmd, name))
    
    def _command_exists(self, cmd: str) -> bool:
        """Check if command exists."""
        try:
            if self.os_type == 'windows':
                subprocess.run(['where', cmd], capture_output=True, check=True, timeout=5)
            else:
                subprocess.run(['which', cmd], capture_output=True, check=True, timeout=5)
            return True
        except:
            return False
    
    def install(self, package_name: str, force_manager: Optional[str] = None) -> bool:
        """
        Install package with full 5-tier fallback cascade.
        
        Tier 0: Luci package manager (first choice)
        Tier 1: Virtual environment with pip
        Tier 2: System package managers
        Tier 3: Stub module creation
        Tier 4: Prompt for package manager installation
        """
        print(f"\n{PURPLE}{BOLD}🩸 Luci Smart Installer{RESET}")
        print(f"{DIM}Package: {package_name}{RESET}")
        
        # Show Raspberry Pi detection
        if self.is_raspberry_pi:
            print(f"{CYAN}🫐 Raspberry Pi detected - using optimized install flow{RESET}")
        
        print()
        
        # ═══════════════════════════════════════════════════════════
        # CHECK: External Availability
        # ═══════════════════════════════════════════════════════════
        print(f"{DIM}Checking external availability...{RESET}")
        
        if self._check_external_availability(package_name):
            print(f"{GREEN}✅ Package '{package_name}' already available externally{RESET}")
            print(f"{DIM}No installation needed{RESET}\n")
            return True
        
        print(f"{YELLOW}⚠️  Package not found externally, installing to internal environment...{RESET}\n")
        
        # Load fallback system
        fallback_system = None
        try:
            sys.path.insert(0, str(Path(__file__).parent.parent / "core"))
            from fallback_system import get_fallback_system
            fallback_system = get_fallback_system()
        except Exception as e:
            print(f"{DIM}Fallback system unavailable: {e}{RESET}\n")
        
        # ═══════════════════════════════════════════════════════════
        # TIER 0: Luci Package Manager (First Choice)
        # ═══════════════════════════════════════════════════════════
        print(f"{BLUE}[Tier 0] Attempting Luci package manager...{RESET}")
        print(f"{DIM}Installing to: {LUCI_ENV}{RESET}")
        
        if self._install_via_luci(package_name):
            print(f"\n{GREEN}✅ [Tier 0] Successfully installed to internal environment{RESET}")
            return True
        
        print(f"{YELLOW}⚠️  Tier 0 failed, cascading to fallback system...{RESET}\n")
        
        # ═══════════════════════════════════════════════════════════
        # TIER 1: Internal Environment Install
        # ═══════════════════════════════════════════════════════════
        print(f"{CYAN}[Tier 1] 🩹 Internal Environment Install{RESET}")
        print(f"{DIM}Installing to LuciferAI internal environment: {LUCI_ENV}{RESET}")
        
        # Try installing to internal environment
        internal_pip = LUCI_ENV / "venv" / "bin" / "pip"
        if self.os_type == 'windows':
            internal_pip = LUCI_ENV / "venv" / "Scripts" / "pip.exe"
        
        if internal_pip.exists():
            try:
                result = subprocess.run(
                    [str(internal_pip), 'install', package_name],
                    capture_output=True,
                    timeout=120
                )
                if result.returncode == 0:
                    print(f"\n{GREEN}✅ [Tier 1] Successfully installed to internal environment{RESET}")
                    print(f"{CYAN}📦 Location: {LUCI_ENV / 'venv'}{RESET}")
                    return True
            except Exception as e:
                print(f"{DIM}Internal install failed: {e}{RESET}")
        
        # Fallback: Use fallback system's venv
        if fallback_system:
            if fallback_system.fallback_virtual_env():
                try:
                    venv_pip = fallback_system.FALLBACK_ENV / "bin" / "pip"
                    if venv_pip.exists():
                        result = subprocess.run(
                            [str(venv_pip), 'install', package_name],
                            capture_output=True,
                            timeout=120
                        )
                        if result.returncode == 0:
                            print(f"\n{GREEN}✅ [Tier 1] Successfully installed via fallback environment{RESET}")
                            return True
                except:
                    pass
        
        print(f"{YELLOW}⚠️  Tier 1 failed, escalating to Tier 2...{RESET}\n")
        
        # ═══════════════════════════════════════════════════════════
        # TIER 2: System Package Managers
        # ═══════════════════════════════════════════════════════════
        print(f"{YELLOW}[Tier 2] 🔄 System Package Managers{RESET}\n")
        
        if not self.available_managers:
            print(f"{RED}❌ No package managers detected{RESET}\n")
        else:
            print(f"{CYAN}Available package managers:{RESET}")
            for cmd, name in self.available_managers:
                print(f"  {GREEN}✓{RESET} {name} ({cmd})")
            print()
            
            # Try each manager in order
            for cmd, name in self.available_managers:
                if force_manager and cmd != force_manager:
                    continue
                
                print(f"{YELLOW}🔄 Attempting install via {name}...{RESET}")
                
                if self._install_via_manager(package_name, cmd, name):
                    print(f"\n{GREEN}✅ [Tier 2] Successfully installed via {name}{RESET}")
                    return True
                
                print(f"{DIM}   {name} failed, trying next...{RESET}")
            
            # Try using fallback system's mirror download
            if fallback_system:
                print(f"\n{YELLOW}🔄 Attempting fallback mirror download...{RESET}")
                if fallback_system.fallback_mirror_download(package_name):
                    print(f"\n{GREEN}✅ [Tier 2] Successfully installed via fallback system{RESET}")
                    return True
        
        print(f"{YELLOW}⚠️  Tier 2 failed, escalating to Tier 3...{RESET}\n")
        
        # ═══════════════════════════════════════════════════════════
        # TIER 3: Stub Module Creation
        # ═══════════════════════════════════════════════════════════
        print(f"{PURPLE}[Tier 3] 🧩 Stub Module Creation{RESET}")
        
        if fallback_system:
            try:
                stub_file = fallback_system.fallback_stub_module(package_name)
                if stub_file:
                    print(f"\n{PURPLE}⚠️  [Tier 3] Stub module created at: {stub_file}{RESET}")
                    print(f"{YELLOW}💡 Package '{package_name}' will be mocked (limited functionality){RESET}")
                    print(f"{YELLOW}💡 This prevents import errors but features may be unavailable{RESET}")
                    return True
            except Exception as e:
                print(f"{RED}Stub creation failed: {e}{RESET}")
        
        print(f"{YELLOW}⚠️  Tier 3 failed, entering Tier 4...{RESET}\n")
        
        # ═══════════════════════════════════════════════════════════
        # TIER 4: Emergency Mode - Prompt for Package Manager
        # ═══════════════════════════════════════════════════════════
        print(f"{RED}[Tier 4] ☠️  All installation tiers exhausted{RESET}\n")
        
        self._prompt_install_package_manager()
        
        # Log failure to fallback system
        if fallback_system:
            fallback_system._log(f"Package installation failed for '{package_name}' after all tiers", tier=4)
            
            # Check if auto-repair should trigger
            if fallback_system.should_auto_repair():
                print(f"\n{GREEN}💫 Auto-repair threshold reached, triggering system repair...{RESET}\n")
                if fallback_system.system_repair():
                    print(f"\n{GREEN}💫 System repaired, retrying installation...{RESET}\n")
                    # Retry installation after repair
                    return self.install(package_name, force_manager)
        
        return False
    
    def _install_via_luci(self, package_name: str) -> bool:
        """Install via Luci package manager (future implementation)."""
        # Check if luci command exists
        if not self._command_exists('luci'):
            return False
        
        try:
            # Try luci install
            result = subprocess.run(
                ['luci', 'install', package_name],
                capture_output=True,
                timeout=120
            )
            
            if result.returncode == 0:
                return True
            
            return False
            
        except Exception as e:
            return False
    
    def _install_via_manager(self, package_name: str, manager_cmd: str, manager_name: str) -> bool:
        """Install via specific package manager."""
        
        # Build install command based on manager
        install_commands = {
            'brew': ['brew', 'install', package_name],
            'port': ['port', 'install', package_name],
            'apt': ['sudo', 'apt', 'install', '-y', package_name],
            'apt-get': ['sudo', 'apt-get', 'install', '-y', package_name],
            'yum': ['sudo', 'yum', 'install', '-y', package_name],
            'dnf': ['sudo', 'dnf', 'install', '-y', package_name],
            'pacman': ['sudo', 'pacman', '-S', '--noconfirm', package_name],
            'zypper': ['sudo', 'zypper', 'install', '-y', package_name],
            'choco': ['choco', 'install', package_name, '-y'],
            'winget': ['winget', 'install', package_name],
            'scoop': ['scoop', 'install', package_name],
            'pip3': ['pip3', 'install', package_name],
            'pip': ['pip', 'install', package_name],
            'conda': ['conda', 'install', '-y', package_name],
            'npm': ['npm', 'install', '-g', package_name],
        }
        
        cmd = install_commands.get(manager_cmd)
        
        if not cmd:
            return False
        
        # Raspberry Pi optimizations
        timeout = 600 if self.is_raspberry_pi else 300  # Extended timeout for slower hardware
        
        try:
            # On Raspberry Pi, update package list first for apt
            if self.is_raspberry_pi and manager_cmd in ['apt', 'apt-get']:
                print(f"{DIM}   Updating package lists (Raspberry Pi)...{RESET}")
                try:
                    subprocess.run(
                        ['sudo', manager_cmd, 'update'],
                        capture_output=True,
                        timeout=120
                    )
                except:
                    pass
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=timeout
            )
            
            return result.returncode == 0
            
        except Exception as e:
            return False
    
    def _prompt_install_package_manager(self):
        """Prompt user to install a package manager for their OS."""
        print(f"{RED}╔{'═' * 58}╗{RESET}")
        print(f"{RED}║  ⚠️  No suitable package manager found                    ║{RESET}")
        print(f"{RED}╚{'═' * 58}╝{RESET}\n")
        
        recommendations = {
            'darwin': {
                'name': 'Homebrew',
                'install': '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
                'url': 'https://brew.sh',
                'description': 'The Missing Package Manager for macOS'
            },
            'linux': {
                'name': 'Your Distribution Package Manager',
                'install': 'Should be pre-installed (apt/yum/dnf/pacman)',
                'url': None,
                'description': 'Most Linux distributions come with a package manager'
            },
            'windows': {
                'name': 'Chocolatey',
                'install': 'Run PowerShell as Admin and execute:\nSet-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString(\'https://community.chocolatey.org/install.ps1\'))',
                'url': 'https://chocolatey.org/install',
                'description': 'The Package Manager for Windows'
            }
        }
        
        # Override for Raspberry Pi
        if self.is_raspberry_pi:
            recommendations['linux'] = {
                'name': 'APT (Raspberry Pi OS)',
                'install': 'APT should be pre-installed on Raspberry Pi OS.\nUpdate with: sudo apt update && sudo apt upgrade',
                'url': 'https://www.raspberrypi.org/documentation/',
                'description': 'Default package manager for Raspberry Pi OS'
            }
        
        rec = recommendations.get(self.os_type)
        
        if rec:
            print(f"{YELLOW}💡 Recommended Package Manager for {self.os_type.title()}:{RESET}")
            print(f"\n{CYAN}{BOLD}{rec['name']}{RESET}")
            print(f"{DIM}{rec['description']}{RESET}\n")
            
            if rec['url']:
                print(f"{BLUE}🔗 Website:{RESET} {rec['url']}\n")
            
            print(f"{YELLOW}📦 Installation:{RESET}")
            print(f"{DIM}{rec['install']}{RESET}\n")
        
        # Also suggest pip if Python is available
        if sys.executable:
            print(f"{YELLOW}💡 Alternative: Use Python's pip{RESET}")
            print(f"{DIM}pip is already available with Python{RESET}")
            print(f"{BLUE}Command:{RESET} {sys.executable} -m pip install <package>\n")
        
        print(f"{CYAN}After installing a package manager, try again:{RESET}")
        print(f"{DIM}luci install <package>{RESET}\n")


def install_package(package_name: str, force_manager: Optional[str] = None) -> bool:
    """
    Install package using smart installer.
    
    Args:
        package_name: Name of package to install
        force_manager: Force use of specific package manager (optional)
    
    Returns:
        True if installation succeeded, False otherwise
    """
    installer = SmartInstaller()
    return installer.install(package_name, force_manager=force_manager)


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print(f"{PURPLE}🩸 Luci Smart Installer{RESET}\n")
        print(f"{YELLOW}Usage:{RESET}")
        print(f"  {BLUE}luci-install <package>{RESET}")
        print(f"  {BLUE}luci-install <package> --manager <brew|apt|choco|pip>{RESET}\n")
        print(f"{YELLOW}Examples:{RESET}")
        print(f"  luci-install curl")
        print(f"  luci-install git --manager brew")
        sys.exit(1)
    
    package_name = sys.argv[1]
    force_manager = None
    
    # Check for --manager flag
    if len(sys.argv) > 2 and sys.argv[2] == '--manager':
        if len(sys.argv) > 3:
            force_manager = sys.argv[3]
        else:
            print(f"{RED}❌ --manager requires a value{RESET}")
            sys.exit(1)
    
    success = install_package(package_name, force_manager=force_manager)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
