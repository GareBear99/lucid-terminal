"""
GitHub Integration Module
Handles GitHub repository operations: searching, cloning, downloading source, dependency analysis
"""

import os
import json
import subprocess
from typing import Dict, List, Optional, Tuple
from pathlib import Path

class GitHubIntegration:
    """Manages GitHub repository operations"""
    
    def __init__(self, base_dir: str = None):
        self.base_dir = base_dir or os.path.expanduser("~/Downloads/github_repos")
        os.makedirs(self.base_dir, exist_ok=True)
    
    def search_repository(self, query: str, max_results: int = 5) -> List[Dict]:
        """
        Search GitHub for repositories using gh CLI or curl
        Returns list of repository info dicts
        """
        results = []
        
        # Try using gh CLI first
        if self._is_gh_installed():
            results = self._search_with_gh(query, max_results)
        else:
            # Fallback to GitHub API with curl
            results = self._search_with_curl(query, max_results)
        
        return results
    
    def _is_gh_installed(self) -> bool:
        """Check if GitHub CLI (gh) is installed"""
        try:
            subprocess.run(['gh', '--version'], capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    def _search_with_gh(self, query: str, max_results: int) -> List[Dict]:
        """Search using gh CLI"""
        try:
            cmd = ['gh', 'repo', 'search', query, '--limit', str(max_results), '--json', 
                   'name,owner,description,url,stargazersCount,language']
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            repos = json.loads(result.stdout)
            
            return [
                {
                    'name': repo['name'],
                    'owner': repo['owner']['login'] if 'owner' in repo else 'unknown',
                    'full_name': f"{repo['owner']['login']}/{repo['name']}" if 'owner' in repo else repo['name'],
                    'description': repo.get('description', 'No description'),
                    'url': repo['url'],
                    'stars': repo.get('stargazersCount', 0),
                    'language': repo.get('language', 'Unknown')
                }
                for repo in repos
            ]
        except Exception as e:
            print(f"Error searching with gh: {e}")
            return []
    
    def _search_with_curl(self, query: str, max_results: int) -> List[Dict]:
        """Search using GitHub API with curl"""
        try:
            url = f"https://api.github.com/search/repositories?q={query}&per_page={max_results}&sort=stars"
            cmd = ['curl', '-s', url]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            
            repos = data.get('items', [])
            return [
                {
                    'name': repo['name'],
                    'owner': repo['owner']['login'],
                    'full_name': repo['full_name'],
                    'description': repo.get('description', 'No description'),
                    'url': repo['html_url'],
                    'stars': repo.get('stargazers_count', 0),
                    'language': repo.get('language', 'Unknown')
                }
                for repo in repos
            ]
        except Exception as e:
            print(f"Error searching with curl: {e}")
            return []
    
    def clone_repository(self, repo_url: str, destination: str = None) -> Tuple[bool, str]:
        """
        Clone a GitHub repository
        Returns (success, path_or_error)
        """
        if not self._is_git_installed():
            return False, "Git is not installed. Please install git first."
        
        # Determine destination
        if destination is None:
            repo_name = repo_url.rstrip('/').split('/')[-1].replace('.git', '')
            destination = os.path.join(self.base_dir, repo_name)
        
        # Clone the repository
        try:
            cmd = ['git', 'clone', repo_url, destination]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return True, destination
        except subprocess.CalledProcessError as e:
            return False, f"Clone failed: {e.stderr}"
    
    def _is_git_installed(self) -> bool:
        """Check if git is installed"""
        try:
            subprocess.run(['git', '--version'], capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    def download_source_archive(self, repo_full_name: str, destination: str = None) -> Tuple[bool, str]:
        """
        Download repository source as zip archive without cloning
        repo_full_name: 'owner/repo' format
        Returns (success, path_or_error)
        """
        if destination is None:
            repo_name = repo_full_name.split('/')[-1]
            destination = os.path.join(self.base_dir, f"{repo_name}.zip")
        
        # Download using curl
        url = f"https://github.com/{repo_full_name}/archive/refs/heads/main.zip"
        
        try:
            cmd = ['curl', '-L', '-o', destination, url]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            # Check if file was created
            if os.path.exists(destination) and os.path.getsize(destination) > 0:
                return True, destination
            else:
                # Try 'master' branch if 'main' didn't work
                url = f"https://github.com/{repo_full_name}/archive/refs/heads/master.zip"
                cmd = ['curl', '-L', '-o', destination, url]
                result = subprocess.run(cmd, capture_output=True, text=True, check=True)
                
                if os.path.exists(destination) and os.path.getsize(destination) > 0:
                    return True, destination
                else:
                    return False, "Failed to download repository archive"
        except subprocess.CalledProcessError as e:
            return False, f"Download failed: {e.stderr}"
    
    def analyze_dependencies(self, repo_path: str) -> Dict[str, List[str]]:
        """
        Analyze repository dependencies from common dependency files
        Returns dict with dependency types and lists
        """
        dependencies = {
            'python': [],
            'javascript': [],
            'go': [],
            'rust': [],
            'ruby': [],
            'other': []
        }
        
        # Python dependencies
        for dep_file in ['requirements.txt', 'Pipfile', 'pyproject.toml', 'setup.py']:
            file_path = os.path.join(repo_path, dep_file)
            if os.path.exists(file_path):
                dependencies['python'].extend(self._parse_python_deps(file_path))
        
        # JavaScript dependencies
        package_json = os.path.join(repo_path, 'package.json')
        if os.path.exists(package_json):
            dependencies['javascript'].extend(self._parse_js_deps(package_json))
        
        # Go dependencies
        go_mod = os.path.join(repo_path, 'go.mod')
        if os.path.exists(go_mod):
            dependencies['go'].extend(self._parse_go_deps(go_mod))
        
        # Rust dependencies
        cargo_toml = os.path.join(repo_path, 'Cargo.toml')
        if os.path.exists(cargo_toml):
            dependencies['rust'].extend(self._parse_rust_deps(cargo_toml))
        
        # Ruby dependencies
        gemfile = os.path.join(repo_path, 'Gemfile')
        if os.path.exists(gemfile):
            dependencies['ruby'].extend(self._parse_ruby_deps(gemfile))
        
        return dependencies
    
    def _parse_python_deps(self, file_path: str) -> List[str]:
        """Parse Python dependency file"""
        deps = []
        try:
            with open(file_path, 'r') as f:
                content = f.read()
                # Simple parsing - extract package names
                for line in content.split('\n'):
                    line = line.strip()
                    if line and not line.startswith('#'):
                        # Extract package name before version specifier
                        pkg = line.split('==')[0].split('>=')[0].split('<=')[0].split('>')[0].split('<')[0].strip()
                        if pkg:
                            deps.append(pkg)
        except Exception:
            pass
        return deps
    
    def _parse_js_deps(self, file_path: str) -> List[str]:
        """Parse JavaScript package.json"""
        deps = []
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                if 'dependencies' in data:
                    deps.extend(data['dependencies'].keys())
                if 'devDependencies' in data:
                    deps.extend(data['devDependencies'].keys())
        except Exception:
            pass
        return deps
    
    def _parse_go_deps(self, file_path: str) -> List[str]:
        """Parse Go go.mod file"""
        deps = []
        try:
            with open(file_path, 'r') as f:
                in_require = False
                for line in f:
                    line = line.strip()
                    if line.startswith('require'):
                        in_require = True
                        continue
                    if in_require:
                        if line == ')':
                            break
                        if line and not line.startswith('//'):
                            pkg = line.split()[0]
                            deps.append(pkg)
        except Exception:
            pass
        return deps
    
    def _parse_rust_deps(self, file_path: str) -> List[str]:
        """Parse Rust Cargo.toml"""
        deps = []
        try:
            with open(file_path, 'r') as f:
                in_deps = False
                for line in f:
                    line = line.strip()
                    if line.startswith('[dependencies]'):
                        in_deps = True
                        continue
                    if in_deps:
                        if line.startswith('['):
                            break
                        if '=' in line:
                            pkg = line.split('=')[0].strip()
                            deps.append(pkg)
        except Exception:
            pass
        return deps
    
    def _parse_ruby_deps(self, file_path: str) -> List[str]:
        """Parse Ruby Gemfile"""
        deps = []
        try:
            with open(file_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('gem'):
                        # Extract gem name
                        parts = line.split()
                        if len(parts) >= 2:
                            gem = parts[1].strip('\'"')
                            deps.append(gem)
        except Exception:
            pass
        return deps
    
    def find_similar_fixes(self, error_message: str, language: str = None) -> List[Dict]:
        """
        Search GitHub for issues/code that might contain fixes for the error
        Returns list of potential fix sources
        """
        # Clean error message for search
        clean_error = error_message.replace('\n', ' ').strip()[:100]
        
        # Build search query
        query = f'"{clean_error}"'
        if language:
            query += f' language:{language}'
        
        # Search for repos and issues
        repos = self.search_repository(query, max_results=3)
        
        return repos
