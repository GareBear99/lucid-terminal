# Testing Guide - Model Detection & Installation Prompts

## Quick Test Commands

### 1. Test Model Detection
```bash
cd /Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local
python3 Demo/test_model_detection.py
```

**Expected Output:**
- ✅ 4/4 tests pass
- Shows current model detection status
- Displays backup directory configuration
- Simulates test commands

### 2. Test "test all" Command
```bash
cd /Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local
python3 -c "from core.enhanced_agent import EnhancedLuciferAgent; agent = EnhancedLuciferAgent(); agent._handle_test_all_models()"
```

**Expected Behavior:**
- Shows detected models with locations (main/backup)
- If no models: Shows searched paths and suggests `install core models`
- If backup not configured: Shows setup hint

### 3. Test Specific Model Command
```bash
cd /Users/TheRustySpoon/Desktop/Projects/LuciferAI_Local
python3 -c "from core.enhanced_agent import EnhancedLuciferAgent; agent = EnhancedLuciferAgent(); agent._handle_model_test('tinyllama')"
```

**Expected Behavior:**
- Checks main and backup directories
- If not found: Prompts to install with y/n
- If found: Shows location and proceeds to test

## Integration Test Scenarios

### Scenario 1: No Models Installed (Default)
1. Run `test all`
2. **Expected:**
   - "❌ No models detected"
   - Shows main directory path
   - Shows "Backup: Not configured"
   - Suggests: "Install with: install core models"

### Scenario 2: Test Specific Missing Model
1. Run `test tinyllama`
2. **Expected:**
   - "❌ TINYLLAMA not detected"
   - Shows searched locations
   - Prompt: "Would you like to install tinyllama? (y/n):"
3. Type `y`
4. **Expected:**
   - Routes to install command
   - Starts installation process

### Scenario 3: Models in Main Directory
1. Install a model first: `install tinyllama`
2. Run `test all`
3. **Expected:**
   - "Detected installed models:"
   - "✓ TINYLLAMA (main)"
   - Proceeds with testing

### Scenario 4: Backup Directory Configured
1. Set backup: `backup models`
2. Enter external drive path
3. Move a model to backup directory manually
4. Run `test all`
5. **Expected:**
   - Shows models with "(backup)" label
   - Tests work normally from backup location

### Scenario 5: Mixed Locations
1. Have tinyllama in main
2. Have mistral in backup
3. Run `test all`
4. **Expected:**
   - "✓ TINYLLAMA (main)"
   - "✓ MISTRAL (backup)"
   - Both models tested

## Manual Verification Checklist

- [ ] `test all` detects no models correctly
- [ ] `test all` shows main directory path
- [ ] `test all` shows backup status (configured/not configured)
- [ ] `test all` suggests install command when no models
- [ ] `test <model>` shows searched locations
- [ ] `test <model>` prompts to install if missing
- [ ] `test <model>` accepts 'y' and routes to install
- [ ] `test <model>` accepts 'n' and cancels
- [ ] `test <model>` shows location when model found
- [ ] Tests work with models in backup directory
- [ ] Backup setup hint shows correct command

## Common Issues & Solutions

### Issue: "No models detected" but models exist
**Check:**
1. Model files are in `~/.luciferai/models/`
2. File names match exactly:
   - `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`
   - `mistral-7b-instruct-v0.2.Q4_K_M.gguf`

### Issue: Backup directory not showing
**Solution:**
1. Run `backup models` to configure
2. Verify `~/.luciferai/config.json` exists
3. Check `backup_models_dir` key is set

### Issue: Install prompt doesn't work
**Check:**
1. Model name is valid (tinyllama or mistral)
2. Not running in non-interactive mode
3. Install command is properly routed

## Test Output Examples

### Success Case
```
🧪 Tier 0 Test Suite - AI for Dummies
══════════════════════════════════════════════════════════════════════

Detected installed models:
  ✓ TINYLLAMA (main)

Running tests for 1 bundled model(s)...
══════════════════════════════════════════════════════════════════════
```

### No Models Case
```
🧪 Tier 0 Test Suite - AI for Dummies
══════════════════════════════════════════════════════════════════════

❌ No models detected

Searched locations:
  • Main: /Users/username/.luciferai/models
  • Backup: Not configured
    (Set with: backup models)

No models to test. Install with: install core models
```

### Install Prompt Case
```
❌ MISTRAL not detected

Searched locations:
  • Main: /Users/username/.luciferai/models
  • Backup: Not configured
    (Set with: backup models)

Would you like to install mistral? (y/n): y

Installing mistral...
[proceeds with installation]
```

## Files Modified
- `core/enhanced_agent.py`
  - `_handle_test_all_models()` - Enhanced detection
  - `_handle_model_test()` - Added install prompts

## Test Files Created
- `Demo/test_model_detection.py` - Automated test suite
- `Demo/TEST_COMMAND_SUMMARY.md` - Feature documentation
- `Demo/TESTING_GUIDE.md` - This guide
