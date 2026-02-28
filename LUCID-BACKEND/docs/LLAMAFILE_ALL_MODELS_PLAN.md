# Llamafile Support for All 85+ Models - Implementation Plan

## Objective
Enable llamafile-based installation and testing for all 85+ supported models, ensuring every model passes Tier 0 tests (basic functionality).

## Current State
✅ **Working:** tinyllama, mistral (llamafile-based, Tier 0 tests pass)
❌ **Not Working:** Remaining 83+ models (try to use Ollama, not llamafile)

## Why This Matters
1. **Catalina Compatibility:** Ollama requires macOS 14+, llamafile works on 10.15+
2. **Offline First:** All models should work 100% offline
3. **Consistent Architecture:** One installation method for all models
4. **Universal Tier 0:** Every model should handle basic queries

## Implementation Steps

### Phase 1: Model File Management
**Files to Update:**
- `core/enhanced_agent.py` - Install handler
- `core/llamafile_agent.py` - Model loading
- `core/model_tiers.py` - Tier definitions

**Changes:**
1. Create model file mapping for all 85+ models:
```python
MODEL_FILES = {
    # Tier 0
    'tinyllama': 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    'phi-2': 'phi-2-2.7b-Q4_K_M.gguf',
    'stablelm': 'stablelm-1.6b-Q4_K_M.gguf',
    'orca-mini': 'orca-mini-3b-Q4_K_M.gguf',
    
    # Tier 1
    'llama3.2': 'llama-3.2-3b-instruct-Q4_K_M.gguf',
    'llama2': 'llama-2-7b-chat-Q4_K_M.gguf',
    'phi-3': 'phi-3-3.8b-instruct-Q4_K_M.gguf',
    # ... all 85+ models
}
```

2. Create download URLs mapping:
```python
MODEL_URLS = {
    'tinyllama': 'https://huggingface.co/.../tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    'llama3.2': 'https://huggingface.co/.../llama-3.2-3b-instruct-Q4_K_M.gguf',
    # ... all models
}
```

### Phase 2: Install Handler Update
**Current Flow (Broken):**
```
install llama3.2 → Package Manager → Try Ollama → Error
```

**New Flow (Fixed):**
```
install llama3.2 → LLM Install Handler → Download GGUF → Install llamafile
```

**Changes in `_handle_ollama_install_request()`:**
1. Check if model in MODEL_FILES mapping
2. If yes: Download GGUF file to `.luciferai/models/`
3. Verify llamafile binary exists
4. Test basic query to confirm installation
5. Add to detected models list

### Phase 3: Progressive Tier Testing Integration
**Update `tests/progressive_tier_test.py`:**

1. **Model Detection:**
```python
def detect_installed_models(self) -> List[Tuple[str, int]]:
    models = []
    models_dir = self.models_dir
    
    # Check for ALL supported models
    for model_name in MODEL_FILES.keys():
        model_file = MODEL_FILES[model_name]
        if (models_dir / model_file).exists():
            tier = get_model_tier(model_name)
            models.append((model_name, tier))
    
    return sorted(models, key=lambda x: x[1])
```

2. **Universal Tier 0 Testing:**
```python
# ALL models must pass Tier 0, regardless of native tier
for model_name, native_tier in detected_models:
    # Start with Tier 0 (everyone)
    tier0_result = self.test_model_on_tier(model_name, native_tier, 0, silent=False)
    
    if tier0_result['pass_rate'] < 80:
        print(f"❌ {model_name} FAILED Tier 0 - basic functionality broken")
        continue  # Don't test higher tiers
    
    # Then test native tier
    if native_tier > 0:
        native_result = self.test_model_on_tier(model_name, native_tier, native_tier, silent=False)
```

### Phase 4: Llamafile Agent Enhancement
**Update `core/llamafile_agent.py`:**

1. **Dynamic Model Loading:**
```python
class LlamafileAgent:
    def __init__(self, model_name: str = None, model_path: Path = None):
        if model_name and not model_path:
            # Auto-detect path from model name
            model_path = self._get_model_path(model_name)
        
        self.model_path = model_path
        self.model_name = model_name or self._detect_model_name()
        # ... rest of init
    
    def _get_model_path(self, model_name: str) -> Path:
        models_dir = Path.home() / '.luciferai' / 'models'
        model_file = MODEL_FILES.get(model_name)
        return models_dir / model_file if model_file else None
```

2. **Unified Query Interface:**
```python
def query(self, prompt: str, **kwargs) -> str:
    # Works for ANY GGUF model in .luciferai/models/
    # No model-specific code needed
```

### Phase 5: Testing Strategy

#### Test Categories
**Tier 0 (Universal - ALL models must pass):**
- Basic math (What is 2+2?)
- Simple greetings (Say hello)
- Common knowledge (What color is sky?)
- File operations (list, pwd, read)
- Info commands (help, memory)

**Tier 1+ (Native tier tests):**
- Only test if model's native tier matches
- Progressive advancement if passing

#### Test Execution
```bash
cd tests
python3 progressive_tier_test.py

# Expected Output:
🧪 PROGRESSIVE TIER TESTING SYSTEM

Detected models:
  • TINYLLAMA (Tier 0)
  • PHI-2 (Tier 0)
  • LLAMA3.2 (Tier 1)
  • MISTRAL (Tier 2)
  • DEEPSEEK-CODER (Tier 3)

═══════════════════════════════════════════════════════
Testing TINYLLAMA (Native Tier 0)
═══════════════════════════════════════════════════════
  Tier 0: ✅ PASS (10/10) 100.0%

═══════════════════════════════════════════════════════
Testing LLAMA3.2 (Native Tier 1)
═══════════════════════════════════════════════════════
  Tier 0: ✅ PASS (10/10) 100.0%  ← Must pass!
  Tier 1: ✅ PASS (9/9) 100.0%    ← Native tier
  Tier 2: ❌ FAIL (3/9) 33.3% [Diagnostic]
```

## File Changes Required

### New Files
1. `core/model_files_map.py` - Centralized model→file mapping
2. `core/model_download.py` - Download logic for GGUF files
3. `docs/LLAMAFILE_MODELS.md` - Documentation

### Modified Files
1. `core/enhanced_agent.py`
   - `_handle_ollama_install_request()` - Route to GGUF download
   - `_check_ollama()` - Also check for GGUF files
   - `_get_model_path()` - Dynamic path resolution

2. `core/llamafile_agent.py`
   - Constructor - Accept model name or path
   - `_get_model_path()` - Auto-detect from name
   - Universal query interface

3. `tests/progressive_tier_test.py`
   - `detect_installed_models()` - Check all GGUF files
   - `_get_model_path()` - Support all models
   - Universal Tier 0 requirement

4. `core/model_tiers.py`
   - Ensure all 85+ models have tier assignments

## Benefits

### For Users
- ✅ All models work on Catalina (10.15+)
- ✅ 100% offline operation
- ✅ Consistent install experience
- ✅ Clear tier expectations

### For Testing
- ✅ Every model validated at Tier 0
- ✅ Progressive tier advancement
- ✅ Diagnostic mode for all higher tiers
- ✅ Complete test coverage

### For Development
- ✅ Single code path for all models
- ✅ No Ollama dependency
- ✅ Easier debugging
- ✅ Better error messages

## Migration Path

### Step 1: Core Infrastructure (Week 1)
- Create model file mapping
- Implement download handler
- Update llamafile agent

### Step 2: Install System (Week 1-2)
- Modify install routing
- Add progress tracking
- Test with 5-10 models

### Step 3: Testing Integration (Week 2)
- Update progressive tests
- Add Tier 0 requirement
- Test all models

### Step 4: Documentation (Week 2-3)
- Update help pages
- Write user guide
- Create troubleshooting docs

### Step 5: Validation (Week 3)
- Run full test suite
- Verify Catalina compatibility
- Performance testing

## Success Criteria
- ✅ All 85+ models have GGUF mappings
- ✅ `install <model>` downloads GGUF for any model
- ✅ Progressive tests detect all installed models
- ✅ Every model passes Tier 0 tests
- ✅ Higher tier models pass native tier tests
- ✅ Works on macOS Catalina (10.15)
- ✅ 100% offline operation
- ✅ No Ollama dependency

## Next Actions
1. Create `core/model_files_map.py` with all 85+ models
2. Implement GGUF download handler
3. Update install routing to use GGUF
4. Test with llama3.2 as proof of concept
5. Expand to remaining models
6. Run progressive tier tests on all

## Notes
- GGUF files are typically 2-30GB each
- Recommend external backup directory for space
- HuggingFace is primary source for GGUF files
- Consider mirrors for reliability
- Implement resume capability for interrupted downloads
