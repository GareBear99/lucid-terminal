# Custom Models Integration Guide

Complete guide for adding **custom GGUF model files** to LuciferAI.

> **Note:** This guide covers local GGUF models only. For external AI services (GitHub Copilot, OpenAI), image generation, or custom plugins, see [CUSTOM_INTEGRATIONS.md](CUSTOM_INTEGRATIONS.md).

## Table of Contents
- [Quick Start](#quick-start)
- [How LuciferAI Discovers Models](#how-luciferai-discovers-models)
- [Adding Pre-Built Models](#adding-pre-built-models)
- [Tier System Integration](#tier-system-integration)
- [Model Aliases and Canonical Names](#model-aliases-and-canonical-names)
- [Troubleshooting](#troubleshooting)

## Quick Start

### 1. Download a GGUF Model

Visit [HuggingFace](https://huggingface.co/models?library=gguf) and search for GGUF models.

Recommended sources:
- [TheBloke's Models](https://huggingface.co/TheBloke)
- [Qwen Models](https://huggingface.co/Qwen)
- [Meta Llama Models](https://huggingface.co/meta-llama)

Look for Q4_K_M quantization for best balance.

### 2. Place in Custom Models Directory

```bash
# Copy model to custom directory
cp your-model.gguf models/custom_models/

# Or download directly
cd models/custom_models
wget https://huggingface.co/org/repo/resolve/main/model.gguf
```

### 3. Enable the Model

```bash
# Start LuciferAI
python3 lucifer.py

# Enable your model
llm enable your-model

# Verify it's active
llm list
```

### 4. Start Using

Your custom model is now available for:
- Natural language queries
- Script generation
- Code fixing
- All LuciferAI features

## How LuciferAI Discovers Models

### Discovery Process

LuciferAI scans for models on startup in this order:

1. **Main Models Directory** (`models/`)
   - Scans for all `.gguf` files
   - Matches against `core/model_files_map.py` for canonical names

2. **Custom Models Directory** (`models/custom_models/`)
   - Scans for additional `.gguf` files
   - Uses filename as identifier if not in map

3. **Model Registration**
   - All discovered models added to `available_models` list
   - Tracked in `~/.luciferai/data/llm_state.json`
   - Can be enabled/disabled via `llm enable/disable`

### Code References

- `enhanced_agent.py::detect_installed_models()` - Directory scanning
- `model_files_map.py` - Canonical name mapping
- `model_tiers.py` - Tier classification

## Adding Pre-Built Models

### Supported Formats

LuciferAI uses the GGUF format via llamafile backend:
- ✅ GGUF (all quantization levels)
- ✅ Q2_K, Q3_K_M, Q4_K_M, Q5_K_M, Q8_0
- ✅ Works on macOS (Catalina+), Windows, Linux

### Recommended Quantizations

| Quantization | Size Reduction | Quality | Use Case |
|--------------|----------------|---------|----------|
| **Q4_K_M** | 75% | Excellent | **Recommended** - Best balance |
| Q5_K_M | 60% | Superior | Higher quality, larger size |
| Q8_0 | 50% | Near-perfect | Minimal compression |
| Q3_K_M | 85% | Good | Maximum compression |
| Q2_K | 90% | Acceptable | Extreme compression |

### System Requirements

Calculate RAM needed:
```
Required RAM = Model File Size × 1.2
```

Examples:
- 4GB Q4_K_M model = 5GB RAM minimum
- 7GB Q5_K_M model = 8.4GB RAM minimum
- 10GB Q8_0 model = 12GB RAM minimum

## Tier System Integration

### Understanding Tiers

LuciferAI uses tiers to select the best model for each task:

- **Tier 0**: 1-3B params - Quick responses, simple tasks
- **Tier 1**: 3-8B params - General purpose, balanced
- **Tier 2**: 7-13B params - Advanced reasoning, coding
- **Tier 3**: 13B+ params - Expert coding, complex tasks

### Option 1: No Tier (Quickest)

Just place your model in `custom_models/` - it works immediately!

```bash
cp my-model.gguf models/custom_models/
llm enable my-model
```

**Default behavior:**
- Treated as Tier 0 (fallback for unknown models)
- Available for all tasks
- No code changes needed

### Option 2: Add to Tier System (Recommended)

Edit `core/model_tiers.py`:

```python
# core/model_tiers.py

# Add your model to the appropriate tier list
TIER_0_MODELS = ['tinyllama', 'phi-2', 'your-small-model']  # 1-3B
TIER_1_MODELS = ['gemma2', 'your-medium-model']            # 3-8B
TIER_2_MODELS = ['mistral', 'your-large-model']            # 7-13B
TIER_3_MODELS = ['deepseek-coder', 'your-expert-model']    # 13B+
```

**Benefits:**
- Optimal model selection for each task
- Better performance/speed balance
- Proper tier-based routing

### Option 3: Canonical Name Mapping

For better aliases and recognition, edit `core/model_files_map.py`:

```python
# core/model_files_map.py

MODEL_FILES = {
    # Your model
    'your-model': 'your-model-q4_k_m.gguf',
    'your-alias': 'your-model-q4_k_m.gguf',  # Alias support
    
    # Existing models...
    'phi-2': 'phi-2-2.7b-Q4_K_M.gguf',
}

MODEL_ALIASES = {
    'your-alias': 'your-model',  # Maps alias to canonical
    'phi2': 'phi-2',
}
```

**Benefits:**
- Support for aliases (`llm enable alias` works)
- Better command recognition
- Consistent naming across system

## Model Aliases and Canonical Names

### What are Canonical Names?

Canonical names are the "official" identifier for each model in LuciferAI.

Example:
- Canonical: `phi-2`
- Aliases: `phi2`, `phi-2-2.7b`
- File: `phi-2-2.7b-Q4_K_M.gguf`

### Adding Aliases for Your Model

```python
# core/model_files_map.py

MODEL_FILES = {
    'qwen2-7b': 'qwen2-7b-instruct-q4_k_m.gguf',
    'qwen2': 'qwen2-7b-instruct-q4_k_m.gguf',  # Short form
    'qwen-2-7b': 'qwen2-7b-instruct-q4_k_m.gguf',  # Alternative
}

MODEL_ALIASES = {
    'qwen2': 'qwen2-7b',  # Maps to canonical
    'qwen-2-7b': 'qwen2-7b',
}
```

Now all these work:
```bash
llm enable qwen2-7b      # Canonical
llm enable qwen2         # Alias
llm enable qwen-2-7b     # Alternative alias
```

## Troubleshooting

### Model Not Appearing in `llm list`

**Check:**
1. File is in correct directory: `models/custom_models/`
2. File has `.gguf` extension
3. Restart LuciferAI to rescan

```bash
# Verify file location
ls -lh models/custom_models/*.gguf

# Check permissions
chmod 644 models/custom_models/your-model.gguf
```

### Model Loads But Gives Errors

**Common causes:**
1. **Insufficient RAM**
   - Check: `model_size × 1.2` RAM available
   - Solution: Close other applications or use smaller quantization

2. **Corrupted Download**
   - Solution: Re-download model file

3. **Incompatible Format**
   - Solution: Ensure model is GGUF format, not PyTorch/Safetensors

```bash
# Check file type
file models/custom_models/your-model.gguf
# Should show: "GGUF model file"

# Check file size matches expected
ls -lh models/custom_models/your-model.gguf
```

### Model Too Slow

**Solutions:**
1. Use smaller quantization (Q4_K_M → Q3_K_M)
2. Switch to smaller parameter model
3. Check CPU usage (may need hardware upgrade)
4. Disable other resource-heavy models

```bash
# Check enabled models
llm list

# Disable heavy models
llm disable llama3.1-70b
```

### Model Not Being Selected for Tasks

**Check tier assignment:**
```bash
# View current tiers
cat core/model_tiers.py | grep -A5 "TIER_._MODELS"
```

If your model isn't in a tier:
- Add to appropriate tier in `model_tiers.py`
- Or it's using Tier 2 default

## Best Practices

### Model Naming Conventions

✅ **Good:**
- `my-model-7b-q4`
- `custom-llama-13b`
- `finetune-mistral-7b`

❌ **Avoid:**
- `My Model 7B.gguf` (spaces)
- `model@7b_v2!.gguf` (special chars)
- `MYMODEL.GGUF` (uppercase)

### Performance Testing

Before deploying:

1. **Memory Test**: Monitor RAM usage during inference
2. **Speed Test**: Time generation for standard prompts
3. **Quality Test**: Compare output quality vs core models

### Sharing Custom Models

If your model performs well:
1. Document quantization and parameters used
2. Share download link and instructions
3. Consider contributing to model_files_map.py

## Examples

### Example 1: Adding Qwen2 7B

```bash
# Download model
cd models/custom_models
wget https://huggingface.co/Qwen/Qwen2-7B-Instruct-GGUF/resolve/main/qwen2-7b-instruct-q4_k_m.gguf

# Enable in LuciferAI
llm enable qwen2-7b-instruct-q4_k_m

# Verify
llm list
# Should show under Custom Models section
```

### Example 2: Adding with Tier Integration

```bash
# 1. Place model
cp my-7b-model.gguf models/custom_models/

# 2. Edit model_tiers.py
# Add 'my-7b-model' to TIER_2_MODELS

# 3. Edit model_files_map.py (optional)
# Add entry: 'my-7b-model': 'my-7b-model.gguf'

# 4. Restart LuciferAI and enable
llm enable my-7b-model
```

### Example 3: Adding with Aliases

```python
# core/model_files_map.py
MODEL_FILES = {
    'my-model': 'my-custom-model-7b-q4.gguf',
    'my-alias': 'my-custom-model-7b-q4.gguf',
}

MODEL_ALIASES = {
    'my-alias': 'my-model',
    'mm': 'my-model',  # Short form
}
```

```bash
# Now all these work:
llm enable my-model
llm enable my-alias  
llm enable mm
```

## Advanced Topics

For creating your own models from scratch, see:
- [MODEL_DEVELOPMENT.md](MODEL_DEVELOPMENT.md) - Converting and quantizing models
- [TIER_SYSTEM.md](TIER_SYSTEM.md) - Understanding tier classification
- `core/model_tiers.py` - Tier system implementation
- `core/model_files_map.py` - Model mapping implementation

## Support

- Documentation: `custom model info` command
- Code: `core/enhanced_agent.py`
- Logs: `~/.luciferai/logs/`
