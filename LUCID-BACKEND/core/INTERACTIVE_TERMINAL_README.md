# 🖱️ Interactive Terminal Module

**Make code snippets clickable in your terminal!** - Uses OSC 8 hyperlinks to create clickable links that open code in your editor.

## Features

✅ **Clickable Code Snippets**
- Create links that open code in your default editor
- Supports VSCode, Sublime Text, TextEdit, and more
- Works with iTerm2, Warp, Kitty, and other modern terminals

✅ **Automatic Editor Detection**
- Detects your preferred editor from `$EDITOR` or `$VISUAL`
- Falls back to VSCode, Sublime, or TextEdit on macOS
- Configurable per-user

✅ **Interactive Code Blocks**
- Show code preview with clickable "open" link
- Expandable sections for better UX
- Temporary file management

✅ **Terminal Compatibility**
- OSC 8 hyperlink protocol (modern terminals)
- Graceful fallback for unsupported terminals
- Shows file paths when hyperlinks unavailable

## Supported Terminals

Terminals with hyperlink support:
- **Warp** ✅ (your terminal!)
- **iTerm2** ✅
- **Kitty** ✅
- **Alacritty** ✅
- **WezTerm** ✅
- **Hyper** ✅

## Usage

### Basic Example

```python
from interactive_terminal import make_clickable

code = """def hello():
    print("Hello, World!")
"""

# Create clickable link
link = make_clickable(code, "Click to open")
print(link)  # Clicking opens code in editor!
```

### Interactive Code Block

```python
from interactive_terminal import get_interactive_terminal

terminal = get_interactive_terminal()

code = """from datetime import datetime

def get_time():
    return datetime.now()
"""

# Create block with preview
block = terminal.create_interactive_code_block(
    code,
    title="Time Function",
    show_preview=True,
    preview_lines=3,
    filename="time_util.py"
)

print(block)
```

Output:
```
▶ Time Function
  [Click to open in editor]

  Preview:
    from datetime import datetime
    
    def get_time():
    ... (1 more line)
```

### Make File Clickable

```python
from interactive_terminal import make_file_clickable

# Make existing file clickable
link = make_file_clickable("/path/to/script.py", "Open Script")
print(link)
```

### Open Snippet Directly

```python
from interactive_terminal import open_snippet

code = "print('Hello!')"
open_snippet(code, "quick_test.py")
# Opens in your default editor immediately
```

## How It Works

### OSC 8 Hyperlinks

The module uses the OSC 8 escape sequence:
```
\033]8;;file:///path/to/file\033\\[link text]\033]8;;\033\\
```

This creates a clickable link in supported terminals. When clicked:
1. Terminal recognizes the `file://` URL
2. Opens the file in your default application
3. For text files, this is usually your editor

### Fallback Mode

For terminals without hyperlink support:
- Shows the file path instead: `[View Code: /tmp/snippet_0.py]`
- User can manually open the file
- Still provides full functionality

## Configuration

### Set Default Editor

```bash
# Set via environment variable
export EDITOR="code"  # VS Code
export EDITOR="subl"  # Sublime Text
export EDITOR="nano"  # Nano
```

### Programmatic Configuration

```python
terminal = get_interactive_terminal()
terminal.editor = "code"  # Force VS Code
```

## API Reference

### `make_clickable(code, label="View Code")`
Quick helper to make code clickable.
- **code**: String containing code
- **label**: Display text for link
- **Returns**: Formatted clickable link

### `make_file_clickable(filepath, label=None)`
Make existing file clickable.
- **filepath**: Path to file
- **label**: Optional display text (defaults to filename)
- **Returns**: Formatted clickable link

### `open_snippet(code, filename=None)`
Open code in editor immediately.
- **code**: String containing code
- **filename**: Optional filename (default: "snippet.py")
- **Returns**: True if successful

### `InteractiveTerminal Class`

#### `create_clickable_snippet(code, label, filename, language)`
Create clickable link for code snippet.

#### `create_clickable_file(filepath, label)`
Create clickable link for existing file.

#### `create_interactive_code_block(code, title, show_preview, preview_lines, filename)`
Create code block with preview and clickable link.

#### `create_expandable_section(title, content, collapsed, code_snippet)`
Create collapsible section with optional code.

#### `open_in_editor(filepath)`
Open file in default editor.

#### `cleanup_temp_files()`
Remove temporary snippet files.

## Integration Examples

### With System Test

```python
from interactive_terminal import make_clickable

# In test output
fix_code = "from datetime import datetime"
link = make_clickable(fix_code, "Click to view fix")

print(f"✓ Found fix in dictionary")
print(f"  {link}")
```

### With Dictionary Search

```python
from interactive_terminal import get_interactive_terminal

terminal = get_interactive_terminal()

for fix in search_results:
    block = terminal.create_interactive_code_block(
        fix['solution'],
        title=f"Fix #{i}: {fix['error_type']}",
        show_preview=True
    )
    print(block)
```

### With Consensus Browser

Already integrated! The consensus browser GUI allows copying fixes to clickable terminal output.

## Temporary Files

Snippets are saved to: `$TMPDIR/luciferai_snippets/`

Files are named: `snippet_N.py` (where N is an incrementing number)

Clean up manually or call:
```python
terminal = get_interactive_terminal()
terminal.cleanup_temp_files()
```

## Terminal Detection

The module automatically detects if your terminal supports hyperlinks by checking:
- `$TERM_PROGRAM` environment variable
- `$TERM` environment variable
- Known terminal identifiers

Supported terminals are whitelisted for reliability.

## Troubleshooting

### Links not clickable?
- Check if your terminal supports OSC 8 hyperlinks
- Try iTerm2, Warp, or Kitty
- Use the fallback file paths shown

### Wrong editor opens?
- Set `$EDITOR` environment variable
- Or configure programmatically: `terminal.editor = "code"`

### Permission errors?
- Check temp directory permissions: `ls -la $TMPDIR/luciferai_snippets/`
- Clean old files: `rm -rf $TMPDIR/luciferai_snippets/`

## Security

- Temporary files are created in user's temp directory
- Files are readable only by user (default temp permissions)
- No network requests made
- All file operations are local

## Credits

**Module**: Interactive Terminal  
**Version**: 1.0  
**Author**: TheRustySpoon  
**License**: MIT

Part of the LuciferAI Local project.

---

Made with 🩸 by TheRustySpoon
