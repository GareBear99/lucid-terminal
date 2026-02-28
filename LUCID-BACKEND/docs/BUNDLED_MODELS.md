# 🎁 LuciferAI Bundled Models

LuciferAI comes with pre-configured support for **llamafile** and **TinyLlama**, providing instant AI capabilities that work on all systems, including legacy macOS versions.

---

## 🚀 Quick Setup

Run the bundled setup script to download and configure models:

```bash
./setup_bundled_models.sh
```

This will:
1. Create `bin/` and `models/` directories
2. Download llamafile (~34MB)
3. Download TinyLlama 1.1B model (~600MB)

**Total download:** ~634MB

---

## 📦 What's Included

### llamafile (Tier 0 Platform)
- **Location:** `bin/llamafile`
- **Size:** 34MB
- **Compatibility:** All macOS versions (Catalina+), Linux
- **Purpose:** Standalone AI model runner (no dependencies)

### TinyLlama 1.1B (Tier 0 Model)
- **Location:** `models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`
- **Size:** 600MB
- **Tier:** 0 (Ultra-Lightweight)
- **Use Cases:**
  - Basic chat and Q&A
  - Quick responses
  - Emergency fallback
  - Legacy system support

---

## 🎯 Usage

### Direct Usage
```bash
# Interactive chat
./bin/llamafile -m ./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf --interactive

# Single prompt
./bin/llamafile -m ./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf -p "Explain Python decorators"
```

### In LuciferAI
```bash
python3 lucifer.py
```

The main banner will automatically detect bundled models:
```
🤖 AI Models:
   ✅ llamafile (bundled)
   ✅ TinyLlama 1.1B (bundled, Tier 0)
```

---

## 🔄 Tier System Integration

LuciferAI uses a **4-tier model system**:

| Tier | Models | Use Case | RAM |
|------|--------|----------|-----|
| **🟢 Tier 0** | TinyLlama, Phi | Basic tasks, legacy systems | <8GB |
| **🔵 Tier 1** | Llama 3.2, Gemma 2B | Quick responses, chat | 8-16GB |
| **🟡 Tier 2** | Mistral, Llama 3.1 | Balanced coding | 16-32GB |
| **🔴 Tier 3** | DeepSeek, Mixtral | Expert coding | 32GB+ |

**Bundled models (Tier 0)** work as:
- ✅ Emergency fallback when system resources are low
- ✅ Primary AI on macOS Catalina and older
- ✅ Portable AI that doesn't require Ollama
- ✅ Quick setup for testing

---

## 📁 Directory Structure

After setup:
```
LuciferAI_Local/
├── bin/
│   └── llamafile                              # 34MB, executable
├── models/
│   └── tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf  # 600MB, model file
├── setup_bundled_models.sh                    # Setup script
└── lucifer.py                                 # Main CLI
```

All bundled components stay in the project directory for:
- ✅ Version control
- ✅ Portability across machines
- ✅ No global installations
- ✅ Easy cleanup

---

## 🔧 Manual Installation

If the setup script doesn't work or you want to install manually:

### 1. Create Directories
```bash
mkdir -p bin models
```

### 2. Download llamafile
```bash
# macOS / Linux
curl -L -o bin/llamafile https://github.com/Mozilla-Ocho/llamafile/releases/download/0.8.6/llamafile-0.8.6
chmod +x bin/llamafile
```

### 3. Download TinyLlama
```bash
curl -L -o models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
  https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

---

## 🆚 Bundled vs Ollama Models

### Bundled (llamafile + TinyLlama)
**Pros:**
- ✅ Works on macOS Catalina (10.15)
- ✅ No dependencies
- ✅ Portable (stays in project)
- ✅ Quick setup

**Cons:**
- ⚠️ Tier 0 only (basic capabilities)
- ⚠️ Slower than Ollama
- ⚠️ Limited model selection

### Ollama Models
**Pros:**
- ✅ Full tier support (Tier 0-3)
- ✅ Faster inference
- ✅ Large model library
- ✅ Easy model management

**Cons:**
- ⚠️ Requires macOS Sonoma (14.0+)
- ⚠️ Separate installation
- ⚠️ Global system dependency

---

## 🎓 Upgrade Path

**Start:** Bundled models (Tier 0)
```bash
./setup_bundled_models.sh
```

**Upgrade:** Install Ollama for more models
```bash
luci install ollama          # macOS Sonoma+ only
luci install llama3.2        # Tier 1
luci install mistral         # Tier 2
luci install deepseek-coder  # Tier 3
```

**Result:** Both systems work together
- Bundled models: Emergency fallback
- Ollama models: Primary AI

---

## 🧪 Testing

Verify bundled models are working:

```bash
# Test llamafile
./bin/llamafile --version

# Test TinyLlama
./bin/llamafile -m ./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf -p "Hello"

# Test in LuciferAI
python3 lucifer.py
# Banner should show: ✅ llamafile (bundled)
#                     ✅ TinyLlama 1.1B (bundled, Tier 0)
```

---

## 🔍 Troubleshooting

### "Permission denied" when running llamafile
```bash
chmod +x bin/llamafile
```

### "No such file or directory"
```bash
# Ensure paths are correct
ls -l bin/llamafile
ls -l models/tinyllama-*.gguf
```

### Model not detected in banner
```bash
# Check exact filename
ls models/
# Should show: tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

### Download interrupted
```bash
# Remove partial file and retry
rm models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
./setup_bundled_models.sh
```

---

## 📚 Related Documentation

- [MODEL_TIERS.md](docs/MODEL_TIERS.md) - Complete tier system guide
- [FALLBACK_SYSTEM.md](docs/FALLBACK_SYSTEM.md) - 5-tier OS fallback
- [Package Manager](luci/README.md) - Installing additional models

---

**🩸 LuciferAI** - AI that works everywhere, from Catalina to Sonoma
