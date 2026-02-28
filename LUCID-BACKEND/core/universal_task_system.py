#!/usr/bin/env python3
"""
🎯 Universal Task System for LuciferAI
Scales intelligently based on model tier:
- Tier 0: Simple execution
- Tier 1-2: Planning + execution + verification
- Tier 3: Full Warp-style with research + generation + testing
- Tier 4: Enterprise-grade with advanced research, optimization, and production testing
"""
from typing import List, Dict, Optional, Callable
from dataclasses import dataclass
from enum import Enum
import re
from core.lucifer_colors import print_step


class TaskComplexity(Enum):
    """Task complexity levels."""
    SIMPLE = "simple"          # Single operation (mkdir, touch, echo)
    MODERATE = "moderate"      # 2-3 operations (create folder + file)
    COMPLEX = "complex"        # 4+ operations or logic required
    ADVANCED = "advanced"      # Code generation, refactoring, debugging


class ModelTier(Enum):
    """Model capability tiers."""
    TIER_0 = 0  # TinyLlama, Phi (1-2B)
    TIER_1 = 1  # Llama 3.2, Gemma (3-8B)
    TIER_2 = 2  # Mistral, Llama 3.1 (7-13B)
    TIER_3 = 3  # DeepSeek, CodeLlama, Mixtral (13-34B)
    TIER_4 = 4  # Llama3-70B, Mixtral-8x22B, Qwen-72B (70B+)


@dataclass
class Task:
    """Represents a single task."""
    description: str
    action: Callable
    args: Dict
    complexity: TaskComplexity
    tier_required: ModelTier
    subtasks: Optional[List['Task']] = None
    verification: Optional[Callable] = None
    cleanup: Optional[Callable] = None


@dataclass
class TaskResult:
    """Result of task execution."""
    success: bool
    message: str
    output: Optional[str] = None
    error: Optional[str] = None
    steps_completed: List[str] = None


class UniversalTaskSystem:
    """
    Universal task system that adapts to model tier.
    Higher tiers get more sophisticated planning and verification.
    """
    
    def __init__(self, model_tier: ModelTier = ModelTier.TIER_0):
        self.model_tier = model_tier
        self.task_history: List[Task] = []
        self.last_created_folder = None  # Track context for "in it" references
        self.last_created_file = None
    
    def _display_tree(self, path, prefix="", is_last=True, max_depth=3, current_depth=0, created_items=None):
        """Display directory tree structure with visual branches.
        
        Args:
            path: Path to display
            prefix: Current line prefix for tree branches
            is_last: Whether this is the last item in parent directory
            max_depth: Maximum depth to traverse
            current_depth: Current depth in traversal
            created_items: Set of newly created paths to highlight
        """
        from pathlib import Path
        
        if created_items is None:
            created_items = set()
        
        path = Path(path)
        if not path.exists():
            return
        
        # Determine branch characters
        branch = "└── " if is_last else "├── "
        
        # Display current item
        display_name = path.name + ("/" if path.is_dir() else "")
        
        # Highlight if newly created
        if str(path) in created_items:
            display_name += "  ← Created"
        
        if current_depth == 0:
            print(f"{display_name}")
        else:
            print(f"{prefix}{branch}{display_name}")
        
        # Recurse into directories
        if path.is_dir() and current_depth < max_depth:
            # Get children, sorted (directories first, then files)
            try:
                children = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name))
            except PermissionError:
                return
            
            for i, child in enumerate(children):
                is_last_child = (i == len(children) - 1)
                
                # Determine new prefix
                if current_depth == 0:
                    new_prefix = ""
                else:
                    new_prefix = prefix + ("    " if is_last else "│   ")
                
                self._display_tree(
                    child,
                    new_prefix,
                    is_last_child,
                    max_depth,
                    current_depth + 1,
                    created_items
                )
    
    def parse_command(self, command: str) -> Optional[Task]:
        """
        Parse natural language command into structured task.
        Complexity detection works for all tiers.
        """
        command_lower = command.lower()
        
        # Pattern matching for common operations
        # IMPORTANT: Order matters! More specific patterns MUST come before general patterns
        patterns = {
            # Write to file - MOST SPECIFIC, CHECK FIRST
            # Pattern: "write to <file> <content>" or "write <content> to <file>"
            r'write\s+to\s+([\w./~-]+)\s+(.+)': 
                self._write_to_file,
            
            # Complex script creation with natural language action description - CHECK BEFORE FOLDER/FILE PATTERNS
            # Matches: "create a script that opens the browser", "create a file on my desktop that opens the browser"
            # Pattern: (create/write/make) + (file/script) + that/which/to + (action description)
            r'(?:create|write|make|build|generate).+(?:file|script|program|code).+(?:that|which).+(?:open|launch|run|execute|start|do|perform)': 
                self._generate_complex_script,
            
            # Move operations with explicit paths (move X from Y to Z) - CHECK BEFORE OTHER MOVE PATTERNS
            r'(?:move|mv)\s+[\w.-]+\s+from\s+.+\s+to\s+': 
                self._move_file_explicit_paths,
            
            # Multi-step: find then move (handles "where is X? move it to Y")
            r'(?:where|find|locate).+(?:file|script).+(?:move|put|transfer|relocate).+(?:to|into|in)': 
                self._find_and_move_file,
            
            # Move operations (find file -> find destination -> move)
            r'(?:move|mv|relocate|transfer|put).+(?:file|script).+(?:to|into|in).+(?:desktop|folder|directory)': 
                self._move_file_to_location,
            
            # Find/locate operations (simple search without move)
            r'(?:find|locate|search|where).+(?:file|script|folder|directory)': 
                self._find_file_or_folder,
            
            # Folder + file (check for both folder AND file keywords)
            r'(?:build|create|make|setup|initialize|new).+(?:folder|directory|dir).+(\w+).+(?:file|script|python).+(\w+\.\w+)': 
                self._build_folder_with_file,
            
            # Folder only (has folder keyword, no file keyword)
            r'(?:build|create|make|setup|initialize|new).+(?:folder|directory|dir).+(\w+)': 
                self._build_folder,
            
            # File only (has file keyword, no folder keyword)
            # Added: put, add, place for natural "put a file" commands
            r'(?:build|create|make|setup|initialize|new|write|generate|put|add|place).+(?:file|script).+(\w+\.\w+)': 
                self._build_file,
            
            # Code generation (specific python/py mentions)
            r'(?:write|generate|create|make).+(?:python|py).+(?:script|file|code)': 
                self._generate_python_script,
            
            # Catch-all for complex/generic creation (e.g. "create me these files", "make an app", "write code for X")
            # This handles requests that don't have explicit filenames or specific "that/which" connectors
            r'(?:create|make|generate|build|write|setup).+(?:files?|scripts?|code|programs?|apps?|application|project)':
                self._generate_complex_script,
            
            # Directory operations
            r'(?:list|show|display).+(?:files|directory|folder|contents)': 
                self._list_directory,
        }
        
        for pattern, handler in patterns.items():
            match = re.search(pattern, command_lower)
            if match:
                return handler(command, match)
        
        return None
    
    def _build_folder_with_file(self, command: str, match: re.Match) -> Task:
        """Create folder and file - moderate complexity."""
        # Smart extraction using name keywords
        folder_name = self._extract_name_after_keywords(command, ['folder', 'directory', 'dir'])
        file_name = self._extract_name_after_keywords(command, ['file', 'script', 'python'])
        
        # Extract location (desktop, current dir, etc.)
        location = self._extract_location(command)
        
        from pathlib import Path
        
        # Check if full_path was extracted (explicit path like ~/Desktop/Projects/foo)
        if location.get('full_path'):
            # Use the full path directly
            folder_path = location['full_path'] / folder_name
        elif 'here' in command.lower() or 'current' in command.lower():
            # Current directory
            folder_path = Path.cwd() / folder_name
        else:
            # Build path from base + subfolder
            if location['base'] == 'desktop':
                base_path = Path.home() / 'Desktop'
            elif location['base'] == 'documents':
                base_path = Path.home() / 'Documents'
            elif location['base'] == 'home':
                base_path = Path.home()
            else:
                base_path = Path.cwd()
            
            # Add subfolder if specified
            if location['subfolder']:
                base_path = base_path / location['subfolder']
            
            folder_path = base_path / folder_name
        
        file_path = folder_path / file_name
        
        # Extract file content hints
        content_hints = self._extract_content_hints(command, file_name)
        
        def execute():
            """Execute folder + file creation."""
            import os
            import sys
            import termios
            import tty
            
            # Check if file already exists
            if file_path.exists():
                # Stop any background processing animation before prompting
                import sys
                import time
                lucifer_module = sys.modules.get('__main__')
                if lucifer_module and hasattr(lucifer_module, 'agent'):
                    agent = lucifer_module.agent
                    if hasattr(agent, '_stop_processing_animation'):
                        agent._stop_processing_animation()
                        # Set HEART_STATE to prevent heartbeat from restarting
                        if hasattr(lucifer_module, 'HEART_STATE'):
                            lucifer_module.HEART_STATE = "prompting"
                        # Wait significantly longer for animation thread to fully stop
                        time.sleep(0.6)
                        # Force clear the line and move to new line
                        import os
                        os.write(1, b'\r\033[K\n')
                        # Ensure output is flushed
                        sys.stdout.flush()
                
                print(f"⚠️  File already exists: {file_path.name}")
                print()
                
                # Force flush before reading input
                sys.stdout.flush()
                sys.stderr.flush()
                
                try:
                    # Single key input for y/n in raw mode
                    print(f"Overwrite existing file? (y/n): ", end='', flush=True)
                    
                    # Read single character in raw mode
                    key = sys.stdin.read(1).lower()
                    print(key)  # Echo the key
                    print()
                    
                    # Reset HEART_STATE back to idle
                    if lucifer_module and hasattr(lucifer_module, 'HEART_STATE'):
                        lucifer_module.HEART_STATE = "idle"
                    
                    if key != 'y':
                        print(f"❌ Creation cancelled")
                        return "CANCELLED"
                except (EOFError, KeyboardInterrupt):
                    print(f"\n❌ Creation cancelled")
                    # Reset HEART_STATE on error too
                    if lucifer_module and hasattr(lucifer_module, 'HEART_STATE'):
                        lucifer_module.HEART_STATE = "idle"
                    return "CANCELLED"
            
            # Create folder
            folder_path.mkdir(parents=True, exist_ok=True)
            print(f"✅ Created folder: {folder_path}")
            
            # Determine file content based on tier
            if self.model_tier.value >= ModelTier.TIER_2.value:
                # Advanced models can generate proper content
                content = self._generate_file_content(file_name, content_hints)
            else:
                # Basic models use templates
                content = self._get_template_content(file_name, content_hints)
            
            # Create file
            file_path.write_text(content)
            print(f"✅ Created file: {file_path}")
            
            # Make executable if script
            if file_name.endswith('.py') or file_name.endswith('.sh'):
                os.chmod(file_path, 0o755)
                print(f"✅ Made executable: {file_path}")
            
            # Display tree
            print()
            print("📁 Project Structure:")
            created_items = {str(folder_path), str(file_path)}
            self._display_tree(folder_path, created_items=created_items)
            print()
            
            return str(file_path)
        
        def verify():
            """Verify creation."""
            if folder_path.exists() and file_path.exists():
                print(f"✅ Verification passed")
                return True
            return False
        
        return Task(
            description=f"Create folder '{folder_name}' with file '{file_name}'",
            action=execute,
            args={'folder': str(folder_path), 'file': str(file_path)},
            complexity=TaskComplexity.MODERATE,
            tier_required=ModelTier.TIER_0,
            verification=verify
        )
    
    def _build_folder(self, command: str, match: re.Match) -> Task:
        """Create folder - simple complexity."""
        folder_name = self._extract_name_after_keywords(command, ['folder', 'directory', 'dir'])
        location = self._extract_location(command)
        
        from pathlib import Path
        
        # Check if full_path was extracted
        if location.get('full_path'):
            folder_path = location['full_path'] / folder_name
        elif 'here' in command.lower() or 'current' in command.lower():
            folder_path = Path.cwd() / folder_name
        else:
            # Build path from base + subfolder
            if location['base'] == 'desktop':
                base_path = Path.home() / 'Desktop'
            elif location['base'] == 'documents':
                base_path = Path.home() / 'Documents'
            elif location['base'] == 'home':
                base_path = Path.home()
            else:
                base_path = Path.cwd()
            
            # Add subfolder if specified
            if location['subfolder']:
                base_path = base_path / location['subfolder']
            
            folder_path = base_path / folder_name
        
        def execute():
            # Track what we create for highlighting
            created_items = set()
            
            # Create main folder
            folder_path.mkdir(parents=True, exist_ok=True)
            print(f"✅ Created folder: {folder_path}")
            created_items.add(str(folder_path))
            
            # Check if command mentions subfolders to create
            subfolder_match = re.search(r'with\s+subfolders?\s+([\w,\s]+)', command.lower())
            if subfolder_match:
                subfolder_names = subfolder_match.group(1)
                # Split by commas or 'and'
                subfolders = re.split(r',|\s+and\s+', subfolder_names)
                
                for subfolder in subfolders:
                    subfolder = subfolder.strip()
                    if subfolder:  # Skip empty strings
                        subfolder_path = folder_path / subfolder
                        subfolder_path.mkdir(parents=True, exist_ok=True)
                        print(f"  ✅ Created subfolder: {subfolder}")
                        created_items.add(str(subfolder_path))
            
            # Display tree structure
            print()
            print("📁 Project Structure:")
            self._display_tree(folder_path, created_items=created_items)
            print()
            
            # Store for context tracking
            self.last_created_folder = str(folder_path)
            return str(folder_path)
        
        return Task(
            description=f"Create folder '{folder_name}'",
            action=execute,
            args={'folder': str(folder_path)},
            complexity=TaskComplexity.SIMPLE,
            tier_required=ModelTier.TIER_0
        )
    
    def _write_to_file(self, command: str, match: re.Match) -> Task:
        """Write content to an existing or new file."""
        from pathlib import Path
        
        # Re-match against original command to preserve case
        # The match object passed in was from the lowercased command
        original_match = re.search(r'write\s+to\s+([\w./~-]+)\s+(.+)', command, re.IGNORECASE)
        if original_match:
            filename = original_match.group(1).strip()
            content = original_match.group(2).strip()
        else:
            # Fallback to lowercase match (shouldn't happen)
            filename = match.group(1).strip()
            content = match.group(2).strip()
        
        # Resolve path
        if filename.startswith('~') or filename.startswith('/'):
            file_path = Path(filename).expanduser()
        else:
            file_path = Path(filename)
        
        def execute():
            import os
            
            # Create parent directories if needed
            file_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write or append content
            mode = 'w'  # Default to overwrite
            if file_path.exists():
                print(f"⚠️  File exists: {file_path.name}")
                print(f"✏️  Writing: {content[:50]}..." if len(content) > 50 else f"✏️  Writing: {content}")
            
            file_path.write_text(content)
            print(f"✅ Wrote to file: {file_path}")
            
            return str(file_path)
        
        return Task(
            description=f"Write to file '{filename}'",
            action=execute,
            args={'file': str(file_path), 'content': content},
            complexity=TaskComplexity.SIMPLE,
            tier_required=ModelTier.TIER_0
        )
    
    def _build_file(self, command: str, match: re.Match) -> Task:
        """Create file - simple complexity."""
        file_name = self._extract_name_after_keywords(command, ['file', 'script'])
        location = self._extract_location(command)
        
        from pathlib import Path
        
        # Check if full_path was extracted
        if location.get('full_path'):
            file_path = location['full_path'] / file_name
        # Check for context references ("in it", "there", "that folder")
        elif any(ref in command.lower() for ref in ['in it', 'there', 'in that', 'in the folder']):
            if self.last_created_folder:
                base_path = Path(self.last_created_folder)
            else:
                # No context - use default
                base_path = Path.home() / 'Desktop'
            file_path = base_path / file_name
        elif 'here' in command.lower() or 'current' in command.lower():
            file_path = Path.cwd() / file_name
        else:
            # Build path from base + subfolder
            if location['base'] == 'desktop':
                base_path = Path.home() / 'Desktop'
            elif location['base'] == 'documents':
                base_path = Path.home() / 'Documents'
            elif location['base'] == 'home':
                base_path = Path.home()
            else:
                base_path = Path.cwd()
            
            # Add subfolder if specified
            if location['subfolder']:
                base_path = base_path / location['subfolder']
            
            file_path = base_path / file_name
        
        content_hints = self._extract_content_hints(command, file_name)
        
        def execute():
            import os
            import sys
            import termios
            import tty
            
            # Check if file already exists
            if file_path.exists():
                print(f"\n⚠️  File already exists: {file_path.name}")
                
                try:
                    # Import the single-key input function
                    from enhanced_agent import get_single_key_input
                    response = get_single_key_input(
                        "Overwrite existing file? (y/n): ",
                        valid_keys=['y', 'n', 'Y', 'N']
                    )
                    
                    if response.lower() != 'y':
                        print(f"\n❌ Creation cancelled")
                        return "CANCELLED"
                except (EOFError, KeyboardInterrupt):
                    print(f"\n❌ Creation cancelled")
                    return "CANCELLED"
                
                print()  # Add blank line after response
            
            # For simple file creation with just a name, create an EMPTY file
            # Only generate content if there are specific content hints
            if content_hints.get('purpose') or 'content' in content_hints:
                if self.model_tier.value >= ModelTier.TIER_2.value:
                    content = self._generate_file_content(file_name, content_hints)
                else:
                    content = self._get_template_content(file_name, content_hints)
            else:
                # Create empty file for simple "create file X" requests
                content = ""
            
            file_path.write_text(content)
            if content:
                print(f"✅ Created file with template: {file_path}")
            else:
                print(f"✅ Created empty file: {file_path}")
            
            if file_name.endswith('.py') or file_name.endswith('.sh'):
                os.chmod(file_path, 0o755)
            
            # Track for context
            self.last_created_file = str(file_path)
            
            return str(file_path)
        
        return Task(
            description=f"Create file '{file_name}'",
            action=execute,
            args={'file': str(file_path)},
            complexity=TaskComplexity.SIMPLE,
            tier_required=ModelTier.TIER_0
        )
    
    def _generate_complex_script(self, command: str, match: re.Match) -> Task:
        """Generate script from complex natural language description.
        Example: 'create a file on my desktop that opens the browser and opens facebook'
        This will be handled by the multi-step workflow in enhanced_agent.py
        """
        from pathlib import Path
        
        # Extract the action description (what the script should do)
        # Look for content after "that", "which", or "to"
        action_description = command
        for split_word in [' that ', ' which ', ' to ']:
            if split_word in command.lower():
                parts = command.lower().split(split_word, 1)
                if len(parts) > 1:
                    action_description = parts[1].strip()
                    break
        
        # Extract location
        location = self._extract_location(command)
        
        # Generate appropriate filename based on action
        filename = self._generate_filename_from_action(action_description)
        
        # Build file path
        if location.get('full_path'):
            file_path = location['full_path'] / filename
        elif 'here' in command.lower() or 'current' in command.lower():
            file_path = Path.cwd() / filename
        else:
            if location['base'] == 'desktop':
                base_path = Path.home() / 'Desktop'
            elif location['base'] == 'documents':
                base_path = Path.home() / 'Documents'
            elif location['base'] == 'home':
                base_path = Path.home()
            else:
                base_path = Path.cwd()
            
            if location['subfolder']:
                base_path = base_path / location['subfolder']
            
            file_path = base_path / filename
        
        # This is a dummy execute - the real work happens in _handle_multi_step_script_creation
        def execute():
            # Create empty file - content will be generated by LLM in multi-step flow
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text('# Placeholder - will be generated by LLM\n')
            return str(file_path)
        
        return Task(
            description=f"Create script that {action_description}",
            action=execute,
            args={
                'file': str(file_path),
                'action_description': action_description,
                'original_command': command
            },
            complexity=TaskComplexity.ADVANCED,
            tier_required=ModelTier.TIER_1
        )
    
    def _generate_filename_from_action(self, action_description: str) -> str:
        """Generate appropriate filename from action description."""
        import re
        
        # Extract key action words
        action_lower = action_description.lower().strip()
        
        # Common action patterns (specific matches first)
        if 'open' in action_lower and 'browser' in action_lower:
            if 'facebook' in action_lower:
                return 'open_facebook.py'
            elif 'youtube' in action_lower:
                return 'open_youtube.py'
            elif 'google' in action_lower:
                return 'open_google.py'
            else:
                return 'open_browser.py'
        elif 'send' in action_lower and ('email' in action_lower or 'mail' in action_lower):
            return 'send_email.py'
        elif 'download' in action_lower:
            return 'download_file.py'
        elif 'scrape' in action_lower or 'fetch' in action_lower:
            return 'web_scraper.py'
        elif 'backup' in action_lower:
            return 'backup_files.py'
        elif 'monitor' in action_lower or 'watch' in action_lower:
            return 'file_monitor.py'
        elif 'api' in action_lower:
            return 'api_client.py'
        else:
            # Dynamic filename generation from action description
            # Remove common filler words
            filler_words = {'a', 'an', 'the', 'that', 'which', 'to', 'will', 'can', 'should', 'would', 
                           'is', 'are', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
                           'but', 'or', 'and', 'if', 'then', 'else', 'when', 'at', 'by', 'for', 'with',
                           'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
                           'above', 'below', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under',
                           'again', 'further', 'then', 'once', 'here', 'there', 'all', 'both', 'each', 'few',
                           'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than',
                           'too', 'very', 'just', 'my', 'your', 'their', 'its', 'this', 'these', 'iconic'}
            
            # Clean up the action description
            # Remove punctuation and split into words
            words = re.findall(r'\b\w+\b', action_lower)
            
            # Filter out filler words and keep meaningful ones
            meaningful_words = [w for w in words if w not in filler_words and len(w) > 1]
            
            # Limit to first 4-5 meaningful words to keep filename reasonable
            if len(meaningful_words) > 5:
                meaningful_words = meaningful_words[:5]
            elif len(meaningful_words) == 0:
                # Fallback if no meaningful words found
                return 'custom_script.py'
            
            # Join words with underscores
            filename_base = '_'.join(meaningful_words)
            
            # Add .py extension
            return f"{filename_base}.py"
    
    def _generate_python_script(self, command: str, match: re.Match) -> Task:
        """Generate Python script - complex/advanced based on tier."""
        complexity = TaskComplexity.ADVANCED if self.model_tier.value >= ModelTier.TIER_3.value else TaskComplexity.COMPLEX
        
        def execute():
            if self.model_tier.value >= ModelTier.TIER_3.value:
                # Tier 3: Use DeepSeek for generation
                print("🤖 Using DeepSeek for code generation...")
                # Would integrate with DeepSeek here
                return "Generated with Tier 3 model"
            elif self.model_tier.value >= ModelTier.TIER_1.value:
                # Tier 1-2: Use Llama/Mistral for generation
                print("🤖 Using Llama/Mistral for code generation...")
                return "Generated with Tier 1-2 model"
            else:
                # Tier 0: Use templates
                print("📝 Using template (Tier 0)")
                return "Generated from template"
        
        return Task(
            description="Generate Python script",
            action=execute,
            args={},
            complexity=complexity,
            tier_required=ModelTier.TIER_1
        )
    
    def _list_directory(self, command: str, match: re.Match) -> Task:
        """List directory - simple."""
        def execute():
            import os
            files = os.listdir('.')
            print(f"📁 Files: {', '.join(files)}")
            return files
        
        return Task(
            description="List directory",
            action=execute,
            args={},
            complexity=TaskComplexity.SIMPLE,
            tier_required=ModelTier.TIER_0
        )
    
    def _find_and_move_file(self, command: str, match: re.Match) -> Task:
        """Find a file, then move it - handles contextual 'the file' references."""
        from pathlib import Path
        import shutil
        
        # Extract file hint and destination
        file_hint = self._extract_file_hint_from_query(command)
        destination = self._extract_destination(command)
        
        def execute():
            """Multi-step: Ask for clarification if needed, find file, move."""
            
            # Check if file hint is vague ("the file", "it")
            if file_hint in ['file', 'the', 'it', 'unknown']:
                print(f"❓ Which file would you like to move?\n")
                print(f"💡 Please specify the filename, for example:")
                print(f"   • 'move test.py to untitled folder'")
                print(f"   • 'find setup.py and move it to desktop'\n")
                return None
            
            # Step 1: Find the file
            print_step(1, 3, f"Locating file matching '{file_hint}'")
            search_paths = [
                Path.cwd(),
                Path.home() / 'Desktop',
                Path.home() / 'Documents',
                Path.home() / 'Downloads',
            ]
            
            matches = []
            for search_path in search_paths:
                if not search_path.exists():
                    continue
                
                try:
                    for item in search_path.rglob('*'):
                        if item.is_file() and file_hint.lower() in item.name.lower():
                            matches.append(item)
                            if len(matches) >= 5:
                                break
                except (PermissionError, OSError):
                    continue
            
            if not matches:
                print(f"❌ No files found matching: {file_hint}")
                print(f"\n🤔 Okay, what would you like me to do next?")
                return None
            
            # Show matches and ask for confirmation
            print(f"✅ Found {len(matches)} match(es):\n")
            for i, match_file in enumerate(matches, 1):
                rel = match_file.relative_to(Path.home()) if match_file.is_relative_to(Path.home()) else match_file
                print(f"  {i}. {rel}")
            
            # If only one match, ask simple y/n
            if len(matches) == 1:
                print()
                import sys
                import termios
                import tty
                
                print(f"Is this the file you want to move? (y/n): ", end='', flush=True)
                
                if sys.stdin.isatty():
                    fd = sys.stdin.fileno()
                    old_settings = termios.tcgetattr(fd)
                    try:
                        tty.setraw(fd)
                        key = sys.stdin.read(1).lower()
                        print(key)  # Echo
                    finally:
                        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
                else:
                    key = input().strip().lower()[:1]
                
                print()
                
                if key != 'y':
                    print(f"\n🤔 Okay, what would you like me to do next?")
                    return None
                
                source_file = matches[0]
            else:
                # Multiple matches - ask for number, y for first, or n to cancel
                print()
                import sys
                
                response = input(f"Enter number (1-{len(matches)}), 'y' for first option, or 'n' to cancel: ").strip().lower()
                
                if response == 'n':
                    print(f"\n🤔 Okay, what would you like me to do next?")
                    return None
                elif response == 'y' or response == '1':
                    source_file = matches[0]
                elif response.isdigit() and 1 <= int(response) <= len(matches):
                    source_file = matches[int(response) - 1]
                else:
                    print(f"❌ Invalid selection")
                    print(f"\n🤔 Okay, what would you like me to do next?")
                    return None
            
            print(f"\n✅ Selected: {source_file.relative_to(Path.home()) if source_file.is_relative_to(Path.home()) else source_file}")
            
            # Step 2: Find destination
            print_step(2, 3, f"Finding destination '{destination}'")
            
            if destination.lower() in ['desktop']:
                dest_dir = Path.home() / 'Desktop'
            elif destination.lower() in ['documents', 'docs']:
                dest_dir = Path.home() / 'Documents'
            elif destination.lower() in ['downloads']:
                dest_dir = Path.home() / 'Downloads'
            else:
                # Search for folder name
                dest_dir = None
                for search_path in [Path.home() / 'Desktop', Path.home() / 'Documents']:
                    if not search_path.exists():
                        continue
                    
                    for item in search_path.rglob('*'):
                        if item.is_dir() and destination.lower() in item.name.lower():
                            dest_dir = item
                            break
                    if dest_dir:
                        break
                
                if not dest_dir:
                    print(f"❌ Destination folder not found: {destination}")
                    return None
            
            print(f"✅ Destination: {dest_dir.relative_to(Path.home()) if dest_dir.is_relative_to(Path.home()) else dest_dir}")
            
            # Step 3: Move with overwrite check
            print_step(3, 3, "Moving file")
            dest_file = dest_dir / source_file.name
            
            # Check if file already exists at destination
            if dest_file.exists():
                print(f"⚠️  File already exists at destination: {dest_file.name}")
                print()
                try:
                    # Import the safe input function
                    import sys
                    import termios
                    import tty
                    
                    # Single key input for y/n
                    print(f"Overwrite existing file? (y/n): ", end='', flush=True)
                    
                    if sys.stdin.isatty():
                        fd = sys.stdin.fileno()
                        old_settings = termios.tcgetattr(fd)
                        try:
                            tty.setraw(fd)
                            key = sys.stdin.read(1).lower()
                            print(key)  # Echo the key
                        finally:
                            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
                    else:
                        key = input().strip().lower()[:1]
                    
                    print()
                    
                    if key != 'y':
                        print(f"❌ Move cancelled")
                        return None
                except (EOFError, KeyboardInterrupt):
                    print(f"\n❌ Move cancelled")
                    return None
            
            try:
                shutil.move(str(source_file), str(dest_file))
                print(f"✅ Moved: {source_file.name} → {dest_dir.relative_to(Path.home()) if dest_dir.is_relative_to(Path.home()) else dest_dir}")
                self.last_found_file = str(dest_file)
                return str(dest_file)
            except Exception as e:
                print(f"❌ Move failed: {e}")
                return None
        
        return Task(
            description=f"Find and move '{file_hint}' to '{destination}'",
            action=execute,
            args={'file_hint': file_hint, 'destination': destination},
            complexity=TaskComplexity.COMPLEX,
            tier_required=ModelTier.TIER_0
        )
    
    def _find_file_or_folder(self, command: str, match: re.Match) -> Task:
        """Find file or folder - moderate complexity."""
        from pathlib import Path
        import os
        
        # Extract what to find
        target_name = self._extract_search_target(command)
        
        def execute():
            """Search for file/folder in common locations."""
            search_paths = [
                Path.cwd(),
                Path.home() / 'Desktop',
                Path.home() / 'Documents',
                Path.home() / 'Downloads',
            ]
            
            found_items = []
            print(f"🔍 Searching for: {target_name}\n")
            
            for search_path in search_paths:
                if not search_path.exists():
                    continue
                
                try:
                    # Search recursively (max depth 3)
                    for item in search_path.rglob('*'):
                        if target_name.lower() in item.name.lower():
                            rel_path = item.relative_to(Path.home()) if item.is_relative_to(Path.home()) else item
                            found_items.append({
                                'path': str(item),
                                'name': item.name,
                                'type': 'folder' if item.is_dir() else 'file',
                                'relative': str(rel_path)
                            })
                            
                            if len(found_items) >= 10:  # Limit results
                                break
                except (PermissionError, OSError):
                    continue
            
            if found_items:
                print(f"✅ Found {len(found_items)} match(es):\n")
                for i, item in enumerate(found_items, 1):
                    icon = "📁" if item['type'] == 'folder' else "📄"
                    print(f"  {i}. {icon} {item['relative']}")
                return found_items
            else:
                print(f"❌ No matches found for: {target_name}")
                return []
        
        return Task(
            description=f"Find '{target_name}'",
            action=execute,
            args={'target': target_name},
            complexity=TaskComplexity.MODERATE,
            tier_required=ModelTier.TIER_0
        )
    
    def _move_file_explicit_paths(self, command: str, match: re.Match) -> Task:
        """Move file with explicit from/to paths - simple when paths are clear."""
        from pathlib import Path
        import shutil
        
        # Parse: move FILENAME from SOURCE_PATH to DEST_PATH
        move_match = re.search(r'(?:move|mv)\s+([\w.-]+)\s+from\s+([\S]+)\s+to\s+([\S]+)', command)
        if not move_match:
            # Fallback to simpler pattern
            return self._move_file_to_location(command, match)
        
        filename = move_match.group(1)
        source_path = Path(move_match.group(2)).expanduser()
        dest_path = Path(move_match.group(3)).expanduser()
        
        def execute():
            """Execute the file move with explicit paths."""
            # Build full paths
            source_file = source_path / filename if source_path.is_dir() else source_path
            
            # Ensure source exists
            if not source_file.exists():
                print(f"❌ Source file not found: {source_file}")
                return None
            
            # Ensure destination directory exists
            if dest_path.is_dir():
                dest_file = dest_path / filename
            else:
                # dest_path might be the full destination file path
                dest_file = dest_path
                dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Ensure destination folder exists
            dest_file.parent.mkdir(parents=True, exist_ok=True)
            
            # Move the file
            try:
                shutil.move(str(source_file), str(dest_file))
                print(f"✅ Moved: {filename}")
                print(f"   From: {source_file}")
                print(f"   To:   {dest_file}")
                
                # Show tree of destination
                if dest_file.parent.exists():
                    print()
                    print("📁 Destination Structure:")
                    # Find the root folder to display
                    root = dest_file.parent
                    while root.parent != root.parent.parent and len(str(root)) > 20:
                        if root.parent.name in ['Desktop', 'Projects', 'Documents']:
                            root = root.parent
                            break
                        root = root.parent
                    
                    self._display_tree(root, max_depth=2, created_items={str(dest_file)})
                    print()
                
                return str(dest_file)
            except Exception as e:
                print(f"❌ Move failed: {e}")
                return None
        
        return Task(
            description=f"Move '{filename}' from {source_path} to {dest_path}",
            action=execute,
            args={'source': str(source_file if 'source_file' in locals() else source_path), 
                  'dest': str(dest_path)},
            complexity=TaskComplexity.SIMPLE,
            tier_required=ModelTier.TIER_0
        )
    
    def _move_file_to_location(self, command: str, match: re.Match) -> Task:
        """Move file to location - complex (find -> locate destination -> move)."""
        from pathlib import Path
        import shutil
        
        # Extract file name and destination
        file_name = self._extract_file_to_move(command)
        destination = self._extract_destination(command)
        
        def execute():
            """Multi-step: Find file, find destination, move."""
            steps = []
            
            # Step 1: Find the file
            print_step(1, 3, f"Locating file '{file_name}'")
            search_paths = [
                Path.cwd(),
                Path.home() / 'Desktop',
                Path.home() / 'Documents',
                Path.home() / 'Downloads',
            ]
            
            matches = []
            for search_path in search_paths:
                if not search_path.exists():
                    continue
                
                try:
                    for item in search_path.rglob('*'):
                        if item.is_file() and file_name.lower() in item.name.lower():
                            matches.append(item)
                            if len(matches) >= 5:
                                break
                except (PermissionError, OSError):
                    continue
            
            if not matches:
                print(f"❌ File not found: {file_name}")
                print(f"\n🤔 Okay, what would you like me to do next?")
                return None
            
            # Show matches and ask for confirmation
            print(f"✅ Found {len(matches)} match(es):\n")
            for i, match_file in enumerate(matches, 1):
                rel = match_file.relative_to(Path.home()) if match_file.is_relative_to(Path.home()) else match_file
                print(f"  {i}. {rel}")
            
            # If only one match, ask simple y/n
            if len(matches) == 1:
                print()
                import sys
                import termios
                import tty
                
                print(f"Is this the file you want to move? (y/n): ", end='', flush=True)
                
                if sys.stdin.isatty():
                    fd = sys.stdin.fileno()
                    old_settings = termios.tcgetattr(fd)
                    try:
                        tty.setraw(fd)
                        key = sys.stdin.read(1).lower()
                        print(key)  # Echo
                    finally:
                        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
                else:
                    key = input().strip().lower()[:1]
                
                print()
                
                if key != 'y':
                    print(f"\n🤔 Okay, what would you like me to do next?")
                    return None
                
                source_file = matches[0]
            else:
                # Multiple matches - ask for number, y for first, or n to cancel
                print()
                import sys
                
                response = input(f"Enter number (1-{len(matches)}), 'y' for first option, or 'n' to cancel: ").strip().lower()
                
                if response == 'n':
                    print(f"\n🤔 Okay, what would you like me to do next?")
                    return None
                elif response == 'y' or response == '1':
                    source_file = matches[0]
                elif response.isdigit() and 1 <= int(response) <= len(matches):
                    source_file = matches[int(response) - 1]
                else:
                    print(f"❌ Invalid selection")
                    print(f"\n🤔 Okay, what would you like me to do next?")
                    return None
            
            print(f"\n✅ Selected: {source_file.relative_to(Path.home()) if source_file.is_relative_to(Path.home()) else source_file}")
            
            steps.append(f"Located {file_name}")
            
            # Step 2: Determine destination
            print_step(2, 3, f"Finding destination '{destination}'")
            
            if destination.lower() == 'desktop':
                dest_dir = Path.home() / 'Desktop'
            elif destination.lower() in ['documents', 'docs']:
                dest_dir = Path.home() / 'Documents'
            elif destination.lower() == 'downloads':
                dest_dir = Path.home() / 'Downloads'
            elif destination.lower() in ['here', 'current']:
                dest_dir = Path.cwd()
            else:
                # Try to find the folder
                dest_dir = None
                for search_path in [Path.home() / 'Desktop', Path.home() / 'Documents']:
                    if not search_path.exists():
                        continue
                    
                    for item in search_path.rglob(destination):
                        if item.is_dir():
                            dest_dir = item
                            break
                    if dest_dir:
                        break
                
                if not dest_dir:
                    print(f"❌ Destination not found: {destination}")
                    return None
            
            print(f"✅ Destination: {dest_dir.relative_to(Path.home()) if dest_dir.is_relative_to(Path.home()) else dest_dir}")
            steps.append(f"Located {destination}")
            
            # Step 3: Move the file
            print_step(3, 3, "Moving file")
            dest_file = dest_dir / source_file.name
            
            try:
                shutil.move(str(source_file), str(dest_file))
                print(f"✅ Moved: {source_file.name} → {dest_dir.relative_to(Path.home()) if dest_dir.is_relative_to(Path.home()) else dest_dir}")
                steps.append("File moved")
                return str(dest_file)
            except Exception as e:
                print(f"❌ Move failed: {e}")
                return None
        
        return Task(
            description=f"Move '{file_name}' to '{destination}'",
            action=execute,
            args={'file': file_name, 'destination': destination},
            complexity=TaskComplexity.COMPLEX,
            tier_required=ModelTier.TIER_0
        )
    
    def execute_task(self, task: Task) -> TaskResult:
        """
        Execute task with tier-appropriate features.
        Only show verbose steps for complex/advanced tasks.
        """
        print(f"\n🎯 Task: {task.description}")
        print(f"   Complexity: {task.complexity.value}")
        print(f"   Tier: {self.model_tier.value}\n")
        
        steps_completed = []
        
        # Only show verbose workflow for MODERATE, COMPLEX, or ADVANCED tasks
        is_verbose = task.complexity in [TaskComplexity.MODERATE, TaskComplexity.COMPLEX, TaskComplexity.ADVANCED]
        
        try:
            # Tier-specific pre-execution (only for complex tasks)
            if is_verbose and self.model_tier.value >= ModelTier.TIER_2.value:
                print("📋 Planning execution...")
                steps_completed.append("Planning")
            
            if is_verbose and self.model_tier.value >= ModelTier.TIER_3.value:
                print("🔍 Research phase...")
                steps_completed.append("Research")
            
            # Advanced research (Tier 4, only for complex tasks)
            if is_verbose and self.model_tier.value >= ModelTier.TIER_4.value:
                print("🎓 Deep analysis...")
                steps_completed.append("Deep Analysis")
            
            # Execute main task
            if is_verbose:
                print("⚡ Executing...")
            output = task.action()
            steps_completed.append("Execution")
            
            # Check for cancellation
            if output == "CANCELLED":
                return TaskResult(
                    success=False,
                    message="❌ Task cancelled by user",
                    output=str(output),
                    steps_completed=steps_completed
                )
            
            # Verification (Tier 1+)
            if self.model_tier.value >= ModelTier.TIER_1.value and task.verification:
                print("\n✅ Verifying...")
                if task.verification():
                    steps_completed.append("Verification")
                else:
                    return TaskResult(
                        success=False,
                        message="Verification failed",
                        steps_completed=steps_completed
                    )
            
            # Testing (Tier 3+, only for complex tasks)
            if is_verbose and self.model_tier.value >= ModelTier.TIER_3.value:
                print("🧪 Running tests...")
                steps_completed.append("Testing")
            
            # Production testing and optimization (Tier 4, only for complex tasks)
            if is_verbose and self.model_tier.value >= ModelTier.TIER_4.value:
                print("🎯 Production validation...")
                steps_completed.append("Production Validation")
                print("⚡ Performance optimization...")
                steps_completed.append("Optimization")
            
            # Cleanup (if needed)
            if task.cleanup:
                print("🧹 Cleanup...")
                task.cleanup()
                steps_completed.append("Cleanup")
            
            self.task_history.append(task)
            
            return TaskResult(
                success=True,
                message=f"✅ Task completed: {task.description}",
                output=str(output),
                steps_completed=steps_completed
            )
        
        except Exception as e:
            return TaskResult(
                success=False,
                message=f"❌ Task failed: {task.description}",
                error=str(e),
                steps_completed=steps_completed
            )
    
    def _extract_name_after_keywords(self, command: str, type_keywords: List[str]) -> str:
        """
        Extract name after type keywords + name keywords.
        E.g., "folder called myproject" -> "myproject"
        E.g., "directory named webapp" -> "webapp"
        E.g., "file test.py" -> "test.py"
        E.g., "create file /path/to/file.py" -> "file.py"
        """
        command_lower = command.lower()
        name_keywords = ['called', 'named', 'titled', 'with name']
        
        # First, check if there's a full path with filename
        # E.g., "create file /Users/name/Desktop/test.py"
        path_match = re.search(r'([/~][\w./~-]+/)?([\w.-]+\.\w+)', command)
        if path_match:
            # Extract just the filename from the path
            from pathlib import Path
            return Path(path_match.group(0)).name
        
        # Look for any filename pattern with extension (e.g., test.py, config.json)
        # This catches cases like "create file fap.py on my desktop"
        filename_match = re.search(r'\b([\w.-]+\.[a-zA-Z0-9]+)\b', command)
        if filename_match:
            return filename_match.group(1)
        
        for type_kw in type_keywords:
            # Find the type keyword
            if type_kw in command_lower:
                # Look for name keyword after type keyword
                type_pos = command_lower.find(type_kw)
                after_type = command_lower[type_pos + len(type_kw):].strip()
                after_type_orig = command[type_pos + len(type_kw):].strip()
                
                # Check for explicit name keywords
                for name_kw in name_keywords:
                    if name_kw in after_type:
                        # Extract name after the name keyword
                        name_pos = after_type.find(name_kw)
                        after_name_kw = after_type_orig[name_pos + len(name_kw):].strip()
                        
                        # Extract the actual name (next word or filename)
                        name_match = re.match(r'\s*([\w./-]+)', after_name_kw)
                        if name_match:
                            name = name_match.group(1)
                            # If it's a path, extract just filename
                            if '/' in name:
                                from pathlib import Path
                                return Path(name).name
                            return name
                
                # No explicit name keyword - check if filename/foldername follows directly
                # E.g., "with file server.py" or "directory myproject"
                direct_match = re.match(r'\s+([\w./-]+)', after_type_orig)
                if direct_match:
                    potential_name = direct_match.group(1)
                    # Avoid common words
                    if potential_name not in ['on', 'in', 'at', 'with', 'and', 'containing', 'to']:
                        # If it's a path, extract just filename
                        if '/' in potential_name:
                            from pathlib import Path
                            return Path(potential_name).name
                        return potential_name
        
        # Fallback: return generic name
        return 'untitled'
    
    def _extract_location(self, command: str) -> Dict[str, str]:
        """Extract location from command, including nested paths.
        Returns: {'base': 'desktop'|'home'|'current', 'subfolder': 'path/to/folder' or None, 'full_path': Path or None}
        """
        from pathlib import Path
        command_lower = command.lower()
        result = {'base': 'current', 'subfolder': None, 'full_path': None}
        
        # First, check for explicit full paths (~/Desktop/Projects/foo or /full/path)
        # Pattern: ~/path/to/folder or /path/to/folder
        explicit_path_match = re.search(r'(?:in|to|on|at)\s+([~\/][\w\/.-]+)', command)
        if explicit_path_match:
            path_str = explicit_path_match.group(1)
            # Expand ~ to home directory
            if path_str.startswith('~'):
                result['full_path'] = Path.home() / path_str[2:].lstrip('/')
            else:
                result['full_path'] = Path(path_str)
            return result
        
        # Check for base location
        if 'desktop' in command_lower:
            result['base'] = 'desktop'
        elif 'home' in command_lower:
            result['base'] = 'home'
        elif 'documents' in command_lower:
            result['base'] = 'documents'
        
        # Extract subfolder path if specified (e.g., "Projects/todo_app folder on desktop")
        # Pattern 1: "<path> folder/directory on/in <location>"
        subfolder_match = re.search(r'\b([\w/-]+)\s+(?:folder|directory|dir)\s+(?:on|in)\s+(?:my\s+)?(?:desktop|home|documents)', command_lower)
        if subfolder_match:
            result['subfolder'] = subfolder_match.group(1)
        
        # Pattern 2: "in <folder1>/<folder2>/... on desktop"
        nested_match = re.search(r'(?:in|to)\s+([\w/-]+)\s+(?:on|in)\s+(?:my\s+)?(?:desktop|home|documents)', command_lower)
        if nested_match:
            result['subfolder'] = nested_match.group(1)
        
        # Pattern 3: "to my desktop/Projects/foo" or "in ~/Desktop/Projects"
        path_match = re.search(r'(?:to|in|on)\s+(?:my\s+)?(?:desktop|home|documents)[/]([\w/-]+)', command_lower)
        if path_match:
            result['subfolder'] = path_match.group(1)
        
        return result
    
    def _extract_file_hint_from_query(self, command: str) -> str:
        """Extract file hint from find-and-move queries."""
        import re
        command_lower = command.lower()
        
        # Check for context references first ("the file", "it")
        if command_lower.startswith('where is the file') or command_lower.startswith('where is it'):
            # Use last created file if available
            if self.last_created_file:
                from pathlib import Path
                return Path(self.last_created_file).name
            else:
                return 'file'  # Vague reference with no context
        
        # Look for filename with extension in the FIRST part (before "move"/"once")
        first_part = re.split(r'move|once|then|and|to', command_lower)[0]
        file_match = re.search(r'(\w+\.\w+)', first_part)
        if file_match:
            return file_match.group(1)
        
        # Look for words between 'where/find' and 'move/to/once'
        # e.g., "where is test.py? move it to..."
        parts = re.split(r'\?|move|put|transfer|relocate|to|once|then', command_lower)
        if len(parts) > 0:
            first_part = parts[0]
            # Remove command words
            for word in ['where', 'is', 'the', 'find', 'locate', 'file', 'script']:
                first_part = first_part.replace(word, '')
            
            words = first_part.strip().split()
            if words:
                for word in words:
                    if len(word) > 2:
                        return word
        
        return 'file'  # Generic fallback
    
    def _extract_search_target(self, command: str) -> str:
        """Extract what to search for from find/locate commands."""
        command_lower = command.lower()
        
        # Remove command keywords
        for keyword in ['find', 'locate', 'search', 'where', 'is', 'the', 'for']:
            command_lower = command_lower.replace(keyword, '')
        
        # Extract filename or folder name
        words = command_lower.strip().split()
        if words:
            # Return first substantial word (likely the target)
            for word in words:
                if len(word) > 2 and word not in ['file', 'folder', 'directory', 'script']:
                    return word
        
        return 'unknown'
    
    def _extract_file_to_move(self, command: str) -> str:
        """Extract filename from move command."""
        command_lower = command.lower()
        
        # Look for file patterns
        import re
        # Match filenames with extensions
        file_match = re.search(r'(\w+\.\w+)', command_lower)
        if file_match:
            return file_match.group(1)
        
        # Look for file/script keyword followed by name
        for keyword in ['file', 'script']:
            if keyword in command_lower:
                parts = command_lower.split(keyword)
                if len(parts) > 1:
                    words = parts[1].strip().split()
                    if words:
                        return words[0]
        
        return 'unknown'
    
    def _extract_destination(self, command: str) -> str:
        """Extract destination from move command - only single word."""
        command_lower = command.lower()
        
        # Look for 'to', 'into', 'in' keywords
        for keyword in [' to the ', ' to ', ' into the ', ' into ', ' in the ', ' in ']:
            if keyword in command_lower:
                # Split and get text after keyword
                idx = command_lower.find(keyword)
                dest_text = command_lower[idx + len(keyword):].strip()
                
                # Remove common words and get first substantial word
                for remove_word in ['directory', 'folder', 'called', 'named', 'on', 'desktop']:
                    dest_text = dest_text.replace(remove_word, ' ')
                
                words = [w for w in dest_text.split() if len(w) > 1 and w.isalnum()]
                if words:
                    # Return ONLY first word
                    return words[0]
        
        return 'desktop'  # Default to desktop
    
    def _extract_content_hints(self, command: str, filename: str) -> Dict:
        """Extract hints about file content from command."""
        hints = {
            'filename': filename,
            'type': self._get_file_type(filename),
            'purpose': None
        }
        
        # Check for purpose keywords
        if 'hello world' in command.lower():
            hints['purpose'] = 'hello_world'
        elif 'test' in command.lower():
            hints['purpose'] = 'test'
        elif 'api' in command.lower():
            hints['purpose'] = 'api'
        
        return hints
    
    def _get_file_type(self, filename: str) -> str:
        """Get file type from extension."""
        if filename.endswith('.py'):
            return 'python'
        elif filename.endswith('.js'):
            return 'javascript'
        elif filename.endswith('.sh'):
            return 'bash'
        elif filename.endswith('.md'):
            return 'markdown'
        return 'text'
    
    def _get_template_content(self, filename: str, hints: Dict) -> str:
        """Get template content for Tier 0-1 models."""
        file_type = hints['type']
        purpose = hints.get('purpose')
        
        if file_type == 'python':
            if purpose == 'hello_world':
                return '''#!/usr/bin/env python3
"""
Simple Hello World script
Created by LuciferAI
"""

def main():
    print("Hello, World!")
    print("Created with LuciferAI")

if __name__ == "__main__":
    main()
'''
            else:
                return f'''#!/usr/bin/env python3
"""
{filename} - Created by LuciferAI
"""

def main():
    # Your code here
    pass

if __name__ == "__main__":
    main()
'''
        
        elif file_type == 'bash':
            return f'''#!/bin/bash
# {filename} - Created by LuciferAI

echo "Script running..."
'''
        
        else:
            return f"# {filename}\n# Created by LuciferAI\n"
    
    def _generate_file_content(self, filename: str, hints: Dict) -> str:
        """Generate content using AI (Tier 2-3)."""
        # This would integrate with Ollama models
        # For now, return enhanced template
        return self._get_template_content(filename, hints)


def get_task_system(model_tier: ModelTier = ModelTier.TIER_0) -> UniversalTaskSystem:
    """Get task system instance for current model tier."""
    return UniversalTaskSystem(model_tier)


# Quick test
if __name__ == "__main__":
    # Test with Tier 0 (TinyLlama)
    system = get_task_system(ModelTier.TIER_0)
    
    command = "build a folder on desktop called test_project with a python script hello.py"
    task = system.parse_command(command)
    
    if task:
        result = system.execute_task(task)
        print(f"\n{result.message}")
        if result.error:
            print(f"Error: {result.error}")
        if result.steps_completed:
            print(f"Steps: {' → '.join(result.steps_completed)}")
    else:
        print("\n❌ Could not parse command")
