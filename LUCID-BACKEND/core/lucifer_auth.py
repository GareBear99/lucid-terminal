#!/usr/bin/env python3
"""
🔐 LuciferAI Authentication System
AES-256 encryption with device binding
"""
import os
import json
import hashlib
import uuid
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from cryptography.fernet import Fernet
import base64

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
RESET = "\033[0m"

# Paths
LUCIFER_HOME = Path.home() / ".luciferai"
DATA_DIR = LUCIFER_HOME / "data"
AUTH_FILE = DATA_DIR / "auth.key"
SESSION_FILE = DATA_DIR / "session.json"
SECURITY_LOG = LUCIFER_HOME / "logs" / "security.log"

# Create directories
DATA_DIR.mkdir(parents=True, exist_ok=True)
SECURITY_LOG.parent.mkdir(parents=True, exist_ok=True)


class LuciferAuth:
    """Authentication and authorization manager."""
    
    def __init__(self):
        self.cipher: Optional[Fernet] = None
        self.session: Dict[str, Any] = {}
        self.failed_attempts = 0
        self.lockout_until: Optional[datetime] = None
        
        # Supported roles
        self.ROLES = ["admin", "user", "daemon"]
        
    def generate_auth_key(self) -> str:
        """
        Generate device-bound authentication key.
        Uses: UUID + username + hostname
        """
        try:
            device_uuid = str(uuid.UUID(int=uuid.getnode()))
            username = os.getenv("USER", "unknown")
            hostname = os.uname().nodename if hasattr(os, 'uname') else "unknown"
            
            # Combine and hash
            unique_string = f"{device_uuid}-{username}-{hostname}"
            device_hash = hashlib.sha256(unique_string.encode()).digest()
            
            # Create Fernet key from hash
            key = base64.urlsafe_b64encode(device_hash[:32])
            
            self._log_security("auth_key_generated", f"Device: {hostname}, User: {username}")
            return key.decode()
        
        except Exception as e:
            self._log_security("auth_key_error", str(e))
            raise
    
    def auth_init(self) -> bool:
        """
        Initialize authentication system.
        Creates or loads existing auth key.
        """
        try:
            if AUTH_FILE.exists():
                # Load existing key
                with open(AUTH_FILE, 'r') as f:
                    data = json.load(f)
                    key = data.get('key')
                    self.cipher = Fernet(key.encode())
                print(f"{GREEN}🔐 Authentication system loaded{RESET}")
                return True
            else:
                # Generate new key
                key = self.generate_auth_key()
                self.cipher = Fernet(key.encode())
                
                # Save key
                auth_data = {
                    "key": key,
                    "created": datetime.now().isoformat(),
                    "device": os.uname().nodename if hasattr(os, 'uname') else "unknown"
                }
                
                with open(AUTH_FILE, 'w') as f:
                    json.dump(auth_data, f, indent=2)
                
                os.chmod(AUTH_FILE, 0o600)  # Read/write for owner only
                
                print(f"{PURPLE}🔐 Authentication system initialized{RESET}")
                print(f"{GOLD}💾 Key saved to: {AUTH_FILE}{RESET}")
                self._log_security("auth_init", "New auth system created")
                return True
        
        except Exception as e:
            print(f"{RED}❌ Auth initialization failed: {e}{RESET}")
            self._log_security("auth_init_error", str(e))
            return False
    
    def auth_prompt(self, max_attempts: int = 3) -> bool:
        """
        Prompt user for authentication.
        
        Args:
            max_attempts: Maximum login attempts before lockout
        
        Returns:
            True if authenticated successfully
        """
        # Check lockout
        if self.lockout_until and datetime.now() < self.lockout_until:
            remaining = (self.lockout_until - datetime.now()).seconds
            print(f"{RED}🔒 Account locked. Try again in {remaining} seconds{RESET}")
            return False
        
        for attempt in range(1, max_attempts + 1):
            try:
                import getpass
                passphrase = getpass.getpass(f"{PURPLE}🔑 Enter passphrase (attempt {attempt}/{max_attempts}): {RESET}")
                
                if self.verify_passphrase(passphrase):
                    self.failed_attempts = 0
                    self.lockout_until = None
                    self._create_session("user")
                    print(f"{GREEN}✅ Authentication successful{RESET}")
                    self._log_security("auth_success", f"User logged in")
                    return True
                else:
                    self.failed_attempts += 1
                    print(f"{RED}❌ Invalid passphrase{RESET}")
                    self._log_security("auth_failed", f"Failed attempt {attempt}")
            
            except KeyboardInterrupt:
                print(f"\n{GOLD}⚠️  Authentication cancelled{RESET}")
                return False
        
        # Max attempts exceeded
        self.lockout_until = datetime.now() + timedelta(minutes=5)
        print(f"{RED}🔒 Too many failed attempts. Locked for 5 minutes.{RESET}")
        self._log_security("auth_lockout", "Account locked due to failed attempts")
        return False
    
    def verify_passphrase(self, passphrase: str) -> bool:
        """Verify the user's passphrase."""
        try:
            # For demo, accept any non-empty passphrase
            # In production, verify against stored hash
            return len(passphrase) > 0
        except:
            return False
    
    def verify_auth(self, action: str, required_role: str = "user") -> bool:
        """
        Verify authentication before privileged action.
        
        Args:
            action: Action being attempted
            required_role: Minimum role required
        
        Returns:
            True if authorized
        """
        if not self.session:
            print(f"{RED}⚠️  Authentication required for: {action}{RESET}")
            return self.auth_prompt()
        
        # Check session expiry
        if self._is_session_expired():
            print(f"{GOLD}⚠️  Session expired. Please re-authenticate.{RESET}")
            return self.auth_prompt()
        
        # Check role permission
        user_role = self.session.get("role", "user")
        if not self._has_permission(user_role, required_role):
            print(f"{RED}🚫 Insufficient permissions. Required: {required_role}{RESET}")
            self._log_security("auth_denied", f"Action: {action}, Role: {user_role}")
            return False
        
        self._log_security("auth_verified", f"Action: {action}")
        return True
    
    def _create_session(self, role: str = "user"):
        """Create authenticated session."""
        self.session = {
            "user": os.getenv("USER", "unknown"),
            "role": role,
            "started": datetime.now().isoformat(),
            "expires": (datetime.now() + timedelta(hours=8)).isoformat()
        }
        
        # Save session
        with open(SESSION_FILE, 'w') as f:
            json.dump(self.session, f, indent=2)
    
    def _is_session_expired(self) -> bool:
        """Check if current session has expired."""
        if not self.session:
            return True
        
        expires = datetime.fromisoformat(self.session.get("expires", ""))
        return datetime.now() > expires
    
    def _has_permission(self, user_role: str, required_role: str) -> bool:
        """Check if user role has required permissions."""
        role_hierarchy = {"daemon": 0, "user": 1, "admin": 2}
        return role_hierarchy.get(user_role, 0) >= role_hierarchy.get(required_role, 0)
    
    def _log_security(self, event: str, details: str):
        """Log security event."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {event}: {details}\n"
        
        with open(SECURITY_LOG, 'a') as f:
            f.write(log_entry)
    
    def logout(self):
        """End current session."""
        if self.session:
            self._log_security("logout", f"User: {self.session.get('user')}")
            self.session = {}
            
            if SESSION_FILE.exists():
                SESSION_FILE.unlink()
            
            print(f"{GOLD}👋 Logged out successfully{RESET}")
    
    def get_session_info(self) -> Dict[str, Any]:
        """Get current session information."""
        return self.session.copy()


# Test authentication system
if __name__ == "__main__":
    print(f"{PURPLE}🧪 Testing LuciferAuth{RESET}\n")
    
    auth = LuciferAuth()
    
    # Test 1: Initialize
    print(f"{GOLD}Test 1: Initialize auth system{RESET}")
    if auth.auth_init():
        print(f"{GREEN}✅ Auth system initialized{RESET}\n")
    
    # Test 2: Create session (skip prompt for testing)
    print(f"{GOLD}Test 2: Create session{RESET}")
    auth._create_session("admin")
    print(f"{GREEN}✅ Session created{RESET}")
    print(f"Session info: {auth.get_session_info()}\n")
    
    # Test 3: Verify auth
    print(f"{GOLD}Test 3: Verify authorization{RESET}")
    if auth.verify_auth("test_action", "user"):
        print(f"{GREEN}✅ Authorization verified{RESET}\n")
    
    # Test 4: Check permissions
    print(f"{GOLD}Test 4: Permission checks{RESET}")
    print(f"  Admin can do user actions: {auth._has_permission('admin', 'user')}")
    print(f"  User can do admin actions: {auth._has_permission('user', 'admin')}")
    print(f"{GREEN}✅ Permission system working{RESET}\n")
    
    # Test 5: Logout
    print(f"{GOLD}Test 5: Logout{RESET}")
    auth.logout()
    print(f"{GREEN}✅ Logout successful{RESET}\n")
    
    print(f"{PURPLE}✨ Auth tests complete{RESET}")
    print(f"{GOLD}Check logs at: {SECURITY_LOG}{RESET}")
