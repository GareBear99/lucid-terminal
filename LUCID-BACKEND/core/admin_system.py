#!/usr/bin/env python3
"""
🔐 LuciferAI Admin System
Admin privileges based on consensus validation and contribution metrics
"""
import json
from pathlib import Path
from typing import Optional, Dict, Any

LUCIFER_HOME = Path.home() / ".luciferai"
ADMIN_CONFIG = LUCIFER_HOME / "data" / "admin_config.json"


class AdminSystem:
    """Manage admin privileges based on consensus validation."""
    
    def __init__(self):
        self.config = self._load_config()
    
    def _load_config(self) -> Dict[str, Any]:
        """Load admin configuration."""
        if ADMIN_CONFIG.exists():
            try:
                with open(ADMIN_CONFIG, 'r') as f:
                    return json.load(f)
            except:
                pass
        
        # Default config
        return {
            "admins": [],  # List of validated admin user IDs
            "admin_criteria": {
                "min_uploads": 10,
                "min_consensus_trust": 0.8,
                "min_successful_fixes": 50,
                "requires_github_validation": True
            },
            "permissions": {
                "admin": [
                    "view_all_ids",
                    "validate_users",
                    "moderate_consensus",
                    "bypass_rate_limits",
                    "system_diagnostics"
                ],
                "trusted": [
                    "upload_to_consensus",
                    "create_environments",
                    "run_daemon"
                ],
                "user": [
                    "read_consensus",
                    "run_scripts",
                    "use_local_dictionary"
                ]
            }
        }
    
    def _save_config(self):
        """Save admin configuration."""
        ADMIN_CONFIG.parent.mkdir(parents=True, exist_ok=True)
        with open(ADMIN_CONFIG, 'w') as f:
            json.dump(self.config, f, indent=2)
    
    def is_admin(self, user_id: str) -> bool:
        """Check if user ID has admin privileges."""
        return user_id in self.config.get("admins", [])
    
    def get_user_role(self, user_id: str) -> str:
        """Get user role based on consensus metrics."""
        if self.is_admin(user_id):
            return "admin"
        
        # Check if user meets trusted criteria
        if self._meets_trusted_criteria(user_id):
            return "trusted"
        
        return "user"
    
    def _meets_trusted_criteria(self, user_id: str) -> bool:
        """Check if user meets criteria for trusted status."""
        try:
            # Load user metrics from consensus
            metrics_file = LUCIFER_HOME / "data" / f"metrics_{user_id}.json"
            
            if not metrics_file.exists():
                return False
            
            with open(metrics_file, 'r') as f:
                metrics = json.load(f)
            
            criteria = self.config.get("admin_criteria", {})
            
            # Check minimum requirements
            if metrics.get("upload_count", 0) < criteria.get("min_uploads", 10):
                return False
            
            if metrics.get("consensus_trust", 0) < criteria.get("min_consensus_trust", 0.8):
                return False
            
            if metrics.get("successful_fixes", 0) < criteria.get("min_successful_fixes", 50):
                return False
            
            if criteria.get("requires_github_validation") and not metrics.get("github_validated"):
                return False
            
            return True
        
        except:
            return False
    
    def promote_to_admin(self, user_id: str, promoted_by: str) -> bool:
        """Promote a user to admin (requires existing admin)."""
        if not self.is_admin(promoted_by):
            return False
        
        if user_id not in self.config.get("admins", []):
            self.config.setdefault("admins", []).append(user_id)
            self._save_config()
        
        return True
    
    def revoke_admin(self, user_id: str, revoked_by: str) -> bool:
        """Revoke admin privileges (requires existing admin)."""
        if not self.is_admin(revoked_by):
            return False
        
        if user_id in self.config.get("admins", []):
            self.config["admins"].remove(user_id)
            self._save_config()
        
        return True
    
    def get_permissions(self, user_id: str) -> list:
        """Get list of permissions for user."""
        role = self.get_user_role(user_id)
        return self.config.get("permissions", {}).get(role, [])
    
    def has_permission(self, user_id: str, permission: str) -> bool:
        """Check if user has specific permission."""
        return permission in self.get_permissions(user_id)
    
    def bootstrap_first_admin(self, user_id: str) -> bool:
        """
        Bootstrap the first admin when no admins exist.
        This should only be called during initial setup.
        """
        if len(self.config.get("admins", [])) > 0:
            return False  # Admins already exist
        
        self.config.setdefault("admins", []).append(user_id)
        self._save_config()
        return True
    
    def show_admin_status(self, user_id: str) -> str:
        """Show admin status for user."""
        role = self.get_user_role(user_id)
        permissions = self.get_permissions(user_id)
        
        response = f"\n🔐 User Role: {role.upper()}\n\n"
        response += f"Permissions:\n"
        
        for perm in permissions:
            response += f"  ✓ {perm}\n"
        
        return response


def get_admin_system() -> AdminSystem:
    """Get the global admin system instance."""
    global _admin_system
    if '_admin_system' not in globals():
        _admin_system = AdminSystem()
    return _admin_system


if __name__ == "__main__":
    # Test
    admin_sys = AdminSystem()
    
    # Bootstrap first admin (only works if no admins exist)
    test_id = "GH-123456-ABCD1234"
    success = admin_sys.bootstrap_first_admin(test_id)
    
    if success:
        print(f"✅ Bootstrapped first admin: {test_id}")
        print(admin_sys.show_admin_status(test_id))
    else:
        print("⚠️  Admins already exist, bootstrap not needed")
