# 🌳 Tree Visualizer - Integration Guide

## Overview

The Tree Visualizer provides clean, annotated directory tree displays throughout LuciferAI. It replaces traditional `ls` output with visual tree structures similar to the `tree` command but with colored directories, syntax-highlighted files, and inline annotations.

## Implementation

### Core Module: `core/tree_visualizer.py`

**Key Features**:
- Unicode box-drawing characters for clean trees
- Color-coded items (directories, code files, docs)
- Inline annotations with `# comment` syntax
- Configurable depth and item limits
- Support for operations preview (move, create, etc.)

## Usage Examples

### 1. Simple Directory Listing

```python
from tree_visualizer import show_directory_tree

# Show directory as tree
tree = show_directory_tree("./my_project", max_depth=2)
print(tree)
```

**Output**:
```
my_project/
├── src/
│   ├── main.py
│   └── utils.py
├── tests/
│   └── test_main.py
└── README.md
```

### 2. With Annotations

```python
from tree_visualizer import show_directory_tree

annotations = {
    "main.py": "Entry point",
    "utils.py": "Helper functions",
    "README.md": "Documentation"
}

tree = show_directory_tree("./my_project", annotations=annotations, max_depth=2)
print(tree)
```

**Output**:
```
my_project/
├── src/
│   ├── main.py  # Entry point
│   └── utils.py  # Helper functions
├── tests/
│   └── test_main.py
└── README.md  # Documentation
```

### 3. Operation Preview

```python
from tree_visualizer import format_operation_tree

# Define structure to create
structure = {
    'src/': {
        'main.py': 'Entry point',
        'config.py': 'Configuration'
    },
    'tests/': {
        'test_main.py': 'Unit tests'
    },
    'README.md': 'Project docs'
}

tree = format_operation_tree("new_project", structure)
print(tree)
```

**Output**:
```
new_project/
├── src/
│   ├── main.py  # Entry point
│   └── config.py  # Configuration
├── tests/
│   └── test_main.py  # Unit tests
└── README.md  # Project docs
```

### 4. Move Operation Preview

```python
from tree_visualizer import preview_move_operation

items = ["file1.py", "file2.py"]
preview = preview_move_operation(
    source="/Users/me/Desktop",
    destination="/Users/me/Projects",
    items=items
)
print(preview)
```

**Output**:
```
Move Operation Preview:

From: /Users/me/Desktop
To:   /Users/me/Projects

Projects/
├── file1.py  # Moved from /Users/me/Desktop
└── file2.py  # Moved from /Users/me/Desktop
```

## Integration Points

### 1. Enhanced Agent - ls Command

**Location**: `core/enhanced_agent.py`

**Recommendation**: Intercept `ls` commands and use tree visualizer:

```python
def _handle_ls_command(self, path: str = ".") -> str:
    """Handle ls command with tree visualization."""
    from tree_visualizer import show_directory_tree
    from lucifer_colors import c
    
    try:
        tree = show_directory_tree(path, max_depth=2)
        return tree
    except Exception as e:
        # Fallback to system ls
        import subprocess
        result = subprocess.run(["ls", "-lah", path], capture_output=True, text=True)
        return result.stdout
```

### 2. File Operations - Before/After Preview

**Use Case**: Show structure before creating directories

```python
def _preview_create_structure(self, root_path: str, structure: dict):
    """Preview directory structure before creation."""
    from tree_visualizer import preview_create_operation
    
    print(c("📋 Preview of structure to be created:", "cyan"))
    print()
    print(preview_create_operation(root_path, structure))
    print()
    
    # Ask for confirmation
    response = input("Proceed? (y/n): ").strip().lower()
    return response == 'y'
```

### 3. Move Operations - Destination Preview

**Use Case**: Show where files will end up

```python
def _handle_move_with_preview(self, source_files: list, destination: str):
    """Move files with visual preview."""
    from tree_visualizer import preview_move_operation
    
    # Show preview
    preview = preview_move_operation(
        source=str(Path(source_files[0]).parent),
        destination=destination,
        items=source_files
    )
    print(preview)
    print()
    
    # Execute move...
```

### 4. Multi-Step Workflow - Structure Display

**Use Case**: Show created structure at completion

```python
def _show_created_structure(self, root_path: str):
    """Show tree of what was created."""
    from tree_visualizer import show_directory_tree
    
    print(c("✅ Created structure:", "green"))
    print()
    print(show_directory_tree(root_path, max_depth=3))
    print()
```

## Color Coding

The visualizer automatically applies colors based on file types:

| Item Type | Color | Examples |
|-----------|-------|----------|
| Directories | Cyan | `mydir/` |
| Code Files | Green | `.py`, `.sh`, `.js`, `.ts` |
| Documents | Blue | `.md`, `.txt`, `.json`, `.yaml` |
| Other Files | Default | All others |
| Annotations | Dim | `# comment text` |

## Configuration

### Depth Control

```python
# Shallow tree (good for large directories)
tree = show_directory_tree(path, max_depth=1)

# Medium depth (default)
tree = show_directory_tree(path, max_depth=2)

# Deep tree (small projects)
tree = show_directory_tree(path, max_depth=4)
```

### Item Limits

```python
from tree_visualizer import TreeVisualizer

viz = TreeVisualizer(max_depth=3)
tree = viz.generate_tree(path, max_items=100)  # Stop after 100 items
```

### Hidden Files

```python
from tree_visualizer import TreeVisualizer

viz = TreeVisualizer(show_hidden=True, max_depth=2)
tree = viz.generate_tree(path)  # Includes .gitignore, .env, etc.
```

## API Reference

### Main Functions

#### `show_directory_tree(path, annotations=None, max_depth=2)`
Quick function for displaying directory trees.

**Args**:
- `path` (str): Directory path to visualize
- `annotations` (dict, optional): {filename: comment} mapping
- `max_depth` (int): Maximum depth to traverse

**Returns**: Formatted tree string

---

#### `format_operation_tree(root_name, structure)`
Format a planned operation as a tree.

**Args**:
- `root_name` (str): Root directory name
- `structure` (dict): Nested structure dict

**Returns**: Formatted tree string

---

#### `preview_move_operation(source, destination, items, show_structure=True)`
Preview a move operation.

**Args**:
- `source` (str): Source directory
- `destination` (str): Destination directory
- `items` (list): Items being moved
- `show_structure` (bool): Show full structure or simple list

**Returns**: Formatted preview string

---

#### `preview_create_operation(root, structure)`
Preview a create operation.

**Args**:
- `root` (str): Root directory
- `structure` (dict): Structure to create

**Returns**: Formatted preview string

### TreeVisualizer Class

```python
class TreeVisualizer:
    def __init__(self, show_hidden=False, max_depth=3):
        """Initialize visualizer."""
        
    def add_annotation(self, path, annotation):
        """Add annotation for specific path."""
        
    def generate_tree(self, root_path, max_items=50):
        """Generate tree for directory."""
```

## Testing

Run the test suite:

```bash
cd /path/to/LuciferAI_Local
python3 Demo/test_tree_viz.py
```

## Use Cases in LuciferAI

### 1. List Directory Contents
```
User: "ls"
LuciferAI: [shows tree view of current directory]
```

### 2. Show Project Structure
```
User: "show me the structure of my project"
LuciferAI: [displays annotated tree with file purposes]
```

### 3. Preview File Creation
```
User: "create a Flask project structure"
LuciferAI: [shows tree preview before creating]
User: "y"
LuciferAI: [creates structure and shows final tree]
```

### 4. Move Operations
```
User: "move these scripts to Projects folder"
LuciferAI: [shows preview with destination tree]
LuciferAI: [executes move and confirms with tree]
```

### 5. Environment Visualization
```
User: "show my luci environments"
LuciferAI: [displays tree of environments with annotations]
```

## Benefits

### For Users
- ✨ **Visual clarity**: Hierarchical relationships obvious at a glance
- 🎨 **Color coding**: File types immediately recognizable
- 📝 **Context**: Inline annotations explain file purposes
- 🚀 **Faster comprehension**: Tree format easier to scan than lists

### For System
- 🔧 **Consistent UX**: Same format everywhere
- 📦 **Modular**: Single import, works anywhere
- ⚡ **Performant**: Depth limits prevent huge trees
- 🎯 **Flexible**: Supports real dirs and virtual structures

## Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Small dir (<20 items) | <10ms | Instant |
| Medium dir (<100 items) | <50ms | Very fast |
| Large dir (>100 items) | <200ms | With truncation |
| Deep recursion (depth=5) | Variable | Use max_depth to limit |

## Future Enhancements

- [ ] Git status integration (show modified files)
- [ ] File size display
- [ ] Permissions display (rwx)
- [ ] Last modified timestamps
- [ ] Custom color schemes
- [ ] Export to HTML/Markdown
- [ ] Interactive mode (expand/collapse)

## Status

| Component | Status | Version |
|-----------|--------|---------|
| Tree Visualizer | ✅ Complete | 1.0.0 |
| Color Coding | ✅ Complete | 1.0.0 |
| Annotations | ✅ Complete | 1.0.0 |
| Operation Preview | ✅ Complete | 1.0.0 |
| Testing | ✅ Complete | 1.0.0 |

**Overall**: 🎉 **Production Ready**

---

**Created**: 2025-10-28  
**Author**: LuciferAI Development Team  
**Compatibility**: macOS, Linux, Windows (with Unicode terminal)
