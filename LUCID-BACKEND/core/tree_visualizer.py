#!/usr/bin/env python3
"""
🌳 Tree Visualizer - Visual Directory Structure Display
Generates clean, annotated tree structures for directory listings
"""
import os
from pathlib import Path
from typing import List, Dict, Optional, Set

# Tree drawing characters
BRANCH = "├── "
PIPE = "│   "
ELBOW = "└── "
BLANK = "    "

# Colors
CYAN = '\033[36m'
GREEN = '\033[32m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
DIM = '\033[2m'
RESET = '\033[0m'


class TreeVisualizer:
    """Generates visual tree structures for directories."""
    
    def __init__(self, show_hidden: bool = False, max_depth: int = 3):
        """
        Initialize tree visualizer.
        
        Args:
            show_hidden: Whether to show hidden files/directories
            max_depth: Maximum depth to traverse
        """
        self.show_hidden = show_hidden
        self.max_depth = max_depth
        self.annotations = {}  # Store annotations for paths
    
    def add_annotation(self, path: str, annotation: str):
        """Add an annotation comment for a specific path."""
        self.annotations[str(Path(path).name)] = annotation
    
    def add_annotations(self, annotations: Dict[str, str]):
        """Add multiple annotations at once."""
        self.annotations.update(annotations)
    
    def generate_tree(self, root_path: str, max_items: int = 50) -> str:
        """
        Generate a tree structure for the given directory.
        
        Args:
            root_path: Root directory to visualize
            max_items: Maximum items to show (prevents huge trees)
            
        Returns:
            Formatted tree string
        """
        root = Path(root_path).resolve()
        
        if not root.exists():
            return f"{root.name}/ (does not exist)"
        
        if not root.is_dir():
            return f"{root.name} (not a directory)"
        
        lines = [f"{CYAN}{root.name}/{RESET}"]
        
        try:
            self._build_tree(root, "", lines, 0, max_items)
        except Exception as e:
            lines.append(f"{YELLOW}(Error reading directory: {e}){RESET}")
        
        return "\n".join(lines)
    
    def _build_tree(self, directory: Path, prefix: str, lines: List[str], 
                    depth: int, max_items: int, shown_count: Dict = None):
        """
        Recursively build tree structure.
        
        Args:
            directory: Current directory
            prefix: Current line prefix (for indentation)
            lines: List to append lines to
            depth: Current depth
            max_items: Maximum items to show
            shown_count: Counter for items shown
        """
        if shown_count is None:
            shown_count = {'count': 0}
        
        if depth >= self.max_depth:
            return
        
        if shown_count['count'] >= max_items:
            lines.append(f"{prefix}{ELBOW}{DIM}(... truncated ...){RESET}")
            return
        
        try:
            # Get directory contents
            contents = sorted(directory.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
            
            # Filter hidden files if needed
            if not self.show_hidden:
                contents = [p for p in contents if not p.name.startswith('.')]
            
            # Separate directories and files
            dirs = [p for p in contents if p.is_dir()]
            files = [p for p in contents if p.is_file()]
            all_items = dirs + files
            
            for i, item in enumerate(all_items):
                if shown_count['count'] >= max_items:
                    lines.append(f"{prefix}{ELBOW}{DIM}(... {len(all_items) - i} more items ...){RESET}")
                    break
                
                is_last = (i == len(all_items) - 1)
                connector = ELBOW if is_last else BRANCH
                
                # Get annotation if exists
                annotation = self.annotations.get(item.name, "")
                annotation_str = f"  {DIM}# {annotation}{RESET}" if annotation else ""
                
                # Format item name with color
                if item.is_dir():
                    item_str = f"{CYAN}{item.name}/{RESET}"
                elif item.suffix in ['.py', '.sh', '.js', '.ts']:
                    item_str = f"{GREEN}{item.name}{RESET}"
                elif item.suffix in ['.md', '.txt', '.json', '.yaml', '.yml']:
                    item_str = f"{BLUE}{item.name}{RESET}"
                else:
                    item_str = item.name
                
                lines.append(f"{prefix}{connector}{item_str}{annotation_str}")
                shown_count['count'] += 1
                
                # Recurse into directories
                if item.is_dir() and depth + 1 < self.max_depth:
                    extension = BLANK if is_last else PIPE
                    self._build_tree(item, prefix + extension, lines, depth + 1, 
                                   max_items, shown_count)
        
        except PermissionError:
            lines.append(f"{prefix}{ELBOW}{YELLOW}(Permission denied){RESET}")
        except Exception as e:
            lines.append(f"{prefix}{ELBOW}{YELLOW}(Error: {e}){RESET}")


def format_ls_as_tree(path: str, annotations: Optional[Dict[str, str]] = None,
                      show_hidden: bool = False, max_depth: int = 2) -> str:
    """
    Format an ls command output as a visual tree.
    
    Args:
        path: Directory path to list
        annotations: Dictionary of {filename: comment}
        show_hidden: Whether to show hidden files
        max_depth: Maximum depth to traverse
        
    Returns:
        Formatted tree string
    """
    viz = TreeVisualizer(show_hidden=show_hidden, max_depth=max_depth)
    
    if annotations:
        viz.add_annotations(annotations)
    
    return viz.generate_tree(path)


def format_operation_tree(root_name: str, structure: Dict) -> str:
    """
    Format a planned operation (move, create, etc.) as a tree.
    
    Args:
        root_name: Name of the root directory
        structure: Nested dict representing structure:
                  {'dirname/': {'file1.txt': 'annotation', 'subdir/': {...}}}
        
    Returns:
        Formatted tree string
    
    Example:
        structure = {
            'project/': {
                'src/': {
                    'main.py': 'Entry point',
                    'utils.py': 'Utilities'
                },
                'README.md': 'Documentation',
                'tests/': {
                    'test_main.py': 'Unit tests'
                }
            }
        }
    """
    lines = [f"{CYAN}{root_name}/{RESET}"]
    _build_operation_tree(structure, "", lines)
    return "\n".join(lines)


def _build_operation_tree(structure: Dict, prefix: str, lines: List[str]):
    """Recursively build operation tree."""
    items = list(structure.items())
    
    for i, (name, content) in enumerate(items):
        is_last = (i == len(items) - 1)
        connector = ELBOW if is_last else BRANCH
        
        # Check if it's a directory
        is_dir = name.endswith('/')
        
        # Handle annotation
        if isinstance(content, str):
            # It's a file with annotation
            annotation_str = f"  {DIM}# {content}{RESET}" if content else ""
            if is_dir:
                item_str = f"{CYAN}{name}{RESET}"
            else:
                item_str = name
            lines.append(f"{prefix}{connector}{item_str}{annotation_str}")
        elif isinstance(content, dict):
            # It's a directory with contents
            item_str = f"{CYAN}{name}{RESET}"
            lines.append(f"{prefix}{connector}{item_str}")
            
            # Recurse into subdirectory
            extension = BLANK if is_last else PIPE
            _build_operation_tree(content, prefix + extension, lines)
        else:
            # Just a name
            lines.append(f"{prefix}{connector}{name}")


def preview_move_operation(source: str, destination: str, 
                          items: List[str], show_structure: bool = True) -> str:
    """
    Generate a preview of a move operation.
    
    Args:
        source: Source directory
        destination: Destination directory
        items: List of items being moved
        show_structure: Whether to show full directory structure
        
    Returns:
        Formatted preview string
    """
    lines = []
    lines.append(f"{CYAN}Move Operation Preview:{RESET}\n")
    lines.append(f"From: {source}")
    lines.append(f"To:   {destination}\n")
    
    if show_structure:
        # Show destination structure
        dest_path = Path(destination)
        dest_name = dest_path.name
        
        # Build structure dict
        structure = {}
        for item in items:
            item_path = Path(item)
            structure[item_path.name] = f"Moved from {source}"
        
        lines.append(f"{dest_name}/")
        for i, (item, annotation) in enumerate(structure.items()):
            is_last = (i == len(structure) - 1)
            connector = ELBOW if is_last else BRANCH
            annotation_str = f"  {DIM}# {annotation}{RESET}"
            lines.append(f"{connector}{item}{annotation_str}")
    else:
        # Simple list
        lines.append(f"Moving {len(items)} item(s):")
        for item in items:
            lines.append(f"  • {Path(item).name}")
    
    return "\n".join(lines)


def preview_create_operation(root: str, structure: Dict[str, any]) -> str:
    """
    Generate a preview of a create operation.
    
    Args:
        root: Root directory being created
        structure: Nested structure to create
        
    Returns:
        Formatted preview string
    """
    lines = []
    lines.append(f"{CYAN}Create Operation Preview:{RESET}\n")
    lines.append(format_operation_tree(Path(root).name, structure))
    return "\n".join(lines)


# Convenience function for enhanced_agent integration
def show_directory_tree(path: str, annotations: Optional[Dict] = None, 
                       max_depth: int = 2) -> str:
    """
    Show directory tree with optional annotations.
    
    This is the main function to use from enhanced_agent.
    
    Args:
        path: Directory path
        annotations: Optional annotations dict
        max_depth: Maximum depth
        
    Returns:
        Formatted tree string
    """
    return format_ls_as_tree(path, annotations=annotations, max_depth=max_depth)


# For testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        path = "."
    
    print(show_directory_tree(path, max_depth=3))
