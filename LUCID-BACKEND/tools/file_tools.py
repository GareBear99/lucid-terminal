#!/usr/bin/env python3
"""
🗂️ File Tools - Read, write, search files like Warp AI
"""
import os
import subprocess
from pathlib import Path
from typing import List, Optional, Dict, Any
import fnmatch

PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
RESET = "\033[0m"


def read_file(path: str, line_range: Optional[tuple] = None) -> Dict[str, Any]:
    """
    Read a file, optionally with line range.
    
    Args:
        path: Absolute or relative path to file
        line_range: Optional tuple (start_line, end_line) for partial read
    
    Returns:
        Dict with status, content, and metadata
    """
    try:
        path_obj = Path(path).expanduser().resolve()
        
        if not path_obj.exists():
            return {
                "success": False,
                "error": f"File not found: {path}",
                "path": str(path_obj)
            }
        
        if not path_obj.is_file():
            return {
                "success": False,
                "error": f"Not a file: {path}",
                "path": str(path_obj)
            }
        
        with open(path_obj, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        
        if line_range:
            start, end = line_range
            lines = lines[start-1:end]
        
        return {
            "success": True,
            "path": str(path_obj),
            "content": ''.join(lines),
            "line_count": len(lines),
            "size": path_obj.stat().st_size
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "path": path
        }


def write_file(path: str, content: str, create_dirs: bool = True) -> Dict[str, Any]:
    """
    Write content to a file.
    
    Args:
        path: Path to write to
        content: Content to write
        create_dirs: Create parent directories if they don't exist
    
    Returns:
        Dict with status and metadata
    """
    try:
        path_obj = Path(path).expanduser().resolve()
        
        if create_dirs:
            path_obj.parent.mkdir(parents=True, exist_ok=True)
        
        with open(path_obj, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return {
            "success": True,
            "path": str(path_obj),
            "bytes_written": len(content.encode('utf-8'))
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "path": path
        }


def edit_file(path: str, search: str, replace: str) -> Dict[str, Any]:
    """
    Search and replace in a file (like Warp's edit).
    
    Args:
        path: Path to file
        search: Text to search for
        replace: Text to replace with
    
    Returns:
        Dict with status and changes made
    """
    try:
        result = read_file(path)
        if not result["success"]:
            return result
        
        content = result["content"]
        
        if search not in content:
            return {
                "success": False,
                "error": f"Search text not found in {path}",
                "path": path
            }
        
        new_content = content.replace(search, replace)
        occurrences = content.count(search)
        
        write_result = write_file(path, new_content, create_dirs=False)
        
        if write_result["success"]:
            return {
                "success": True,
                "path": path,
                "occurrences_replaced": occurrences,
                "bytes_changed": len(new_content.encode('utf-8')) - len(content.encode('utf-8'))
            }
        
        return write_result
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "path": path
        }


def find_files(pattern: str, search_dir: str = ".", max_depth: int = 10) -> Dict[str, Any]:
    """
    Find files matching a pattern (like Warp's find).
    
    Args:
        pattern: Glob pattern (e.g., "*.py", "**/*.js")
        search_dir: Directory to search in
        max_depth: Maximum depth to recurse
    
    Returns:
        Dict with matched files
    """
    try:
        search_path = Path(search_dir).expanduser().resolve()
        
        if not search_path.exists():
            return {
                "success": False,
                "error": f"Directory not found: {search_dir}"
            }
        
        matches = []
        
        for root, dirs, files in os.walk(search_path):
            depth = len(Path(root).relative_to(search_path).parts)
            if depth > max_depth:
                dirs.clear()
                continue
            
            for filename in files:
                if fnmatch.fnmatch(filename, pattern) or fnmatch.fnmatch(str(Path(root) / filename), pattern):
                    full_path = Path(root) / filename
                    matches.append({
                        "path": str(full_path),
                        "relative": str(full_path.relative_to(search_path)),
                        "size": full_path.stat().st_size
                    })
        
        return {
            "success": True,
            "pattern": pattern,
            "search_dir": str(search_path),
            "matches": matches,
            "count": len(matches)
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "pattern": pattern
        }


def grep_search(query: str, path: str = ".", file_pattern: str = "*") -> Dict[str, Any]:
    """
    Search for text in files (like Warp's grep).
    
    Args:
        query: Text to search for
        path: Directory to search in
        file_pattern: File pattern to match
    
    Returns:
        Dict with matches
    """
    try:
        search_path = Path(path).expanduser().resolve()
        
        if not search_path.exists():
            return {
                "success": False,
                "error": f"Path not found: {path}"
            }
        
        matches = []
        
        # Use subprocess for faster grep if available
        if os.system("which rg > /dev/null 2>&1") == 0:
            # Use ripgrep
            result = subprocess.run(
                ["rg", query, str(search_path), "--json"],
                capture_output=True,
                text=True
            )
            # Parse JSON output (simplified)
            for line in result.stdout.splitlines():
                if "match" in line:
                    matches.append({"raw": line})
        else:
            # Fallback to Python search
            for root, dirs, files in os.walk(search_path):
                for filename in fnmatch.filter(files, file_pattern):
                    file_path = Path(root) / filename
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            for line_num, line_content in enumerate(f, 1):
                                if query in line_content:
                                    matches.append({
                                        "file": str(file_path),
                                        "line": line_num,
                                        "content": line_content.strip()
                                    })
                    except:
                        continue
        
        return {
            "success": True,
            "query": query,
            "path": str(search_path),
            "matches": matches,
            "count": len(matches)
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "query": query
        }


def move_file(source: str, destination: str, overwrite: bool = False) -> Dict[str, Any]:
    """
    Move a file or directory to a new location.
    
    Args:
        source: Path to file or directory to move
        destination: Destination path
        overwrite: If True, overwrite existing files
    
    Returns:
        Dict with status and metadata
    """
    try:
        import shutil
        
        source_path = Path(source).expanduser().resolve()
        dest_path = Path(destination).expanduser().resolve()
        
        # Check if source exists
        if not source_path.exists():
            return {
                "success": False,
                "error": f"Source not found: {source}",
                "source": str(source_path)
            }
        
        # Check if destination exists
        if dest_path.exists() and not overwrite:
            return {
                "success": False,
                "error": f"Destination already exists: {destination}. Use overwrite=True to replace.",
                "destination": str(dest_path)
            }
        
        # If destination is a directory, move into it
        if dest_path.is_dir():
            dest_path = dest_path / source_path.name
        
        # Create parent directories if needed
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Perform the move
        shutil.move(str(source_path), str(dest_path))
        
        return {
            "success": True,
            "source": str(source_path),
            "destination": str(dest_path),
            "type": "directory" if dest_path.is_dir() else "file",
            "size": dest_path.stat().st_size if dest_path.is_file() else None
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "source": source,
            "destination": destination
        }


def list_directory(path: str = ".", show_hidden: bool = False) -> Dict[str, Any]:
    """
    List directory contents with metadata.
    
    Args:
        path: Directory to list
        show_hidden: Include hidden files
    
    Returns:
        Dict with directory contents
    """
    try:
        dir_path = Path(path).expanduser().resolve()
        
        if not dir_path.exists():
            return {
                "success": False,
                "error": f"Directory not found: {path}"
            }
        
        if not dir_path.is_dir():
            return {
                "success": False,
                "error": f"Not a directory: {path}"
            }
        
        items = []
        for item in sorted(dir_path.iterdir()):
            if not show_hidden and item.name.startswith('.'):
                continue
            
            stat = item.stat()
            items.append({
                "name": item.name,
                "path": str(item),
                "type": "dir" if item.is_dir() else "file",
                "size": stat.st_size if item.is_file() else None,
                "modified": stat.st_mtime
            })
        
        return {
            "success": True,
            "path": str(dir_path),
            "items": items,
            "count": len(items)
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "path": path
        }


# Test functions
if __name__ == "__main__":
    print(f"{PURPLE}🧪 Testing File Tools{RESET}\n")
    
    # Test 1: Read this file
    print(f"{GOLD}Test 1: Read file{RESET}")
    result = read_file(__file__, line_range=(1, 10))
    if result["success"]:
        print(f"{GREEN}✅ Read {result['line_count']} lines{RESET}")
        print(result["content"][:100] + "...")
    else:
        print(f"{RED}❌ {result['error']}{RESET}")
    
    # Test 2: Find Python files
    print(f"\n{GOLD}Test 2: Find files{RESET}")
    result = find_files("*.py", "..")
    if result["success"]:
        print(f"{GREEN}✅ Found {result['count']} Python files{RESET}")
        for match in result["matches"][:3]:
            print(f"  • {match['relative']}")
    else:
        print(f"{RED}❌ {result['error']}{RESET}")
    
    # Test 3: List directory
    print(f"\n{GOLD}Test 3: List directory{RESET}")
    result = list_directory("..")
    if result["success"]:
        print(f"{GREEN}✅ Found {result['count']} items{RESET}")
        for item in result["items"][:5]:
            icon = "📁" if item["type"] == "dir" else "📄"
            print(f"  {icon} {item['name']}")
    else:
        print(f"{RED}❌ {result['error']}{RESET}")
    
    print(f"\n{PURPLE}✨ File tools tests complete{RESET}")
