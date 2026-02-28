#!/usr/bin/env python3
"""
🩸 LuciferAI Environment Scanner
Find and manage ALL virtual environments on the system:
- Conda environments
- venv/virtualenv
- pyenv
- Luci environments
- Custom environments
"""
import os
import sys
import json
import subprocess
from pathlib import Path
from typing import List, Dict, Optional

# Colors
PURPLE = '\033[35m'
GREEN = '\033[32m'
RED = '\033[31m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
CYAN = '\033[36m'
DIM = '\033[2m'
RESET = '\033[0m'

# Common environment locations
COMMON_ENV_DIRS = [
    Path.home() / ".virtualenvs",
    Path.home() / ".pyenv" / "versions",
    Path.home() / ".local" / "share" / "virtualenvs",
    Path.home() / "envs",
    Path.home() / "venv",
    Path.home() / ".venv",
    Path.home() / ".conda" / "envs",
    Path.home() / ".luci_environments" / "envs",
    Path.home() / ".luciferai" / "global_env",
]


class EnvironmentScanner:
    """Scan and discover all virtual environments."""
    
    def __init__(self):
        self.environments = []
        self.conda_envs = []
        self.pyenv_envs = []
        self.luci_envs = []
        self.venv_envs = []
        self.active_env = None
        self.active_env_type = None
    
    def scan_all(self):
        """Scan for all environment types."""
        print(f"{YELLOW}🔍 Scanning for virtual environments...{RESET}\n")
        
        self._detect_active_environment()
        self._scan_conda_environments()
        self._scan_luci_environments()
        self._scan_pyenv_environments()
        self._scan_venv_environments()
        self._scan_common_locations()
    
    def _detect_active_environment(self):
        """Detect currently active environment."""
        # Check Conda
        if os.environ.get('CONDA_DEFAULT_ENV'):
            self.active_env = os.environ['CONDA_DEFAULT_ENV']
            self.active_env_type = 'conda'
            return
        
        # Check VIRTUAL_ENV (venv/virtualenv)
        if os.environ.get('VIRTUAL_ENV'):
            self.active_env = os.environ['VIRTUAL_ENV']
            self.active_env_type = 'venv'
            return
        
        # Check Luci environment
        luci_env_file = Path.home() / ".luci_environments" / ".active_env"
        if luci_env_file.exists():
            self.active_env = luci_env_file.read_text().strip()
            self.active_env_type = 'luci'
            return
        
        # Check PYENV
        if os.environ.get('PYENV_VERSION'):
            self.active_env = os.environ['PYENV_VERSION']
            self.active_env_type = 'pyenv'
            return
    
    def _scan_conda_environments(self):
        """Scan for Conda environments."""
        try:
            result = subprocess.run(
                ["conda", "env", "list", "--json"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                for env_path in data.get('envs', []):
                    env_path = Path(env_path)
                    name = env_path.name
                    
                    # Get Python version
                    python_exe = env_path / "bin" / "python"
                    py_version = self._get_python_version(python_exe)
                    
                    self.conda_envs.append({
                        'name': name,
                        'path': str(env_path),
                        'type': 'conda',
                        'python_version': py_version,
                        'active': (name == self.active_env and self.active_env_type == 'conda')
                    })
        except FileNotFoundError:
            pass  # Conda not installed
        except Exception as e:
            print(f"{DIM}⚠️  Could not scan conda: {e}{RESET}")
    
    def _scan_luci_environments(self):
        """Scan for Luci environments."""
        luci_envs_dir = Path.home() / ".luci_environments" / "envs"
        
        if not luci_envs_dir.exists():
            return
        
        for env_dir in luci_envs_dir.iterdir():
            if env_dir.is_dir():
                python_exe = env_dir / "bin" / "python"
                if python_exe.exists():
                    py_version = self._get_python_version(python_exe)
                    
                    self.luci_envs.append({
                        'name': env_dir.name,
                        'path': str(env_dir),
                        'type': 'luci',
                        'python_version': py_version,
                        'active': (env_dir.name == self.active_env and self.active_env_type == 'luci')
                    })
    
    def _scan_pyenv_environments(self):
        """Scan for pyenv environments."""
        try:
            result = subprocess.run(
                ["pyenv", "versions", "--bare"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                for version in result.stdout.strip().split('\n'):
                    if version:
                        pyenv_root = Path.home() / ".pyenv" / "versions" / version
                        if pyenv_root.exists():
                            python_exe = pyenv_root / "bin" / "python"
                            
                            self.pyenv_envs.append({
                                'name': version,
                                'path': str(pyenv_root),
                                'type': 'pyenv',
                                'python_version': version,
                                'active': (version == self.active_env and self.active_env_type == 'pyenv')
                            })
        except FileNotFoundError:
            pass  # pyenv not installed
        except Exception as e:
            print(f"{DIM}⚠️  Could not scan pyenv: {e}{RESET}")
    
    def _scan_venv_environments(self):
        """Scan for venv/virtualenv in common locations."""
        searched_paths = set()
        
        for base_dir in COMMON_ENV_DIRS:
            if not base_dir.exists():
                continue
            
            if base_dir in searched_paths:
                continue
            searched_paths.add(base_dir)
            
            # Check if this is itself a venv
            if self._is_venv(base_dir):
                python_exe = base_dir / "bin" / "python"
                py_version = self._get_python_version(python_exe)
                
                # Skip if already found in Luci envs
                if any(env['path'] == str(base_dir) for env in self.luci_envs):
                    continue
                
                self.venv_envs.append({
                    'name': base_dir.name,
                    'path': str(base_dir),
                    'type': 'venv',
                    'python_version': py_version,
                    'active': (str(base_dir) == self.active_env and self.active_env_type == 'venv')
                })
            
            # Check subdirectories
            try:
                for subdir in base_dir.iterdir():
                    if subdir.is_dir() and self._is_venv(subdir):
                        python_exe = subdir / "bin" / "python"
                        py_version = self._get_python_version(python_exe)
                        
                        # Skip if already found
                        if any(env['path'] == str(subdir) for env in self.luci_envs):
                            continue
                        
                        self.venv_envs.append({
                            'name': subdir.name,
                            'path': str(subdir),
                            'type': 'venv',
                            'python_version': py_version,
                            'active': (str(subdir) == self.active_env and self.active_env_type == 'venv')
                        })
            except PermissionError:
                continue
    
    def _scan_common_locations(self):
        """Scan current directory and common project locations for venvs."""
        # Check current directory
        cwd = Path.cwd()
        for venv_name in ['venv', '.venv', 'env', '.env', 'virtualenv']:
            venv_path = cwd / venv_name
            if venv_path.exists() and self._is_venv(venv_path):
                # Skip if already found
                if any(env['path'] == str(venv_path) for env in self.venv_envs):
                    continue
                
                python_exe = venv_path / "bin" / "python"
                py_version = self._get_python_version(python_exe)
                
                self.venv_envs.append({
                    'name': f"{cwd.name}/{venv_name}",
                    'path': str(venv_path),
                    'type': 'venv',
                    'python_version': py_version,
                    'active': (str(venv_path) == self.active_env and self.active_env_type == 'venv')
                })
    
    def _is_venv(self, path: Path) -> bool:
        """Check if a directory is a virtual environment."""
        # Check for common venv markers
        indicators = [
            path / "bin" / "python",
            path / "bin" / "activate",
            path / "pyvenv.cfg",
        ]
        
        return any(ind.exists() for ind in indicators)
    
    def _get_python_version(self, python_exe: Path) -> str:
        """Get Python version from executable."""
        if not python_exe.exists():
            return "unknown"
        
        try:
            result = subprocess.run(
                [str(python_exe), "--version"],
                capture_output=True,
                text=True,
                timeout=2
            )
            version = result.stdout.strip().replace("Python ", "")
            return version if version else "unknown"
        except:
            return "unknown"
    
    def display_summary(self):
        """Display summary of found environments."""
        print(f"{PURPLE}╔════════════════════════════════════════════════════════════╗{RESET}")
        print(f"{PURPLE}║        🩸 LuciferAI Environment Scanner                   ║{RESET}")
        print(f"{PURPLE}╚════════════════════════════════════════════════════════════╝{RESET}\n")
        
        # Show active environment
        if self.active_env:
            print(f"{GREEN}🎯 Active Environment:{RESET}")
            print(f"  {CYAN}{self.active_env}{RESET} {DIM}({self.active_env_type}){RESET}\n")
        else:
            print(f"{DIM}No environment currently active{RESET}\n")
        
        # Summary counts
        print(f"{CYAN}📊 Found Environments:{RESET}\n")
        
        if self.conda_envs:
            print(f"  {BLUE}Conda:{RESET}      {len(self.conda_envs)} environments")
        
        if self.luci_envs:
            print(f"  {PURPLE}Luci:{RESET}       {len(self.luci_envs)} environments")
        
        if self.pyenv_envs:
            print(f"  {YELLOW}Pyenv:{RESET}      {len(self.pyenv_envs)} environments")
        
        if self.venv_envs:
            print(f"  {GREEN}Venv:{RESET}       {len(self.venv_envs)} environments")
        
        total = len(self.conda_envs) + len(self.luci_envs) + len(self.pyenv_envs) + len(self.venv_envs)
        print(f"\n  {CYAN}Total:{RESET}      {total} environments")
        print()
    
    def display_detailed(self):
        """Display detailed list of all environments."""
        self.display_summary()
        
        print(f"{PURPLE}═══════════════════════════════════════════════════════════{RESET}\n")
        
        # Luci Environments
        if self.luci_envs:
            print(f"{PURPLE}🩸 Luci Environments:{RESET}\n")
            for env in self.luci_envs:
                self._print_env(env)
            print()
        
        # Conda Environments
        if self.conda_envs:
            print(f"{BLUE}🐍 Conda Environments:{RESET}\n")
            for env in self.conda_envs:
                self._print_env(env)
            print()
        
        # Pyenv Environments
        if self.pyenv_envs:
            print(f"{YELLOW}🔧 Pyenv Environments:{RESET}\n")
            for env in self.pyenv_envs:
                self._print_env(env)
            print()
        
        # Venv Environments
        if self.venv_envs:
            print(f"{GREEN}📦 Venv/Virtualenv Environments:{RESET}\n")
            for env in self.venv_envs:
                self._print_env(env)
            print()
        
        print(f"{PURPLE}═══════════════════════════════════════════════════════════{RESET}\n")
        
        # Show activation instructions
        print(f"{YELLOW}💡 Activation Commands:{RESET}\n")
        
        if self.luci_envs:
            print(f"  {PURPLE}Luci:{RESET}       {BLUE}source <(luci activate <name>){RESET}")
        
        if self.conda_envs:
            print(f"  {BLUE}Conda:{RESET}      {BLUE}conda activate <name>{RESET}")
        
        if self.pyenv_envs:
            print(f"  {YELLOW}Pyenv:{RESET}      {BLUE}pyenv activate <name>{RESET}")
        
        if self.venv_envs:
            print(f"  {GREEN}Venv:{RESET}       {BLUE}source /path/to/env/bin/activate{RESET}")
        
        print()
    
    def _print_env(self, env: Dict):
        """Print a single environment."""
        marker = f"{GREEN}* " if env['active'] else "  "
        name_color = GREEN if env['active'] else CYAN
        
        print(f"{marker}{name_color}{env['name']}{RESET}")
        print(f"    Type: {env['type']}")
        print(f"    Python: {env['python_version']}")
        print(f"    Path: {DIM}{env['path']}{RESET}")
        
        if env['active']:
            print(f"    {GREEN}✓ Currently Active{RESET}")
        
        print()
    
    def get_activation_command(self, env_name: str) -> Optional[str]:
        """Get the activation command for a specific environment."""
        # Check Luci
        for env in self.luci_envs:
            if env['name'] == env_name:
                return f"source <(luci activate {env_name})"
        
        # Check Conda
        for env in self.conda_envs:
            if env['name'] == env_name:
                return f"conda activate {env_name}"
        
        # Check Pyenv
        for env in self.pyenv_envs:
            if env['name'] == env_name:
                return f"pyenv activate {env_name}"
        
        # Check Venv
        for env in self.venv_envs:
            if env['name'] == env_name:
                return f"source {env['path']}/bin/activate"
        
        return None


def scan_environments():
    """Scan and display all environments."""
    scanner = EnvironmentScanner()
    scanner.scan_all()
    scanner.display_detailed()
    return scanner


def search_environment(query: str):
    """Search for environments matching query across all package managers.
    
    This comprehensively searches:
    - Conda environments
    - Luci environments
    - Pyenv versions
    - venv/virtualenv in common locations
    - Poetry environments
    - Pipenv environments
    - Project-local venvs
    """
    scanner = EnvironmentScanner()
    scanner.scan_all()
    
    print(f"{PURPLE}╔════════════════════════════════════════════════════════════╗{RESET}")
    print(f"{PURPLE}║        🔍 Environment Search: {CYAN}{query}{PURPLE}{' ' * (29 - len(query))}║{RESET}")
    print(f"{PURPLE}╚════════════════════════════════════════════════════════════╝{RESET}\n")
    
    # Collect all environments
    all_envs = scanner.conda_envs + scanner.luci_envs + scanner.pyenv_envs + scanner.venv_envs
    
    # Search by name (case-insensitive)
    query_lower = query.lower()
    matches = []
    
    for env in all_envs:
        # Match on name
        if query_lower in env['name'].lower():
            matches.append(env)
            continue
        
        # Match on path
        if query_lower in env['path'].lower():
            matches.append(env)
            continue
        
        # Match on Python version
        if query_lower in env['python_version'].lower():
            matches.append(env)
            continue
        
        # Match on type
        if query_lower in env['type'].lower():
            matches.append(env)
            continue
    
    # Remove duplicates (same path)
    seen_paths = set()
    unique_matches = []
    for env in matches:
        if env['path'] not in seen_paths:
            seen_paths.add(env['path'])
            unique_matches.append(env)
    
    matches = unique_matches
    
    if not matches:
        print(f"{RED}❌ No environments found matching '{query}'{RESET}")
        print()
        print(f"{YELLOW}💡 Tips:{RESET}")
        print(f"  • Try a shorter search term (e.g., 'py' instead of 'python')")
        print(f"  • Search by type: 'conda', 'venv', 'luci', 'pyenv'")
        print(f"  • Search by Python version: '3.9', '3.11', etc.")
        print(f"  • List all environments: {CYAN}environments{RESET} or {CYAN}envs{RESET}")
        print()
        return scanner
    
    # Group matches by type for better organization
    matches_by_type = {
        'conda': [],
        'luci': [],
        'pyenv': [],
        'venv': []
    }
    
    for env in matches:
        matches_by_type[env['type']].append(env)
    
    # Display results grouped by type
    print(f"{GREEN}✓ Found {len(matches)} matching environment(s):{RESET}\n")
    
    for env_type, envs in matches_by_type.items():
        if not envs:
            continue
        
        # Type header with icon
        type_icons = {
            'conda': f"{BLUE}🐍 Conda",
            'luci': f"{PURPLE}🩸 Luci",
            'pyenv': f"{YELLOW}🔧 Pyenv",
            'venv': f"{GREEN}📦 Venv/Virtualenv"
        }
        
        print(f"{type_icons.get(env_type, env_type.title())}:{RESET} {DIM}({len(envs)} found){RESET}\n")
        
        for env in envs:
            scanner._print_env(env)
            
            # Show activation command
            activation_cmd = scanner.get_activation_command(env['name'])
            if activation_cmd:
                print(f"    {YELLOW}💡 Activate:{RESET} {BLUE}{activation_cmd}{RESET}")
            print()
    
    # Summary footer
    print(f"{PURPLE}═══════════════════════════════════════════════════════════{RESET}\n")
    
    # Show additional info
    active_in_results = any(env['active'] for env in matches)
    if active_in_results:
        print(f"{GREEN}✓ Your currently active environment is in the search results{RESET}")
    else:
        if scanner.active_env:
            print(f"{YELLOW}ℹ  Your active environment '{scanner.active_env}' is not in these results{RESET}")
    
    print()
    
    return scanner


def activate_environment(query: str):
    """Generate activation command for an environment.
    
    Args:
        query: Environment name or path
    
    Returns:
        Activation command to be executed by user
    """
    scanner = EnvironmentScanner()
    scanner.scan_all()
    
    print(f"{PURPLE}╔════════════════════════════════════════════════════════════╗{RESET}")
    print(f"{PURPLE}║        🔥 Activate Environment: {CYAN}{query}{PURPLE}{' ' * (28 - len(query))}║{RESET}")
    print(f"{PURPLE}╚════════════════════════════════════════════════════════════╝{RESET}\n")
    
    # Collect all environments
    all_envs = scanner.conda_envs + scanner.luci_envs + scanner.pyenv_envs + scanner.venv_envs
    
    # Search by name or path (case-insensitive)
    query_lower = query.lower()
    matches = []
    
    for env in all_envs:
        # Exact name match (highest priority)
        if env['name'].lower() == query_lower:
            matches.insert(0, env)  # Add to front
            continue
        
        # Partial name match
        if query_lower in env['name'].lower():
            matches.append(env)
            continue
        
        # Path match
        if query_lower in env['path'].lower():
            matches.append(env)
            continue
    
    # Remove duplicates
    seen_paths = set()
    unique_matches = []
    for env in matches:
        if env['path'] not in seen_paths:
            seen_paths.add(env['path'])
            unique_matches.append(env)
    
    matches = unique_matches
    
    if not matches:
        print(f"{RED}❌ No environment found matching '{query}'{RESET}\n")
        print(f"{YELLOW}💡 Tips:{RESET}")
        print(f"  • List all environments: {CYAN}environments{RESET}")
        print(f"  • Search for environments: {CYAN}env search <query>{RESET}")
        print(f"  • Make sure the environment name is correct")
        print()
        return None
    
    # If multiple matches, show selection
    if len(matches) > 1:
        print(f"{YELLOW}⚠️  Found {len(matches)} matching environments:{RESET}\n")
        
        for i, env in enumerate(matches, 1):
            marker = f"{GREEN}* " if env['active'] else "  "
            name_color = GREEN if env['active'] else CYAN
            
            print(f"{marker}[{i}] {name_color}{env['name']}{RESET}")
            print(f"      Type: {env['type']}")
            print(f"      Python: {env['python_version']}")
            print(f"      Path: {DIM}{env['path']}{RESET}")
            
            if env['active']:
                print(f"      {GREEN}✓ Currently Active{RESET}")
            print()
        
        print(f"{YELLOW}💡 Use exact name or full path to activate specific environment{RESET}")
        print(f"{YELLOW}   Example: activate {matches[0]['name']}{RESET}\n")
        
        return None
    
    # Single match - show activation instructions
    env = matches[0]
    
    print(f"{GREEN}✓ Found environment:{RESET}\n")
    
    marker = f"{GREEN}* " if env['active'] else "  "
    name_color = GREEN if env['active'] else CYAN
    
    print(f"{marker}{name_color}{env['name']}{RESET}")
    print(f"  Type: {env['type']}")
    print(f"  Python: {env['python_version']}")
    print(f"  Path: {DIM}{env['path']}{RESET}")
    
    if env['active']:
        print(f"  {GREEN}✓ Already Active{RESET}")
    
    print()
    
    # Get activation command
    activation_cmd = scanner.get_activation_command(env['name'])
    
    if not activation_cmd:
        # Fallback for venv
        if env['type'] == 'venv':
            activation_cmd = f"source {env['path']}/bin/activate"
    
    if activation_cmd:
        print(f"{PURPLE}═══════════════════════════════════════════════════════════{RESET}\n")
        print(f"{YELLOW}📋 Activation Command:{RESET}\n")
        print(f"  {BLUE}{activation_cmd}{RESET}\n")
        print(f"{PURPLE}═══════════════════════════════════════════════════════════{RESET}\n")
        
        # Instructions
        if env['active']:
            print(f"{GREEN}ℹ  This environment is already active!{RESET}")
        else:
            print(f"{YELLOW}💡 To activate, copy and run the command above in your terminal{RESET}")
            print(f"{DIM}   (LuciferAI cannot directly activate environments in your shell){RESET}")
        
        print()
        
        return activation_cmd
    else:
        print(f"{RED}❌ Could not generate activation command for this environment{RESET}\n")
        return None


if __name__ == "__main__":
    # Test
    scan_environments()
