#!/usr/bin/env python3
"""
🩸 LuciferAI GitHub Uploader
Upload projects to GitHub with encrypted ID-to-username mapping
"""
import os
import sys
import json
import hashlib
import subprocess
from pathlib import Path
from typing import Optional, Dict, Tuple
from datetime import datetime, timedelta

# Colors
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
CYAN = '\033[36m'
DIM = '\033[2m'
RESET = '\033[0m'


class GitHubUploader:
    """Upload projects to GitHub with encrypted user tracking."""
    
    def __init__(self, id_manager=None, project_path: Optional[str] = None):
        """Initialize uploader.
        
        Args:
            id_manager: SystemIDManager instance (will create if None)
            project_path: Path to project directory (uses cwd if None)
        """
        # Set project root
        if project_path:
            self.project_root = Path(project_path)
        else:
            self.project_root = Path.cwd()
        
        self.id_map_file = self.project_root / ".luciferai_ids"
        self.version_file = self.project_root / ".luciferai_version"
        self.rate_limit_file = Path.home() / ".luciferai" / "data" / "github_rate_limits.json"
        
        # Load or use provided system ID
        if id_manager:
            self.id_manager = id_manager
        else:
            try:
                sys.path.insert(0, str(Path(__file__).parent))
                from system_id import get_system_id_manager
                self.id_manager = get_system_id_manager()
            except:
                self.id_manager = None
        
        # Ensure rate limit file directory
        self.rate_limit_file.parent.mkdir(parents=True, exist_ok=True)
    
    def _check_github_validation(self) -> bool:
        """Check if GitHub account is linked and validated."""
        if not self.id_manager or not self.id_manager.has_id():
            return False
        
        github_username = self.id_manager.get_github_username()
        if not github_username:
            return False
        
        # Check if validated on GitHub (would check consensus validation)
        # For now, just check if ID exists
        return True
    
    def _load_rate_limits(self) -> Dict:
        """Load rate limit tracking data."""
        if not self.rate_limit_file.exists():
            return {}
        
        try:
            with open(self.rate_limit_file, 'r') as f:
                return json.load(f)
        except:
            return {}
    
    def _save_rate_limits(self, limits: Dict):
        """Save rate limit tracking data."""
        with open(self.rate_limit_file, 'w') as f:
            json.dump(limits, f, indent=2)
    
    def _check_rate_limit(self, action: str, max_per_hour: int = 5) -> Tuple[bool, Optional[str]]:
        """Check if action is within rate limits."""
        limits = self._load_rate_limits()
        user_id = self.id_manager.get_id() if self.id_manager else "unknown"
        
        # Initialize user limits
        if user_id not in limits:
            limits[user_id] = {}
        
        if action not in limits[user_id]:
            limits[user_id][action] = []
        
        # Get timestamps from last hour
        now = datetime.utcnow()
        one_hour_ago = now - timedelta(hours=1)
        
        # Filter to recent actions
        recent_actions = [
            ts for ts in limits[user_id][action]
            if datetime.fromisoformat(ts) > one_hour_ago
        ]
        
        # Check limit
        if len(recent_actions) >= max_per_hour:
            next_available = datetime.fromisoformat(recent_actions[0]) + timedelta(hours=1)
            wait_time = (next_available - now).seconds // 60
            return (False, f"Rate limit exceeded. Try again in {wait_time} minutes.")
        
        # Add current action
        recent_actions.append(now.isoformat())
        limits[user_id][action] = recent_actions
        
        # Save
        self._save_rate_limits(limits)
        
        return (True, None)
    
    def _encrypt_mapping(self, user_id: str, github_username: str) -> str:
        """Create encrypted mapping of user ID to GitHub username."""
        # Create SHA256 hash of the mapping
        data = f"{user_id}:{github_username}:{datetime.utcnow().isoformat()}"
        encrypted = hashlib.sha256(data.encode()).hexdigest()
        return encrypted
    
    def _load_id_mappings(self) -> Dict:
        """Load existing ID mappings."""
        if not self.id_map_file.exists():
            return {"mappings": [], "version": "1.0"}
        
        try:
            with open(self.id_map_file, 'r') as f:
                return json.load(f)
        except:
            return {"mappings": [], "version": "1.0"}
    
    def _save_id_mapping(self, user_id: str, github_username: str):
        """Save encrypted ID mapping to project."""
        self._save_id_mapping_with_version(user_id, github_username, "unknown", "unknown")
    
    def _save_id_mapping_with_version(self, user_id: str, github_username: str, 
                                      version: str, repo_name: str):
        """Save encrypted ID mapping with version info to project."""
        mappings = self._load_id_mappings()
        
        # Check if this ID already exists
        for mapping in mappings["mappings"]:
            if mapping["user_id_hash"] == hashlib.sha256(user_id.encode()).hexdigest():
                print(f"{YELLOW}ID already logged for this project{RESET}")
                return
        
        # Create new encrypted mapping
        encrypted_full = self._encrypt_mapping(user_id, github_username)
        
        mapping_entry = {
            "user_id_hash": hashlib.sha256(user_id.encode()).hexdigest(),
            "username_hash": hashlib.sha256(github_username.encode()).hexdigest(),
            "encrypted_mapping": encrypted_full,
            "version": version,
            "repository": repo_name,
            "timestamp": datetime.utcnow().isoformat(),
            "luciferai_verified": True
        }
        
        mappings["mappings"].append(mapping_entry)
        
        # Save to file
        with open(self.id_map_file, 'w') as f:
            json.dump(mappings, f, indent=2)
        
        print(f"{GREEN}✅ ID mapping logged (encrypted){RESET}")
        print(f"{DIM}   File: .luciferai_ids{RESET}")
    
    def _check_git_installed(self) -> bool:
        """Check if git is installed."""
        try:
            subprocess.run(['git', '--version'], capture_output=True, check=True)
            return True
        except:
            return False
    
    def _check_gh_cli_installed(self) -> bool:
        """Check if GitHub CLI is installed."""
        try:
            subprocess.run(['gh', '--version'], capture_output=True, check=True)
            return True
        except:
            return False
    
    def _is_git_repo(self) -> bool:
        """Check if current directory is a git repository."""
        return (self.project_root / ".git").exists()
    
    def _init_git_repo(self) -> bool:
        """Initialize git repository."""
        try:
            subprocess.run(['git', 'init'], cwd=self.project_root, check=True)
            print(f"{GREEN}✅ Git repository initialized{RESET}")
            return True
        except:
            print(f"{RED}❌ Failed to initialize git repository{RESET}")
            return False
    
    def _create_gitignore(self):
        """Create .gitignore if it doesn't exist."""
        gitignore = self.project_root / ".gitignore"
        
        if not gitignore.exists():
            default_ignores = [
                ".luc/",
                "__pycache__/",
                "*.pyc",
                ".DS_Store",
                "*.log",
                ".env",
                "venv/",
                "node_modules/"
            ]
            
            with open(gitignore, 'w') as f:
                f.write("\n".join(default_ignores) + "\n")
            
            print(f"{GREEN}✅ Created .gitignore{RESET}")
    
    def _stage_files(self) -> bool:
        """Stage all files for commit."""
        try:
            subprocess.run(['git', 'add', '.'], cwd=self.project_root, check=True)
            print(f"{GREEN}✅ Files staged{RESET}")
            return True
        except:
            print(f"{RED}❌ Failed to stage files{RESET}")
            return False
    
    def _commit_changes(self, message: str) -> bool:
        """Commit changes."""
        try:
            subprocess.run(
                ['git', 'commit', '-m', message],
                cwd=self.project_root,
                check=True,
                capture_output=True
            )
            print(f"{GREEN}✅ Changes committed{RESET}")
            return True
        except subprocess.CalledProcessError as e:
            if b"nothing to commit" in e.stdout or b"nothing to commit" in e.stderr:
                print(f"{YELLOW}⚠️  No changes to commit{RESET}")
                return True
            print(f"{RED}❌ Failed to commit changes{RESET}")
            return False
    
    def _create_github_repo(self, repo_name: str, is_private: bool = False) -> bool:
        """Create GitHub repository using gh CLI."""
        try:
            visibility = '--private' if is_private else '--public'
            
            result = subprocess.run(
                ['gh', 'repo', 'create', repo_name, visibility, '--source', '.', '--push'],
                cwd=self.project_root,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                print(f"{GREEN}✅ GitHub repository created and pushed{RESET}")
                return True
            else:
                print(f"{RED}❌ Failed to create GitHub repository{RESET}")
                print(f"{DIM}{result.stderr}{RESET}")
                return False
        except Exception as e:
            print(f"{RED}❌ Error creating repository: {e}{RESET}")
            return False
    
    def _prompt_version(self) -> str:
        """Prompt user for project version."""
        print(f"{CYAN}Select project version:{RESET}")
        print(f"  {BLUE}1.{RESET} Alpha")
        print(f"  {BLUE}2.{RESET} Beta")
        print(f"  {BLUE}3.{RESET} Release Candidate (RC)")
        print(f"  {BLUE}4.{RESET} Stable")
        print(f"  {BLUE}5.{RESET} Custom")
        print()
        
        while True:
            try:
                choice = input(f"{PURPLE}Version (1-5):{RESET} ").strip()
                
                if choice == '1':
                    return "alpha"
                elif choice == '2':
                    return "beta"
                elif choice == '3':
                    return "rc"
                elif choice == '4':
                    return "stable"
                elif choice == '5':
                    custom = input(f"{PURPLE}Enter custom version:{RESET} ").strip()
                    return custom if custom else "v1.0.0"
                else:
                    print(f"{RED}Invalid choice. Please enter 1-5.{RESET}")
            except (EOFError, KeyboardInterrupt):
                print(f"\n{YELLOW}Cancelled{RESET}")
                return None
    
    def _prompt_visibility(self) -> bool:
        """Prompt user for repository visibility."""
        print(f"\n{CYAN}Repository visibility:{RESET}")
        print(f"  {BLUE}1.{RESET} Public  (Anyone can see this repository)")
        print(f"  {BLUE}2.{RESET} Private (Only you and collaborators can see)")
        print()
        
        while True:
            try:
                choice = input(f"{PURPLE}Visibility (1-2):{RESET} ").strip()
                
                if choice == '1':
                    return False  # Public
                elif choice == '2':
                    return True   # Private
                else:
                    print(f"{RED}Invalid choice. Please enter 1 or 2.{RESET}")
            except (EOFError, KeyboardInterrupt):
                print(f"\n{YELLOW}Cancelled{RESET}")
                return None
    
    def _get_current_version(self) -> Optional[str]:
        """Get current version from version file."""
        if self.version_file.exists():
            try:
                with open(self.version_file, 'r') as f:
                    data = json.load(f)
                    return data.get('version')
            except:
                return None
        return None
    
    def _save_version(self, version: str):
        """Save version to version file."""
        data = {
            'version': version,
            'timestamp': datetime.utcnow().isoformat()
        }
        with open(self.version_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    def _parse_version(self, version: str) -> tuple:
        """Parse version string into components."""
        # Handle semantic versions like v1.2.3 or 1.2.3
        version = version.lstrip('v')
        try:
            parts = version.split('.')
            if len(parts) >= 3:
                return (int(parts[0]), int(parts[1]), int(parts[2]))
            elif len(parts) == 2:
                return (int(parts[0]), int(parts[1]), 0)
            elif len(parts) == 1:
                return (int(parts[0]), 0, 0)
        except:
            return None
    
    def _bump_version(self, current: str) -> Optional[str]:
        """Prompt user to bump version."""
        print(f"\n{CYAN}Current version:{RESET} {GREEN}{current}{RESET}")
        print(f"\n{CYAN}Select version bump:{RESET}")
        print(f"  {BLUE}1.{RESET} Major (X.0.0) - Breaking changes")
        print(f"  {BLUE}2.{RESET} Minor (x.X.0) - New features")
        print(f"  {BLUE}3.{RESET} Patch (x.x.X) - Bug fixes")
        print(f"  {BLUE}4.{RESET} Custom")
        print()
        
        parsed = self._parse_version(current)
        
        while True:
            try:
                choice = input(f"{PURPLE}Bump type (1-4):{RESET} ").strip()
                
                if choice == '1':  # Major
                    if parsed:
                        return f"v{parsed[0] + 1}.0.0"
                    return "v2.0.0"
                elif choice == '2':  # Minor
                    if parsed:
                        return f"v{parsed[0]}.{parsed[1] + 1}.0"
                    return "v1.1.0"
                elif choice == '3':  # Patch
                    if parsed:
                        return f"v{parsed[0]}.{parsed[1]}.{parsed[2] + 1}"
                    return "v1.0.1"
                elif choice == '4':  # Custom
                    custom = input(f"{PURPLE}Enter new version:{RESET} ").strip()
                    return custom if custom else current
                else:
                    print(f"{RED}Invalid choice. Please enter 1-4.{RESET}")
            except (EOFError, KeyboardInterrupt):
                print(f"\n{YELLOW}Cancelled{RESET}")
                return None
    
    def upload_project(self, repo_name: Optional[str] = None, 
                      commit_message: Optional[str] = None,
                      is_private: Optional[bool] = None,
                      version: Optional[str] = None,
                      interactive: bool = True) -> bool:
        """
        Upload project to GitHub with encrypted ID logging.
        
        Args:
            repo_name: Name of GitHub repository (default: current directory name)
            commit_message: Commit message (default: "Initial commit via LuciferAI")
            is_private: Create private repository (prompted if None)
            version: Project version (prompted if None)
            interactive: Enable interactive prompts (default: True)
        """
        print(f"\n{PURPLE}🩸 LuciferAI GitHub Uploader{RESET}\n")
        
        # Check GitHub validation
        if not self._check_github_validation():
            print(f"{RED}❌ GitHub account not linked or validated{RESET}")
            print(f"{YELLOW}This command requires:{RESET}")
            print(f"  1. Linked GitHub account")
            print(f"  2. Validated on GitHub consensus")
            print(f"{BLUE}Run: github link{RESET}\n")
            return False
        
        # Check rate limit (5 uploads per hour)
        can_proceed, error_msg = self._check_rate_limit('upload', max_per_hour=5)
        if not can_proceed:
            print(f"{RED}❌ {error_msg}{RESET}")
            print(f"{YELLOW}Rate limit: 5 uploads per hour{RESET}\n")
            return False
        
        # Get system ID
        if not self.id_manager or not self.id_manager.has_id():
            print(f"{RED}❌ No verified system ID found{RESET}")
            print(f"{YELLOW}Please link your GitHub account first{RESET}")
            print(f"{BLUE}Run: github link{RESET}\n")
            return False
        
        user_id = self.id_manager.get_id()
        github_username = self.id_manager.get_github_username()
        
        print(f"{CYAN}User ID:{RESET} {user_id}")
        print(f"{CYAN}GitHub:{RESET} {github_username}\n")
        
        # Check git installed
        if not self._check_git_installed():
            print(f"{RED}❌ Git is not installed{RESET}")
            print(f"{YELLOW}Install git: https://git-scm.com/{RESET}\n")
            return False
        
        # Check gh CLI installed
        if not self._check_gh_cli_installed():
            print(f"{RED}❌ GitHub CLI (gh) is not installed{RESET}")
            print(f"{YELLOW}Install: brew install gh{RESET}\n")
            return False
        
        # Set defaults
        if not repo_name:
            repo_name = self.project_root.name
        
        # Interactive prompts
        if interactive:
            # Prompt for version
            if version is None:
                version = self._prompt_version()
                if version is None:
                    return False
            
            # Prompt for visibility
            if is_private is None:
                is_private = self._prompt_visibility()
                if is_private is None:
                    return False
        else:
            # Non-interactive defaults
            if version is None:
                version = "alpha"
            if is_private is None:
                is_private = False
        
        # Create commit message with version
        if not commit_message:
            commit_message = f"Initial commit via LuciferAI [{version}]"
        else:
            commit_message = f"{commit_message} [{version}]"
        
        print(f"\n{BLUE}Repository:{RESET} {repo_name}")
        print(f"{BLUE}Version:{RESET} {version}")
        print(f"{BLUE}Visibility:{RESET} {'Private' if is_private else 'Public'}\n")
        
        # Initialize repo if needed
        if not self._is_git_repo():
            print(f"{YELLOW}Initializing git repository...{RESET}")
            if not self._init_git_repo():
                return False
        
        # Create .gitignore
        self._create_gitignore()
        
        # Log encrypted ID mapping with version
        print(f"{CYAN}Logging encrypted ID mapping...{RESET}")
        self._save_id_mapping_with_version(user_id, github_username, version, repo_name)
        
        # Stage files
        print(f"{CYAN}Staging files...{RESET}")
        if not self._stage_files():
            return False
        
        # Commit
        print(f"{CYAN}Committing changes...{RESET}")
        if not self._commit_changes(commit_message):
            return False
        
        # Create and push to GitHub
        print(f"{CYAN}Creating GitHub repository...{RESET}")
        if not self._create_github_repo(repo_name, is_private):
            return False
        
        # Save version
        self._save_version(version)
        
        print(f"\n{GREEN}🎉 Project uploaded successfully!{RESET}")
        print(f"{CYAN}Repository:{RESET} https://github.com/{github_username}/{repo_name}")
        print(f"{CYAN}Version:{RESET} {version}\n")
        
        return True
    
    def update_project(self, commit_message: Optional[str] = None,
                      version: Optional[str] = None) -> bool:
        """
        Update existing GitHub repository with version bump.
        
        Args:
            commit_message: Commit message (prompted if None)
            version: New version (prompted with bump options if None)
        """
        print(f"\n{PURPLE}🩸 LuciferAI GitHub Update{RESET}\n")
        
        # Check GitHub validation
        if not self._check_github_validation():
            print(f"{RED}❌ GitHub account not linked or validated{RESET}")
            print(f"{YELLOW}This command requires:{RESET}")
            print(f"  1. Linked GitHub account")
            print(f"  2. Validated on GitHub consensus")
            print(f"{BLUE}Run: github link{RESET}\n")
            return False
        
        # Check rate limit (10 updates per hour)
        can_proceed, error_msg = self._check_rate_limit('update', max_per_hour=10)
        if not can_proceed:
            print(f"{RED}❌ {error_msg}{RESET}")
            print(f"{YELLOW}Rate limit: 10 updates per hour{RESET}\n")
            return False
        
        # Get system ID
        if not self.id_manager or not self.id_manager.has_id():
            print(f"{RED}❌ No verified system ID found{RESET}")
            print(f"{YELLOW}Please link your GitHub account first{RESET}\n")
            return False
        
        user_id = self.id_manager.get_id()
        github_username = self.id_manager.get_github_username()
        
        print(f"{CYAN}User ID:{RESET} {user_id}")
        print(f"{CYAN}GitHub:{RESET} {github_username}\n")
        
        # Check if git repo
        if not self._is_git_repo():
            print(f"{RED}❌ Not a git repository{RESET}")
            print(f"{YELLOW}Use 'upload project' for new projects{RESET}\n")
            return False
        
        # Get current version
        current_version = self._get_current_version()
        
        if not current_version:
            print(f"{YELLOW}⚠️  No version found. Setting initial version...{RESET}")
            current_version = "v1.0.0"
        
        # Prompt for version bump
        if version is None:
            version = self._bump_version(current_version)
            if version is None:
                return False
        
        # Prompt for commit message
        if not commit_message:
            print(f"\n{CYAN}Commit message:{RESET}")
            commit_message = input(f"{PURPLE}Message (or Enter for default):{RESET} ").strip()
            if not commit_message:
                commit_message = f"Update to {version}"
        
        # Add version to commit message
        commit_message = f"{commit_message} [{version}]"
        
        print(f"\n{BLUE}New Version:{RESET} {version}")
        print(f"{BLUE}Commit:{RESET} {commit_message}\n")
        
        # Update version in mapping
        repo_name = self.project_root.name
        print(f"{CYAN}Updating version in ID mapping...{RESET}")
        self._save_id_mapping_with_version(user_id, github_username, version, repo_name)
        
        # Stage all changes
        print(f"{CYAN}Staging changes...{RESET}")
        if not self._stage_files():
            return False
        
        # Commit
        print(f"{CYAN}Committing changes...{RESET}")
        if not self._commit_changes(commit_message):
            return False
        
        # Push to GitHub
        print(f"{CYAN}Pushing to GitHub...{RESET}")
        try:
            subprocess.run(
                ['git', 'push'],
                cwd=self.project_root,
                check=True,
                capture_output=True
            )
            print(f"{GREEN}✅ Pushed to GitHub{RESET}")
        except subprocess.CalledProcessError as e:
            print(f"{RED}❌ Failed to push{RESET}")
            print(f"{DIM}{e.stderr.decode() if e.stderr else ''}{RESET}")
            return False
        
        # Save new version
        self._save_version(version)
        
        print(f"\n{GREEN}🎉 Repository updated successfully!{RESET}")
        print(f"{CYAN}Version:{RESET} {current_version} → {version}\n")
        
        return True
    
    def fetch_templates(self) -> Dict:
        """
        Fetch templates from GitHub consensus repository.
        
        NOTE: This is a stub method. Template consensus sync is not yet implemented.
        When implemented, this will:
        1. Connect to GitHub consensus repository
        2. Download shared code templates
        3. Return dictionary of template_hash: template_data
        
        Returns:
            Empty dict (feature not yet implemented)
        """
        # TODO: Implement GitHub template consensus sync
        # For now, return empty dict to prevent errors
        return {}
    
    def upload_template(self, template_data: Dict) -> bool:
        """
        Upload template to GitHub consensus repository.
        
        NOTE: This is a stub method. Template consensus sync is not yet implemented.
        When implemented, this will upload user-created templates to share with community.
        
        Args:
            template_data: Template data dictionary
        
        Returns:
            False (feature not yet implemented)
        """
        # TODO: Implement GitHub template consensus upload
        # For now, return False to prevent errors
        return False


def upload_to_github(repo_name: Optional[str] = None,
                    commit_message: Optional[str] = None,
                    is_private: Optional[bool] = None,
                    version: Optional[str] = None,
                    interactive: bool = True) -> bool:
    """
    Upload current project to GitHub.
    
    Args:
        repo_name: Repository name (default: current directory)
        commit_message: Commit message
        is_private: Create private repository (prompted if None)
        version: Project version (prompted if None)
        interactive: Enable interactive prompts
    """
    uploader = GitHubUploader()
    return uploader.upload_project(repo_name, commit_message, is_private, version, interactive)


def update_github_repo(commit_message: Optional[str] = None,
                      version: Optional[str] = None) -> bool:
    """
    Update existing GitHub repository with version bump.
    
    Args:
        commit_message: Commit message (prompted if None)
        version: New version (prompted with bump options if None)
    """
    uploader = GitHubUploader()
    return uploader.update_project(commit_message, version)


if __name__ == "__main__":
    # Test
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "update":
        update_github_repo()
    else:
        upload_to_github()
