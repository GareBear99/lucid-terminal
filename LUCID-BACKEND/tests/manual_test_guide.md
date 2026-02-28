# 🧪 Manual Testing Guide for LuciferAI

This guide covers commands that require manual interaction and cannot be fully automated.

---

## ✅ Test 1: DELETE Command with Trash Confirmation

### Setup
```bash
echo "test file" > ~/Desktop/test_delete.txt
```

### Command
```
delete the file test_delete.txt on my desktop
```

### Expected Behavior
1. ✓ Finds the file at `~/Desktop/test_delete.txt`
2. ✓ Shows: `Found: /Users/[user]/Desktop/test_delete.txt`
3. ✓ Prompts: `Move to trash? (y/n):`
4. ✓ If `y`: File moves to macOS Trash (via `osascript`)
5. ✓ If `n`: Operation cancelled
6. ✓ File no longer exists at original location

### Verify
```bash
# Check file is gone
ls ~/Desktop/test_delete.txt  # Should not exist

# Check Trash
open ~/.Trash  # Should see test_delete.txt
```

---

## ✅ Test 2: OPEN Command with App Selection

### Setup
```bash
echo "# Test README" > ~/Desktop/test_readme.md
```

### Command
```
open test_readme.md
```

### Expected Behavior
1. ✓ Finds file (if multiple, shows numbered list)
2. ✓ If multiple matches:
   - Shows: `Multiple files found:`
   - Lists files with numbers
   - Prompts: `Select file (1-N or 0 to cancel):`
   - Shows selected path
   - Prompts: `Is this correct? (y/n):`
   - If `n`: Shows list again
3. ✓ Once confirmed, shows app options:
   ```
   Available apps:
   1. vscode
   2. sublime
   3. system default
   Select app (1-3 or 0):
   ```
4. ✓ Opens file with selected app
5. ✓ If wrong app selected: `Would you like to try again? (y/n)`

### Verify
- File opens in the selected application

---

## ✅ Test 3: DAEMON WATCH (No Autofix)

### Setup
```bash
cat > ~/Desktop/test_watch.py << 'EOF'
import sys

def calculate(x, y):
    result = x / y  # Potential ZeroDivisionError
    return result

print(calculate(10, 0))
EOF
```

### Command
```
daemon watch test_watch.py
```

### Expected Behavior
1. ✓ Finds script (multi-select if multiple matches)
2. ✓ Shows path with confirmation: `Watch this file? (y/n):`
3. ✓ Prompts: `Enable autofix mode? (y/n):`
4. ✓ If `n` (no autofix):
   - Watches file for changes
   - When error detected, shows:
     ```
     🔍 Top 3 Consensus Fixes:
     
     [1] Score: 95.0% | Success: 42/45
     ┌────────────────────────────────────────┐
     │  Add zero division check               │
     │  if y == 0: raise ValueError("zero")   │
     └────────────────────────────────────────┘
     
     [2] Score: 87.0% | Success: 38/45
     ...
     ```
   - **White background** for fix suggestions
   - Does NOT auto-apply
   - Continues watching

### Verify
```bash
# Trigger error by modifying file
echo "# comment" >> ~/Desktop/test_watch.py

# Should see consensus fixes displayed
```

---

## ✅ Test 4: DAEMON WATCH (With Autofix)

### Command
```
daemon watch test_watch.py
```

### Expected Behavior (Select `y` for autofix)
1. ✓ Same initial steps as Test 3
2. ✓ When error detected:
   - Shows: `🔧 Applying best fix...`
   - Automatically applies highest-scored consensus fix
   - Shows: `✓ Fix applied and verified`
   - Continues watching with fix in place

### Verify
```bash
cat ~/Desktop/test_watch.py
# Should see zero-division check added
```

---

## ✅ Test 5: FIX SCRIPT Command

### Setup
Use the test file from conversation:
```bash
cat > ~/Desktop/test_fix.py << 'EOF'
import sys
import os

def process_data():
    data = json.dumps({"test": "value", "number": 42})  # Missing json import
    return data

if __name__ == "__main__":
    print(process_data())
EOF
```

### Command
```
fix ~/Desktop/test_fix.py
```

### Expected Behavior
1. ✓ Detects error: `NameError: name 'json' is not defined`
2. ✓ Searches consensus dictionary for matching error
3. ✓ Shows: `Searching consensus for: NameError: name 'json' is not defined`
4. ✓ Finds fix: `Add: import json`
5. ✓ Applies fix to file
6. ✓ Verifies: Runs script to confirm it works
7. ✓ Shows: `✓ Fix verified - script runs successfully`

### Verify
```bash
python3 ~/Desktop/test_fix.py
# Should output: {"test": "value", "number": 42}

head -3 ~/Desktop/test_fix.py
# Should show: import json added at top
```

---

## ✅ Test 6: COMMAND HISTORY (Up/Down Arrows)

### Test A: Within Session
1. Run: `help`
2. Run: `pwd`
3. Run: `memory`
4. Press **Up Arrow** → Should show `memory`
5. Press **Up Arrow** → Should show `pwd`
6. Press **Up Arrow** → Should show `help`
7. Press **Down Arrow** → Should show `pwd`
8. Press **Enter** → Runs `pwd`

### Test B: Across Restarts
1. Run several commands (e.g., `help`, `list ~`, `pwd`)
2. Exit LuciferAI: `exit`
3. Restart LuciferAI: `python3 lucifer.py`
4. Press **Up Arrow** immediately
5. ✓ Should show last command from previous session
6. ✓ Can navigate through last 120 commands

### Verify
```bash
cat ~/.luciferai/data/command_history.txt
# Should contain last 120 commands
wc -l ~/.luciferai/data/command_history.txt
# Should be ≤ 120 lines
```

---

## ✅ Test 7: MULTI-FILE SELECTION with Re-selection

### Setup (Create multiple test.py files)
```bash
mkdir -p ~/Desktop/projects/app1
mkdir -p ~/Desktop/projects/app2
mkdir -p ~/Documents/code

echo "# App 1" > ~/Desktop/projects/app1/test.py
echo "# App 2" > ~/Desktop/projects/app2/test.py
echo "# Docs" > ~/Documents/code/test.py
```

### Command
```
open test.py
```

### Expected Behavior
1. ✓ Shows:
   ```
   Multiple files found:
   
   1. ~/Desktop/projects/app1/test.py
   2. ~/Desktop/projects/app2/test.py
   3. ~/Documents/code/test.py
   
   Select file (1-3 or 0 to cancel):
   ```

2. Select `1`

3. ✓ Shows:
   ```
   Selected: /Users/[user]/Desktop/projects/app1/test.py
   Is this correct? (y/n):
   ```

4. Enter `n`

5. ✓ Shows file list AGAIN (loops back to step 1)

6. Select `2`

7. ✓ Confirms again

8. Enter `y`

9. ✓ Proceeds with opening file

### Verify
- Correct file opens after confirmation

---

## ✅ Test 8: TYPO CORRECTION

### Test Commands
```
hlep
```

### Expected Behavior
1. ✓ Shows: `Did you mean 'help'? (y/n):`
2. ✓ If `y`: Runs `help` command
3. ✓ If `n`: Cancels

### Other Typos to Test
- `mve` → suggests `move`
- `instal` → suggests `install`
- `cpy` → suggests `copy`
- `dlete` → suggests `delete`

---

## ✅ Test 9: CONTEXT TRACKING

### Commands (Run in sequence)
```
create folder myproject
```

Then immediately:
```
put a file named main.py in it
```

### Expected Behavior
1. ✓ First command creates `~/Desktop/myproject/`
2. ✓ Second command detects "in it" reference
3. ✓ Uses stored context: `self.last_created_folder`
4. ✓ Creates file at `~/Desktop/myproject/main.py`

### Verify
```bash
ls ~/Desktop/myproject/main.py
# File should exist
```

---

## ✅ Test 10: AI QUERY ROUTING

### Prerequisites
- TinyLlama/llamafile must be installed
- Check with: `ls ~/.luciferai/bin/llamafile`

### Test A: Multi-word Question
```
what is python
```

### Expected Behavior
✓ Routes to AI (not treated as unknown command)
✓ Returns AI response about Python

### Test B: Single-word Question
```
explain
```

### Expected Behavior
✓ Routes to AI if available
✓ Returns response or asks for clarification

### Test C: Natural Language Command
```
show me what files are in my desktop
```

### Expected Behavior
✓ Parses as natural language
✓ Executes appropriate command (list ~/Desktop)

---

## ✅ Test 11: CLEAR, EXIT, MAINMENU

### CLEAR
```
clear
```
✓ Clears terminal screen

### EXIT
```
exit
```
✓ Shows: `Lucifer bids you farewell...`
✓ Exits program cleanly

### MAINMENU
```
mainmenu
```
✓ Returns to main LuciferAI menu
✓ Shows ASCII art and options

---

## 📊 Test Summary Checklist

Copy this and check off as you test:

```
☐ delete command with trash confirmation
☐ open command with app selection
☐ daemon watch with top 3 suggestions (no autofix)
☐ daemon watch with autofix enabled
☐ fix command with consensus
☐ Up/Down arrow history (120 commands)
☐ History persists across restarts
☐ Multi-file selection with re-selection loop
☐ Typo correction prompts
☐ Context tracking ("in it" references)
☐ AI query routing (multi-word)
☐ clear command
☐ exit command
☐ mainmenu command
```

---

## 🐛 Known Issues from Automated Tests

From test run (78.9% pass rate):

1. **Folder creation path** - May need manual verification
2. **Memory command** - Check if returns proper output
3. **Models info** - Verify displays correctly

---

## 🎯 Success Criteria

All tests should:
- ✓ Respond appropriately to user input
- ✓ Show clear prompts and confirmations
- ✓ Handle y/n inputs correctly
- ✓ Loop back when user says 'n' to confirmation
- ✓ Display consensus fixes with white background
- ✓ Persist command history across restarts
- ✓ Route unrecognized commands to AI when available
