#!/usr/bin/env python3
"""
🩸 LuciferAI OS Compatibility Layer
Ensures LuciferAI works across all OS platforms and versions:
- macOS (Catalina 10.15 to Sequoia 15+)
- Linux (Ubuntu, Debian, Fedora, Arch, Raspberry Pi OS)
- Windows (10, 11)
- BSD variants
"""
import os
import sys
import platform
import subprocess
from pathlib import Path
from typing import Optional, Tuple

# Colors (ANSI compatible)
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
RESET = '\033[0m'


class OSCompat:
    """Cross-platform OS compatibility handler."""
    
    def __init__(self):
        self.system = platform.system().lower()
        self.release = platform.release()
        self.version = platform.version()
        self.machine = platform.machine()
        
        # Detect specific OS details
        self.is_macos = self.system == 'darwin'
        self.is_linux = self.system == 'linux'
        self.is_windows = self.system == 'windows'
        self.is_bsd = 'bsd' in self.system
        
        # macOS specifics
        if self.is_macos:
            self.macos_version = self._get_macos_version()
            self.macos_name = self._get_macos_name()
        
        # Linux specifics
        if self.is_linux:
            self.linux_distro = self._get_linux_distro()
            self.is_raspberry_pi = self._is_raspberry_pi()
        
        # Terminal capabilities
        self.supports_color = self._check_color_support()
        self.supports_unicode = self._check_unicode_support()
        self.term_type = os.getenv('TERM', 'unknown')
    
    def _get_macos_version(self) -> Tuple[int, int, int]:
        """Get detailed macOS version."""
        try:
            version_str = platform.mac_ver()[0]
            parts = version_str.split('.')
            major = int(parts[0]) if len(parts) > 0 else 0
            minor = int(parts[1]) if len(parts) > 1 else 0
            patch = int(parts[2]) if len(parts) > 2 else 0
            return (major, minor, patch)
        except:
            return (0, 0, 0)
    
    def _get_macos_name(self) -> str:
        """Get macOS name based on version."""
        major, minor, _ = self.macos_version
        
        if major >= 15:
            return "Sequoia or newer"
        elif major == 14:
            return "Sonoma"
        elif major == 13:
            return "Ventura"
        elif major == 12:
            return "Monterey"
        elif major == 11:
            return "Big Sur"
        elif major == 10:
            if minor >= 15:
                return "Catalina"
            elif minor == 14:
                return "Mojave"
            elif minor == 13:
                return "High Sierra"
            else:
                return f"macOS 10.{minor}"
        else:
            return "Unknown macOS"
    
    def _get_linux_distro(self) -> str:
        """Get Linux distribution name."""
        try:
            # Try /etc/os-release first (standard)
            if Path('/etc/os-release').exists():
                with open('/etc/os-release', 'r') as f:
                    for line in f:
                        if line.startswith('PRETTY_NAME='):
                            return line.split('=')[1].strip().strip('"')
            
            # Try platform.freedesktop_os_release() for Python 3.10+
            if hasattr(platform, 'freedesktop_os_release'):
                info = platform.freedesktop_os_release()
                return info.get('PRETTY_NAME', 'Linux')
            
            # Fallback
            return 'Linux'
        except:
            return 'Linux'
    
    def _get_windows_version(self) -> str:
        """Get detailed Windows version name."""
        try:
            import sys
            if sys.platform == 'win32':
                version = sys.getwindowsversion()
                major, minor, build = version.major, version.minor, version.build
                
                if major == 10 and build >= 22000:
                    return "Windows 11"
                elif major == 10:
                    return "Windows 10"
                elif major == 6:
                    if minor == 3:
                        return "Windows 8.1"
                    elif minor == 2:
                        return "Windows 8"
                    elif minor == 1:
                        return "Windows 7"
                    elif minor == 0:
                        return "Windows Vista"
                elif major == 5:
                    if minor == 1:
                        return "Windows XP"
                    elif minor == 2:
                        return "Windows Server 2003"
                
                return f"Windows {major}.{minor}"
        except:
            return f"Windows {self.release}"
    
    def _is_raspberry_pi(self) -> bool:
        """Detect Raspberry Pi."""
        try:
            if Path("/proc/device-tree/model").exists():
                with open("/proc/device-tree/model", "r") as f:
                    return "raspberry pi" in f.read().lower()
            
            if Path("/proc/cpuinfo").exists():
                with open("/proc/cpuinfo", "r") as f:
                    cpuinfo = f.read().lower()
                    return "bcm" in cpuinfo or "raspberry" in cpuinfo
        except:
            pass
        
        return False
    
    def _check_color_support(self) -> bool:
        """Check if terminal supports colors."""
        # Windows color support
        if self.is_windows:
            # Try Windows 10+ VT100 support first
            try:
                import ctypes
                kernel32 = ctypes.windll.kernel32
                # Try to enable ANSI escape sequences
                handle = kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE
                mode = ctypes.c_ulong()
                if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
                    mode.value |= 0x0004  # ENABLE_VIRTUAL_TERMINAL_PROCESSING
                    if kernel32.SetConsoleMode(handle, mode):
                        return True
            except:
                pass
            
            # Fallback for Windows 7/8: Check if colorama is available
            try:
                import colorama
                colorama.init()  # Initialize colorama for Windows 7/8
                return True
            except ImportError:
                # No color support on Windows 7/8 without colorama
                return False
        
        # Unix-like: check TERM
        term = os.getenv('TERM', '')
        if term in ['dumb', '']:
            return False
        
        return True
    
    def _check_unicode_support(self) -> bool:
        """Check if terminal supports Unicode."""
        try:
            # Try encoding a Unicode character
            '🩸'.encode(sys.stdout.encoding)
            return True
        except:
            return False
    
    def get_shell(self) -> str:
        """Get the current shell."""
        if self.is_windows:
            return os.getenv('COMSPEC', 'cmd.exe')
        else:
            return os.getenv('SHELL', '/bin/sh')
    
    def get_home_dir(self) -> Path:
        """Get user home directory (cross-platform)."""
        return Path.home()
    
    def get_config_dir(self) -> Path:
        """Get appropriate config directory for OS."""
        if self.is_macos:
            return Path.home() / "Library" / "Application Support" / "LuciferAI"
        elif self.is_windows:
            appdata = os.getenv('APPDATA')
            if appdata:
                return Path(appdata) / "LuciferAI"
            return Path.home() / "AppData" / "Roaming" / "LuciferAI"
        else:  # Linux/BSD
            return Path.home() / ".config" / "luciferai"
    
    def get_data_dir(self) -> Path:
        """Get appropriate data directory for OS."""
        if self.is_macos:
            return Path.home() / "Library" / "Application Support" / "LuciferAI" / "data"
        elif self.is_windows:
            localappdata = os.getenv('LOCALAPPDATA')
            if localappdata:
                return Path(localappdata) / "LuciferAI" / "data"
            return Path.home() / "AppData" / "Local" / "LuciferAI" / "data"
        else:  # Linux/BSD
            return Path.home() / ".local" / "share" / "luciferai"
    
    def get_cache_dir(self) -> Path:
        """Get appropriate cache directory for OS."""
        if self.is_macos:
            return Path.home() / "Library" / "Caches" / "LuciferAI"
        elif self.is_windows:
            temp = os.getenv('TEMP', os.getenv('TMP', ''))
            if temp:
                return Path(temp) / "LuciferAI"
            return Path.home() / "AppData" / "Local" / "Temp" / "LuciferAI"
        else:  # Linux/BSD
            cache_home = os.getenv('XDG_CACHE_HOME')
            if cache_home:
                return Path(cache_home) / "luciferai"
            return Path.home() / ".cache" / "luciferai"
    
    def clear_screen(self):
        """Clear terminal screen (cross-platform)."""
        if self.is_windows:
            os.system('cls')
        else:
            os.system('clear')
    
    def get_terminal_size(self) -> Tuple[int, int]:
        """Get terminal size (columns, lines)."""
        try:
            import shutil
            cols, lines = shutil.get_terminal_size()
            return (cols, lines)
        except:
            return (80, 24)  # Default fallback
    
    def is_admin(self) -> bool:
        """Check if running with admin/sudo privileges."""
        if self.is_windows:
            try:
                import ctypes
                return ctypes.windll.shell32.IsUserAnAdmin() != 0
            except:
                return False
        else:
            return os.geteuid() == 0 if hasattr(os, 'geteuid') else False
    
    def get_python_version_compat(self) -> str:
        """Get Python version compatibility info."""
        major, minor, patch = sys.version_info[:3]
        
        if major < 3 or (major == 3 and minor < 8):
            return f"⚠️  Python {major}.{minor}.{patch} (Upgrade recommended to 3.8+)"
        elif major == 3 and minor < 10:
            return f"✅ Python {major}.{minor}.{patch} (Compatible, but 3.10+ recommended)"
        else:
            return f"✅ Python {major}.{minor}.{patch} (Fully compatible)"
    
    def check_dependencies(self) -> dict:
        """Check for required system dependencies."""
        deps = {
            'git': self._check_command('git'),
            'python3': self._check_command('python3'),
            'pip': self._check_command('pip') or self._check_command('pip3'),
        }
        
        # Optional but recommended
        deps['ollama'] = self._check_command('ollama')
        
        if self.is_macos:
            deps['brew'] = self._check_command('brew')
        
        return deps
    
    def _check_command(self, cmd: str) -> bool:
        """Check if a command exists."""
        try:
            if self.is_windows:
                subprocess.run(['where', cmd], capture_output=True, check=True)
            else:
                subprocess.run(['which', cmd], capture_output=True, check=True)
            return True
        except:
            return False
    
    def display_system_info(self):
        """Display system information."""
        print(f"\n{PURPLE}╔════════════════════════════════════════════════════════════╗{RESET}")
        print(f"{PURPLE}║         🩸 LuciferAI System Information                   ║{RESET}")
        print(f"{PURPLE}╚════════════════════════════════════════════════════════════╝{RESET}\n")
        
        # Windows 7/8 warning
        if self.is_windows:
            try:
                version = sys.getwindowsversion()
                if version.major == 6 and version.minor in [1, 2, 3]:  # Win 7, 8, 8.1
                    print(f"{YELLOW}⚠️  Running on legacy Windows version{RESET}")
                    if not self.supports_color:
                        print(f"{YELLOW}💡 Install colorama for color support: pip install colorama{RESET}")
                    print()
        
        # OS Information
        if self.is_macos:
            print(f"{BLUE}OS:{RESET}               {self.macos_name} ({'.'.join(map(str, self.macos_version))})")
        elif self.is_linux:
            print(f"{BLUE}OS:{RESET}               {self.linux_distro}")
            if self.is_raspberry_pi:
                print(f"{BLUE}Device:{RESET}           {YELLOW}Raspberry Pi{RESET}")
        elif self.is_windows:
            win_version = self._get_windows_version()
            print(f"{BLUE}OS:{RESET}               {win_version}")
        else:
            print(f"{BLUE}OS:{RESET}               {self.system.title()}")
        
        print(f"{BLUE}Architecture:{RESET}     {self.machine}")
        print(f"{BLUE}Python:{RESET}           {self.get_python_version_compat()}")
        print(f"{BLUE}Shell:{RESET}            {self.get_shell()}")
        
        # Terminal capabilities
        print(f"\n{BLUE}Terminal:{RESET}")
        print(f"  Type: {self.term_type}")
        print(f"  Colors: {GREEN}✅{RESET}" if self.supports_color else f"  Colors: {RED}❌{RESET}")
        print(f"  Unicode: {GREEN}✅{RESET}" if self.supports_unicode else f"  Unicode: {RED}❌{RESET}")
        
        cols, lines = self.get_terminal_size()
        print(f"  Size: {cols}x{lines}")
        
        # Dependencies
        print(f"\n{BLUE}Dependencies:{RESET}")
        deps = self.check_dependencies()
        for name, available in deps.items():
            status = f"{GREEN}✅{RESET}" if available else f"{RED}❌{RESET}"
            print(f"  {name}: {status}")
        
        # Directories
        print(f"\n{BLUE}Directories:{RESET}")
        print(f"  Config: {self.get_config_dir()}")
        print(f"  Data: {self.get_data_dir()}")
        print(f"  Cache: {self.get_cache_dir()}")
        
        print(f"\n{PURPLE}════════════════════════════════════════════════════════════{RESET}\n")
    
    def ensure_directories(self):
        """Ensure all necessary directories exist."""
        dirs = [
            self.get_config_dir(),
            self.get_data_dir(),
            self.get_cache_dir(),
        ]
        
        for directory in dirs:
            directory.mkdir(parents=True, exist_ok=True)


# Global instance
_os_compat = None


def get_os_compat() -> OSCompat:
    """Get global OSCompat instance."""
    global _os_compat
    if _os_compat is None:
        _os_compat = OSCompat()
    return _os_compat


def is_supported_os() -> bool:
    """Check if current OS is supported."""
    compat = get_os_compat()
    
    # Check Python version
    if sys.version_info < (3, 8):
        return False
    
    # Check macOS version
    if compat.is_macos:
        major, minor, _ = compat.macos_version
        if major == 10 and minor < 15:  # Before Catalina
            return False
    
    # Windows 7/8 supported but with reduced features
    # (requires colorama for color support)
    
    return True


def get_incompatibility_message() -> Optional[str]:
    """Get message if OS is incompatible."""
    compat = get_os_compat()
    
    if sys.version_info < (3, 8):
        return f"Python 3.8+ required (current: {sys.version_info.major}.{sys.version_info.minor})"
    
    if compat.is_macos:
        major, minor, _ = compat.macos_version
        if major == 10 and minor < 15:
            return f"macOS Catalina (10.15) or newer required (current: {compat.macos_name})"
    
    return None


if __name__ == "__main__":
    # Test
    compat = OSCompat()
    compat.display_system_info()
    
    if is_supported_os():
        print(f"{GREEN}✅ Your system is fully supported!{RESET}\n")
    else:
        msg = get_incompatibility_message()
        print(f"{RED}❌ Incompatibility detected: {msg}{RESET}\n")
