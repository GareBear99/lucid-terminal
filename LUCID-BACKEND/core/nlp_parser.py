#!/usr/bin/env python3
"""
🧠 Natural Language Parser - LLM-powered command understanding
Uses local LLM (Ollama or llama-cpp-python) to parse natural language into structured commands with fuzzy matching
"""
import re
import json
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from difflib import SequenceMatcher

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))
from file_tools import find_files, list_directory

# Import unified LLM backend
from core.llm_backend import get_llm_backend

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
RESET = "\033[0m"


class NaturalLanguageParser:
    """
    Parses natural language commands using local LLM.
    
    Features:
    - Intent extraction (watch file, run script, search, etc.)
    - Fuzzy file path matching
    - "Did you mean" suggestions
    - Interactive confirmations
    - Mode selection (watch vs autofix)
    - Supports both Ollama and llama-cpp-python backends
    """
    
    def __init__(self, ollama_available: bool = False, model: str = "llama3.2", model_delegate_fn=None):
        self.ollama_available = ollama_available
        self.model = model  # Can be llama3.2, mistral, or deepseek-coder
        self.cwd = Path.cwd()
        self.model_delegate_fn = model_delegate_fn  # Function to delegate tasks to specific models
        
        # Initialize unified LLM backend
        self.llm_backend = None
        if self.ollama_available:
            try:
                self.llm_backend = get_llm_backend(model=self.model, verbose=False)
                if not self.llm_backend.is_available():
                    self.llm_backend = None
                    self.ollama_available = False
            except:
                self.llm_backend = None
                self.ollama_available = False
        
    def parse_command(self, user_input: str) -> Dict[str, Any]:
        """
        Parse natural language command into structured intent.
        
        Returns:
            {
                'intent': 'watch' | 'run' | 'search' | 'unknown',
                'confidence': 0.0-1.0,
                'file_candidates': [list of possible file paths],
                'action_type': 'autofix' | 'watch' | 'suggest',
                'parameters': {additional params},
                'needs_confirmation': bool
            }
        """
        if self.ollama_available:
            return self._parse_with_ollama(user_input)
        else:
            return self._parse_with_rules(user_input)
    
    def _parse_with_ollama(self, user_input: str) -> Dict[str, Any]:
        """Use LLM backend to parse natural language command."""
        try:
            if not self.llm_backend:
                return self._parse_with_rules(user_input)
            
            # Use delegated model for simple parsing if available
            model_to_use = self.model
            if self.model_delegate_fn:
                model_to_use = self.model_delegate_fn('simple_parse')
                # Update backend model if different
                if model_to_use != self.llm_backend.model:
                    self.llm_backend.set_model(model_to_use)
            
            system_prompt = """You are a command parser for LuciferAI. Parse user commands into structured JSON.

Your job: Extract the user's intent and identify any file paths or names mentioned.

Possible intents:
- "watch": User wants to monitor a file for errors (daemon mode)
- "run": User wants to execute a script
- "search": User wants to search for something
- "fix": User wants to fix errors
- "create": User wants to create a file
- "list": User wants to list files/directories
- "move": User wants to move/relocate a file or directory
- "unknown": Can't determine intent

For file references, extract ANY mentioned file names, even if incomplete.
Examples:
- "watch my desktop fan terminal file" -> file_hints: ["desktop", "fan", "terminal", "file"]
- "can you watch the lucifer fan daemon" -> file_hints: ["lucifer", "fan", "daemon"]
- "run test.py" -> file_hints: ["test.py"]

Respond ONLY with valid JSON in this exact format:
{
  "intent": "watch|run|search|fix|create|list|move|unknown",
  "confidence": 0.0-1.0,
  "file_hints": ["word1", "word2"],
  "action_type": "autofix|watch|suggest|move|none",
  "reasoning": "brief explanation"
}"""

            # Use unified LLM backend
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input}
            ]
            
            ai_response = self.llm_backend.chat(
                messages,
                temperature=0.3,
                max_tokens=512,
                format="json",
                timeout=10
            )
            
            # Parse JSON response
            parsed = json.loads(ai_response)
            
            # Find file candidates based on hints (skip for creation intents)
            file_candidates = []
            if parsed.get('file_hints') and parsed.get('intent') not in ['create', 'make', 'new']:
                file_candidates = self._find_file_candidates(parsed['file_hints'])
            
            return {
                'intent': parsed.get('intent', 'unknown'),
                'confidence': parsed.get('confidence', 0.5),
                'file_candidates': file_candidates,
                'action_type': parsed.get('action_type', 'none'),
                'parameters': {},
                'needs_confirmation': len(file_candidates) != 1,
                'reasoning': parsed.get('reasoning', '')
            }
        
        except Exception as e:
            print(f"{GOLD}⚠️  LLM parsing failed, using rule-based fallback{RESET}")
            return self._parse_with_rules(user_input)
    
    def _parse_with_rules(self, user_input: str) -> Dict[str, Any]:
        """Fallback: Rule-based parsing when Ollama unavailable."""
        user_lower = user_input.lower().strip()
        
        # Detect intent with keywords
        intent = 'unknown'
        confidence = 0.6
        action_type = 'none'
        
        if any(word in user_lower for word in ['watch', 'monitor', 'daemon']):
            intent = 'watch'
            confidence = 0.8
            action_type = 'watch'
        
        elif any(word in user_lower for word in ['run', 'execute', 'exec']):
            intent = 'run'
            confidence = 0.8
        
        elif any(word in user_lower for word in ['search', 'find', 'locate']):
            intent = 'search'
            confidence = 0.7
        
        elif any(word in user_lower for word in ['fix', 'repair', 'autofix']):
            intent = 'fix'
            confidence = 0.8
            action_type = 'autofix'
        
        elif any(word in user_lower for word in ['create', 'make', 'new']):
            intent = 'create'
            confidence = 0.7
        
        elif any(word in user_lower for word in ['list', 'ls', 'show']):
            intent = 'list'
            confidence = 0.7
        
        elif any(word in user_lower for word in ['move', 'mv', 'relocate', 'transfer']):
            intent = 'move'
            confidence = 0.8
            action_type = 'move'
        
        # Extract file hints from input
        # Look for words that might be file names
        words = re.findall(r'\b\w+\b', user_lower)
        
        # Common file-related words to look for
        file_keywords = ['file', 'script', 'py', 'sh', 'terminal', 'daemon', 
                        'test', 'fan', 'lucifer', 'desktop', 'project']
        
        file_hints = [w for w in words if w in file_keywords or len(w) > 4]
        
        # Try to find actual files (skip for creation intents)
        file_candidates = []
        if intent not in ['create', 'make', 'new']:
            file_candidates = self._find_file_candidates(file_hints)
        
        return {
            'intent': intent,
            'confidence': confidence,
            'file_candidates': file_candidates,
            'action_type': action_type,
            'parameters': {},
            'needs_confirmation': len(file_candidates) > 1 or (intent == 'watch' and len(file_candidates) > 0),
            'reasoning': f'Rule-based: detected {intent} intent'
        }
    
    def _find_file_candidates(self, hints: List[str]) -> List[Dict[str, Any]]:
        """
        Find file candidates based on hints.
        
        Returns list of dicts with:
            - 'path': full path
            - 'name': filename
            - 'match_score': 0.0-1.0
            - 'match_reason': why it matched
        """
        if not hints:
            return []
        
        candidates = []
        
        # Search common locations
        search_paths = [
            self.cwd,
            self.cwd / "LuciferAI_Fan_Terminal",
            Path.home() / "Desktop",
            Path.home() / "Documents",
        ]
        
        for search_path in search_paths:
            if not search_path.exists():
                continue
            
            try:
                # Find all Python and shell scripts
                for pattern in ["*.py", "*.sh", "*.bash"]:
                    result = find_files(pattern, str(search_path), max_depth=1)
                    
                    if result['success']:
                        for match in result['matches']:
                            filepath = Path(match['path'])
                            filename = filepath.name.lower()
                            
                            # Calculate match score based on hints
                            score = 0.0
                            matched_hints = []
                            
                            for hint in hints:
                                hint_lower = hint.lower()
                                if hint_lower in filename:
                                    score += 0.3
                                    matched_hints.append(hint)
                                elif self._fuzzy_match(hint_lower, filename) > 0.6:
                                    score += 0.2
                                    matched_hints.append(f"{hint}~")
                            
                            if score > 0:
                                candidates.append({
                                    'path': str(filepath.absolute()),
                                    'name': filepath.name,
                                    'match_score': min(score, 1.0),
                                    'match_reason': f"Matched: {', '.join(matched_hints)}",
                                    'relative': str(filepath.relative_to(Path.home()) if filepath.is_relative_to(Path.home()) else filepath)
                                })
            
            except Exception:
                continue
        
        # Sort by match score
        candidates.sort(key=lambda x: x['match_score'], reverse=True)
        
        # Return top 5 candidates
        return candidates[:5]
    
    def _fuzzy_match(self, s1: str, s2: str) -> float:
        """Calculate fuzzy string match score (0.0-1.0)."""
        return SequenceMatcher(None, s1, s2).ratio()
    
    def confirm_action(self, parsed: Dict[str, Any], user_input: str) -> Optional[Dict[str, Any]]:
        """
        Interactive confirmation for ambiguous commands.
        
        Returns confirmed action dict or None if cancelled.
        """
        intent = parsed['intent']
        candidates = parsed['file_candidates']
        
        if not parsed['needs_confirmation']:
            # No confirmation needed, execute directly
            if candidates:
                return {
                    'action': intent,
                    'file': candidates[0]['path'],
                    'mode': parsed['action_type']
                }
            return None
        
        # Show what we understood
        print(f"\n{CYAN}🤔 Let me confirm what you want...{RESET}\n")
        print(f"{BLUE}I understood:{RESET} You want to {GOLD}{intent}{RESET}", end="")
        
        if candidates:
            print(f" this file:\n")
            
            # Show candidates
            if len(candidates) == 1:
                candidate = candidates[0]
                print(f"  {GREEN}→{RESET} {candidate['relative']}")
                print(f"     {GOLD}({candidate['match_reason']}){RESET}\n")
                
                # Confirm single candidate
                response = input(f"{CYAN}Is this correct? (y/n):{RESET} ").strip().lower()
                
                if response in ['y']:
                    # Ask about mode if it's a watch command
                    if intent == 'watch':
                        mode = self._confirm_watch_mode()
                        return {
                            'action': 'watch',
                            'file': candidate['path'],
                            'mode': mode
                        }
                    return {
                        'action': intent,
                        'file': candidate['path'],
                        'mode': parsed['action_type']
                    }
                else:
                    print(f"\n{GOLD}💡 Please specify the exact file path or be more specific{RESET}")
                    return None
            
            else:
                # Multiple candidates - let user choose
                print(f"\n{GOLD}I found multiple matches. Which one did you mean?{RESET}\n")
                
                for i, candidate in enumerate(candidates, 1):
                    print(f"  {BLUE}[{i}]{RESET} {candidate['relative']}")
                    print(f"      {GOLD}({candidate['match_reason']}){RESET}")
                
                print(f"\n  {BLUE}[0]{RESET} None of these / Cancel\n")
                
                choice = input(f"{CYAN}Enter number:{RESET} ").strip()
                
                try:
                    choice_num = int(choice)
                    
                    if choice_num == 0:
                        print(f"\n{GOLD}❌ Cancelled{RESET}")
                        return None
                    
                    elif 1 <= choice_num <= len(candidates):
                        selected = candidates[choice_num - 1]
                        
                        # Ask about mode if it's a watch command
                        if intent == 'watch':
                            mode = self._confirm_watch_mode()
                            return {
                                'action': 'watch',
                                'file': selected['path'],
                                'mode': mode
                            }
                        
                        return {
                            'action': intent,
                            'file': selected['path'],
                            'mode': parsed['action_type']
                        }
                    else:
                        print(f"\n{RED}❌ Invalid choice{RESET}")
                        return None
                
                except ValueError:
                    print(f"\n{RED}❌ Invalid input{RESET}")
                    return None
        
        else:
            print(f", but I couldn't find a matching file.\n")
            print(f"{GOLD}💡 Try:{RESET}")
            print(f"  • Provide the full file path")
            print(f"  • Use 'find' to locate the file first")
            print(f"  • Be more specific about the file name\n")
            return None
    
    def _confirm_watch_mode(self) -> str:
        """Ask user which watch mode they want."""
        print(f"\n{CYAN}Which mode do you want?{RESET}\n")
        print(f"  {BLUE}[1]{RESET} {GREEN}Autofix Mode{RESET} - Automatically apply fixes when errors detected")
        print(f"  {BLUE}[2]{RESET} {GOLD}Watch Mode{RESET} - Monitor and suggest fixes (you choose)")
        print()
        
        mode_choice = input(f"{CYAN}Enter number (1 or 2):{RESET} ").strip()
        
        if mode_choice == '1':
            print(f"\n{GREEN}✅ Using Autofix Mode{RESET}")
            return 'autofix'
        elif mode_choice == '2':
            print(f"\n{GOLD}✅ Using Watch Mode (with suggestions){RESET}")
            return 'watch'
        else:
            print(f"\n{GOLD}Using Watch Mode (default){RESET}")
            return 'watch'


# Convenience function
def parse_natural_language(user_input: str, ollama_available: bool = False) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    """
    Parse natural language and get confirmation if needed.
    
    Returns:
        (parsed_intent, confirmed_action)
    """
    parser = NaturalLanguageParser(ollama_available)
    parsed = parser.parse_command(user_input)
    
    if parsed['needs_confirmation']:
        confirmed = parser.confirm_action(parsed, user_input)
        return parsed, confirmed
    
    return parsed, None


if __name__ == "__main__":
    # Test the parser
    print(f"{PURPLE}🧠 Natural Language Parser Test{RESET}\n")
    
    test_commands = [
        "watch my desktop fan terminal file",
        "can you monitor the lucifer fan daemon",
        "run test.py",
        "search for errors in my code",
    ]
    
    parser = NaturalLanguageParser(ollama_available=False)
    
    for cmd in test_commands:
        print(f"\n{BLUE}Input:{RESET} {cmd}")
        result = parser.parse_command(cmd)
        print(f"{GREEN}Intent:{RESET} {result['intent']} ({result['confidence']:.0%} confidence)")
        
        if result['file_candidates']:
            print(f"{GOLD}File candidates:{RESET}")
            for c in result['file_candidates']:
                print(f"  • {c['name']} (score: {c['match_score']:.2f})")
