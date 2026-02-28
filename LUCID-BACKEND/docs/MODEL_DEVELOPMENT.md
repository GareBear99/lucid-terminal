# Model Development Guide

Complete guide for creating, converting, and quantizing your own GGUF models for LuciferAI.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Converting Existing Models to GGUF](#converting-existing-models-to-gguf)
- [Quantization Guide](#quantization-guide)
- [Testing Your Model](#testing-your-model)
- [Adding to LuciferAI](#adding-to-luciferai)
- [Fine-Tuning for LuciferAI](#fine-tuning-for-luciferai)
- [Best Practices](#best-practices)

## Prerequisites

### System Requirements

- **Operating System**: macOS, Linux, or WSL on Windows
- **Python**: 3.8 or higher
- **Disk Space**: 2-3× the size of your base model
- **RAM**: At least model size × 1.5 for conversion process

### Required Tools

1. **llama.cpp** - Core conversion toolkit
2. **PyTorch** - For model conversion scripts
3. **HuggingFace Transformers** - For loading base models
4. **llamafile** (optional) - For testing models

### Installation

```bash
# Clone llama.cpp
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp

# Install Python dependencies
pip install -r requirements.txt

# Build the tools (macOS/Linux)
make

# For specific architectures
make LLAMA_METAL=1  # macOS with Metal
make LLAMA_CUDA=1   # Linux with CUDA
```

## Converting Existing Models to GGUF

### Supported Input Formats

llama.cpp can convert from:
- ✅ PyTorch (`.bin`, `.pt`, `.pth`)
- ✅ Safetensors (`.safetensors`)
- ✅ HuggingFace model directories
- ✅ GGML (legacy format, can upgrade to GGUF)

### Step 1: Obtain Base Model

Download a model from HuggingFace:

```bash
# Using git LFS (for large models)
git lfs install
git clone https://huggingface.co/meta-llama/Llama-2-7b-hf

# Or using huggingface-cli
pip install huggingface_hub[cli]
huggingface-cli download meta-llama/Llama-2-7b-hf --local-dir ./Llama-2-7b-hf
```

Popular base models:
- [meta-llama/Llama-2-7b-hf](https://huggingface.co/meta-llama/Llama-2-7b-hf)
- [mistralai/Mistral-7B-v0.1](https://huggingface.co/mistralai/Mistral-7B-v0.1)
- [Qwen/Qwen2-7B](https://huggingface.co/Qwen/Qwen2-7B)
- [microsoft/phi-2](https://huggingface.co/microsoft/phi-2)

### Step 2: Convert to GGUF

Using `convert.py` from llama.cpp:

```bash
# Basic conversion
python convert.py /path/to/model --outfile model.gguf

# With specific output type (F32 = full precision)
python convert.py /path/to/model --outfile model.gguf --outtype f32

# For instruct/chat models
python convert.py /path/to/model --outfile model.gguf --chat-template chatml
```

**Common Issues:**

1. **Missing tokenizer files**
   ```bash
   # Ensure these files exist in model directory:
   # - tokenizer.model or tokenizer.json
   # - tokenizer_config.json
   # - config.json
   ```

2. **Unsupported architecture**
   - Check llama.cpp documentation for supported models
   - Some architectures may need specific convert scripts

3. **Out of memory**
   - Use `--outtype f16` instead of `f32` to reduce memory
   - Close other applications
   - Use swap if necessary

### Step 3: Verify Conversion

```bash
# Check file type
file model.gguf
# Should output: "GGUF model file version 3"

# Get model info
./quantize model.gguf --info
```

## Quantization Guide

Quantization reduces model size while preserving quality by using lower-precision numbers.

### Understanding Quantization Types

| Type | Size | Quality | Speed | Use Case |
|------|------|---------|-------|----------|
| F32 | 100% | Perfect | Slow | Reference only |
| F16 | 50% | Near-perfect | Medium | High-end hardware |
| Q8_0 | 50% | Excellent | Medium | Minimal compression |
| **Q5_K_M** | 60% | Superior | Fast | High quality needs |
| **Q4_K_M** | 75% | Excellent | Fast | **Recommended balance** |
| Q3_K_M | 85% | Good | Very fast | Mobile/low-end |
| Q2_K | 90% | Acceptable | Very fast | Extreme compression |

### K-Quants Explained

K-quants (e.g., `Q4_K_M`, `Q5_K_S`) use mixed precision:
- Different quantization for different tensor types
- Better quality than standard quants at same size
- Variants: `_S` (small), `_M` (medium), `_L` (large)

**Recommendation**: Use `Q4_K_M` for most cases.

### Quantization Process

```bash
# Build quantize tool (if not already built)
make quantize

# Quantize to Q4_K_M (recommended)
./quantize model.gguf model-q4_k_m.gguf Q4_K_M

# Other common quantizations
./quantize model.gguf model-q5_k_m.gguf Q5_K_M  # Higher quality
./quantize model.gguf model-q8_0.gguf Q8_0      # Minimal loss
./quantize model.gguf model-q3_k_m.gguf Q3_K_M  # Smaller size
```

### Batch Quantization

Create multiple quantization levels:

```bash
#!/bin/bash
# quantize_all.sh

MODEL="model.gguf"

for QUANT in Q2_K Q3_K_M Q4_K_M Q5_K_M Q8_0; do
  echo "Quantizing to $QUANT..."
  ./quantize "$MODEL" "model-${QUANT,,}.gguf" "$QUANT"
done
```

### Choosing the Right Quantization

Consider these factors:

1. **Available RAM**
   - 8GB RAM → Q3_K_M or Q4_K_M for 7B models
   - 16GB RAM → Q4_K_M or Q5_K_M for 7B, Q4_K_M for 13B
   - 32GB+ RAM → Q5_K_M or Q8_0 for most models

2. **Task Complexity**
   - Simple commands → Q3_K_M is fine
   - Code generation → Q4_K_M minimum
   - Complex reasoning → Q5_K_M or higher

3. **Speed Requirements**
   - Real-time responses → Q3_K_M or Q4_K_M
   - Quality over speed → Q5_K_M or Q8_0

## Testing Your Model

### Test with llamafile

Before adding to LuciferAI, test independently:

```bash
# Download llamafile
wget https://github.com/Mozilla-Ocho/llamafile/releases/latest/download/llamafile
chmod +x llamafile

# Test inference
./llamafile -m model-q4_k_m.gguf --prompt "Hello, how are you?"

# Interactive mode
./llamafile -m model-q4_k_m.gguf -i

# With custom parameters
./llamafile -m model-q4_k_m.gguf \
  --temp 0.7 \
  --top-p 0.9 \
  --repeat-penalty 1.1 \
  --prompt "Write a Python function to sort a list"
```

### Test with llama.cpp

```bash
# Basic test
./main -m model-q4_k_m.gguf -p "Hello, how are you?"

# Interactive mode
./main -m model-q4_k_m.gguf -i -ins

# Benchmark performance
./main -m model-q4_k_m.gguf --test
```

### Quality Testing

Create a test prompt set:

```bash
# test_prompts.txt
Write a Python function to reverse a string
Explain quantum computing in simple terms
Write a bash script to backup files
What is the capital of France?
Fix this code: def add(a b): return a+b
```

Test each quantization:

```bash
for model in model-q*.gguf; do
  echo "Testing $model..."
  ./llamafile -m "$model" < test_prompts.txt > "results_${model}.txt"
done
```

Compare outputs to find best quality/size balance.

## Adding to LuciferAI

### Step 1: Place Model File

```bash
# Copy to custom models directory
cp model-q4_k_m.gguf /path/to/LuciferAI/models/custom_models/

# Or rename for clarity
cp model-q4_k_m.gguf /path/to/LuciferAI/models/custom_models/my-custom-7b-q4.gguf
```

### Step 2: Enable Model

```bash
# Start LuciferAI
python3 lucifer.py

# Check if detected
llm list

# Enable your model
llm enable my-custom-7b-q4

# Verify
llm list
```

### Step 3: Test in LuciferAI

Try various commands:

```bash
# Simple query
show me files in current directory

# Code generation
write a python script to sort files by size

# Code fixing
fix the syntax errors in main.py
```

Monitor logs for issues:

```bash
tail -f ~/.luciferai/logs/session_*.json
```

## Fine-Tuning for LuciferAI

### Optimal Training Data

To make your model work better with LuciferAI:

1. **Command Parsing**
   ```
   Input: list files in src directory
   Output: ls src/
   
   Input: find python files
   Output: find . -name "*.py"
   
   Input: show me large files
   Output: du -h | sort -hr | head
   ```

2. **Code Generation**
   ```
   Input: write a python function to parse JSON
   Output: [complete function with error handling]
   
   Input: create bash script for backups
   Output: [script with proper error checking]
   ```

3. **Context Awareness**
   ```
   User: show me main.py
   [system shows main.py]
   User: fix the error in it
   [model should reference main.py without being told again]
   ```

### Fine-Tuning Process

Using llama.cpp's LoRA training:

```bash
# Prepare training data (JSONL format)
# Each line: {"text": "input\noutput"}

# Train LoRA adapter
./finetune \
  --model-base model.gguf \
  --train-data training_data.jsonl \
  --lora-out lora_adapter.bin \
  --epochs 3 \
  --batch-size 4

# Merge LoRA with base model
./export-lora \
  --model-base model.gguf \
  --lora lora_adapter.bin \
  --model-out model_finetuned.gguf
```

### Recommended Training Focus

Priority areas for LuciferAI:

1. **File Operations** (40%)
   - ls, find, grep, cat, etc.
   - Directory navigation
   - File content queries

2. **Code Understanding** (30%)
   - Python, Bash, JavaScript syntax
   - Error detection and fixing
   - Code explanation

3. **Command Synthesis** (20%)
   - Natural language → shell commands
   - Multi-step task planning

4. **Context Retention** (10%)
   - Remembering previous files
   - Following up on prior commands

## Best Practices

### Model Naming

✅ **Good naming**:
- `my-llama-7b-q4` - Clear, includes size and quant
- `custom-mistral-13b-q5` - Descriptive
- `finetuned-code-7b-q4` - Purpose indicated

❌ **Avoid**:
- `Model.gguf` - Too generic
- `my model v2.gguf` - Spaces
- `FINAL_MODEL_v3.2!!.gguf` - Special characters

### Directory Organization

```
models/custom_models/
├── my-model-7b-q4.gguf        # Production model
├── my-model-7b-q5.gguf        # Higher quality variant
└── experimental/
    └── my-model-7b-q2.gguf    # Testing only
```

### Version Control

Keep notes on your models:

```bash
# models/custom_models/README.txt
my-model-7b-q4.gguf
  Base: Llama-2-7b-hf
  Quantization: Q4_K_M
  Fine-tuned: Yes (3 epochs on command data)
  Date: 2024-01-15
  Notes: Best balance for LuciferAI tasks
```

### Performance Benchmarking

Track key metrics:

```bash
# tokens per second
# (measure with llamafile --test)

# memory usage
# (monitor with htop during inference)

# quality score
# (subjective rating on test prompts)
```

### Sharing Models

If your model works well:

1. **Document thoroughly**
   - Base model used
   - Training data (if any)
   - Quantization level
   - Recommended use cases

2. **Upload to HuggingFace**
   ```bash
   huggingface-cli upload user/model-name model.gguf
   ```

3. **Share configuration**
   - Which tier it should be in
   - Any special parameters needed

## Troubleshooting

### Conversion Fails

**Error: "Unsupported model architecture"**
- Solution: Check llama.cpp version supports your model
- Update: `git pull && make clean && make`

**Error: "Missing tokenizer"**
- Solution: Download complete model files from HuggingFace
- Ensure `tokenizer.model` or `tokenizer.json` present

### Quantization Issues

**Output file is corrupted**
- Solution: Re-run quantization, ensure enough disk space
- Verify input GGUF file is valid first

**Model too large for RAM**
- Solution: Use more aggressive quantization (Q3_K_M or Q2_K)
- Or choose a smaller base model (7B instead of 13B)

### Model Quality Problems

**Responses are nonsense**
- Likely: Too aggressive quantization
- Solution: Use Q4_K_M or higher

**Model doesn't follow instructions**
- Likely: Base model not instruct-tuned
- Solution: Use instruct/chat variants (e.g., `Llama-2-7b-chat` not `Llama-2-7b`)

**Context gets confused**
- Likely: Model too small for task
- Solution: Use larger model (13B+) or add fine-tuning

## Resources

### Essential Links

- [llama.cpp GitHub](https://github.com/ggerganov/llama.cpp) - Core conversion tools
- [llamafile GitHub](https://github.com/Mozilla-Ocho/llamafile) - Testing tool
- [HuggingFace GGUF Models](https://huggingface.co/models?library=gguf) - Pre-converted models
- [GGUF Format Spec](https://github.com/ggerganov/ggml/blob/master/docs/gguf.md) - Technical details

### Community

- [llama.cpp Discussions](https://github.com/ggerganov/llama.cpp/discussions)
- [LuciferAI Community](https://github.com/yourusername/luciferai/discussions)
- [r/LocalLLaMA](https://reddit.com/r/LocalLLaMA) - Model running community

### Further Reading

- [Quantization Deep Dive](https://github.com/ggerganov/llama.cpp/discussions/2094)
- [Model Formats Comparison](https://github.com/ggerganov/ggml/blob/master/docs/formats.md)
- [Fine-Tuning Guide](https://github.com/ggerganov/llama.cpp/discussions/2506)

## See Also

- [CUSTOM_MODELS.md](CUSTOM_MODELS.md) - Adding pre-built models
- [TIER_SYSTEM.md](TIER_SYSTEM.md) - Setting model tiers
- `core/model_tiers.py` - Tier configuration code
- `core/model_files_map.py` - Model naming code
