# Model Management System Implementation Plan

## Summary
This document outlines the comprehensive model management system to be implemented.

## Features to Implement

### 1. Install Commands for All Models
**Location:** `core/enhanced_agent.py` - extend `_handle_install()` method

**Supported Models (85+ variants):**

**Tier 0:**
- `install tinyllama` / `install tiny`
- `install phi-2` / `install phi2`
- `install stablelm`

**Tier 1:**
- `install llama3.2` / `install llama-3.2`
- `install llama2` / `install llama-2`
- `install phi-3` / `install phi3`
- `install gemma` / `install gemma2`
- `install vicuna`
- `install orca-2` / `install orca2`
- `install openchat`
- `install starling`

**Tier 2:**
- `install mistral`
- `install mixtral`
- `install llama3` / `install llama-3`
- `install llama3.1` / `install llama-3.1`
- `install codellama` / `install code-llama`
- `install neural-chat`
- `install solar`
- `install qwen` / `install qwen2`
- `install yi`

**Tier 3:**
- `install deepseek` / `install deepseek-coder`
- `install wizardcoder`
- `install wizardlm`
- `install dolphin`
- `install nous-hermes` / `install hermes`
- `install phind-codellama`

### 2. Autocorrect & "Did You Mean" Logic
**Location:** `core/enhanced_agent.py` - extend `_auto_correct_typos()` method

**Common Typos to Handle:**
```python
# Model name typos
'tinylamaa' -> 'tinyllama'
'mistrl' -> 'mistral'
'mistrall' -> 'mistral'
'lamma' -> 'llama'
'lama' -> 'llama'
'deepseek' typos -> 'deepseek-coder'
'gemma' typos -> 'gemma'
'phi2' / 'phi3' variants
'qwen' / 'qwin' variants
```

### 3. Bulk Enable/Disable Commands
**Location:** `core/enhanced_agent.py` - new methods

**Commands:**
- `llm enable all` - Enable all installed models
- `llm disable all` - Disable all installed models
- `llm enable tier0` / `tier1` / `tier2` / `tier3` - Enable all models in a tier
- `llm disable tier0` / `tier1` / `tier2` / `tier3` - Disable all models in a tier

### 4. Update Help Command
**Location:** `core/enhanced_agent.py` - `_handle_help()` method

**Add sections:**
```
🤖 MODEL MANAGEMENT
  llm list              Show all models with status
  llm enable <model>    Enable a model
  llm disable <model>   Disable a model
  llm enable all        Enable all installed models
  llm disable all       Disable all installed models
  llm enable tier<N>    Enable all models in tier N (0-3)
  llm disable tier<N>   Disable all models in tier N (0-3)
  models info           Compare model capabilities

📦 MODEL INSTALLATION
  install tinyllama     Install TinyLlama (Tier 0)
  install mistral       Install Mistral (Tier 2)
  install llama3.2      Install Llama 3.2 (Tier 1)
  install deepseek      Install DeepSeek Coder (Tier 3)
  (And 80+ more models - see 'models info')
```

### 5. Update Info Command
**Location:** `core/enhanced_agent.py` - `_handle_info()` method

**Add sections:**
- Complete model tier breakdown
- Installation instructions for each tier
- Model comparison table
- Tier-specific capabilities

## Implementation Steps

1. ✅ Create model_tiers.py (DONE)
2. ✅ Update model detection in lucifer_colors.py (DONE)
3. ✅ Update test suite for multi-model testing (DONE)
4. ⏳ Add install commands for all models
5. ⏳ Add autocorrect/did-you-mean for model names
6. ⏳ Add bulk enable/disable commands
7. ⏳ Update help command with new sections
8. ⏳ Update info command with model details
9. ⏳ Test all functionality

## Testing Strategy

1. Test install command for each tier
2. Test autocorrect with common typos
3. Test enable/disable all
4. Test enable/disable by tier
5. Verify help shows all commands
6. Verify info shows all models

## Files to Modify

- `core/enhanced_agent.py` - Main logic
- `core/model_tiers.py` - Already complete
- `tests/test_all_commands.py` - Add new tests
- `core/lucifer_colors.py` - Already updated

## Priority Order

1. HIGH: Bulk enable/disable all (immediate need)
2. HIGH: Update help command (documentation)
3. MEDIUM: Autocorrect for model names (usability)
4. MEDIUM: Install commands for all models (expansion)
5. LOW: Update info command (nice-to-have)
