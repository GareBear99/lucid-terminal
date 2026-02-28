#!/usr/bin/env python3
"""
🔧 LuciferAI Autofix Module
Automatically fixes syntax and indentation issues in Python files
"""
import re
import subprocess
import ast
from pathlib import Path
from typing import Optional, Tuple, List
from lucifer_colors import c, Emojis


class AutoFixer:
    """Automatically fixes common syntax and indentation issues."""
    
    def __init__(self):
        self.has_autopep8 = self._check_tool("autopep8")
        self.has_black = self._check_tool("black")
    
    def _check_tool(self, tool_name: str) -> bool:
        """Check if a formatting tool is available."""
        try:
            result = subprocess.run(
                ["which", tool_name],
                capture_output=True,
                text=True,
                timeout=2
            )
            return result.returncode == 0
        except:
            return False
    
    def fix_file(self, filepath: str, aggressive: bool = False) -> Tuple[bool, str]:
        """
        Fix syntax and indentation issues in a Python file.
        
        Args:
            filepath: Path to the file to fix
            aggressive: Use more aggressive fixing
        
        Returns:
            Tuple of (success, message)
        """
        filepath = Path(filepath)
        
        if not filepath.exists():
            return False, f"File not found: {filepath}"
        
        if not filepath.suffix == ".py":
            return False, "Only Python files are supported"
        
        # Try to read the file
        try:
            original_content = filepath.read_text()
        except Exception as e:
            return False, f"Could not read file: {e}"
        
        # First, try basic fixes
        fixed_content = self._basic_fixes(original_content)
        
        # Try parsing to check for syntax errors
        syntax_errors = self._check_syntax(fixed_content)
        
        if not syntax_errors:
            # No syntax errors, apply formatting
            fixed_content = self._apply_formatting(fixed_content, aggressive)
            
            # Write back
            try:
                filepath.write_text(fixed_content)
                return True, "File fixed successfully"
            except Exception as e:
                return False, f"Could not write file: {e}"
        else:
            # Try to fix specific syntax errors
            for error_msg, line_num in syntax_errors[:5]:  # Fix first 5 errors
                fixed_content = self._fix_syntax_error(fixed_content, error_msg, line_num)
            
            # Check again
            if not self._check_syntax(fixed_content):
                # Apply formatting
                fixed_content = self._apply_formatting(fixed_content, aggressive)
                
                try:
                    filepath.write_text(fixed_content)
                    return True, "File fixed successfully (with syntax corrections)"
                except Exception as e:
                    return False, f"Could not write file: {e}"
            else:
                # Still has errors, but save anyway with basic fixes
                try:
                    filepath.write_text(fixed_content)
                    return False, f"Partial fix applied, {len(syntax_errors)} errors remain"
                except Exception as e:
                    return False, f"Could not write file: {e}"
    
    def _basic_fixes(self, content: str) -> str:
        """Apply basic text-level fixes."""
        lines = content.split('\n')
        fixed_lines = []
        
        for line in lines:
            # Fix common escape sequence issues
            line = line.replace('\\n', '\n') if '\\n' in line and not line.strip().startswith('#') else line
            line = line.replace('\\t', '\t') if '\\t' in line and not line.strip().startswith('#') else line
            
            # Fix escaped quotes in code (not in strings)
            if '\\"' in line and not self._is_in_string(line):
                line = line.replace('\\"', '"')
            
            fixed_lines.append(line)
        
        return '\n'.join(fixed_lines)
    
    def _is_in_string(self, line: str) -> bool:
        """Check if escaped quotes are likely within a string literal."""
        # Simple heuristic: count quotes before the escaped quote
        quote_count = line.count('"') + line.count("'")
        return quote_count >= 2
    
    def _check_syntax(self, content: str) -> List[Tuple[str, int]]:
        """Check for syntax errors."""
        try:
            ast.parse(content)
            return []
        except SyntaxError as e:
            return [(str(e.msg), e.lineno if e.lineno else 0)]
        except Exception as e:
            return [(str(e), 0)]
    
    def _fix_syntax_error(self, content: str, error_msg: str, line_num: int) -> str:
        """Try to fix a specific syntax error."""
        lines = content.split('\n')
        
        if line_num == 0 or line_num > len(lines):
            return content
        
        line_idx = line_num - 1
        line = lines[line_idx]
        
        # Fix common issues
        if "unexpected character after line continuation character" in error_msg:
            # Remove backslashes before newlines
            line = re.sub(r'\\+n', '\n', line)
            line = re.sub(r'\\+t', '\t', line)
            line = re.sub(r'\\\\"', '"', line)
            lines[line_idx] = line
        
        elif "invalid syntax" in error_msg.lower():
            # Try to fix missing colons
            if line.strip().startswith(('if ', 'elif ', 'else', 'for ', 'while ', 'def ', 'class ', 'try', 'except', 'finally', 'with ')):
                if not line.rstrip().endswith(':'):
                    lines[line_idx] = line.rstrip() + ':'
        
        return '\n'.join(lines)
    
    def _apply_formatting(self, content: str, aggressive: bool = False) -> str:
        """Apply code formatting using available tools."""
        # Try autopep8 first (more conservative)
        if self.has_autopep8 and not aggressive:
            try:
                result = subprocess.run(
                    ["autopep8", "-"],
                    input=content,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    return result.stdout
            except:
                pass
        
        # Try black for more aggressive formatting
        if self.has_black and aggressive:
            try:
                result = subprocess.run(
                    ["black", "-", "--quiet"],
                    input=content,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    return result.stdout
            except:
                pass
        
        # Fallback: basic indentation fixing
        return self._fix_indentation(content)
    
    def _fix_indentation(self, content: str) -> str:
        """Basic indentation fixing."""
        lines = content.split('\n')
        indent_level = 0
        fixed_lines = []
        
        for line in lines:
            stripped = line.lstrip()
            
            if not stripped or stripped.startswith('#'):
                fixed_lines.append(line)
                continue
            
            # Decrease indent for certain keywords
            if stripped.startswith(('elif ', 'else:', 'except', 'except:', 'finally:', 'return', 'break', 'continue')):
                if stripped.startswith(('return', 'break', 'continue')):
                    # These don't change indent level
                    pass
                else:
                    indent_level = max(0, indent_level - 1)
            
            # Apply indent
            fixed_line = '    ' * indent_level + stripped
            fixed_lines.append(fixed_line)
            
            # Increase indent after certain lines
            if stripped.rstrip().endswith(':'):
                indent_level += 1
            
            # Decrease indent after dedent keywords
            if stripped.startswith(('return', 'break', 'continue', 'raise', 'pass')):
                # Check if we should dedent next
                pass
        
        return '\n'.join(fixed_lines)


def autofix_file(filepath: str, aggressive: bool = False, verbose: bool = True) -> bool:
    """
    Convenience function to autofix a file.
    
    Args:
        filepath: Path to file to fix
        aggressive: Use aggressive formatting
        verbose: Print status messages
    
    Returns:
        True if successful
    """
    fixer = AutoFixer()
    
    if verbose:
        print(c(f"{Emojis.WRENCH} Autofixing {filepath}...", "blue"))
    
    success, message = fixer.fix_file(filepath, aggressive)
    
    if verbose:
        if success:
            print(c(f"{Emojis.CHECKMARK} {message}", "green"))
        else:
            print(c(f"{Emojis.WARNING} {message}", "yellow"))
    
    return success


def autofix_directory(directory: str, recursive: bool = True, aggressive: bool = False) -> Tuple[int, int]:
    """
    Autofix all Python files in a directory.
    
    Args:
        directory: Directory path
        recursive: Search recursively
        aggressive: Use aggressive formatting
    
    Returns:
        Tuple of (success_count, total_count)
    """
    directory = Path(directory)
    
    if not directory.is_dir():
        print(c(f"{Emojis.ERROR} Not a directory: {directory}", "red"))
        return 0, 0
    
    # Find Python files
    if recursive:
        py_files = list(directory.rglob("*.py"))
    else:
        py_files = list(directory.glob("*.py"))
    
    print(c(f"{Emojis.MAGNIFYING_GLASS} Found {len(py_files)} Python files", "blue"))
    
    fixer = AutoFixer()
    success_count = 0
    
    for py_file in py_files:
        success, message = fixer.fix_file(str(py_file), aggressive)
        if success:
            success_count += 1
            print(c(f"{Emojis.CHECKMARK} {py_file.name}", "green"))
        else:
            print(c(f"{Emojis.WARNING} {py_file.name}: {message}", "yellow"))
    
    print(c(f"\n{Emojis.SPARKLES} Fixed {success_count}/{len(py_files)} files", "cyan"))
    return success_count, len(py_files)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print(c(f"{Emojis.INFO} Usage: python autofix.py <file_or_directory>", "cyan"))
        sys.exit(1)
    
    target = sys.argv[1]
    target_path = Path(target)
    
    if target_path.is_file():
        autofix_file(str(target_path))
    elif target_path.is_dir():
        autofix_directory(str(target_path))
    else:
        print(c(f"{Emojis.ERROR} Not found: {target}", "red"))
        sys.exit(1)
