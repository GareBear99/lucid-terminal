# 🤖 Lucid Terminal - Complete Model Registry

**Status**: 85+ models across 5 tiers  
**Source**: Ported from LuciferAI  
**File**: `electron/core/models/modelTiers.ts`

---

## 📦 Core Models (Featured on Install Page)

These are the **recommended models** for each tier, highlighted with ⭐

### 🟢 Tier 0: Basic/Emergency (1-2B params)

| Model | Params | Size | Description | Status |
|-------|--------|------|-------------|--------|
| **tinyllama** ⭐🎁 | 1.1B | 600MB | Ultra-lightweight bundled - works offline | Bundled |
| **phi-2** ⭐ | 2.7B | 1.7GB | Microsoft compact with strong reasoning | Ollama |

**Requirements**: <8GB RAM | Works on macOS Catalina+ | Offline capable

---

### 🔵 Tier 1: General Purpose (3-8B params)

| Model | Params | Size | Description | Provider |
|-------|--------|------|-------------|----------|
| **llama3.2** ⭐ | 3B | 2GB | Meta's latest lightweight | Ollama |
| **gemma** ⭐ | 2B | 1.4GB | Google's efficient lightweight | Ollama |
| **phi-3** ⭐ | 3.8B | 2.3GB | Microsoft Phi-3 - strong for size | Ollama |

**Requirements**: 8-16GB RAM | Fast responses | Mobile-friendly

**Use Cases**: General chat, basic coding, explanations, quick tasks

---

### 🟡 Tier 2: Advanced (7-13B params)

| Model | Params | Size | Description | Provider |
|-------|--------|------|-------------|----------|
| **mistral** ⭐ | 7B | 4.1GB | Excellent balanced - **RECOMMENDED** | Ollama |
| **llama3.1** ⭐ | 8B | 4.7GB | Meta's latest - great instructions | Ollama |
| **qwen2.5** ⭐ | 7B | 4.7GB | Multilingual coding specialist | Ollama |

**Requirements**: 16-32GB RAM | Balanced performance

**Use Cases**: Coding, debugging, reasoning, production development, multilingual

---

### 🔴 Tier 3: Expert (13-34B params)

| Model | Params | Size | Description | Provider |
|-------|--------|------|-------------|----------|
| **deepseek-coder** ⭐ | 6.7B | 3.8GB | Specialized coding expert | Ollama |
| **codellama** ⭐ | 13B | 7.4GB | Meta's code specialist | Ollama |
| **mixtral** ⭐ | 8x7B | 26GB | Mixture of Experts - high perf | Ollama |

**Requirements**: 32GB+ RAM | High-performance hardware

**Use Cases**: Expert debugging, architecture design, complex refactoring, enterprise code

---

### ⚫ Tier 4: Ultra-Expert (70B+ params)

| Model | Params | Size | Description | Provider |
|-------|--------|------|-------------|----------|
| **llama3.1:70b** ⭐ | 70B | 40GB | Meta's ultra-expert | Ollama |
| **qwen2.5:72b** ⭐ | 72B | 41GB | Massive multilingual expert | Ollama |

**Requirements**: 64GB+ RAM | Research-grade hardware

**Use Cases**: Enterprise systems, research, production apps, maximum quality

---

## 📋 All Supported Models (85+)

### Tier 0: Basic/Emergency (8 models)
```
✅ tinyllama (1.1B, 600MB) 🎁 - Bundled
✅ phi-2 (2.7B, 1.7GB)
✅ stablelm (3B, 1.6GB)
✅ stablelm-2 (1.6B, 934MB)
✅ orca-mini (3B, 1.9GB)
```

### Tier 1: General Purpose (18 models)
```
✅ llama3.2 (3B, 2GB) ⭐
✅ llama3.2:1b (1B, 1.3GB)
✅ gemma (2B, 1.4GB) ⭐
✅ gemma-7b (7B, 4.8GB)
✅ gemma2 (9B, 5.5GB)
✅ phi-3 (3.8B, 2.3GB) ⭐
✅ llama2 (7B, 3.8GB)
✅ vicuna (7B, 3.8GB)
✅ orca-2 (7B, 3.8GB)
✅ openchat (7B, 4.1GB)
✅ starling (7B, 4.1GB)
+ 7 more variants
```

### Tier 2: Advanced (18 models)
```
✅ mistral (7B, 4.1GB) ⭐ RECOMMENDED
✅ llama3 (8B, 4.7GB)
✅ llama3.1 (8B, 4.7GB) ⭐
✅ qwen2.5 (7B, 4.7GB) ⭐
✅ codellama-7b (7B, 3.8GB)
✅ neural-chat (7B, 4.1GB)
✅ solar (10.7B, 6.1GB)
✅ yi (6B, 3.5GB)
✅ qwen (7B, 4.5GB)
+ 9 more variants
```

### Tier 3: Expert (17 models)
```
✅ deepseek-coder (6.7B, 3.8GB) ⭐
✅ deepseek-coder-33b (33B, 19GB)
✅ codellama (13B, 7.4GB) ⭐
✅ codellama-34b (34B, 19GB)
✅ mixtral (8x7B, 26GB) ⭐
✅ wizardcoder (15B, 8.6GB)
✅ wizardlm (13B, 7.4GB)
✅ yi-34b (34B, 19GB)
✅ dolphin-mixtral (8x7B, 26GB)
✅ nous-hermes (13B, 7.4GB)
✅ phind-codellama (34B, 19GB)
+ 6 more variants
```

### Tier 4: Ultra-Expert (4 models)
```
✅ llama3.1:70b (70B, 40GB) ⭐
✅ qwen2.5:72b (72B, 41GB) ⭐
✅ mixtral-8x22b (176B, 176GB)
+ 1 more variant
```

---

## 🎯 Tier Selection Guide

### For Daily Development
**Recommended**: Tier 2 - Mistral or Llama 3.1
- RAM: 16GB+
- Size: ~5GB
- Speed: Fast
- Quality: Excellent

### For Beginners / Limited RAM
**Recommended**: Tier 1 - Llama 3.2 or Gemma
- RAM: 8GB+
- Size: ~2GB
- Speed: Very Fast
- Quality: Good

### For Expert Coding
**Recommended**: Tier 3 - DeepSeek Coder or CodeLlama
- RAM: 32GB+
- Size: 3-20GB
- Speed: Medium
- Quality: Expert

### For Research / Maximum Quality
**Recommended**: Tier 4 - Llama 3.1:70b
- RAM: 64GB+
- Size: 40GB+
- Speed: Slow
- Quality: Best

---

## 📥 Installation Commands

### Install Core Models
```bash
# Tier 0 (Bundled - already installed)
tinyllama is pre-installed

# Tier 1 - Lightweight
ollama pull llama3.2
ollama pull gemma
ollama pull phi3

# Tier 2 - Balanced (RECOMMENDED)
ollama pull mistral
ollama pull llama3.1
ollama pull qwen2.5

# Tier 3 - Expert
ollama pull deepseek-coder
ollama pull codellama
ollama pull mixtral

# Tier 4 - Ultra-Expert (requires 64GB+ RAM)
ollama pull llama3.1:70b
ollama pull qwen2.5:72b
```

### List Available Models
```bash
# In Lucid Terminal
llm list

# Or via Ollama directly
ollama list
```

---

## 🔧 Technical Details

### Model Registry Structure
```typescript
interface ModelInfo {
  name: string;
  tier: number;           // 0-4
  params: string;         // e.g. "7B"
  size: string;           // e.g. "4.1GB"
  description: string;
  useCase: string[];
  provider: 'ollama' | 'llamafile' | 'openai' | 'custom';
  isCore?: boolean;       // Featured on install page
  isBundled?: boolean;    // Pre-installed
}
```

### Functions Available
```typescript
// Get model tier
getModelTier('mistral') // → 2

// Get models by tier
getModelsByTier(2) // → All Tier 2 models

// Get core models only
getCoreModels() // → 13 featured models

// Get tier capabilities
getTierCapabilities(2) // → Tier 2 info

// Format for display
formatModelInfo(model) // → Formatted string
```

---

## 📊 Summary

| Tier | Models | Core | RAM | Best For |
|------|--------|------|-----|----------|
| 0 | 8 | 2 | <8GB | Emergency, offline, legacy |
| 1 | 18 | 3 | 8-16GB | General chat, basic code |
| 2 | 18 | 3 | 16-32GB | **Recommended development** |
| 3 | 17 | 3 | 32GB+ | Expert coding, enterprise |
| 4 | 4 | 2 | 64GB+ | Research, max quality |
| **Total** | **85+** | **13** | - | - |

---

## 🎁 Bundled Model

**TinyLlama** (600MB) comes pre-installed:
- ✅ Works offline
- ✅ No dependencies
- ✅ macOS Catalina compatible
- ✅ Emergency fallback
- ✅ Uses llamafile (no Ollama needed)

---

## 🚀 Next Steps

1. **Start with Tier 2** (Mistral or Llama 3.1) for best balance
2. **Scale up** to Tier 3 for expert tasks
3. **Scale down** to Tier 1 for speed
4. **Fallback** to Tier 0 (TinyLlama) if offline

All models work with the deterministic routing system - LLM is optional but powerful when needed!

---

**Status**: Complete Model System ✅  
**Total Models**: 85+ across 5 tiers  
**Core Models**: 13 featured models  
**Bundled**: TinyLlama (600MB)  
**Ready**: For Phase 5 LLM Integration
