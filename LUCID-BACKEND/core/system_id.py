#!/usr/bin/env python3
"""
🩸 LuciferAI System ID Manager
Persistent ID storage across uninstalls, OS-specific locations
ID is assigned by GitHub on first sync
"""
import os
import sys
import json
import platform
from pathlib import Path
from typing import Optional

# Colors
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
RESET = '\033[0m'


class SystemIDManager:
    """Manage persistent system ID across OS platforms."""
    
    def __init__(self):
        self.os_type = platform.system().lower()
        self.id_file_path = self._get_os_specific_path()
        self.id_data = self._load_id_data()
    
    def _get_os_specific_path(self) -> Path:
        """Get OS-specific hidden directory for ID storage."""
        
        if self.os_type == 'darwin':  # macOS
            # Use /Library/Application Support (system-wide) or ~/Library (user)
            # Using user Library to avoid sudo requirements
            base_path = Path.home() / "Library" / "Application Support" / "LuciferAI"
            base_path.mkdir(parents=True, exist_ok=True)
            return base_path / ".system_id"
        
        elif self.os_type == 'linux':
            # Check if running on Raspberry Pi
            if self._is_raspberry_pi():
                # Raspberry Pi specific location
                base_path = Path.home() / ".config" / "luciferai"
                base_path.mkdir(parents=True, exist_ok=True)
                return base_path / ".system_id"
            else:
                # Standard Linux
                base_path = Path.home() / ".config" / "luciferai"
                base_path.mkdir(parents=True, exist_ok=True)
                return base_path / ".system_id"
        
        elif self.os_type == 'windows':
            # Windows: Use AppData/Roaming
            appdata = os.getenv('APPDATA')
            if appdata:
                base_path = Path(appdata) / "LuciferAI"
            else:
                base_path = Path.home() / "AppData" / "Roaming" / "LuciferAI"
            base_path.mkdir(parents=True, exist_ok=True)
            return base_path / ".system_id"
        
        else:
            # Fallback for unknown OS
            base_path = Path.home() / ".luciferai_system"
            base_path.mkdir(parents=True, exist_ok=True)
            return base_path / ".system_id"
    
    def _is_raspberry_pi(self) -> bool:
        """Check if running on Raspberry Pi."""
        try:
            # Check for Raspberry Pi specific files
            if Path("/proc/device-tree/model").exists():
                with open("/proc/device-tree/model", "r") as f:
                    model = f.read().lower()
                    return "raspberry pi" in model
            
            # Check /proc/cpuinfo for BCM
            if Path("/proc/cpuinfo").exists():
                with open("/proc/cpuinfo", "r") as f:
                    cpuinfo = f.read().lower()
                    return "bcm" in cpuinfo and "raspberry" in cpuinfo
        except:
            pass
        
        return False
    
    def _load_id_data(self) -> dict:
        """Load ID data from storage."""
        if not self.id_file_path.exists():
            return {}
        
        try:
            with open(self.id_file_path, 'r') as f:
                return json.load(f)
        except:
            return {}
    
    def _save_id_data(self):
        """Save ID data to storage."""
        try:
            # Make directory if it doesn't exist
            self.id_file_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Save with restricted permissions
            with open(self.id_file_path, 'w') as f:
                json.dump(self.id_data, f, indent=2)
            
            # Set file permissions (read/write for owner only)
            if self.os_type != 'windows':
                os.chmod(self.id_file_path, 0o600)
            
            return True
        except Exception as e:
            print(f"{RED}Failed to save system ID: {e}{RESET}")
            return False
    
    def has_id(self) -> bool:
        """Check if system has an ID assigned."""
        return 'user_id' in self.id_data and self.id_data['user_id'] is not None
    
    def get_id(self) -> Optional[str]:
        """Get the system ID."""
        return self.id_data.get('user_id')
    
    def get_github_username(self) -> Optional[str]:
        """Get the GitHub username."""
        return self.id_data.get('github_username')
    
    def set_id_from_github(self, github_username: str, github_id: str) -> bool:
        """
        Set system ID from GitHub sync.
        ID format: GH-{github_id}-{first 8 chars of username hash}
        """
        import hashlib
        
        # Create unique ID based on GitHub
        username_hash = hashlib.sha256(github_username.encode()).hexdigest()[:8].upper()
        user_id = f"GH-{github_id}-{username_hash}"
        
        self.id_data = {
            'user_id': user_id,
            'github_username': github_username,
            'github_id': github_id,
            'os_type': self.os_type,
            'os_version': platform.version(),
            'is_raspberry_pi': self._is_raspberry_pi(),
            'assigned_via': 'github_sync',
            'storage_path': str(self.id_file_path)
        }
        
        return self._save_id_data()
    
    def display_id_info(self):
        """Display system ID information."""
        if not self.has_id():
            print(f"\n{YELLOW}═══════════════════════════════════════════════════════════{RESET}")
            print(f"{YELLOW}No System ID assigned yet{RESET}")
            print(f"{YELLOW}═══════════════════════════════════════════════════════════{RESET}\n")
            print(f"{BLUE}System ID will be assigned after first GitHub sync{RESET}")
            print(f"{BLUE}Run: {GREEN}github link{RESET}")
            print()
            return
        
        print(f"\n{PURPLE}═══════════════════════════════════════════════════════════{RESET}")
        print(f"{PURPLE}🩸 LuciferAI System ID{RESET}")
        print(f"{PURPLE}═══════════════════════════════════════════════════════════{RESET}\n")
        
        print(f"{BLUE}User ID:{RESET}          {GREEN}{self.id_data['user_id']}{RESET}")
        print(f"{BLUE}GitHub:{RESET}           {self.id_data.get('github_username', 'N/A')}")
        print(f"{BLUE}OS:{RESET}               {self.id_data.get('os_type', 'Unknown').title()}")
        
        if self.id_data.get('is_raspberry_pi'):
            print(f"{BLUE}Device:{RESET}           {YELLOW}Raspberry Pi{RESET}")
        
        print(f"{BLUE}Storage:{RESET}          {self.id_file_path}")
        print(f"\n{PURPLE}═══════════════════════════════════════════════════════════{RESET}\n")
        
        print(f"{GREEN}✅ This ID persists across reinstalls{RESET}")
        print(f"{DIM}   Stored in OS-specific location{RESET}\n")
    
    def get_temporary_id(self) -> str:
        """
        Get a temporary ID before GitHub sync.
        This is used for local operations only.
        """
        return "TEMP-" + self._get_device_fingerprint()[:12].upper()
    
    def _get_device_fingerprint(self) -> str:
        """Get a device fingerprint for temporary ID."""
        import hashlib
        import uuid
        
        # Combine multiple device identifiers
        identifiers = [
            str(uuid.getnode()),  # MAC address
            platform.node(),       # Hostname
            self.os_type,
            platform.machine(),
        ]
        
        combined = "-".join(identifiers)
        return hashlib.sha256(combined.encode()).hexdigest()
    
    def clear_id(self) -> bool:
        """Clear the system ID (for testing/debugging only)."""
        if self.id_file_path.exists():
            try:
                self.id_file_path.unlink()
                self.id_data = {}
                return True
            except Exception as e:
                print(f"{RED}Failed to clear ID: {e}{RESET}")
                return False
        return True


# Global instance
_system_id_manager = None


def get_system_id_manager() -> SystemIDManager:
    """Get the global SystemIDManager instance."""
    global _system_id_manager
    if _system_id_manager is None:
        _system_id_manager = SystemIDManager()
    return _system_id_manager


def get_user_id() -> str:
    """
    Get user ID. Returns GitHub-assigned ID if available,
    otherwise returns temporary ID.
    """
    manager = get_system_id_manager()
    
    if manager.has_id():
        return manager.get_id()
    else:
        return manager.get_temporary_id()


def is_id_permanent() -> bool:
    """Check if current ID is permanent (GitHub-assigned)."""
    manager = get_system_id_manager()
    return manager.has_id()


def assign_id_from_github(github_username: str, github_id: str) -> bool:
    """Assign permanent ID from GitHub sync."""
    manager = get_system_id_manager()
    success = manager.set_id_from_github(github_username, github_id)
    
    if success:
        print(f"\n{GREEN}✅ System ID assigned from GitHub!{RESET}")
        print(f"{BLUE}User ID:{RESET} {GREEN}{manager.get_id()}{RESET}")
        print(f"{BLUE}GitHub:{RESET}  {github_username}")
        print(f"\n{YELLOW}💡 This ID is now permanently stored on your system{RESET}")
        print(f"{DIM}   Location: {manager.id_file_path}{RESET}\n")
    
    return success


def show_id_status():
    """Show ID status and information."""
    manager = get_system_id_manager()
    
    if manager.has_id():
        manager.display_id_info()
    else:
        print(f"\n{YELLOW}⚠️  Using temporary ID: {manager.get_temporary_id()}{RESET}")
        print(f"{BLUE}To get permanent ID, link your GitHub account:{RESET}")
        print(f"{GREEN}   github link{RESET}\n")


if __name__ == "__main__":
    # Test
    manager = SystemIDManager()
    
    print(f"OS Type: {manager.os_type}")
    print(f"Storage Path: {manager.id_file_path}")
    print(f"Is Raspberry Pi: {manager._is_raspberry_pi()}")
    print(f"Has ID: {manager.has_id()}")
    print(f"Current ID: {get_user_id()}")
    print(f"Is Permanent: {is_id_permanent()}")
    
    # Test GitHub ID assignment
    print("\n--- Testing GitHub ID Assignment ---")
    assign_id_from_github("TheRustySpoon", "123456")
    
    show_id_status()
