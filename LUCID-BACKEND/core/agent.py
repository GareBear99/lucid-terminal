#!/usr/bin/env python3
"""
🧠 LuciferAI Agent - Main orchestrator (Warp AI clone)
Handles tool calling, reasoning, and user interaction
"""
import sys
import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional

# Add tools to path
sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))

from file_tools import (read_file, write_file, edit_file, find_files, 
                        grep_search, list_directory)
from command_tools import (run_command, run_python_code, get_env_info, 
                           check_command_exists, is_risky_command)

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
RESET = "\033[0m"


class LuciferAgent:
    """Main agent that processes user requests and executes tools."""
    
    def __init__(self):
        self.conversation_history: List[Dict[str, str]] = []
        self.tools_executed: List[str] = []
        self.env = get_env_info()
        print(f"{PURPLE}👾 LuciferAI initialized{RESET}")
        print(f"{GOLD}📁 Working directory: {self.env['cwd']}{RESET}\n")
    
    def process_request(self, user_input: str) -> str:
        """
        Main entry point - process user request and return response.
        
        For now, uses rule-based logic. Later will be replaced with AI model.
        """
        self.conversation_history.append({"role": "user", "content": user_input})
        
        # Parse intent and extract tools needed
        response = self._route_request(user_input)
        
        self.conversation_history.append({"role": "assistant", "content": response})
        return response
    
    def _route_request(self, user_input: str) -> str:
        """Route request to appropriate handler based on intent."""
        user_lower = user_input.lower().strip()
        
        # File reading requests
        if any(keyword in user_lower for keyword in ['read', 'show', 'cat', 'view', 'open']):
            if match := re.search(r'(?:read|show|cat|view|open)\s+(.+)', user_lower):
                filepath = match.group(1).strip()
                return self._handle_read_file(filepath)
        
        # File search requests
        if any(keyword in user_lower for keyword in ['find', 'search for file', 'locate']):
            if match := re.search(r'(?:find|locate)\s+(?:files?\s+)?(.+)', user_lower):
                pattern = match.group(1).strip()
                return self._handle_find_files(pattern)
        
        # Code search requests  
        if 'search' in user_lower and 'for' in user_lower and 'in' in user_lower:
            if match := re.search(r'search\s+for\s+["\']?(.+?)["\']?\s+in\s+(.+)', user_lower):
                query, path = match.groups()
                return self._handle_grep(query.strip(), path.strip())
        
        # List directory requests
        if any(keyword in user_lower for keyword in ['list', 'ls', 'show files']):
            if match := re.search(r'(?:list|ls|show files)\s+(?:in\s+)?(.+)', user_lower):
                path = match.group(1).strip() or "."
            else:
                path = "."
            return self._handle_list_directory(path)
        
        # Command execution requests
        if any(keyword in user_lower for keyword in ['run', 'execute', 'exec']):
            if match := re.search(r'(?:run|execute|exec)\s+(.+)', user_lower):
                command = match.group(1).strip()
                return self._handle_run_command(command)
        
        # File writing requests
        if 'create' in user_lower or 'write' in user_lower:
            if match := re.search(r'(?:create|write)\s+(?:file\s+)?(.+?)\s+with\s+(.+)', user_lower):
                filepath, content = match.groups()
                return self._handle_write_file(filepath.strip(), content.strip())
        
        # Edit file requests
        if 'edit' in user_lower or 'replace' in user_lower:
            # Complex parsing needed here
            return self._handle_edit_request(user_input)
        
        # Environment info
        if any(keyword in user_lower for keyword in ['where am i', 'current directory', 'pwd']):
            return self._handle_env_info()
        
        # Help
        if user_lower in ['help', '?', 'what can you do']:
            return self._handle_help()
        
        # Default: suggest what we can do
        return self._handle_unknown(user_input)
    
    def _handle_read_file(self, filepath: str) -> str:
        """Handle file reading requests."""
        print(f"{BLUE}🔍 Reading file: {filepath}{RESET}")
        self.tools_executed.append(f"read_file({filepath})")
        
        result = read_file(filepath)
        
        if result["success"]:
            content = result["content"]
            lines = content.count('\n')
            return f"{GREEN}✅ Read {filepath} ({lines} lines, {result['size']} bytes){RESET}\n\n{content}"
        else:
            return f"{RED}❌ Error: {result['error']}{RESET}"
    
    def _handle_write_file(self, filepath: str, content: str) -> str:
        """Handle file writing requests."""
        print(f"{BLUE}✏️  Writing file: {filepath}{RESET}")
        self.tools_executed.append(f"write_file({filepath})")
        
        result = write_file(filepath, content)
        
        if result["success"]:
            return f"{GREEN}✅ Created {filepath} ({result['bytes_written']} bytes){RESET}"
        else:
            return f"{RED}❌ Error: {result['error']}{RESET}"
    
    def _handle_edit_request(self, user_input: str) -> str:
        """Handle complex edit requests."""
        # This would use AI to parse the edit request
        # For now, return a message
        return f"{GOLD}💡 Edit functionality requires specifying:\n  • File path\n  • Text to search for\n  • Replacement text\n\nExample: 'edit myfile.py replace \"old text\" with \"new text\"'{RESET}"
    
    def _handle_find_files(self, pattern: str) -> str:
        """Handle find files requests."""
        print(f"{BLUE}🔍 Finding files: {pattern}{RESET}")
        self.tools_executed.append(f"find_files({pattern})")
        
        # Remove quotes if present
        pattern = pattern.strip('"\'')
        
        result = find_files(pattern, self.env['cwd'])
        
        if result["success"]:
            if result["count"] == 0:
                return f"{GOLD}No files found matching '{pattern}'{RESET}"
            
            response = f"{GREEN}✅ Found {result['count']} files matching '{pattern}':{RESET}\n\n"
            for match in result["matches"][:20]:  # Limit to 20 results
                response += f"  📄 {match['relative']}\n"
            
            if result["count"] > 20:
                response += f"\n{GOLD}... and {result['count'] - 20} more{RESET}"
            
            return response
        else:
            return f"{RED}❌ Error: {result['error']}{RESET}"
    
    def _handle_grep(self, query: str, path: str) -> str:
        """Handle code search requests."""
        print(f"{BLUE}🔍 Searching for '{query}' in {path}{RESET}")
        self.tools_executed.append(f"grep_search({query}, {path})")
        
        result = grep_search(query, path)
        
        if result["success"]:
            if result["count"] == 0:
                return f"{GOLD}No matches found for '{query}' in {path}{RESET}"
            
            response = f"{GREEN}✅ Found {result['count']} matches for '{query}':{RESET}\n\n"
            for match in result["matches"][:15]:  # Limit results
                if "file" in match:
                    response += f"  📄 {match['file']}:{match['line']}\n"
                    response += f"     {match['content']}\n\n"
            
            if result["count"] > 15:
                response += f"{GOLD}... and {result['count'] - 15} more matches{RESET}"
            
            return response
        else:
            return f"{RED}❌ Error: {result['error']}{RESET}"
    
    def _handle_list_directory(self, path: str) -> str:
        """Handle list directory requests."""
        print(f"{BLUE}📂 Listing directory: {path}{RESET}")
        self.tools_executed.append(f"list_directory({path})")
        
        result = list_directory(path)
        
        if result["success"]:
            response = f"{GREEN}✅ Contents of {result['path']}:{RESET}\n\n"
            for item in result["items"]:
                icon = "📁" if item["type"] == "dir" else "📄"
                size = f"({item['size']} bytes)" if item["size"] else ""
                response += f"  {icon} {item['name']} {size}\n"
            
            return response
        else:
            return f"{RED}❌ Error: {result['error']}{RESET}"
    
    def _handle_run_command(self, command: str) -> str:
        """Handle command execution requests."""
        print(f"{BLUE}⚡ Running command: {command}{RESET}")
        self.tools_executed.append(f"run_command({command})")
        
        # Safety check
        if is_risky_command(command):
            return f"{RED}⚠️  This command appears risky and requires manual confirmation:\n  {command}\n\nPlease run it manually in your terminal.{RESET}"
        
        result = run_command(command, cwd=self.env['cwd'])
        
        if result["success"]:
            output = result['stdout'].strip() if result['stdout'] else "(no output)"
            return f"{GREEN}✅ Command executed successfully:{RESET}\n\n{output}"
        else:
            stderr = result.get('stderr', result.get('error', 'Unknown error'))
            return f"{RED}❌ Command failed (exit code {result.get('exit_code', '?')}):{RESET}\n\n{stderr}"
    
    def _handle_env_info(self) -> str:
        """Handle environment info requests."""
        return f"""{GREEN}📍 Environment Information:{RESET}

  Current Directory: {self.env['cwd']}
  Home Directory: {self.env['home']}
  User: {self.env['user']}
  Shell: {self.env['shell']}
  Platform: {self.env['platform']}
"""
    
    def _handle_help(self) -> str:
        """Show available capabilities."""
        return f"""{PURPLE}👾 LuciferAI Capabilities:{RESET}

{GREEN}📂 File Operations:{RESET}
  • "read <file>" - Read file contents
  • "create <file> with <content>" - Create new file
  • "find <pattern>" - Find files matching pattern
  • "list [directory]" - List directory contents

{GREEN}🔍 Search:{RESET}
  • "search for '<text>' in <path>" - Search code/text
  • "find <pattern>" - Find files by name

{GREEN}⚡ Commands:{RESET}
  • "run <command>" - Execute shell command
  • "where am i" - Show current directory

{GREEN}💡 Examples:{RESET}
  • "read config.yaml"
  • "find *.py"
  • "search for 'def main' in ."
  • "list ~/Desktop"
  • "run git status"

{GOLD}Note: Currently using rule-based logic. AI model integration coming next.{RESET}
"""
    
    def _handle_unknown(self, user_input: str) -> str:
        """Handle unknown requests."""
        return f"""{GOLD}🤔 I'm not sure how to handle that request yet.

Your request: "{user_input}"

Try:{RESET}
  • "help" - See what I can do
  • "read <filename>" - Read a file
  • "find <pattern>" - Search for files
  • "run <command>" - Execute a command

{PURPLE}💡 Tip: I work best with clear, specific requests!{RESET}
"""
    
    def clear_history(self):
        """Clear conversation history."""
        self.conversation_history = []
        self.tools_executed = []
        print(f"{GOLD}🧹 Conversation history cleared{RESET}")


# Test the agent
if __name__ == "__main__":
    print(f"{PURPLE}╔════════════════════════════════════════╗{RESET}")
    print(f"{PURPLE}║     👾 LuciferAI Agent Test Suite     ║{RESET}")
    print(f"{PURPLE}╚════════════════════════════════════════╝{RESET}\n")
    
    agent = LuciferAgent()
    
    # Test cases
    test_requests = [
        "help",
        "where am i",
        "list .",
        "find *.py",
        "read ../requirements.txt",
    ]
    
    for i, request in enumerate(test_requests, 1):
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{GOLD}Test {i}: {request}{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        response = agent.process_request(request)
        print(response)
    
    print(f"\n\n{GREEN}✅ All tests complete!{RESET}")
    print(f"{GOLD}Tools executed: {', '.join(agent.tools_executed)}{RESET}")
