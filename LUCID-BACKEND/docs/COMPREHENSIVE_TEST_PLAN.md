# Comprehensive LLM System Test Plan

## Test Status Overview

### ✅ Completed
1. Model tier mapping system (85+ models in `model_tiers.py`)
2. Model detection in `.luciferai/models/` directory
3. Test suite runs all installed models simultaneously
4. Response validation system with tier-aware checks

### 🔄 To Verify

## Test 1: Model Detection & Tier Assignment
**Objective:** Verify all models are detected and assigned correct tiers

### Test Cases:
1. Place TinyLlama model in `.luciferai/models/`
   - Expected: Detected as Tier 0
   - Verify: Startup banner shows "Tier 0"
   
2. Place Mistral model in `.luciferai/models/`
   - Expected: Detected as Tier 2
   - Verify: Startup banner shows "Tier 2"

3. Place Llama 3.2 model in `.luciferai/models/`
   - Expected: Detected as Tier 1
   - Verify: Startup banner shows "Tier 1"

4. Place multiple models
   - Expected: All detected with correct tiers
   - Verify: `llm list` shows all with correct tier labels

### Verification Command:
```bash
# Check model detection
ls ~/.luciferai/models/
# Run LuciferAI and check startup banner
python3 lucifer.py
# Type: llm list
```

## Test 2: Enabled/Disabled Status
**Objective:** Verify enabled/disabled status persists and displays correctly

### Test Cases:
1. Disable Mistral: `llm disable mistral`
   - Expected: Status saved to `~/.luciferai/llm_state.json`
   - Verify: Restart shows Mistral as ⏸️ Disabled
   
2. Enable Mistral: `llm enable mistral`
   - Expected: Status updated
   - Verify: Shows ✅ Enabled

3. Check persistence
   - Disable a model, exit, restart
   - Expected: Status persists across restarts

### Verification Command:
```bash
# Check state file
cat ~/.luciferai/llm_state.json
# Should show: {"mistral": false, "tinyllama": true}
```

## Test 3: Startup Banner Updates
**Objective:** Verify banner reflects all installed models with status

### Test Cases:
1. Install only TinyLlama
   - Expected Banner shows:
   ```
   📦 Bundled Models:
      ✅ Tinyllama (Tier 0) - Enabled
   ```

2. Install TinyLlama + Mistral (Mistral disabled)
   - Expected Banner shows:
   ```
   📦 Bundled Models:
      ✅ Tinyllama (Tier 0) - Enabled
      ⏸️ Mistral (Tier 2) - Disabled
   ```

3. Install 3+ models with mixed status
   - Expected: All shown with correct status

### Verification:
- Restart after each install
- Check banner display matches model status

## Test 4: Multi-Model Testing (Critical)
**Objective:** Verify "run tests" tests ALL installed models simultaneously

### Test Cases:
1. Install TinyLlama only
   - Run: `run tests`
   - Expected: Tests run against TinyLlama only
   - Verify: Progress bar shows "Testing with: TINYLLAMA"

2. Install TinyLlama + Mistral
   - Run: `run tests`
   - Expected: Each test runs against BOTH models before next test
   - Verify: Output shows:
   ```
   🧪 TEST: Query: Simple terminal command
   📝 User Input: What is ls?
   🤖 Testing with models: TINYLLAMA (✅ Enabled), MISTRAL (⏸️ Disabled)
   
   🔹 Testing with TINYLLAMA...
      📤 Input: What is ls?
      💬 Response: ...
   
   🔹 Testing with MISTRAL...
      📤 Input: What is ls?
      💬 Response: ...
   
   📊 MODEL COMPARISON RESULTS:
   ...
   
   [THEN moves to next test]
   ```

3. Disable Mistral, run tests
   - Expected: STILL tests Mistral (tests all installed regardless of status)
   - Verify: Both models tested

4. Install 3+ models
   - Expected: All models tested for each test
   - Verify: Test doesn't proceed until all models complete

### Critical Verification:
```python
# In test_all_commands.py line ~135
# Verify this loop structure:
for model in available_models:  # NOT enabled_models
    # Run test for this model
    # Wait for completion
    # Store result
# Only after all models complete, show comparison
# Then proceed to next test
```

## Test 5: Tier 0 System Compatibility
**Objective:** Verify all models work with keyword-based Tier 0 system

### Test Cases:
1. Test Tier 0 model (TinyLlama) with simple queries
   - Input: "What is ls?"
   - Expected: Instant keyword response
   - Verify: No LLM invocation needed

2. Test Tier 1 model (Llama 3.2) with simple queries
   - Input: "What is ls?"
   - Expected: Can use keyword OR LLM
   - Verify: Response received

3. Test Tier 2 model (Mistral) with simple queries
   - Input: "What is ls?"
   - Expected: High-quality response
   - Verify: Proper tier validation

4. Test Tier 3 model (DeepSeek) with complex queries
   - Input: Complex coding question
   - Expected: Expert-level response
   - Verify: Tier 3 capabilities used

### Keyword System Verification:
- All models should benefit from keyword shortcuts
- Keywords defined in `simple_knowledge.py` work for all
- No model bypasses keyword system

## Test 6: Model-Specific Routing
**Objective:** Verify TEST_MODEL environment variable works

### Test Cases:
1. Set TEST_MODEL=tinyllama
   - Run tests
   - Expected: Only TinyLlama tested
   
2. Set TEST_MODEL=mistral
   - Run tests
   - Expected: Only Mistral tested

3. No TEST_MODEL set
   - Run tests
   - Expected: ALL installed models tested

### Verification Command:
```bash
TEST_MODEL=tinyllama python3 tests/test_all_commands.py
# Should test only TinyLlama

python3 tests/test_all_commands.py
# Should test ALL installed models
```

## Test 7: llm list all Command
**Objective:** Verify comprehensive model list display

### Test Cases:
1. Run: `llm list all`
   - Expected: Shows all 85+ models organized by tier
   - Verify: Each tier shows correct models
   - Verify: Installation instructions included

2. Check model counts per tier
   - Tier 0: ~9 models
   - Tier 1: ~14 models
   - Tier 2: ~23 models
   - Tier 3: ~39 models

### Verification:
```bash
python3 lucifer.py
# Type: llm list all
# Verify output format and counts
```

## Test 8: Help Page Completeness
**Objective:** Verify help shows all commands

### Test Cases:
1. Run: `help`
   - Verify section: 🤖 AI MODEL MANAGEMENT
   - Verify section: 📦 MODEL INSTALLATION
   - Verify all tier install commands listed
   - Verify bulk enable/disable commands

2. Check completeness
   - All 30+ install commands shown
   - llm list all mentioned
   - Enable/disable all commands shown

## Critical Flow Test (End-to-End)
**This must work perfectly:**

```bash
# 1. Install two models
cp tinyllama.gguf ~/.luciferai/models/
cp mistral.gguf ~/.luciferai/models/

# 2. Start LuciferAI
python3 lucifer.py
# Verify: Banner shows both models

# 3. Disable Mistral
llm disable mistral
# Verify: Banner updates

# 4. Run tests
run tests
# CRITICAL: Verify output shows:
# - Each test lists both models
# - Each model gets tested
# - Results compared
# - THEN next test starts

# 5. Check test completion
# All tests should complete with both models
# Even though Mistral is disabled
```

## Expected Test Output Format

```
🧪 TEST: Query: Simple terminal command
📝 User Input: What is ls?
🤖 Testing with models: TINYLLAMA (✅ Enabled), MISTRAL (⏸️ Disabled)
============================================================

  🔹 Testing with TINYLLAMA...
     📤 Input: What is ls?
     💬 Response: ls lists files in a directory...

  🔹 Testing with MISTRAL...
     📤 Input: What is ls?
     💬 Response: The ls command displays directory contents...

📊 MODEL COMPARISON RESULTS:
============================================================
   TINYLLAMA: ✅ SUCCESS [100%] - Relevant answer with 3 key terms
      💬 Found: list, directory, files
   
   MISTRAL: ✅ SUCCESS [100%] - Relevant answer with 4 key terms
      💬 Found: list, directory, contents, command

🎯 Overall: 2/2 models completed successfully
============================================================

[NOW PROCEEDS TO NEXT TEST]

🧪 TEST: Query: Programming language definition
📝 User Input: What is python?
...
```

## Files to Check

1. **`core/model_tiers.py`** (Line 101-141)
   - Verify `get_model_tier()` function works
   - Test with various model names

2. **`core/lucifer_colors.py`** (Line 173-284)
   - Verify `detect_installed_models()` finds all models
   - Check tier assignment logic (Line 276-277)

3. **`tests/test_all_commands.py`** (Line 35-115)
   - Verify detection loop finds ALL .gguf files
   - Check `available_models` list is populated
   - Verify loop at line 135 uses `available_models` not `enabled_models`

4. **`core/enhanced_agent.py`** (Line 4468-4516)
   - Verify `_handle_llm_list_all()` displays correctly

## Success Criteria

✅ All models detected with correct tiers
✅ Enabled/disabled status persists
✅ Startup banner shows all models with status
✅ "run tests" tests ALL installed models per test
✅ Tests don't proceed until all models complete current test
✅ All models work with Tier 0 keyword system
✅ "llm list all" shows 85+ models
✅ Help page shows all commands

## Failure Scenarios to Watch For

❌ Test proceeds to next test before all models finish current test
❌ Disabled models skipped in testing (should still be tested)
❌ Model detected but wrong tier assigned
❌ Startup banner doesn't update after install
❌ Status doesn't persist across restarts
❌ Keyword system bypassed for higher-tier models
❌ Model naming variants not recognized
