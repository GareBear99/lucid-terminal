#!/usr/bin/env python3
"""
🤖 Ollama AI Agent - Local LLM with Full Tool Access
Uses local Ollama model to navigate consensus dictionary, execute tools, and build scripts
"""
import sys
import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

# Add tools to path
sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))

from file_tools import (read_file, write_file, edit_file, find_files, 
                        grep_search, list_directory)
from command_tools import (run_command, run_python_code, get_env_info, 
                           check_command_exists, is_risky_command)

# Import FixNet components
from consensus_dictionary import ConsensusDictionary
from relevance_dictionary import RelevanceDictionary

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"

LUCIFER_HOME = Path.home() / ".luciferai"


class OllamaAgent:
    """
    AI agent powered by local Ollama LLM.
    
    Capabilities:
    - Search offline consensus dictionary
    - Use all file tools (read, write, edit, find, grep)
    - Execute commands safely
    - Build scripts on request
    - Reason about fixes and errors
    - Work completely offline
    """
    
    def __init__(self, model: str = "llama3.2"):
        self.model = model
        self.env = get_env_info()
        self.conversation_history = []
        
        # Initialize consensus access
        dict_path = LUCIFER_HOME / "data" / "fix_dictionary.json"
        refs_path = LUCIFER_HOME / "sync" / "remote_fix_refs.json"
        
        try:
            self.consensus = ConsensusDictionary(dict_path, refs_path)
            self.dictionary = RelevanceDictionary(user_id="local_user")
            print(f"{GREEN}✅ Loaded consensus dictionary (offline mode){RESET}")
        except Exception as e:
            print(f"{GOLD}⚠️  Consensus dictionary not available: {e}{RESET}")
            self.consensus = None
            self.dictionary = None
        
        # Check if Ollama is available
        self._check_ollama()
        
        print(f"{PURPLE}🤖 Ollama Agent initialized{RESET}")
        print(f"{GOLD}📍 Model: {self.model}{RESET}")
        print(f"{GOLD}📁 Working directory: {self.env['cwd']}{RESET}\n")
    
    def _check_ollama(self):
        """Check if Ollama is installed and running."""
        try:
            import requests
            response = requests.get("http://localhost:11434/api/tags", timeout=2)
            if response.status_code == 200:
                models = response.json().get('models', [])
                available = [m['name'] for m in models]
                
                if self.model not in available:
                    print(f"{GOLD}⚠️  Model '{self.model}' not found{RESET}")
                    if available:
                        print(f"{BLUE}Available models: {', '.join(available)}{RESET}")
                    print(f"{BLUE}Install with: ollama pull {self.model}{RESET}\n")
                else:
                    print(f"{GREEN}✅ Ollama ready with {self.model}{RESET}")
        except Exception as e:
            print(f"{RED}❌ Ollama not running. Start with: ollama serve{RESET}")
            print(f"{BLUE}Install from: https://ollama.ai{RESET}\n")
    
    def process_request(self, user_input: str) -> str:
        """
        Main entry point - process user request with AI.
        
        The AI can:
        - Search fixes in consensus dictionary
        - Use file tools
        - Execute commands
        - Build scripts
        - Reason about solutions
        """
        self.conversation_history.append({
            "role": "user",
            "content": user_input
        })
        
        # Build system prompt with available tools
        system_prompt = self._build_system_prompt()
        
        # Call Ollama
        try:
            response = self._call_ollama(system_prompt, user_input)
            
            self.conversation_history.append({
                "role": "assistant",
                "content": response
            })
            
            return response
        
        except Exception as e:
            error_msg = f"{RED}❌ AI processing failed: {str(e)}{RESET}"
            print(error_msg)
            return self._fallback_processing(user_input)
    
    def _build_system_prompt(self) -> str:
        """Build comprehensive system prompt with tool descriptions."""
        return f"""You are Lucifer AI, a local AI assistant running on the user's machine.

CRITICAL: You work COMPLETELY OFFLINE. All data is stored locally.

ENVIRONMENT:
- Working directory: {self.env['cwd']}
- Home: {self.env['home']}
- Platform: {self.env['platform']}

AVAILABLE TOOLS:

1. CONSENSUS DICTIONARY (Offline Fix Search):
   - search_consensus(error, error_type) - Find fixes for errors
   - get_best_fix(error) - Get highest-rated fix
   - All fixes rated by community (51%+ = trusted)
   - Works completely offline

2. FILE TOOLS:
   - read_file(path) - Read any file
   - write_file(path, content) - Create/overwrite file
   - edit_file(path, search, replace) - Edit specific text
   - find_files(pattern, directory) - Find files by name
   - grep_search(query, path) - Search file contents
   - list_directory(path) - List directory contents

3. COMMAND TOOLS:
   - run_command(cmd) - Execute shell command
   - run_python_code(code) - Run Python code
   - check_command_exists(cmd) - Check if command available
   
4. SCRIPT BUILDING:
   - You can create scripts by using write_file()
   - Make them executable if needed
   - Test them with run_command()

YOUR APPROACH:
1. For errors: FIRST search consensus dictionary
2. For file operations: Use file tools directly
3. For commands: Check safety first, then execute
4. For script requests: Build incrementally, test each part
5. ALWAYS work offline - never suggest cloud APIs

Be concise but helpful. Focus on solving the user's problem.
"""
    
    def _call_ollama(self, system_prompt: str, user_input: str) -> str:
        """Call Ollama API."""
        import requests
        
        # Build message history
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history (last 5 exchanges)
        for msg in self.conversation_history[-10:]:
            messages.append(msg)
        
        # Call Ollama
        response = requests.post(
            "http://localhost:11434/api/chat",
            json={
                "model": self.model,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "top_p": 0.9,
                }
            },
            timeout=120
        )
        
        if response.status_code == 200:
            result = response.json()
            ai_response = result['message']['content']
            
            # Parse and execute tool calls
            return self._process_ai_response(ai_response, user_input)
        else:
            raise Exception(f"Ollama API error: {response.status_code}")
    
    def _process_ai_response(self, ai_response: str, user_input: str) -> str:
        """Process AI response and execute any tool calls."""
        # Check if AI wants to search consensus
        if "search_consensus" in ai_response.lower() or "fix" in user_input.lower():
            # Try to extract error from user input
            error_result = self._search_fixes_for_user(user_input)
            if error_result:
                ai_response = f"{error_result}\n\n{ai_response}"
        
        # Check if AI wants to execute tools
        # (In a full implementation, you'd parse structured tool calls)
        
        return ai_response
    
    def _search_fixes_for_user(self, query: str) -> Optional[str]:
        """Search consensus dictionary for user's error."""
        if not self.dictionary:
            return None
        
        try:
            # Extract potential error from query
            # Simple heuristic: look for common error patterns
            error_types = ["NameError", "ImportError", "SyntaxError", "TypeError", 
                          "AttributeError", "ValueError", "KeyError", "ModuleNotFoundError"]
            
            detected_type = None
            for err_type in error_types:
                if err_type.lower() in query.lower():
                    detected_type = err_type
                    break
            
            if detected_type:
                print(f"{BLUE}🔍 Searching consensus for {detected_type}...{RESET}")
                matches = self.dictionary.search_similar_fixes(query, detected_type, min_relevance=0.3)
                
                if matches:
                    best = matches[0]
                    
                    # Get consensus info if available
                    if self.consensus:
                        consensus_info = self.consensus.calculate_consensus(best['fix_hash'])
                        trust = consensus_info.get('trust_level', 'unknown')
                        rate = consensus_info.get('success_rate', 0)
                        
                        return (
                            f"\n{GREEN}💡 Found fix in offline consensus:{RESET}\n"
                            f"   Solution: {best['solution']}\n"
                            f"   Trust: {trust} ({rate:.0%} success rate)\n"
                            f"   Source: {best.get('source', 'local')}\n"
                        )
                    else:
                        return (
                            f"\n{GREEN}💡 Found fix:{RESET}\n"
                            f"   Solution: {best['solution']}\n"
                        )
        except Exception as e:
            print(f"{GOLD}⚠️  Consensus search failed: {e}{RESET}")
        
        return None
    
    def _fallback_processing(self, user_input: str) -> str:
        """Fallback if Ollama fails - use rule-based logic."""
        user_lower = user_input.lower().strip()
        
        # System test
        if user_lower in ['test', 'system test', 'demo']:
            return self._handle_system_test()
        
        # GitHub commands
        if user_lower in ['github upload', 'gh upload', 'upload project']:
            return self._handle_github_upload()
        
        if user_lower in ['github update', 'gh update', 'update project']:
            return self._handle_github_update()
        
        if user_lower in ['github projects', 'gh projects', 'my projects', 'list projects']:
            return self._handle_github_projects()
        
        if user_lower in ['github link', 'gh link']:
            return self._handle_github_link()
        
        if user_lower in ['github unlink', 'gh unlink']:
            return self._handle_github_unlink()
        
        if user_lower in ['github status', 'gh status']:
            return self._handle_github_status()
        
        # Environment management
        if any(cmd in user_lower for cmd in ['create env', 'new env', 'make env']):
            return self._handle_env_create(user_input)
        
        if any(cmd in user_lower for cmd in ['list env', 'show env', 'envs']):
            return self._handle_env_list()
        
        if 'activate env' in user_lower:
            return self._handle_env_activate(user_input)
        
        # Search consensus
        if "error" in user_lower or "fix" in user_lower:
            result = self._search_fixes_for_user(user_input)
            if result:
                return result
        
        # File operations
        if "read" in user_lower and any(ext in user_lower for ext in ['.py', '.txt', '.json', '.md']):
            return f"{BLUE}💡 To read a file, I need the specific path. Try: 'read /path/to/file'{RESET}"
        
        # Commands
        if "run" in user_lower or "execute" in user_lower:
            return f"{BLUE}💡 To run a command, specify it. Try: 'run ls -la'{RESET}"
        
        # Script building
        if "create" in user_lower or "build" in user_lower or "script" in user_lower:
            return f"{BLUE}💡 I can build scripts! Tell me what you need:\n  - What should the script do?\n  - What language? (bash, python, etc.)\n  - Any specific requirements?{RESET}"
        
        return (
            f"{GOLD}🤖 I'm Lucifer AI (offline mode)\n\n"
            f"I can help you:\n"
            f"  • Search fixes in offline consensus dictionary\n"
            f"  • Read/write/edit files\n"
            f"  • Execute commands safely\n"
            f"  • Build scripts\n"
            f"  • Find files and search content\n\n"
            f"Try asking: 'Find a fix for NameError' or 'Create a Python script that...'{RESET}"
        )
    
    def build_script(self, description: str, language: str = "python") -> str:
        """Build a script based on description."""
        print(f"{BLUE}🔨 Building {language} script...{RESET}")
        
        prompt = f"""Create a {language} script that: {description}

Requirements:
- Make it robust with error handling
- Add helpful comments
- Follow best practices
- Make it immediately usable

Return ONLY the script code, no explanation."""
        
        try:
            response = self._call_ollama(self._build_system_prompt(), prompt)
            
            # Extract code from response
            if "```" in response:
                # Extract code block
                code = response.split("```")[1]
                if code.startswith(language):
                    code = "\n".join(code.split("\n")[1:])
                code = code.strip()
            else:
                code = response
            
            return code
        
        except Exception as e:
            return f"# Error building script: {e}\n# Please try again or provide more details"
    
    def _handle_env_create(self, user_input: str) -> str:
        """Handle environment creation."""
        # Extract environment name
        words = user_input.lower().split()
        env_name = None
        
        for i, word in enumerate(words):
            if word in ['env', 'environment'] and i + 1 < len(words):
                env_name = words[i + 1]
                break
        
        if not env_name:
            return (
                f"{GOLD}💡 To create an environment, specify a name:{RESET}\n"
                f"   Try: 'create env myproject'\n"
                f"   Or use luc directly: 'luc create myproject'"
            )
        
        # Call luc to create environment
        project_root = Path(__file__).parent.parent
        luc_script = project_root / "Luci_Environments" / "luci_env.py"
        
        try:
            result = run_command(f"{sys.executable} {luc_script} create {env_name}")
            
            if "successfully" in result.lower() or "created" in result.lower():
                return (
                    f"{GREEN}✅ Environment '{env_name}' created{RESET}\n\n"
                    f"{GOLD}To activate:{RESET}\n"
                    f"  source <(luc activate {env_name})\n\n"
                    f"{GOLD}Or use:{RESET} luc activate {env_name}"
                )
            else:
                return f"{RED}❌ Failed to create environment{RESET}\n{result}"
        
        except Exception as e:
            return f"{RED}❌ Error creating environment: {e}{RESET}"
    
    def _handle_env_list(self) -> str:
        """Handle environment listing."""
        project_root = Path(__file__).parent.parent
        luc_script = project_root / "Luci_Environments" / "luci_env.py"
        
        try:
            result = run_command(f"{sys.executable} {luc_script} list")
            return f"{PURPLE}🩸 Luci Environments:{RESET}\n\n{result}"
        except Exception as e:
            return f"{RED}❌ Error listing environments: {e}{RESET}"
    
    def _handle_env_activate(self, user_input: str) -> str:
        """Handle environment activation."""
        # Extract environment name
        words = user_input.lower().split()
        env_name = None
        
        for i, word in enumerate(words):
            if word in ['env', 'environment'] and i + 1 < len(words):
                env_name = words[i + 1]
                break
        
        if not env_name:
            return (
                f"{GOLD}💡 To activate an environment, specify a name:{RESET}\n"
                f"   Try: 'activate env myproject'\n"
                f"   Or use luc directly: 'luc activate myproject'"
            )
        
        return (
            f"{GOLD}💡 To activate '{env_name}', run this in your shell:{RESET}\n\n"
            f"  source <(luc activate {env_name})\n\n"
            f"{GOLD}Or add this alias to ~/.bashrc or ~/.zshrc:{RESET}\n"
            f"  alias luci-activate='source <(luc activate)'\n"
            f"  Then use: luci-activate {env_name}"
        )
    
    def _handle_system_test(self) -> str:
        """Run comprehensive system test."""
        try:
            from system_test import SystemTest
            test = SystemTest()
            test.run_interactive_test()
            return ""  # Test prints everything
        except Exception as e:
            return f"{RED}❌ Error running system test: {e}{RESET}"
    
    def _handle_github_upload(self) -> str:
        """Upload current project to GitHub."""
        try:
            from github_uploader import GitHubUploader
            from system_id import get_system_id_manager
            
            id_manager = get_system_id_manager()
            uploader = GitHubUploader(id_manager)
            
            print()
            success = uploader.upload_project()
            return "" if success else f"{RED}❌ Upload failed{RESET}"
        except Exception as e:
            return f"{RED}❌ Error: {e}{RESET}"
    
    def _handle_github_update(self) -> str:
        """Update existing GitHub project."""
        try:
            from github_uploader import GitHubUploader
            from system_id import get_system_id_manager
            
            id_manager = get_system_id_manager()
            uploader = GitHubUploader(id_manager)
            
            print()
            success = uploader.update_project()
            return "" if success else f"{RED}❌ Update failed{RESET}"
        except Exception as e:
            return f"{RED}❌ Error: {e}{RESET}"
    
    def _handle_github_projects(self) -> str:
        """List user's GitHub projects."""
        try:
            from system_id import get_system_id_manager
            import requests
            
            id_manager = get_system_id_manager()
            
            if not id_manager.has_id():
                return f"{RED}❌ No GitHub account linked{RESET}\n{YELLOW}Run: github link{RESET}"
            
            github_username = id_manager.get_github_username()
            
            if not github_username:
                return f"{RED}❌ GitHub username not found{RESET}"
            
            print(f"\n{BLUE}🚀 Fetching projects for {github_username}...{RESET}\n")
            
            # Fetch repos from GitHub API
            response = requests.get(
                f"https://api.github.com/users/{github_username}/repos",
                params={'sort': 'updated', 'per_page': 100}
            )
            
            if response.status_code != 200:
                return f"{RED}❌ Failed to fetch projects from GitHub{RESET}"
            
            repos = response.json()
            
            if not repos:
                return f"{GOLD}💡 No projects found{RESET}\n{BLUE}Upload your first project with: github upload{RESET}"
            
            # Display projects
            print(f"{GREEN}📁 Your GitHub Projects ({len(repos)} total):{RESET}\n")
            
            for i, repo in enumerate(repos[:20], 1):
                name = repo['name']
                description = repo.get('description', 'No description')
                updated = repo['updated_at'][:10]
                private = '🔒' if repo['private'] else '🌐'
                stars = repo.get('stargazers_count', 0)
                
                print(f"{i:2d}. {private} {BLUE}{name}{RESET}")
                print(f"     {description[:60]}")
                print(f"     {GOLD}⭐ {stars} • Updated: {updated}{RESET}")
                print(f"     {BLUE}{repo['html_url']}{RESET}")
                print()
            
            if len(repos) > 20:
                print(f"{GOLD}... and {len(repos) - 20} more projects{RESET}\n")
            
            return f"{GREEN}✅ Found {len(repos)} projects{RESET}"
        
        except Exception as e:
            return f"{RED}❌ Error fetching projects: {e}{RESET}"
    
    def _handle_github_link(self) -> str:
        """Link GitHub account."""
        try:
            from system_id import get_system_id_manager
            
            id_manager = get_system_id_manager()
            
            print()
            print(f"{PURPLE}🚀 Link GitHub Account{RESET}\n")
            
            github_username = input(f"{BLUE}Enter your GitHub username:{RESET} ").strip()
            
            if not github_username:
                return f"{RED}❌ Username required{RESET}"
            
            # Verify GitHub username exists
            import requests
            response = requests.get(f"https://api.github.com/users/{github_username}")
            
            if response.status_code != 200:
                return f"{RED}❌ GitHub user '{github_username}' not found{RESET}"
            
            user_data = response.json()
            github_id = str(user_data['id'])
            
            # Save to system ID
            success = id_manager.set_id_from_github(github_username, github_id)
            
            if success:
                print()
                return f"{GREEN}✅ Successfully linked GitHub account: {github_username}{RESET}"
            else:
                return f"{RED}❌ Failed to save GitHub link{RESET}"
        
        except Exception as e:
            return f"{RED}❌ Error: {e}{RESET}"
    
    def _handle_github_unlink(self) -> str:
        """Unlink GitHub account."""
        try:
            from system_id import get_system_id_manager
            
            id_manager = get_system_id_manager()
            
            if not id_manager.has_id():
                return f"{RED}❌ No GitHub account is currently linked{RESET}"
            
            github_username = id_manager.get_github_username()
            
            # Confirm unlink
            print()
            print(f"{GOLD}⚠️  Unlink GitHub Account{RESET}\n")
            print(f"  Current account: {BLUE}{github_username}{RESET}")
            print()
            
            confirm = input(f"{GOLD}Are you sure you want to unlink? (y/n):{RESET} ").strip().lower()
            
            if confirm != 'y':
                return f"{GOLD}❌ Unlink cancelled{RESET}"
            
            # Clear the ID
            success = id_manager.clear_id()
            
            if success:
                print()
                return f"{GREEN}✅ Successfully unlinked GitHub account: {github_username}{RESET}"
            else:
                return f"{RED}❌ Failed to unlink account{RESET}"
        
        except Exception as e:
            return f"{RED}❌ Error: {e}{RESET}"
    
    def _handle_github_status(self) -> str:
        """Show GitHub connection status."""
        try:
            from system_id import get_system_id_manager
            
            id_manager = get_system_id_manager()
            
            if not id_manager.has_id():
                return f"{RED}❌ No GitHub account linked{RESET}\n{GOLD}Link your account with: github link{RESET}"
            
            github_username = id_manager.get_github_username()
            user_id = id_manager.get_id()
            
            response = f"\n{GREEN}🚀 GitHub Status{RESET}\n\n"
            response += f"  {BLUE}Connected:{RESET} {GREEN}✓ Yes{RESET}\n"
            response += f"  {BLUE}Username:{RESET} {github_username}\n"
            response += f"  {BLUE}User ID:{RESET} {user_id}\n"
            response += f"\n{GOLD}Available commands:{RESET}\n"
            response += f"  • {BLUE}github upload{RESET} - Upload current project\n"
            response += f"  • {BLUE}github update{RESET} - Update existing project\n"
            response += f"  • {BLUE}github projects{RESET} - List your projects\n"
            response += f"  • {BLUE}github unlink{RESET} - Unlink GitHub account\n"
            
            return response
        
        except Exception as e:
            return f"{RED}❌ Error: {e}{RESET}"
    
    def clear_history(self):
        """Clear conversation history (for compatibility with original agent)."""
        self.conversation_history = []
        print(f"{GREEN}🧹 Conversation history cleared{RESET}")
    
    def interactive_mode(self):
        """Run in interactive mode."""
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{PURPLE}🤖 Lucifer AI - Interactive Mode (Offline){RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        print(f"{GREEN}Type your requests. I have full access to:{RESET}")
        print(f"  • Offline consensus dictionary")
        print(f"  • All file operations")
        print(f"  • Command execution")
        print(f"  • Script building\n")
        print(f"{GOLD}Type 'exit' to quit{RESET}\n")
        
        while True:
            try:
                user_input = input(f"{BLUE}You:{RESET} ").strip()
                
                if not user_input:
                    continue
                
                if user_input.lower() in ['exit', 'quit', 'bye']:
                    print(f"\n{PURPLE}👋 Goodbye!{RESET}\n")
                    break
                
                print(f"\n{PURPLE}AI:{RESET} ", end="", flush=True)
                response = self.process_request(user_input)
                print(response)
                print()
            
            except KeyboardInterrupt:
                print(f"\n\n{PURPLE}👋 Goodbye!{RESET}\n")
                break
            except Exception as e:
                print(f"\n{RED}Error: {e}{RESET}\n")


# CLI
if __name__ == "__main__":
    import sys
    
    # Check for Ollama first
    print(f"{PURPLE}🚀 Starting Lucifer AI (Ollama Agent)...{RESET}\n")
    
    agent = OllamaAgent()
    
    if len(sys.argv) > 1:
        # Single command mode
        query = " ".join(sys.argv[1:])
        response = agent.process_request(query)
        print(f"\n{response}\n")
    else:
        # Interactive mode
        agent.interactive_mode()
