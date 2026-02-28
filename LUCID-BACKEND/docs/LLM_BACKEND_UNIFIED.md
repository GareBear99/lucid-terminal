# Unified LLM Backend - Implementation Documentation

## Overview
LuciferAI now supports **multiple LLM backends** that work interchangeably:
- **Ollama** (preferred for macOS Sonoma 14.0+)
- **llama-cpp-python** (fallback for older macOS like Catalina/Big Sur)
- **Docker** (universal containerized fallback)

All backends provide **identical functionality** - models and features work the same regardless of which backend is used.

---

## Architecture

### Core Components

#### 1. **Unified LLM Backend** (`core/llm_backend.py`)
A single interface that automatically detects and uses available backends:

```python
from core.llm_backend import get_llm_backend

# Automatically selects best available backend
backend = get_llm_backend(model="llama3.2")

# Works identically with Ollama or llama-cpp-python
response = backend.chat(messages, temperature=0.7)
```

**Features:**
- Automatic backend detection (Ollama → llama-cpp-python)
- Unified API for all operations (chat, generate, list_models)
- Transparent switching between backends
- No code changes needed for different backends

#### 2. **Backend Implementations**

**OllamaBackend:**
- Uses Ollama REST API (http://localhost:11434)
- Native macOS app
- Requires macOS Sonoma 14.0+
- Excellent performance

**LlamaCppBackend:**
- Uses llama-cpp-python library
- Pure Python implementation
- Works on macOS Catalina (10.15) and newer
- Uses GGUF model format
- Good for older systems

---

## Installation Commands

### New Installation Options

**1. Install Ollama Platform:**
```bash
luci install ollama
```
- Auto-detects macOS version
- Falls back to alternatives on old macOS

**2. Install llama-cpp-python:**
```bash
luci install llama-cpp-python
```
- Installs via pip
- Perfect for Catalina/Big Sur
- Instructions for downloading GGUF models

**3. Install Models:**
```bash
luci install llama3.2
luci install mistral
luci install deepseek-coder
```
- Works with either backend
- Auto-detects which backend to use

### "Did You Mean" Logic

All model installations now include typo correction:

```bash
# Typos are auto-corrected with confirmation:
luci install lama        → "Did you mean llama3.2?"
luci install lamma       → "Did you mean llama3.2?"
luci install mistrel     → "Did you mean mistral?"
luci install mistrall    → "Did you mean mistral?"
luci install deepseak    → "Did you mean deepseek-coder?"
luci install depseek     → "Did you mean deepseek-coder?"
luci install olama       → "Did you mean ollama?"
```

---

## Updated Components

### 1. **nlp_parser.py**
- Now uses unified LLM backend
- Automatically falls back to rule-based parsing if no backend available
- Supports both Ollama and llama-cpp-python transparently

### 2. **enhanced_agent.py**

**Updated Help Text:**
```
🧠 AI Models & Natural Language:
  Installation (Guided):
  • install ollama - Install Ollama platform via Luci!
    (Fallback for Catalina: llama-cpp-python or Docker)
  • install llama-cpp-python - Lightweight LLM backend (for older macOS)
  • install llama - llama3.2 (2GB): Fast command parsing
  • install mistral - mistral (7GB): Advanced + web/images
  • install mistrel - Auto-corrects to 'mistral' with confirmation
  • install deepseek - deepseek-coder (6.7GB): Expert coding
```

**New Method: `_show_llamacpp_install()`**
- Handles llama-cpp-python installation
- Provides instructions for GGUF model downloads
- Links to Hugging Face model repository

### 3. **Models Info Page**

Added backend information section:
```
🔧 LLM Backend Support:
  • Ollama - Native macOS app (requires Sonoma 14.0+)
  • llama-cpp-python - Lightweight Python library (works on Catalina+)
  • Docker - Containerized Ollama (universal fallback)

  All backends work identically - models are interchangeable!

🏗️  Installation Options:

Option 1: Ollama (Recommended for macOS Sonoma+)
  • luci install ollama - Install Ollama platform
  • luci install llama3.2 - Install model

Option 2: llama-cpp-python (For Catalina/Big Sur)
  • luci install llama-cpp-python - Install backend
  • Download GGUF models to ~/.luciferai/models/
  • Models: https://huggingface.co/models?search=gguf

💾 All models install to: ~/.luciferai/models/
🔄 Auto-detection: deepseek > mistral > llama3.2
🔄 Backend priority: Ollama > llama-cpp-python
```

---

## Usage Examples

### Example 1: Chat with Unified Backend
```python
from core.llm_backend import get_llm_backend

# Works with any available backend
backend = get_llm_backend(model="llama3.2", verbose=True)

if backend.is_available():
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is Python?"}
    ]
    
    response = backend.chat(messages, temperature=0.7)
    print(response)
    
    # Check which backend is being used
    print(f"Using: {backend.get_backend_type()}")
```

### Example 2: Generate Completion
```python
from core.llm_backend import get_llm_backend

backend = get_llm_backend()

if backend.is_available():
    response = backend.generate(
        "Explain quantum computing in one sentence",
        max_tokens=100,
        temperature=0.5
    )
    print(response)
```

### Example 3: List Available Models
```python
from core.llm_backend import get_llm_backend

backend = get_llm_backend()

if backend.is_available():
    models = backend.list_models()
    print(f"Available models: {models}")
```

---

## For Users

### Quick Start

1. **Check your macOS version:**
   ```bash
   sw_vers
   ```

2. **Choose installation:**
   - **macOS Sonoma (14.0+):** Use Ollama
     ```bash
     luci install ollama
     luci install llama3.2
     ```
   
   - **macOS Catalina/Big Sur:** Use llama-cpp-python
     ```bash
     luci install llama-cpp-python
     # Then download GGUF models to ~/.luciferai/models/
     ```

3. **Start using:**
   ```bash
   luci
   # All LLM features work identically!
   ```

### Compatibility Matrix

| macOS Version | Recommended Backend | Alternative |
|---------------|---------------------|-------------|
| Sonoma 14.0+ | Ollama | llama-cpp-python |
| Ventura 13.x | Ollama | llama-cpp-python |
| Monterey 12.x | Ollama | llama-cpp-python |
| Big Sur 11.x | llama-cpp-python | Docker |
| Catalina 10.15 | llama-cpp-python | Docker |
| Older | Docker | Manual setup |

---

## Benefits

### For Developers
✅ **Single API:** Write once, works with any backend  
✅ **Automatic Fallback:** System detects best available option  
✅ **Easy Testing:** Switch backends without code changes  
✅ **Future-Proof:** Easy to add new backends

### For Users
✅ **Works on Old macOS:** No need to upgrade OS  
✅ **No Configuration:** Automatic backend detection  
✅ **Same Features:** All capabilities work identically  
✅ **Easy Installation:** Simple commands with typo correction

---

## Technical Details

### Backend Detection Priority
1. **Ollama** - Checks if running at localhost:11434
2. **llama-cpp-python** - Checks if library is installed
3. **None** - Falls back to rule-based parsing

### Model Format Support
- **Ollama:** Native Ollama format (auto-downloaded)
- **llama-cpp-python:** GGUF format (manual download)

### Model Storage
- **Ollama:** Managed by Ollama (~/.ollama/)
- **llama-cpp-python:** ~/.luciferai/models/
- **Unified Access:** Both accessible through same API

---

## Migration Guide

### For Existing Ollama Users
✅ **No Changes Needed:** Everything works as before  
✅ **Automatic:** System uses Ollama if available  
✅ **Fallback Available:** llama-cpp-python as backup

### For New Users on Old macOS
1. Install llama-cpp-python: `luci install llama-cpp-python`
2. Download GGUF models to `~/.luciferai/models/`
3. Use normally - system auto-detects

### Recommended GGUF Models
- **llama-3.2-3b-instruct-q4_k_m.gguf** (2GB)
- **mistral-7b-instruct-v0.2-q4_k_m.gguf** (4GB)
- **deepseek-coder-6.7b-instruct-q4_k_m.gguf** (4GB)

Download from: https://huggingface.co/models?search=gguf

---

## Future Enhancements

### Planned Features
- [ ] Auto-download GGUF models via luci
- [ ] GPU acceleration for llama-cpp-python
- [ ] Remote backend support (API keys)
- [ ] Model quantization options
- [ ] Benchmark mode to compare backends

---

## Troubleshooting

### Backend Not Detected
```bash
# Check Ollama
curl http://localhost:11434/api/tags

# Check llama-cpp-python
python3 -c "import llama_cpp; print('OK')"
```

### llama-cpp-python Installation Issues
```bash
# Install with specific options
pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
```

### Model Not Found (llama-cpp-python)
- Ensure GGUF files are in `~/.luciferai/models/`
- Check filename matches expected format
- Verify file permissions

---

## Summary

The unified LLM backend provides:
- ✅ **Universal Compatibility** - Works on all macOS versions
- ✅ **Transparent Operation** - Same API for all backends
- ✅ **Automatic Fallback** - Smart backend selection
- ✅ **Easy Installation** - Simple commands with typo correction
- ✅ **Future-Proof** - Easy to extend with new backends

All existing LLM features work identically across backends - no learning curve, no configuration needed!
