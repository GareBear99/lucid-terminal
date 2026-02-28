#!/usr/bin/env python3
"""
🌐 LuciferAI FixNet - Public Fix Upload & Learning System
Encrypts, signs, and uploads fixes to GitHub for collaborative learning
"""
import os
import json
import hashlib
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime
from cryptography.fernet import Fernet
import base64

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"

# Paths
LUCIFER_HOME = Path.home() / ".luciferai"
FIXES_DIR = LUCIFER_HOME / "logs" / "fixes"
SYNC_DIR = LUCIFER_HOME / "sync"
AUTH_FILE = LUCIFER_HOME / "data" / "auth.key"
COMMIT_LOG = SYNC_DIR / "commit_links.json"
FIX_DICTIONARY = LUCIFER_HOME / "data" / "fix_dictionary.json"

# GitHub repo for FixNet sync
GITHUB_REPO = "https://github.com/GareBear99/LuciferAI_FixNet"
FIXNET_LOCAL = LUCIFER_HOME / "fixnet"

# Create directories
FIXES_DIR.mkdir(parents=True, exist_ok=True)
SYNC_DIR.mkdir(parents=True, exist_ok=True)


class FixNetUploader:
    """Manages encrypted fix uploads to public GitHub repository."""
    
    def __init__(self, user_id: Optional[str] = None, smart_filter=None):
        self.user_id = user_id or self._generate_user_id()
        self.cipher = self._load_cipher()
        self.commit_history: List[Dict] = self._load_commit_log()
        self.smart_filter = smart_filter  # Will be set by integration
        
        # Initialize FixNet repo
        self._init_fixnet_repo()
    
    def _generate_user_id(self) -> str:
        """Generate unique user ID from system info."""
        import uuid
        device_id = str(uuid.UUID(int=uuid.getnode()))
        username = os.getenv("USER", "unknown")
        combined = f"{device_id}-{username}"
        return hashlib.sha256(combined.encode()).hexdigest()[:16].upper()
    
    def _load_cipher(self) -> Optional[Fernet]:
        """Load encryption cipher from auth key."""
        try:
            if AUTH_FILE.exists():
                with open(AUTH_FILE) as f:
                    data = json.load(f)
                    key = data.get('key')
                    return Fernet(key.encode())
        except:
            pass
        return None
    
    def _load_commit_log(self) -> List[Dict]:
        """Load commit history."""
        if COMMIT_LOG.exists():
            with open(COMMIT_LOG) as f:
                return json.load(f)
        return []
    
    def _save_commit_log(self):
        """Save commit history."""
        with open(COMMIT_LOG, 'w') as f:
            json.dump(self.commit_history, f, indent=2)
    
    def _init_fixnet_repo(self):
        """Initialize or update local FixNet repository."""
        if not FIXNET_LOCAL.exists():
            print(f"{BLUE}📦 Initializing FixNet repository...{RESET}")
            try:
                # Clone or init
                subprocess.run(
                    ["git", "clone", GITHUB_REPO, str(FIXNET_LOCAL)],
                    capture_output=True,
                    check=False
                )
                
                if not FIXNET_LOCAL.exists():
                    # If clone fails, init new repo
                    FIXNET_LOCAL.mkdir(parents=True, exist_ok=True)
                    subprocess.run(["git", "init"], cwd=FIXNET_LOCAL, capture_output=True)
                    
                    # Create README
                    readme = FIXNET_LOCAL / "README.md"
                    readme.write_text("""# LuciferAI FixNet
                    
Public repository of encrypted, signed code fixes from the LuciferAI community.

## Structure
- `fixes/` - Encrypted patch files (.enc)
- `signatures/` - SHA256 signatures (.sig)
- `refs.json` - Relevance dictionary (anonymized)

## Security
All fixes are AES-256 encrypted and SHA256 signed.
User IDs are anonymized hashes.
""")
                    
                    subprocess.run(["git", "add", "."], cwd=FIXNET_LOCAL, capture_output=True)
                    subprocess.run(
                        ["git", "commit", "-m", "Initialize FixNet"],
                        cwd=FIXNET_LOCAL,
                        capture_output=True
                    )
                
                print(f"{GREEN}✅ FixNet repository ready{RESET}")
            except Exception as e:
                print(f"{RED}⚠️  FixNet init failed: {e}{RESET}")
        else:
            # Pull latest
            try:
                subprocess.run(
                    ["git", "pull"],
                    cwd=FIXNET_LOCAL,
                    capture_output=True,
                    timeout=5
                )
            except:
                pass
    
    def create_fix_patch(self, 
                        script_path: str,
                        error: str,
                        solution: str,
                        context: Dict[str, Any],
                        inspired_by: Optional[str] = None,
                        variation_reason: Optional[str] = None) -> Dict[str, Any]:
        """
        Create a fix patch with metadata.
        
        Args:
            script_path: Path to fixed script
            error: Original error message
            solution: Applied fix/solution
            context: Additional context
            inspired_by: Hash of fix that inspired this one
            variation_reason: Why this variation exists
        
        Returns:
            Dict with patch info
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        script_name = Path(script_path).stem
        
        # Create patch metadata
        patch_data = {
            "user_id": self.user_id,
            "timestamp": datetime.now().isoformat(),
            "script": script_name,
            "script_path": script_path,
            "error_type": self._classify_error(error),
            "error": error[:500],  # Truncate for privacy
            "solution": solution[:1000],
            "context": context,
            "device": os.uname().nodename if hasattr(os, 'uname') else "unknown",
            "inspired_by": inspired_by,
            "variation_reason": variation_reason,
            "is_variant": inspired_by is not None
        }
        
        # Calculate hash
        patch_json = json.dumps(patch_data, sort_keys=True)
        fix_hash = hashlib.sha256(patch_json.encode()).hexdigest()
        patch_data["fix_hash"] = fix_hash
        
        # Save locally first
        patch_file = FIXES_DIR / f"fix_{script_name}_{timestamp}.json"
        with open(patch_file, 'w') as f:
            json.dump(patch_data, f, indent=2)
        
        print(f"{GREEN}📝 Fix patch created: {patch_file.name}{RESET}")
        return {
            "patch_file": str(patch_file),
            "patch_data": patch_data,
            "fix_hash": fix_hash
        }
    
    def encrypt_patch(self, patch_file: str) -> str:
        """
        Encrypt patch file with AES-256.
        
        Args:
            patch_file: Path to patch file
        
        Returns:
            Path to encrypted file
        """
        if not self.cipher:
            print(f"{RED}❌ No encryption key available{RESET}")
            return ""
        
        try:
            # Read patch
            with open(patch_file, 'rb') as f:
                data = f.read()
            
            # Encrypt
            encrypted = self.cipher.encrypt(data)
            
            # Save encrypted
            enc_file = f"{patch_file}.enc"
            with open(enc_file, 'wb') as f:
                f.write(encrypted)
            
            print(f"{PURPLE}🔐 Encrypted: {Path(enc_file).name}{RESET}")
            return enc_file
        
        except Exception as e:
            print(f"{RED}❌ Encryption failed: {e}{RESET}")
            return ""
    
    def sign_file(self, file_path: str) -> str:
        """
        Create SHA256 signature for file.
        
        Args:
            file_path: Path to file to sign
        
        Returns:
            Path to signature file
        """
        try:
            # Calculate SHA256
            with open(file_path, 'rb') as f:
                file_hash = hashlib.sha256(f.read()).hexdigest()
            
            # Create signature file
            sig_file = f"{file_path}.sig"
            sig_data = {
                "sha256": file_hash,
                "file": Path(file_path).name,
                "signed": datetime.now().isoformat(),
                "signer": self.user_id
            }
            
            with open(sig_file, 'w') as f:
                json.dump(sig_data, f, indent=2)
            
            print(f"{BLUE}✍️  Signature: {file_hash[:12]}...{RESET}")
            return sig_file
        
        except Exception as e:
            print(f"{RED}❌ Signing failed: {e}{RESET}")
            return ""
    
    def upload_to_github(self,
                        encrypted_file: str,
                        signature_file: str,
                        patch_data: Dict[str, Any]) -> Optional[str]:
        """
        Upload encrypted fix to GitHub FixNet repository.
        
        Args:
            encrypted_file: Path to encrypted patch
            signature_file: Path to signature
            patch_data: Original patch metadata
        
        Returns:
            Commit URL or None
        """
        try:
            # Copy files to FixNet repo
            fixes_dir = FIXNET_LOCAL / "fixes"
            sigs_dir = FIXNET_LOCAL / "signatures"
            fixes_dir.mkdir(exist_ok=True)
            sigs_dir.mkdir(exist_ok=True)
            
            enc_dest = fixes_dir / Path(encrypted_file).name
            sig_dest = sigs_dir / Path(signature_file).name
            
            import shutil
            shutil.copy(encrypted_file, enc_dest)
            shutil.copy(signature_file, sig_dest)
            
            # Update refs.json (public metadata only)
            refs_file = FIXNET_LOCAL / "refs.json"
            refs = []
            if refs_file.exists():
                with open(refs_file) as f:
                    refs = json.load(f)
            
            # Add anonymized reference with branching metadata
            ref_entry = {
                "fix_hash": patch_data["fix_hash"],
                "user_id": self.user_id,
                "timestamp": patch_data["timestamp"],
                "error_type": patch_data["error_type"],
                "script": patch_data["script"],
                "encrypted_file": enc_dest.name,
                "signature_file": sig_dest.name
            }
            
            # Include branching info if this is a variant
            if patch_data.get("is_variant"):
                ref_entry["inspired_by"] = patch_data["inspired_by"]
                ref_entry["variation_reason"] = patch_data["variation_reason"]
                ref_entry["relationship_type"] = "context_variant"
            
            refs.append(ref_entry)
            
            with open(refs_file, 'w') as f:
                json.dump(refs, f, indent=2)
            
            # Git commit and push
            subprocess.run(["git", "add", "."], cwd=FIXNET_LOCAL, check=True)
            
            commit_msg = f"[LuciferAI AutoFix][user: {self.user_id}][script: {patch_data['script']}]"
            subprocess.run(
                ["git", "commit", "-m", commit_msg],
                cwd=FIXNET_LOCAL,
                check=True
            )
            
            # Get commit hash
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=FIXNET_LOCAL,
                capture_output=True,
                text=True
            )
            commit_hash = result.stdout.strip()[:7]
            
            # Push (might fail if no remote configured)
            push_result = subprocess.run(
                ["git", "push"],
                cwd=FIXNET_LOCAL,
                capture_output=True
            )
            
            if push_result.returncode == 0:
                commit_url = f"{GITHUB_REPO}/commit/{commit_hash}"
                print(f"{GREEN}🌍 Uploaded to GitHub: {commit_url}{RESET}")
                
                # Log commit
                self.commit_history.append({
                    "commit_hash": commit_hash,
                    "commit_url": commit_url,
                    "timestamp": datetime.now().isoformat(),
                    "fix_hash": patch_data["fix_hash"],
                    "patch": enc_dest.name
                })
                self._save_commit_log()
                
                return commit_url
            else:
                print(f"{GOLD}⚠️  Committed locally (push failed - configure remote){RESET}")
                return f"local://{commit_hash}"
        
        except Exception as e:
            print(f"{RED}❌ Upload failed: {e}{RESET}")
            return None
    
    def full_fix_upload_flow(self,
                            script_path: str,
                            error: str,
                            solution: str,
                            context: Dict[str, Any] = None,
                            inspired_by: Optional[str] = None,
                            variation_reason: Optional[str] = None,
                            force_upload: bool = False) -> Tuple[Optional[str], bool, Optional[str]]:
        """
        Complete flow: create → filter → encrypt → sign → upload.
        
        Args:
            script_path: Path to fixed script
            error: Original error
            solution: Fix solution
            context: Additional context
            inspired_by: Hash of fix that inspired this one
            variation_reason: Why this variation was needed
            force_upload: Skip smart filter (for testing)
        
        Returns:
            (commit_url, was_uploaded, fix_hash)
        """
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{PURPLE}🌐 LuciferAI FixNet Upload{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        context = context or {}
        error_type = self._classify_error(error)
        
        # Step 0: Smart filtering (decide if upload is needed)
        if not force_upload and self.smart_filter:
            should_upload, reason = self.smart_filter.should_upload(
                error=error,
                solution=solution,
                error_type=error_type,
                inspired_by={'fix_hash': inspired_by} if inspired_by else None
            )
            
            print(f"{GOLD}[0/4] Smart upload filter:{RESET}")
            print(f"      {reason}")
            
            if not should_upload:
                # Still create patch locally for dictionary
                patch_info = self.create_fix_patch(
                    script_path, error, solution, context,
                    inspired_by=inspired_by,
                    variation_reason=variation_reason
                )
                print(f"\n{BLUE}📝 Fix saved locally (not uploaded globally){RESET}")
                return (None, False, patch_info['fix_hash'])
            
            print(f"      {GREEN}✓ Proceeding with upload{RESET}\n")
        
        # Step 1: Create patch
        print(f"{GOLD}[1/4] Creating fix patch...{RESET}")
        if inspired_by:
            print(f"{PURPLE}      🌿 Branched from: {inspired_by[:12]}...{RESET}")
            if variation_reason:
                print(f"{CYAN}      📝 Reason: {variation_reason}{RESET}")
        patch_info = self.create_fix_patch(
            script_path, error, solution, context,
            inspired_by=inspired_by,
            variation_reason=variation_reason
        )
        
        # Step 2: Encrypt
        print(f"{GOLD}[2/4] Encrypting patch...{RESET}")
        encrypted = self.encrypt_patch(patch_info["patch_file"])
        if not encrypted:
            return (None, False, patch_info['fix_hash'])
        
        # Step 3: Sign
        print(f"{GOLD}[3/4] Creating signature...{RESET}")
        signature = self.sign_file(encrypted)
        if not signature:
            return (None, False, patch_info['fix_hash'])
        
        # Step 4: Upload
        print(f"{GOLD}[4/4] Uploading to GitHub...{RESET}")
        commit_url = self.upload_to_github(encrypted, signature, patch_info["patch_data"])
        
        if commit_url:
            print(f"\n{GREEN}✅ Fix successfully uploaded!{RESET}")
            print(f"{BLUE}🔗 Link: {commit_url}{RESET}")
            print(f"{GOLD}📊 Fix Hash: {patch_info['fix_hash'][:12]}...{RESET}")
            if inspired_by:
                print(f"{PURPLE}🌳 Context branch created in consensus{RESET}")
            print()
            return (commit_url, True, patch_info['fix_hash'])
        
        return (None, False, patch_info['fix_hash'])
    
    def _classify_error(self, error: str) -> str:
        """Classify error type for dictionary."""
        error_lower = error.lower()
        
        if "nameerror" in error_lower:
            return "NameError"
        elif "syntaxerror" in error_lower:
            return "SyntaxError"
        elif "importerror" in error_lower or "modulenotfound" in error_lower:
            return "ImportError"
        elif "typeerror" in error_lower:
            return "TypeError"
        elif "attributeerror" in error_lower:
            return "AttributeError"
        elif "keyerror" in error_lower:
            return "KeyError"
        elif "indexerror" in error_lower:
            return "IndexError"
        elif "valueerror" in error_lower:
            return "ValueError"
        else:
            return "Unknown"


# Test FixNet uploader
if __name__ == "__main__":
    print(f"{PURPLE}🧪 Testing FixNet Uploader{RESET}\n")
    
    uploader = FixNetUploader()
    
    print(f"{GOLD}User ID: {uploader.user_id}{RESET}\n")
    
    # Simulate a fix
    test_script = "test_parser.py"
    test_error = "NameError: name 'session' is not defined"
    test_solution = "Added import: from core import session"
    test_context = {
        "line": 42,
        "function": "parse_request",
        "attempted_fixes": 1
    }
    
    # Run full upload flow
    commit_url = uploader.full_fix_upload_flow(
        test_script,
        test_error,
        test_solution,
        test_context
    )
    
    if commit_url:
        print(f"{GREEN}✨ Test complete - fix uploaded!{RESET}")
    else:
        print(f"{GOLD}⚠️  Test complete - upload skipped (configure GitHub remote){RESET}")
    
    print(f"\n{BLUE}📂 Check files at:{RESET}")
    print(f"  Fixes: {FIXES_DIR}")
    print(f"  FixNet: {FIXNET_LOCAL}")
