# 🔄 Luci! Smart Fallback System

## Overview

Luci! now features an **intelligent fallback system with user confirmation**. If the first package manager fails to install a package, Luci! will automatically offer to try alternative sources.

## How It Works

### 1. Priority Order
When you run `luci install <package>`, Luci! tries sources in this order:
1. **Homebrew** (brew) - macOS packages
2. **Conda** - Python/data science packages  
3. **pip** - Python packages
4. **apt** - Linux packages (if on Linux)
5. **yum** - RedHat/CentOS packages (if on Linux)
6. **npm** - Node.js packages

### 2. Automatic First Attempt
The **first available source** is tried automatically without asking.

```
🔍 Searching for htop across package managers...

  • brew: ✓ Available
  • conda: ✓ Available

Installing via brew...

🍺 Installing htop via Homebrew...
  [1/7] Updating Homebrew... ✓
  ...
```

### 3. Confirmation for Fallbacks
If the first source **fails**, Luci! asks before trying the next:

```
⚠️  Installation via brew failed

Try installing via conda? (1 source remaining)
Press 'y' to proceed, 'n' to skip
```

### 4. Single-Key Response
Just press:
- **`y`** - Try this source (automatic proceed)
- **`n`** - Skip to next source or abort

No need to press Enter! The key press is instant.

### 5. Continue Until Success
Luci! will keep offering fallbacks until:
- ✅ Installation succeeds
- ❌ All sources are exhausted
- 🚫 User declines all fallbacks

## Example Scenarios

### Scenario 1: Success on First Try
```bash
$ luci install htop

🔍 Searching for htop across package managers...
  • brew: ✓ Available

Installing via brew...
✅ htop installed successfully via brew!
```

### Scenario 2: Fallback to Second Source
```bash
$ luci install some-package

🔍 Searching for some-package across package managers...
  • brew: ✓ Available
  • conda: ✓ Available

Installing via brew...
⚠️  Installation via brew failed

Try installing via conda? (1 source remaining)
Press 'y' to proceed, 'n' to skip
y

🐍 Installing some-package via Conda...
✅ some-package installed successfully via conda!
```

### Scenario 3: User Declines Fallback
```bash
$ luci install package

Installing via brew...
⚠️  Installation via brew failed

Try installing via conda? (1 source remaining)
Press 'y' to proceed, 'n' to skip
n

Skipped conda

❌ All installation attempts failed
```

### Scenario 4: Multiple Fallbacks
```bash
$ luci install rare-package

🔍 Searching for rare-package across package managers...
  • brew: ✓ Available
  • conda: ✓ Available  
  • pip: ✓ Found

Installing via brew...
⚠️  Installation via brew failed

Try installing via conda? (2 sources remaining)
Press 'y' to proceed, 'n' to skip
y

⚠️  Installation via conda failed

Try installing via pip? (1 source remaining)
Press 'y' to proceed, 'n' to skip
y

📥 Installing rare-package via pip...
✅ rare-package installed successfully via pip!
```

## Benefits

### 1. Automatic Recovery
Don't worry if one package manager fails - Luci! will try others automatically.

### 2. User Control
You decide whether to try alternative sources. No forced installations.

### 3. Time Saving
No need to manually try different package managers. Luci! handles it for you.

### 4. Transparency
Clear feedback about what's happening and what failed.

### 5. Smart Ordering
Most likely to succeed sources are tried first (brew, then conda, then pip).

## Use Cases

### Network Issues
If Homebrew servers are down, fall back to conda or pip.

### Package Availability
Some packages are only in conda, not brew - fallback handles this.

### Version Conflicts
If brew's version conflicts, try conda's version instead.

### Platform Differences
Different platforms have different package managers - fallback adapts.

## Configuration

No configuration needed! The fallback system works automatically based on:
- Which package managers are installed on your system
- Package availability in each source
- Your confirmation responses

## Tips

### Quick Accept
Press `y` immediately to accept the fallback.

### Skip Multiple
Press `n` repeatedly to skip through fallbacks quickly.

### Interrupt Anytime
Press `Ctrl+C` to abort the entire installation process.

## Testing

To test the fallback system:

```bash
# Run the test script
python3 test_fallback.py

# This simulates a brew failure and prompts for conda
```

## Technical Details

### Single-Key Input
Uses `termios` and `tty` for instant key detection:
- No Enter required
- Immediate response
- Clean terminal handling

### Fallback Chain
```
Install Request
    ↓
Try Source 1 (auto)
    ↓
Failed? → Ask user → y → Try Source 2
                    → n → Skip
    ↓
Failed? → Ask user → y → Try Source 3
                    → n → Skip
    ↓
All Failed → Show error
```

### Error Handling
- Network timeouts
- Missing dependencies
- Permission issues
- Invalid packages
- User interrupts

## Future Enhancements

- [ ] Remember successful source per package
- [ ] Parallel availability checking
- [ ] Retry failed sources with different options
- [ ] Suggest specific package versions
- [ ] Log fallback decisions for debugging

---

**Luci! - Smart fallbacks for reliable installations!** 🔄✨
