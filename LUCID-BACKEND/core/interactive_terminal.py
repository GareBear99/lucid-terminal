#!/usr/bin/env python3
"""
🖱️ LuciferAI Interactive Terminal - Clickable Code Snippets
Makes terminal output interactive with clickable links to open files/snippets
"""
import os
import sys
import tempfile
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any

from lucifer_colors import c, Emojis


class InteractiveTerminal:
    """
    Handles interactive terminal features including clickable code snippets.
    Uses OSC 8 hyperlinks for terminal compatibility.
    """
    
    def __init__(self):
        self.snippet_cache: Dict[str, str] = {}
        self.temp_dir = Path(tempfile.gettempdir()) / "luciferai_snippets"
        self.temp_dir.mkdir(exist_ok=True)
        
        # Preferences
        self.prefs_dir = Path.home() / ".luciferai" / "preferences"
        self.prefs_dir.mkdir(parents=True, exist_ok=True)
        self.prefs_file = self.prefs_dir / "editor_prefs.json"
        
        # Detect terminal capabilities
        self.supports_hyperlinks = self._check_hyperlink_support()
        self.editor = self._get_default_editor()
    
    def _check_hyperlink_support(self) -> bool:
        """Check if terminal supports OSC 8 hyperlinks."""
        term = os.getenv("TERM", "")
        term_program = os.getenv("TERM_PROGRAM", "")
        
        # Terminals that support hyperlinks
        supported = [
            "iTerm.app",
            "WezTerm",
            "kitty",
            "alacritty",
            "hyper"
        ]
        
        return term_program in supported or "kitty" in term or term.startswith("xterm")
    
    def _get_default_editor(self) -> str:
        """Get default text editor (without prompting)."""
        # Check saved preferences
        prefs = self._load_preferences()
        if prefs.get("editor"):
            return prefs["editor"]
        
        # Check environment variables
        editor = os.getenv("EDITOR") or os.getenv("VISUAL")
        
        if editor:
            return editor
        
        # macOS defaults
        if sys.platform == "darwin":
            # Try to find VS Code
            if os.path.exists("/Applications/Visual Studio Code.app"):
                return "code"
            # Try Sublime Text
            if os.path.exists("/Applications/Sublime Text.app"):
                return "subl"
            # Default to TextEdit (don't prompt yet)
            return "open -e"
        
        # Linux defaults
        elif sys.platform == "linux":
            # Try common editors
            for editor in ["code", "subl", "gedit", "nano", "vim"]:
                if subprocess.run(["which", editor], capture_output=True).returncode == 0:
                    return editor
        
        # Fallback
        return "nano"
    
    def _load_preferences(self) -> dict:
        """Load user preferences."""
        if self.prefs_file.exists():
            try:
                import json
                with open(self.prefs_file, 'r') as f:
                    return json.load(f)
            except:
                return {}
        return {}
    
    def _save_preferences(self, prefs: dict):
        """Save user preferences."""
        import json
        with open(self.prefs_file, 'w') as f:
            json.dump(prefs, f, indent=2)
    
    def _prompt_vscode_install(self) -> str:
        """Prompt user to install VSCode or use default editor."""
        print(c("\n" + "="*60, "purple"))
        print(c("  📝 Text Editor Setup", "cyan"))
        print(c("="*60, "purple"))
        print()
        print(c("VSCode not found on your system.", "yellow"))
        print(c("VSCode is recommended for the best code editing experience.\n", "dim"))
        print(c("Options:", "cyan"))
        print(c("  1. Install VSCode (recommended)", "green"))
        print(c("  2. Use TextEdit with .txt files (native macOS)", "blue"))
        print(c("  3. Use TextEdit for all files (native macOS)", "blue"))
        print(c("  4. Use Nano (terminal editor)", "blue"))
        print()
        
        editor = "open -e"
        use_txt = False
        
        while True:
            choice = input(c("Enter your choice (1-4): ", "cyan")).strip()
            
            if choice == "1":
                print()
                print(c("📦 Installing VSCode...", "cyan"))
                print(c("Opening download page in your browser...", "dim"))
                print()
                
                # Open VSCode download page
                import webbrowser
                webbrowser.open("https://code.visualstudio.com/download")
                
                print(c("After installing VSCode:", "yellow"))
                print(c("  1. Run this command in terminal: code --version", "dim"))
                print(c("  2. If 'code' is not found, open VSCode and:", "dim"))
                print(c("     - Press Cmd+Shift+P", "dim"))
                print(c("     - Type 'Shell Command: Install code'", "dim"))
                print(c("     - Press Enter\n", "dim"))
                
                # For now, fall back to TextEdit
                editor = "open -e"
                break
            
            elif choice == "2":
                editor = "open -e"
                use_txt = True
                print(c("\n✅ Using TextEdit (will convert to .txt files)", "green"))
                break
            
            elif choice == "3":
                editor = "open -e"
                print(c("\n✅ Using TextEdit", "green"))
                break
            
            elif choice == "4":
                editor = "nano"
                print(c("\n✅ Using Nano", "green"))
                break
            
            else:
                print(c("Invalid choice. Please enter 1-4.", "red"))
        
        # Ask about saving preference
        print()
        dont_ask = input(c("Don't ask again? (y/n): ", "yellow")).strip().lower()
        
        if dont_ask == 'y':
            prefs = self._load_preferences()
            prefs["skip_vscode_prompt"] = True
            prefs["editor"] = editor
            prefs["use_txt_files"] = use_txt
            self._save_preferences(prefs)
            print(c("✅ Preference saved. Use 'reset editor settings' in help menu to reset\n", "green"))
        
        print(c("="*60 + "\n", "purple"))
        
        return editor
    
    def create_clickable_snippet(self, 
                                 code: str, 
                                 label: str = "View Code", 
                                 filename: Optional[str] = None,
                                 language: str = "python") -> str:
        """
        Create a clickable link that opens code in editor.
        
        Args:
            code: The code content
            label: Display text for the link
            filename: Optional filename for the snippet
            language: Programming language for syntax (default: python)
        
        Returns:
            Formatted string with clickable link
        """
        if not filename:
            filename = f"snippet_{len(self.snippet_cache)}.{language}"
        
        # Save snippet to temp file
        snippet_path = self.temp_dir / filename
        with open(snippet_path, 'w') as f:
            f.write(code)
        
        # Store in cache
        self.snippet_cache[str(snippet_path)] = code
        
        # Create clickable link
        if self.supports_hyperlinks:
            # OSC 8 hyperlink format: \033]8;;file://path\033\\text\033]8;;\033\\
            link = f"\033]8;;file://{snippet_path}\033\\{c(f'[{label}]', 'cyan')}\033]8;;\033\\"
        else:
            # Fallback: show path
            link = c(f"[{label}: {snippet_path}]", "cyan")
        
        return link
    
    def create_clickable_file(self, filepath: str, label: Optional[str] = None) -> str:
        """
        Create a clickable link to an existing file.
        
        Args:
            filepath: Path to the file
            label: Optional display text (defaults to filename)
        
        Returns:
            Formatted string with clickable link
        """
        path = Path(filepath).resolve()
        
        if not label:
            label = path.name
        
        if self.supports_hyperlinks and path.exists():
            # OSC 8 hyperlink
            link = f"\033]8;;file://{path}\033\\{c(f'[{label}]', 'blue')}\033]8;;\033\\"
        else:
            # Fallback
            link = c(f"[{label}: {path}]", "blue")
        
        return link
    
    def open_in_editor(self, filepath: str) -> bool:
        """
        Open file in text editor. Prompts for VSCode if not set.
        
        Args:
            filepath: Path to file to open
        
        Returns:
            True if successful, False otherwise
        """
        try:
            path = Path(filepath)
            
            if not path.exists():
                print(c(f"{Emojis.CROSS} File not found: {filepath}", "red"))
                return False
            
            # Check if we should prompt for editor preference
            prefs = self._load_preferences()
            
            # If using default TextEdit and haven't been asked, prompt now
            if self.editor == "open -e" and not prefs.get("skip_vscode_prompt", False):
                # Check if VSCode is installed
                if not os.path.exists("/Applications/Visual Studio Code.app"):
                    self.editor = self._prompt_vscode_install()
            
            # If user chose text file mode, create .txt version
            if prefs.get("use_txt_files", False):
                # Copy to .txt file
                txt_path = path.with_suffix('.txt')
                import shutil
                shutil.copy(str(path), str(txt_path))
                path = txt_path
            
            # Open with editor
            if self.editor == "open -e":
                # macOS TextEdit
                subprocess.Popen(["open", "-e", str(path)])
            elif self.editor == "code":
                # VS Code
                subprocess.Popen([self.editor, str(path)])
            elif self.editor == "subl":
                # Sublime Text
                subprocess.Popen([self.editor, str(path)])
            else:
                # Terminal-based editors
                subprocess.run([self.editor, str(path)])
            
            print(c(f"{Emojis.CHECKMARK} Opened in {self.editor}: {path.name}", "green"))
            return True
        
        except Exception as e:
            print(c(f"{Emojis.CROSS} Error opening file: {e}", "red"))
            return False
    
    def create_interactive_code_block(self,
                                      code: str,
                                      title: str = "Code Snippet",
                                      show_preview: bool = True,
                                      preview_lines: int = 5,
                                      filename: Optional[str] = None) -> str:
        """
        Create an interactive code block with clickable link and optional preview.
        
        Args:
            code: The code content
            title: Title for the code block
            show_preview: Whether to show a preview of the code
            preview_lines: Number of lines to preview
            filename: Optional filename
        
        Returns:
            Formatted string with code block and clickable link
        """
        # Create snippet file and link
        link = self.create_clickable_snippet(code, "Click to open in editor", filename)
        
        # Build output
        output = []
        output.append(c(f"\n▶ {title}", "purple"))
        output.append(f"  {link}")
        
        if show_preview:
            lines = code.strip().split('\n')
            preview = lines[:preview_lines]
            
            output.append(c("\n  Preview:", "dim"))
            for line in preview:
                output.append(c(f"    {line}", "dim"))
            
            if len(lines) > preview_lines:
                output.append(c(f"    ... ({len(lines) - preview_lines} more lines)", "dim"))
        
        output.append("")  # Empty line
        
        return '\n'.join(output)
    
    def create_expandable_section(self,
                                   title: str,
                                   content: str,
                                   collapsed: bool = True,
                                   code_snippet: Optional[str] = None) -> str:
        """
        Create an expandable section that shows/hides content.
        
        Args:
            title: Section title
            content: Content to show when expanded
            collapsed: Whether section starts collapsed
            code_snippet: Optional code to make clickable
        
        Returns:
            Formatted string with expandable section
        """
        output = []
        
        if collapsed:
            output.append(c(f"▶ {title} ", "cyan") + c("[Click to expand]", "dim"))
        else:
            output.append(c(f"▼ {title}", "cyan"))
            
            # Show content
            for line in content.strip().split('\n'):
                output.append(f"  {line}")
            
            # Add clickable code snippet if provided
            if code_snippet:
                link = self.create_clickable_snippet(code_snippet, "Open code", f"{title.lower().replace(' ', '_')}.py")
                output.append(f"\n  {link}")
        
        return '\n'.join(output)
    
    def cleanup_temp_files(self):
        """Clean up temporary snippet files."""
        try:
            for file in self.temp_dir.glob("snippet_*"):
                file.unlink()
            print(c(f"{Emojis.CHECKMARK} Cleaned up {len(self.snippet_cache)} temp snippets", "green"))
            self.snippet_cache.clear()
        except Exception as e:
            print(c(f"{Emojis.WARNING} Error cleaning temp files: {e}", "yellow"))


# Global instance
_interactive_terminal = None

def get_interactive_terminal() -> InteractiveTerminal:
    """Get or create global InteractiveTerminal instance."""
    global _interactive_terminal
    if _interactive_terminal is None:
        _interactive_terminal = InteractiveTerminal()
    return _interactive_terminal


def make_clickable(code: str, label: str = "View Code") -> str:
    """
    Quick helper to make code clickable.
    
    Args:
        code: Code content
        label: Link label
    
    Returns:
        Clickable link string
    """
    terminal = get_interactive_terminal()
    return terminal.create_clickable_snippet(code, label)


def make_file_clickable(filepath: str, label: Optional[str] = None) -> str:
    """
    Quick helper to make file path clickable.
    
    Args:
        filepath: Path to file
        label: Optional link label
    
    Returns:
        Clickable link string
    """
    terminal = get_interactive_terminal()
    return terminal.create_clickable_file(filepath, label)


def create_clickable_snippet(code: str, filename: Optional[str] = None, label: Optional[str] = None) -> str:
    """
    Create a clickable link for a code snippet.
    
    Args:
        code: Code content
        filename: Optional filename for the snippet
        label: Optional label for the link
    
    Returns:
        Clickable link string
    """
    terminal = get_interactive_terminal()
    
    if not filename:
        filename = "snippet.py"
    
    if not label:
        label = "[Click to view code snippet]"
    
    return terminal.create_clickable_snippet(code, label, filename)


def open_snippet(code: str, filename: Optional[str] = None) -> bool:
    """
    Open code snippet in editor.
    
    Args:
        code: Code content
        filename: Optional filename
    
    Returns:
        True if successful
    """
    terminal = get_interactive_terminal()
    
    if not filename:
        filename = "snippet.py"
    
    snippet_path = terminal.temp_dir / filename
    with open(snippet_path, 'w') as f:
        f.write(code)
    
    return terminal.open_in_editor(str(snippet_path))


def reset_editor_settings() -> bool:
    """
    Reset editor settings to default (removes saved preferences).
    
    Returns:
        True if successful
    """
    from lucifer_colors import c, Emojis
    
    terminal = get_interactive_terminal()
    
    if terminal.prefs_file.exists():
        terminal.prefs_file.unlink()
        print(c(f"{Emojis.CHECKMARK} Editor settings reset to default", "green"))
        print(c("  You will be prompted again next time you open a code snippet", "blue"))
        return True
    else:
        print(c(f"{Emojis.LIGHTBULB} No saved preferences found", "yellow"))
        return False


# Test/Demo
if __name__ == "__main__":
    print(c("\n🖱️  Interactive Terminal Demo\n", "purple"))
    
    terminal = InteractiveTerminal()
    
    print(c("Terminal Capabilities:", "cyan"))
    print(f"  Hyperlink Support: {'✅ Yes' if terminal.supports_hyperlinks else '❌ No'}")
    print(f"  Default Editor: {terminal.editor}\n")
    
    # Demo 1: Clickable snippet
    demo_code = """def hello_world():
    print("Hello from clickable code!")
    return "Success"

if __name__ == "__main__":
    hello_world()
"""
    
    print(c("Demo 1: Clickable Code Snippet", "green"))
    link = terminal.create_clickable_snippet(demo_code, "Click to open hello.py", "hello.py")
    print(f"  {link}\n")
    
    # Demo 2: Interactive code block
    print(c("Demo 2: Interactive Code Block", "green"))
    block = terminal.create_interactive_code_block(
        demo_code,
        title="Hello World Function",
        show_preview=True,
        preview_lines=3,
        filename="hello_demo.py"
    )
    print(block)
    
    # Demo 3: Expandable section
    print(c("Demo 3: Expandable Section", "green"))
    expanded = terminal.create_expandable_section(
        "Sample Fix for NameError",
        "This fix resolves the NameError by importing datetime:\n\nfrom datetime import datetime",
        collapsed=False,
        code_snippet="from datetime import datetime"
    )
    print(expanded)
    
    print(c("\n💡 Try clicking the blue/cyan links if your terminal supports it!", "yellow"))
    print(c("   Or use the file paths to open manually.\n", "dim"))
