# 🔍 LuciferAI Consensus Browser

**GUI browser for consensus dictionary fixes** - Visual interface for browsing, searching, and viewing code snippets from the collaborative fix dictionary.

## Overview

The Consensus Browser provides an intuitive GUI for exploring fixes stored in the LuciferAI consensus dictionary. It allows you to browse both local fixes (your own) and remote fixes (from other validated users in FixNet).

## Features

✅ **Tree View Navigation**
- Hierarchical display of all fixes
- Grouped by error patterns
- Local and remote fixes organized separately

✅ **Search & Filter**
- Real-time search across all fixes
- Filter by error type, solution content, or user
- Instant results as you type

✅ **Detailed Views**
- **Solution Tab**: View the actual fix code
- **Metadata Tab**: See usage statistics, timestamps, relevance scores
- **Branches Tab**: Explore fix relationships and variations

✅ **Interactive Actions**
- Copy solutions to clipboard
- Open fixes in GitHub (if available)
- Refresh data from disk

✅ **Statistics**
- Live counters for local and remote fixes
- Usage tracking and success rates
- Relevance scoring

## Installation

The browser is already installed in your LuciferAI project at:
```
LuciferAI_Local/LuciferAI_Consensus_Browser/
```

### Requirements

- **Python 3.7+**
- **tkinter** (usually included with Python)
- **LuciferAI core modules**

## Usage

### Launch from LuciferAI

The easiest way to launch the browser:

```bash
# Start LuciferAI
python3 lucifer.py

# In LuciferAI prompt:
LuciferAI> browser
```

### Direct Execution

You can also run the browser directly:

```bash
python3 LuciferAI_Consensus_Browser/consensus_browser.py
```

## Interface Guide

### Left Panel: Tree View

The tree view displays all fixes in a hierarchical structure:

```
📚 Local Fixes
  └─ NameError: 'datetime' not defined
      ├─ Fix #1: from datetime import datetime
      └─ Fix #2: import datetime
  └─ ImportError: No module named 'requests'
      └─ Fix #1: pip install requests

🌍 Remote Fixes (FixNet)
  └─ NameError: Fix from user ABC123
  └─ SyntaxError: Fix from user DEF456
```

### Right Panel: Detail Tabs

#### Solution Tab
Shows the actual fix code/solution. For local fixes, this is the full solution. For remote fixes, it may show an encrypted note until synced.

#### Metadata Tab
Displays detailed information about the fix:
- Error type and signature
- Fix hash (unique identifier)
- User ID who created it
- Timestamp
- Script path where it was applied
- Usage statistics (success count, total uses)
- Relevance score
- GitHub commit URL (if uploaded)

#### Branches Tab
Shows relationships between fixes:
- **Inspired**: Fixes that were derived from this one
- **Inspired By**: The original fix this one was based on
- Variation reasons (why the fix was modified)

### Search Bar

Type in the search bar to filter fixes in real-time:
- Search by error pattern
- Search by solution content
- Search by error type

### Action Buttons

- **📋 Copy Solution**: Copy the fix to your clipboard
- **🔗 Open in GitHub**: Open the fix commit in GitHub (if available)
- **🔄 Refresh**: Reload data from disk

## Data Sources

### Local Fixes
Stored in: `~/.luciferai/data/fix_dictionary.json`

These are fixes you've created or applied on your system. They include:
- Full solution code
- Success rates
- Usage statistics
- Context information

### Remote Fixes
Stored in: `~/.luciferai/fixnet/refs.json`

These are fixes from other validated users in FixNet. They include:
- Encrypted solutions (decrypt via sync)
- Fix hashes for matching
- User IDs
- Timestamps

### Branch Connections
Stored in: `~/.luciferai/data/user_branches.json`

Tracks relationships between fixes:
- Which fixes inspired others
- Variation reasons
- Context-aware branching

### Script Counters
Stored in: `~/.luciferai/data/script_counters.json`

Tracks per-script usage:
- How many times a fix was applied to each script
- Fix effectiveness per script
- Variation patterns

## Understanding Relevance Scores

Fixes are scored based on:
- **Success Rate**: How often the fix actually worked
- **Usage Count**: How many times it's been used
- **Context Match**: How well it matches your error
- **Recency**: Newer fixes may be weighted higher

Score ranges:
- **0.8 - 1.0**: Excellent match, highly reliable
- **0.6 - 0.8**: Good match, worth trying
- **0.4 - 0.6**: Moderate match, may need adjustment
- **0.0 - 0.4**: Poor match, use with caution

## Keyboard Shortcuts

- **Arrow Keys**: Navigate tree
- **Enter**: Expand/collapse nodes
- **Ctrl+F**: Focus search bar
- **Ctrl+C**: Copy selected solution
- **Ctrl+R**: Refresh data

## Tips

1. **Use Search**: With hundreds of fixes, search is your friend
2. **Check Branches**: Related fixes often have better solutions
3. **Review Metadata**: Usage stats tell you which fixes work best
4. **Sync Regularly**: Keep remote fixes up-to-date with `fixnet sync`
5. **Copy & Adapt**: Don't just copy—understand and adapt fixes to your needs

## Troubleshooting

### "No fixes found"
- Make sure you've run some scripts with errors
- Check that auto-fix is enabled
- Try syncing with FixNet: `fixnet sync`

### "Unable to load data"
- Ensure `~/.luciferai/` directory exists
- Check file permissions
- Try running LuciferAI once to initialize

### GUI doesn't open
- Verify tkinter is installed: `python3 -m tkinter`
- On Linux, install: `sudo apt-get install python3-tk`
- On macOS, tkinter should be included with Python

### Remote fixes show "Encrypted"
- Remote fixes are encrypted until decrypted locally
- Use `fixnet sync` to download and decrypt
- Requires validated user ID

## Integration with LuciferAI

The browser integrates seamlessly with the main LuciferAI system:

1. **Auto-Discovery**: Automatically finds all local and remote fixes
2. **Live Updates**: Refresh to see new fixes immediately
3. **GitHub Integration**: Click through to see fixes in context
4. **Copy to LuciferAI**: Copy fixes and use directly in LuciferAI

## Privacy & Security

- **Local fixes**: Stored unencrypted on your system
- **Remote fixes**: Encrypted with AES-256
- **User IDs**: Hashed for privacy
- **No tracking**: Browse completely offline

## Version History

**v1.0** (Current)
- Tree view navigation
- Search and filter
- Solution/metadata/branches tabs
- Copy to clipboard
- GitHub integration
- Real-time statistics

## Credits

**System:** LuciferAI Consensus Browser  
**Version:** 1.0  
**Author:** TheRustySpoon  
**License:** MIT

Part of the LuciferAI Local project.

---

Made with 🩸 by TheRustySpoon
