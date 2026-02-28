#!/usr/bin/env python3
"""
🩸 Luci Environment Manager
Dynamically creates and manages virtual environments for projects with dependencies
"""
import os
import sys
import json
import subprocess
import hashlib
from pathlib import Path
from typing import Optional, Dict, List, Tuple

# Colors
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
CYAN = '\033[36m'
DIM = '\033[2m'
RESET = '\033[0m'

# Project root
PROJECT_ROOT = Path(__file__).parent.parent
LUCI_ENVS_DIR = PROJECT_ROOT / "luci_environments"
ENVS_METADATA_FILE = LUCI_ENVS_DIR / "environments.json"


class LuciEnvironmentManager:
    """Manages virtual environments for scripts with dependencies."""
    
    def __init__(self):
        """Initialize the environment manager."""
        self.envs_dir = LUCI_ENVS_DIR
        self.envs_dir.mkdir(parents=True, exist_ok=True)
        self.metadata = self._load_metadata()
    
    def _load_metadata(self) -> Dict:
        """Load environment metadata from disk."""
        if ENVS_METADATA_FILE.exists():
            try:
                with open(ENVS_METADATA_FILE, 'r') as f:
                    return json.load(f)
            except:
                return {"environments": {}}
        return {"environments": {}}
    
    def _save_metadata(self):
        """Save environment metadata to disk."""
        try:
            with open(ENVS_METADATA_FILE, 'w') as f:
                json.dump(self.metadata, f, indent=2)
        except Exception as e:
            print(f"{RED}⚠️  Could not save environment metadata: {e}{RESET}")
    
    def _generate_env_name(self, script_path: str, dependencies: List[str]) -> str:
        """Generate a unique environment name based on script location and dependencies."""
        # Create hash from script directory and sorted dependencies
        script_dir = str(Path(script_path).parent)
        deps_string = ",".join(sorted(dependencies))
        content = f"{script_dir}:{deps_string}"
        hash_digest = hashlib.md5(content.encode()).hexdigest()[:8]
        
        # Use script name + hash for readability
        script_name = Path(script_path).stem
        env_name = f"luci_{script_name}_{hash_digest}"
        
        return env_name
    
    def find_or_create_environment(self, script_path: str, dependencies: List[str]) -> Tuple[Optional[str], bool]:
        """
        Find existing environment or create new one for the given script and dependencies.
        
        Returns:
            Tuple of (env_path, is_new) where:
            - env_path: Path to the environment's bin directory, or None if failed
            - is_new: True if a new environment was created, False if existing was found
        """
        if not dependencies:
            return None, False  # No environment needed
        
        env_name = self._generate_env_name(script_path, dependencies)
        env_path = self.envs_dir / env_name
        
        # Check if environment exists and is still valid
        if env_name in self.metadata["environments"]:
            env_info = self.metadata["environments"][env_name]
            
            # Verify environment still exists on disk
            if env_path.exists() and (env_path / "bin" / "python3").exists():
                # Check if dependencies match
                existing_deps = set(env_info.get("dependencies", []))
                requested_deps = set(dependencies)
                
                if existing_deps == requested_deps:
                    print(f"{GREEN}✅ Found existing luci environment: {CYAN}{env_name}{RESET}")
                    print(f"{DIM}   Location: {env_path}{RESET}")
                    print(f"{DIM}   Dependencies: {', '.join(dependencies)}{RESET}")
                    return str(env_path / "bin"), False
        
        # Create new environment
        print(f"{PURPLE}🩸 Creating new luci environment: {CYAN}{env_name}{RESET}")
        print(f"{DIM}   Script: {Path(script_path).name}{RESET}")
        print(f"{DIM}   Dependencies: {', '.join(dependencies)}{RESET}")
        print()
        
        try:
            # Create virtual environment
            print(f"{YELLOW}⚙️  Setting up virtual environment...{RESET}")
            subprocess.run(
                [sys.executable, "-m", "venv", str(env_path)],
                check=True,
                capture_output=True
            )
            
            pip_exe = env_path / "bin" / "pip3"
            
            # Upgrade pip
            print(f"{YELLOW}⚙️  Upgrading pip...{RESET}")
            subprocess.run(
                [str(pip_exe), "install", "--upgrade", "pip", "setuptools", "wheel"],
                check=True,
                capture_output=True,
                timeout=60
            )
            
            # Install dependencies with fallback
            print(f"{YELLOW}⚙️  Installing dependencies...{RESET}")
            for dep in dependencies:
                print(f"{BLUE}   Installing {dep}...{RESET}", end=' ', flush=True)
                success = self._install_dependency(pip_exe, dep)
                if success:
                    print(f"{GREEN}✓{RESET}")
                else:
                    print(f"{YELLOW}⚠️{RESET}")
            
            # Save metadata
            self.metadata["environments"][env_name] = {
                "name": env_name,
                "script_path": str(script_path),
                "dependencies": dependencies,
                "created": str(Path(script_path).parent),
                "python": str(env_path / "bin" / "python3")
            }
            self._save_metadata()
            
            print()
            print(f"{GREEN}✅ Environment created successfully!{RESET}")
            print(f"{DIM}   Location: {env_path}{RESET}")
            
            return str(env_path / "bin"), True
            
        except subprocess.CalledProcessError as e:
            print(f"{RED}❌ Failed to create environment: {e}{RESET}")
            return None, False
        except Exception as e:
            print(f"{RED}❌ Unexpected error: {e}{RESET}")
            return None, False
    
    def _install_dependency(self, pip_exe: Path, package: str) -> bool:
        """
        Install a dependency with full 5-tier fallback cascade.
        
        Returns:
            True if installation succeeded, False otherwise
        """
        # ═══════════════════════════════════════════════════════════
        # TIER 0: Direct pip install
        # ═══════════════════════════════════════════════════════════
        try:
            subprocess.run(
                [str(pip_exe), "install", package],
                check=True,
                capture_output=True,
                timeout=120
            )
            return True
        except:
            pass
        
        # ═══════════════════════════════════════════════════════════
        # TIER 1: Retry with upgraded pip
        # ═══════════════════════════════════════════════════════════
        try:
            subprocess.run(
                [str(pip_exe), "install", "--upgrade", "pip"],
                check=True,
                capture_output=True,
                timeout=60
            )
            subprocess.run(
                [str(pip_exe), "install", package],
                check=True,
                capture_output=True,
                timeout=120
            )
            return True
        except:
            pass
        
        # ═══════════════════════════════════════════════════════════
        # TIER 2: Try alternative package names
        # ═══════════════════════════════════════════════════════════
        alternatives = [
            package.lower(),
            package.replace('-', '_'),
            package.replace('_', '-'),
        ]
        
        for alt in alternatives:
            if alt != package:
                try:
                    subprocess.run(
                        [str(pip_exe), "install", alt],
                        check=True,
                        capture_output=True,
                        timeout=120
                    )
                    return True
                except:
                    continue
        
        # ═══════════════════════════════════════════════════════════
        # TIER 3: Try system package manager (fallback system)
        # ═══════════════════════════════════════════════════════════
        try:
            sys.path.insert(0, str(Path(__file__).parent))
            from fallback_system import get_fallback_system
            fallback = get_fallback_system()
            
            if fallback and fallback.fallback_mirror_download(package):
                # Retry pip after system install
                try:
                    subprocess.run(
                        [str(pip_exe), "install", package],
                        check=True,
                        capture_output=True,
                        timeout=120
                    )
                    return True
                except:
                    pass
        except:
            pass
        
        # All tiers failed
        return False
    
    def activate_environment(self, env_bin_path: str) -> Dict[str, str]:
        """
        Get environment variables to activate the environment.
        
        Returns:
            Dict of environment variables to set (PATH, VIRTUAL_ENV, etc.)
        """
        env_path = Path(env_bin_path).parent
        
        return {
            'VIRTUAL_ENV': str(env_path),
            'PATH': f"{env_bin_path}:{os.environ.get('PATH', '')}",
            'PYTHONHOME': '',  # Unset PYTHONHOME
        }
    
    def run_script_in_environment(self, script_path: str, env_bin_path: Optional[str], timeout: int = 10) -> subprocess.CompletedProcess:
        """
        Run a script in the specified environment.
        
        Args:
            script_path: Path to the Python script
            env_bin_path: Path to environment's bin directory, or None for system Python
            timeout: Execution timeout in seconds
            
        Returns:
            CompletedProcess result
        """
        if env_bin_path:
            python_exe = Path(env_bin_path) / "python3"
        else:
            python_exe = "python3"
        
        # Build environment variables
        env = os.environ.copy()
        if env_bin_path:
            env_vars = self.activate_environment(env_bin_path)
            env.update(env_vars)
        
        # Run script
        result = subprocess.run(
            [str(python_exe), script_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env
        )
        
        return result
    
    def list_environments(self) -> List[Dict]:
        """List all tracked environments."""
        return list(self.metadata["environments"].values())
    
    def cleanup_orphaned_environments(self):
        """Remove environments for scripts that no longer exist."""
        orphaned = []
        
        for env_name, env_info in list(self.metadata["environments"].items()):
            script_path = env_info.get("script_path")
            if script_path and not Path(script_path).exists():
                orphaned.append(env_name)
        
        if orphaned:
            print(f"{YELLOW}🗑️  Cleaning up {len(orphaned)} orphaned environment(s)...{RESET}")
            for env_name in orphaned:
                env_path = self.envs_dir / env_name
                if env_path.exists():
                    import shutil
                    shutil.rmtree(env_path)
                del self.metadata["environments"][env_name]
                print(f"{DIM}   Removed: {env_name}{RESET}")
            
            self._save_metadata()
            print(f"{GREEN}✅ Cleanup complete{RESET}")


def get_luci_env_manager() -> LuciEnvironmentManager:
    """Get a singleton instance of the environment manager."""
    global _env_manager
    if '_env_manager' not in globals():
        _env_manager = LuciEnvironmentManager()
    return _env_manager


# For testing
if __name__ == "__main__":
    manager = LuciEnvironmentManager()
    
    print(f"{PURPLE}╔═══════════════════════════════════════════════════╗")
    print(f"║  🩸 Luci Environment Manager - Test Mode        ║")
    print(f"╚═══════════════════════════════════════════════════╝{RESET}\n")
    
    # List existing environments
    envs = manager.list_environments()
    if envs:
        print(f"{CYAN}Tracked Environments:{RESET}")
        for env in envs:
            print(f"  • {env['name']}")
            print(f"    Script: {env.get('script_path', 'unknown')}")
            print(f"    Deps: {', '.join(env.get('dependencies', []))}")
            print()
    else:
        print(f"{YELLOW}No environments tracked yet{RESET}\n")
