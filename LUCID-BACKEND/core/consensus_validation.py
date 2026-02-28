#!/usr/bin/env python3
"""
🔐 Consensus ID Validation System
Manages available validated IDs through consensus with queue system
"""
import json
import time
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import getpass

LUCIFER_HOME = Path.home() / ".luciferai"
AVAILABLE_IDS_FILE = LUCIFER_HOME / "data" / "available_ids.json"
VALIDATION_QUEUE_FILE = LUCIFER_HOME / "data" / "validation_queue.json"
RATE_LIMIT_FILE = LUCIFER_HOME / "data" / "consensus_rate_limits.json"
CONFIRMED_IDS_FILE = LUCIFER_HOME / "data" / "confirmed_ids.json"
PENDING_NOTIFICATIONS_FILE = LUCIFER_HOME / "data" / "pending_notifications.json"
GITHUB_USER_MAPPINGS_FILE = LUCIFER_HOME / "data" / "github_user_mappings.json"

GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
CYAN = '\033[36m'
PURPLE = '\033[35m'
RESET = '\033[0m'


class ConsensusValidation:
    """Manage consensus-validated IDs with queue system."""
    
    def __init__(self):
        self.available_ids = self._load_available_ids()
        self.queue = self._load_queue()
        self.rate_limits = self._load_rate_limits()
        self.confirmed_ids = self._load_confirmed_ids()
        self.pending_notifications = self._load_pending_notifications()
        self.github_mappings = self._load_github_mappings()
        
        # Ensure 10 IDs are always available
        self._ensure_available_ids()
    
    def _load_available_ids(self) -> Dict[str, Any]:
        """Load available validated IDs from consensus."""
        if AVAILABLE_IDS_FILE.exists():
            try:
                with open(AVAILABLE_IDS_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        
        return {
            "available": [],
            "total_issued": 0,
            "last_replenished": None
        }
    
    def _save_available_ids(self):
        """Save available IDs."""
        AVAILABLE_IDS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(AVAILABLE_IDS_FILE, 'w') as f:
            json.dump(self.available_ids, f, indent=2)
    
    def _load_queue(self) -> List[Dict[str, Any]]:
        """Load validation queue."""
        if VALIDATION_QUEUE_FILE.exists():
            try:
                with open(VALIDATION_QUEUE_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return []
    
    def _save_queue(self):
        """Save validation queue."""
        VALIDATION_QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(VALIDATION_QUEUE_FILE, 'w') as f:
            json.dump(self.queue, f, indent=2)
    
    def _load_rate_limits(self) -> Dict[str, Any]:
        """Load rate limit data."""
        if RATE_LIMIT_FILE.exists():
            try:
                with open(RATE_LIMIT_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        
        return {
            "last_sync": None,
            "sync_count_today": 0,
            "next_available_sync": None
        }
    
    def _save_rate_limits(self):
        """Save rate limit data."""
        RATE_LIMIT_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(RATE_LIMIT_FILE, 'w') as f:
            json.dump(self.rate_limits, f, indent=2)
    
    def _load_confirmed_ids(self) -> Dict[str, Any]:
        """Load confirmed IDs from consensus."""
        if CONFIRMED_IDS_FILE.exists():
            try:
                with open(CONFIRMED_IDS_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {}
    
    def _save_confirmed_ids(self):
        """Save confirmed IDs."""
        CONFIRMED_IDS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CONFIRMED_IDS_FILE, 'w') as f:
            json.dump(self.confirmed_ids, f, indent=2)
    
    def _load_pending_notifications(self) -> List[Dict[str, Any]]:
        """Load pending user notifications."""
        if PENDING_NOTIFICATIONS_FILE.exists():
            try:
                with open(PENDING_NOTIFICATIONS_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return []
    
    def _save_pending_notifications(self):
        """Save pending notifications."""
        PENDING_NOTIFICATIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(PENDING_NOTIFICATIONS_FILE, 'w') as f:
            json.dump(self.pending_notifications, f, indent=2)
    
    def _load_github_mappings(self) -> Dict[str, str]:
        """Load GitHub username to consensus ID mappings."""
        if GITHUB_USER_MAPPINGS_FILE.exists():
            try:
                with open(GITHUB_USER_MAPPINGS_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {}
    
    def _save_github_mappings(self):
        """Save GitHub mappings."""
        GITHUB_USER_MAPPINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(GITHUB_USER_MAPPINGS_FILE, 'w') as f:
            json.dump(self.github_mappings, f, indent=2)
    
    def _ensure_available_ids(self):
        """Ensure 10 IDs are always available in the pool."""
        current_count = len(self.available_ids.get("available", []))
        
        if current_count < 10:
            needed = 10 - current_count
            
            for _ in range(needed):
                new_id = self._generate_consensus_id()
                self.available_ids.setdefault("available", []).append({
                    "id": new_id,
                    "generated_at": datetime.utcnow().isoformat() + "Z",
                    "status": "available"
                })
                self.available_ids["total_issued"] = self.available_ids.get("total_issued", 0) + 1
            
            self.available_ids["last_replenished"] = datetime.utcnow().isoformat() + "Z"
            self._save_available_ids()
    
    def _generate_consensus_id(self) -> str:
        """Generate a new consensus-validated ID."""
        import hashlib
        import uuid
        
        # Generate unique ID
        timestamp = str(time.time())
        random = str(uuid.uuid4())
        combined = f"{timestamp}-{random}"
        
        hash_val = hashlib.sha256(combined.encode()).hexdigest()[:16].upper()
        return f"CONSENSUS-{hash_val}"
    
    def check_existing_link(self, github_username: str) -> Optional[str]:
        """Check if GitHub user already has a linked ID."""
        return self.github_mappings.get(github_username)
    
    def request_github_link(self, github_username: str) -> Dict[str, Any]:
        """
        Request to link GitHub account with consensus-validated ID.
        Returns ID immediately if available, otherwise adds to queue.
        """
        # Check if user already has an ID
        existing_id = self.check_existing_link(github_username)
        if existing_id:
            return {
                "success": False,
                "reason": "already_linked",
                "message": f"GitHub user '{github_username}' is already linked to consensus ID",
                "existing_id": existing_id
            }
        
        # Check if IDs are available
        if self.available_ids.get("available"):
            # Check rate limits
            if not self._check_rate_limit():
                return {
                    "success": False,
                    "reason": "rate_limit",
                    "message": "Rate limit reached. Please wait before syncing.",
                    "next_available": self.rate_limits.get("next_available_sync")
                }
            
            # Assign ID immediately (pending confirmation)
            assigned_id = self.available_ids["available"].pop(0)
            consensus_id = assigned_id["id"]
            
            assigned_id["linked_to"] = github_username
            assigned_id["linked_at"] = datetime.utcnow().isoformat() + "Z"
            assigned_id["status"] = "pending_confirmation"
            
            # Add to GitHub mappings (pending)
            self.github_mappings[github_username] = {
                "consensus_id": consensus_id,
                "status": "pending_confirmation",
                "verification_level": "unverified",
                "can_edit_repos": False,
                "assigned_at": datetime.utcnow().isoformat() + "Z"
            }
            self._save_github_mappings()
            
            # Replenish pool
            self._ensure_available_ids()
            self._save_available_ids()
            
            # Record rate limit
            self._record_sync()
            
            return {
                "success": True,
                "id": consensus_id,
                "github_username": github_username,
                "status": "pending_confirmation",
                "message": "ID assigned - waiting for consensus confirmation"
            }
        
        else:
            # Add to queue
            queue_entry = {
                "github_username": github_username,
                "requested_at": datetime.utcnow().isoformat() + "Z",
                "position": len(self.queue) + 1,
                "status": "waiting"
            }
            
            self.queue.append(queue_entry)
            self._save_queue()
            
            return {
                "success": False,
                "reason": "queue",
                "message": "No IDs available. Added to validation queue.",
                "position": queue_entry["position"],
                "estimated_wait": f"{queue_entry['position'] * 10} minutes"
            }
    
    def _check_rate_limit(self) -> bool:
        """Check if we can sync to consensus (rate limit)."""
        last_sync = self.rate_limits.get("last_sync")
        
        if not last_sync:
            return True
        
        last_sync_time = datetime.fromisoformat(last_sync.replace("Z", ""))
        now = datetime.utcnow()
        
        # Allow 1 sync per hour
        time_since_last = (now - last_sync_time).total_seconds()
        
        if time_since_last < 3600:  # 1 hour
            next_available = last_sync_time + timedelta(hours=1)
            self.rate_limits["next_available_sync"] = next_available.isoformat() + "Z"
            self._save_rate_limits()
            return False
        
        return True
    
    def _record_sync(self):
        """Record a sync operation for rate limiting."""
        now = datetime.utcnow()
        self.rate_limits["last_sync"] = now.isoformat() + "Z"
        self.rate_limits["sync_count_today"] = self.rate_limits.get("sync_count_today", 0) + 1
        self.rate_limits["next_available_sync"] = (now + timedelta(hours=1)).isoformat() + "Z"
        self._save_rate_limits()
    
    def process_queue(self):
        """Process validation queue when IDs become available."""
        if not self.queue:
            return []
        
        processed = []
        
        while self.queue and self.available_ids.get("available"):
            if not self._check_rate_limit():
                break
            
            # Process next in queue
            next_user = self.queue.pop(0)
            result = self.request_github_link(next_user["github_username"])
            
            if result["success"]:
                processed.append({
                    "github_username": next_user["github_username"],
                    "id": result["id"],
                    "processed_at": datetime.utcnow().isoformat() + "Z"
                })
        
        self._save_queue()
        return processed
    
    def verify_github_credentials(self, github_username: str, github_password: str) -> Optional[str]:
        """
        Verify GitHub credentials and get GitHub user ID.
        Password is NOT saved - only used for verification.
        """
        print(f"\n{YELLOW}🔐 Verifying GitHub credentials...{RESET}")
        print(f"{CYAN}Note: Password is used only for verification and is NOT saved{RESET}\n")
        
        try:
            import requests
            from requests.auth import HTTPBasicAuth
            
            # Verify credentials with GitHub API
            response = requests.get(
                "https://api.github.com/user",
                auth=HTTPBasicAuth(github_username, github_password),
                timeout=10
            )
            
            if response.status_code == 200:
                user_data = response.json()
                github_id = str(user_data['id'])
                
                print(f"{GREEN}✅ GitHub credentials verified{RESET}")
                print(f"{CYAN}Username: {github_username}{RESET}")
                print(f"{CYAN}GitHub ID: {github_id}{RESET}\n")
                
                return github_id
            
            elif response.status_code == 401:
                print(f"{RED}❌ Invalid credentials{RESET}\n")
                return None
            
            else:
                print(f"{RED}❌ GitHub API error: {response.status_code}{RESET}\n")
                return None
        
        except Exception as e:
            print(f"{RED}❌ Error verifying credentials: {e}{RESET}\n")
            return None
    
    def link_github_with_validation(self, github_username: str, github_password: str) -> Dict[str, Any]:
        """
        Full flow: Verify GitHub credentials and assign consensus ID.
        Password is used for verification only and never saved.
        """
        # Verify credentials first
        github_id = self.verify_github_credentials(github_username, github_password)
        
        if not github_id:
            return {
                "success": False,
                "reason": "invalid_credentials",
                "message": "GitHub credentials could not be verified"
            }
        
        # Request consensus ID
        result = self.request_github_link(github_username)
        
        if result["success"]:
            result["github_id"] = github_id
            
            # Mark as verified (password was provided)
            if github_username in self.github_mappings:
                self.github_mappings[github_username]["verification_level"] = "verified"
                self.github_mappings[github_username]["can_edit_repos"] = True
                self.github_mappings[github_username]["verified_at"] = datetime.utcnow().isoformat() + "Z"
                self._save_github_mappings()
                
                result["verification_level"] = "verified"
                result["can_edit_repos"] = True
        
        return result
    
    def link_github_unverified(self, github_username: str) -> Dict[str, Any]:
        """
        Link GitHub account without password (unverified).
        User can only view, not edit repos.
        """
        print(f"\n{YELLOW}🔗 Linking GitHub account (Unverified Mode){RESET}")
        print(f"{CYAN}Note: Without password verification, you cannot edit repos{RESET}")
        print(f"{CYAN}To enable repo editing, re-link with password later{RESET}\n")
        
        # Check if already linked
        existing = self.check_existing_link(github_username)
        if existing:
            return {
                "success": False,
                "reason": "already_linked",
                "message": f"GitHub user '{github_username}' is already linked"
            }
        
        # Request consensus ID
        result = self.request_github_link(github_username)
        
        if result["success"]:
            result["verification_level"] = "unverified"
            result["can_edit_repos"] = False
            result["message"] += " (Unverified - cannot edit repos)"
        
        return result
    
    def upgrade_to_verified(self, github_username: str, github_password: str) -> Dict[str, Any]:
        """
        Upgrade unverified account to verified by providing password.
        """
        # Check if account exists
        if github_username not in self.github_mappings:
            return {
                "success": False,
                "reason": "not_linked",
                "message": "GitHub account not linked yet"
            }
        
        mapping = self.github_mappings[github_username]
        
        # Check if already verified
        if mapping.get("verification_level") == "verified":
            return {
                "success": False,
                "reason": "already_verified",
                "message": "Account is already verified"
            }
        
        # Verify password
        github_id = self.verify_github_credentials(github_username, github_password)
        
        if not github_id:
            return {
                "success": False,
                "reason": "invalid_credentials",
                "message": "GitHub credentials could not be verified"
            }
        
        # Upgrade to verified
        mapping["verification_level"] = "verified"
        mapping["can_edit_repos"] = True
        mapping["verified_at"] = datetime.utcnow().isoformat() + "Z"
        mapping["github_id"] = github_id
        
        self._save_github_mappings()
        
        return {
            "success": True,
            "message": "Account upgraded to verified",
            "consensus_id": mapping["consensus_id"],
            "can_edit_repos": True
        }
    
    def check_repo_edit_permission(self, github_username: str) -> bool:
        """Check if user has permission to edit repos."""
        if github_username not in self.github_mappings:
            return False
        
        mapping = self.github_mappings[github_username]
        return mapping.get("can_edit_repos", False) and mapping.get("verification_level") == "verified"
    
    def confirm_id_from_consensus(self, github_username: str, consensus_id: str) -> bool:
        """Confirm ID assignment from GitHub consensus."""
        # Update mapping status
        if github_username in self.github_mappings:
            mapping = self.github_mappings[github_username]
            
            if mapping.get("consensus_id") == consensus_id:
                mapping["status"] = "confirmed"
                mapping["confirmed_at"] = datetime.utcnow().isoformat() + "Z"
                
                # Add to confirmed IDs
                self.confirmed_ids[consensus_id] = {
                    "github_username": github_username,
                    "confirmed_at": datetime.utcnow().isoformat() + "Z",
                    "confirmed_by": "consensus"
                }
                
                self._save_github_mappings()
                self._save_confirmed_ids()
                return True
        
        return False
    
    def detect_duplicate_id(self, consensus_id: str, github_username: str) -> bool:
        """Detect if ID was duplicated and assign new one."""
        # Check if this ID is already confirmed for someone else
        if consensus_id in self.confirmed_ids:
            existing_user = self.confirmed_ids[consensus_id].get("github_username")
            
            if existing_user and existing_user != github_username:
                print(f"\n{RED}⚠️  Duplicate ID detected!{RESET}")
                print(f"{YELLOW}ID {consensus_id} was assigned to multiple users{RESET}")
                print(f"{CYAN}Resolving...{RESET}\n")
                
                # Remove from current user
                if github_username in self.github_mappings:
                    del self.github_mappings[github_username]
                    self._save_github_mappings()
                
                # Generate new ID
                new_id = self._generate_consensus_id()
                
                # Assign new ID
                self.github_mappings[github_username] = {
                    "consensus_id": new_id,
                    "status": "confirmed",
                    "assigned_at": datetime.utcnow().isoformat() + "Z",
                    "previous_id": consensus_id,
                    "reason": "duplicate_resolved"
                }
                
                self.confirmed_ids[new_id] = {
                    "github_username": github_username,
                    "confirmed_at": datetime.utcnow().isoformat() + "Z",
                    "confirmed_by": "duplicate_resolution"
                }
                
                # Create notification
                notification = {
                    "github_username": github_username,
                    "type": "id_changed",
                    "old_id": consensus_id,
                    "new_id": new_id,
                    "reason": "A copy of your ID was made for someone else at the exact same time. You were queued and received this new permanently validated ID.",
                    "created_at": datetime.utcnow().isoformat() + "Z",
                    "status": "pending"
                }
                
                self.pending_notifications.append(notification)
                
                self._save_github_mappings()
                self._save_confirmed_ids()
                self._save_pending_notifications()
                
                print(f"{GREEN}✅ New consensus ID assigned: {new_id}{RESET}")
                print(f"{YELLOW}Previous ID: {consensus_id} (removed){RESET}\n")
                
                return True
        
        return False
    
    def check_pending_notifications(self, github_username: str) -> List[Dict[str, Any]]:
        """Check for pending notifications for user."""
        user_notifications = []
        
        for notification in self.pending_notifications:
            if notification.get("github_username") == github_username and notification.get("status") == "pending":
                user_notifications.append(notification)
        
        return user_notifications
    
    def mark_notification_shown(self, github_username: str, notification_type: str):
        """Mark notification as shown to user."""
        for notification in self.pending_notifications:
            if notification.get("github_username") == github_username and notification.get("type") == notification_type:
                notification["status"] = "shown"
                notification["shown_at"] = datetime.utcnow().isoformat() + "Z"
        
        self._save_pending_notifications()
    
    def get_queue_status(self) -> Dict[str, Any]:
        """Get current queue status."""
        return {
            "queue_length": len(self.queue),
            "available_ids": len(self.available_ids.get("available", [])),
            "total_issued": self.available_ids.get("total_issued", 0),
            "confirmed_ids": len(self.confirmed_ids),
            "pending_confirmations": sum(1 for m in self.github_mappings.values() if m.get("status") == "pending_confirmation"),
            "last_replenished": self.available_ids.get("last_replenished"),
            "rate_limit_status": {
                "last_sync": self.rate_limits.get("last_sync"),
                "next_available": self.rate_limits.get("next_available_sync")
            }
        }


def get_consensus_validation() -> ConsensusValidation:
    """Get global consensus validation instance."""
    global _consensus_validation
    if '_consensus_validation' not in globals():
        _consensus_validation = ConsensusValidation()
    return _consensus_validation


if __name__ == "__main__":
    # Test
    cv = ConsensusValidation()
    
    print(f"{PURPLE}╔{'═'*60}╗{RESET}")
    print(f"{PURPLE}║  🔐 Consensus Validation System Test{' '*20}║{RESET}")
    print(f"{PURPLE}╚{'═'*60}╝{RESET}\n")
    
    status = cv.get_queue_status()
    
    print(f"{CYAN}Status:{RESET}")
    print(f"  Available IDs: {status['available_ids']}")
    print(f"  Queue Length: {status['queue_length']}")
    print(f"  Total Issued: {status['total_issued']}")
    print()
