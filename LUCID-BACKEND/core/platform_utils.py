#!/usr/bin/env python3
"""
🌐 Platform Utilities - Cross-platform system detection and path handling
Supports: macOS (Catalina+), Windows (7+), Linux, Raspberry Pi
"""
import os
import sys
import platform
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

# Color codes
PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"


class PlatformUtils:
    """
    Cross-platform utilities for LuciferAI.
    
    Detects OS, architecture, and provides platform-specific paths and commands.
    """
    
    def __init__(self):
        self.system = platform.system()  # Darwin, Linux, Windows
        self.machine = platform.machine()  # x86_64, arm64, aarch64, etc.
        self.release = platform.release()
        self.version = platform.version()
        
        # Detect specific platform details
        self.platform_info = self._detect_platform()
    
    def _detect_platform(self) -> Dict[str, Any]:
        """Detect detailed platform information."""
        info = {
            'os': 'unknown',
            'os_version': 'unknown',
            'arch': self.machine,
            'supported': False,
            'min_version_met': False,
            'path_sep': os.sep,
            'home': Path.home(),
            'shell': os.environ.get('SHELL', os.environ.get('COMSPEC', 'unknown')),
        }
        
        if self.system == 'Darwin':  # macOS
            info.update(self._detect_macos())
        elif self.system == 'Windows':
            info.update(self._detect_windows())
        elif self.system == 'Linux':
            info.update(self._detect_linux())
        
        return info
    
    def _detect_macos(self) -> Dict[str, Any]:
        """Detect macOS version and capabilities."""
        version = platform.mac_ver()[0]
        major, minor = map(int, version.split('.')[:2])
        
        # macOS version mapping
        macos_names = {
            10: {
                15: ('Catalina', True),
                16: ('Big Sur', True),
            },
            11: {0: ('Big Sur', True)},
            12: {0: ('Monterey', True)},
            13: {0: ('Ventura', True)},
            14: {0: ('Sonoma', True)},
            15: {0: ('Sequoia', True)},
        }
        
        name, supported = macos_names.get(major, {}).get(minor, ('Unknown macOS', False))
        
        # Catalina is 10.15, so minimum is 10.15+
        min_version_met = (major == 10 and minor >= 15) or major >= 11
        
        # Detect Apple Silicon vs Intel
        is_apple_silicon = self.machine == 'arm64'
        
        return {
            'os': 'macOS',
            'os_version': f'{name} ({version})',
            'os_version_number': version,
            'supported': supported,
            'min_version_met': min_version_met,
            'apple_silicon': is_apple_silicon,
            'arch_name': 'Apple Silicon (M1/M2/M3)' if is_apple_silicon else 'Intel',
            'package_managers': ['brew', 'pip', 'conda'],
        }
    
    def _detect_windows(self) -> Dict[str, Any]:
        """Detect Windows version and capabilities."""
        version = platform.version()
        release = platform.release()
        
        # Windows version mapping
        windows_versions = {
            '7': ('Windows 7', True, 6.1),
            '8': ('Windows 8', True, 6.2),
            '8.1': ('Windows 8.1', True, 6.3),
            '10': ('Windows 10', True, 10.0),
            '11': ('Windows 11', True, 10.0),  # Win11 reports as 10.0 internally
        }
        
        name, supported, min_build = windows_versions.get(release, ('Unknown Windows', False, 0))
        
        # Check if Windows 7 or later
        try:
            ver_major = int(platform.version().split('.')[0])
            min_version_met = ver_major >= 6  # Windows 7 is version 6.1
        except:
            min_version_met = False
        
        return {
            'os': 'Windows',
            'os_version': f'{name} ({release})',
            'os_version_number': release,
            'supported': supported,
            'min_version_met': min_version_met,
            'package_managers': ['pip', 'conda', 'chocolatey'],
        }
    
    def _detect_linux(self) -> Dict[str, Any]:
        """Detect Linux distribution and capabilities."""
        try:
            import distro
            dist_name = distro.name()
            dist_version = distro.version()
        except ImportError:
            # Fallback if distro not available
            dist_name = 'Linux'
            dist_version = platform.release()
        
        # Detect if Raspberry Pi
        is_raspberry_pi = False
        try:
            with open('/proc/cpuinfo', 'r') as f:
                cpuinfo = f.read()
                is_raspberry_pi = 'Raspberry Pi' in cpuinfo or 'BCM' in cpuinfo
        except:
            pass
        
        package_managers = ['pip']
        
        # Detect common package managers
        if os.path.exists('/usr/bin/apt') or os.path.exists('/usr/bin/apt-get'):
            package_managers.append('apt')
        if os.path.exists('/usr/bin/yum'):
            package_managers.append('yum')
        if os.path.exists('/usr/bin/dnf'):
            package_managers.append('dnf')
        if os.path.exists('/usr/bin/pacman'):
            package_managers.append('pacman')
        
        return {
            'os': 'Linux',
            'os_version': f'{dist_name} {dist_version}',
            'os_version_number': dist_version,
            'supported': True,  # Linux is always supported
            'min_version_met': True,
            'raspberry_pi': is_raspberry_pi,
            'arch_name': 'ARM' if 'arm' in self.machine or 'aarch' in self.machine else 'x86_64',
            'package_managers': package_managers,
        }
    
    def get_luciferai_paths(self) -> Dict[str, Path]:
        """Get platform-specific LuciferAI paths."""
        home = Path.home()
        
        if self.system == 'Windows':
            # Windows: Use AppData
            base = Path(os.environ.get('APPDATA', home)) / 'LuciferAI'
        else:
            # macOS/Linux: Use hidden directory in home
            base = home / '.luciferai'
        
        return {
            'base': base,
            'data': base / 'data',
            'sync': base / 'sync',
            'bin': base / 'bin',
            'models': base / 'models',
            'cache': base / 'cache',
            'logs': base / 'logs',
            'config': base / 'config.json',
        }
    
    def get_luci_paths(self) -> Dict[str, Path]:
        """Get platform-specific Luci! environment paths."""
        home = Path.home()
        
        if self.system == 'Windows':
            base = Path(os.environ.get('APPDATA', home)) / 'Luci'
        else:
            base = home / '.luci'
        
        return {
            'base': base,
            'env': base / 'env' / 'venv',
            'cache': base / 'cache',
            'registry': base / 'registry.json',
            'config': base / 'config.json',
        }
    
    def get_shell_config(self) -> Optional[Path]:
        """Get the appropriate shell configuration file."""
        home = Path.home()
        
        if self.system == 'Windows':
            # Windows PowerShell profile
            return Path(os.environ.get('USERPROFILE', home)) / 'Documents' / 'WindowsPowerShell' / 'profile.ps1'
        else:
            # Try to detect shell
            shell = os.environ.get('SHELL', '')
            
            if 'zsh' in shell:
                return home / '.zshrc'
            elif 'bash' in shell:
                return home / '.bashrc'
            elif 'fish' in shell:
                return home / '.config' / 'fish' / 'config.fish'
            else:
                # Default to bashrc
                return home / '.bashrc'
    
    def get_clear_command(self) -> str:
        """Get platform-specific clear screen command."""
        return 'cls' if self.system == 'Windows' else 'clear'
    
    def get_executable_extension(self) -> str:
        """Get platform-specific executable extension."""
        return '.exe' if self.system == 'Windows' else ''
    
    def get_path_separator(self) -> str:
        """Get platform-specific PATH separator."""
        return ';' if self.system == 'Windows' else ':'
    
    def is_supported(self) -> Tuple[bool, str]:
        """Check if current platform is supported."""
        info = self.platform_info
        
        if not info['min_version_met']:
            if info['os'] == 'macOS':
                return False, f"macOS Catalina (10.15) or later required. You have: {info['os_version']}"
            elif info['os'] == 'Windows':
                return False, f"Windows 7 or later required. You have: {info['os_version']}"
        
        if not info['supported']:
            return False, f"Unsupported OS version: {info['os_version']}"
        
        return True, f"{info['os']} {info['os_version']} ({info.get('arch_name', self.machine)})"
    
    def print_platform_info(self):
        """Print detailed platform information."""
        info = self.platform_info
        
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{BLUE}🖥️  Platform Information{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        print(f"{GREEN}Operating System:{RESET} {info['os']}")
        print(f"{GREEN}Version:{RESET} {info['os_version']}")
        print(f"{GREEN}Architecture:{RESET} {info.get('arch_name', self.machine)}")
        
        if info['os'] == 'macOS':
            print(f"{GREEN}Apple Silicon:{RESET} {'Yes' if info.get('apple_silicon') else 'No'}")
        elif info['os'] == 'Linux' and info.get('raspberry_pi'):
            print(f"{GREEN}Raspberry Pi:{RESET} Yes")
        
        print(f"{GREEN}Supported:{RESET} {'✓ Yes' if info['supported'] else '✗ No'}")
        print(f"{GREEN}Min Version Met:{RESET} {'✓ Yes' if info['min_version_met'] else '✗ No'}")
        
        print(f"\n{BLUE}Package Managers:{RESET}")
        for pm in info.get('package_managers', []):
            print(f"  • {pm}")
        
        print(f"\n{BLUE}LuciferAI Paths:{RESET}")
        paths = self.get_luciferai_paths()
        for name, path in paths.items():
            print(f"  • {name}: {path}")
        
        print(f"\n{PURPLE}{'='*60}{RESET}\n")


# Global instance
_platform_utils = None

def get_platform_utils() -> PlatformUtils:
    """Get or create global PlatformUtils instance."""
    global _platform_utils
    if _platform_utils is None:
        _platform_utils = PlatformUtils()
    return _platform_utils


# Convenience functions
def is_macos() -> bool:
    """Check if running on macOS."""
    return platform.system() == 'Darwin'

def is_windows() -> bool:
    """Check if running on Windows."""
    return platform.system() == 'Windows'

def is_linux() -> bool:
    """Check if running on Linux."""
    return platform.system() == 'Linux'

def is_raspberry_pi() -> bool:
    """Check if running on Raspberry Pi."""
    utils = get_platform_utils()
    return utils.platform_info.get('raspberry_pi', False)


if __name__ == "__main__":
    # Test the platform detection
    utils = PlatformUtils()
    utils.print_platform_info()
    
    supported, msg = utils.is_supported()
    if supported:
        print(f"{GREEN}✅ Platform fully supported: {msg}{RESET}")
    else:
        print(f"{RED}❌ Platform not supported: {msg}{RESET}")
