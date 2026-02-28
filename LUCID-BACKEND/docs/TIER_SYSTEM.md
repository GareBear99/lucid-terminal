# Tier System Guide

> **Technical Guide** - For installation instructions and model list, see [MODEL_TIERS.md](MODEL_TIERS.md)

Understanding and configuring LuciferAI's intelligent model selection system.

## Table of Contents
- [Overview](#overview)
- [Tier Classifications](#tier-classifications)
- [How Model Selection Works](#how-model-selection-works)
- [Adding Models to Tiers](#adding-models-to-tiers)
- [Platform-Specific Considerations](#platform-specific-considerations)
- [Performance Tuning](#performance-tuning)
- [Examples](#examples)

## Overview

LuciferAI uses a tier-based system to automatically select the best model for each task. This balances:
- **Speed** - Faster responses for simple tasks
- **Quality** - Better reasoning for complex tasks
- **Resources** - Efficient use of RAM and CPU

### Why Tiers?

Different tasks need different capabilities:
- Listing files → Small, fast model (Tier 0)
- Writing Python code → Medium model (Tier 1-2)
- Complex debugging → Large model (Tier 2-3)
- Advanced architecture → Expert model (Tier 3-4)

## Tier Classifications

### Tier 0: Quick Response Models
**Size**: 1-3B parameters  
**RAM**: 2-4GB  
**Speed**: Very Fast (50-100 tokens/sec)  
**Use Cases**: Simple commands, file operations, basic queries

**Bundled Models**:
- `phi-2` (2.7B) - Microsoft's efficient model
- `tinyllama` (1.1B) - Ultra-lightweight

**Characteristics**:
- Instant responses
- Low resource usage
- Good for repetitive tasks
- Limited reasoning depth

**Best For**:
- `ls`, `cd`, `find` commands
- Simple file queries
- Quick information retrieval
- Navigation assistance

### Tier 1: Balanced Models
**Size**: 3-8B parameters  
**RAM**: 4-8GB  
**Speed**: Fast (30-60 tokens/sec)  
**Use Cases**: General scripting, moderate coding, explanations

**Bundled Models**:
- `gemma2` (7B) - Google's efficient model

**Characteristics**:
- Good reasoning ability
- Balanced speed/quality
- Handles most coding tasks
- Context-aware responses

**Best For**:
- Python/Bash script generation
- Code explanation
- Multi-step tasks
- General programming

### Tier 2: Advanced Models
**Size**: 7-13B parameters  
**RAM**: 8-16GB  
**Speed**: Medium (15-40 tokens/sec)  
**Use Cases**: Complex code, refactoring, debugging

**Bundled Models**:
- `mistral` (7B) - High-quality instruct model

**Characteristics**:
- Strong reasoning
- Complex problem solving
- Good code understanding
- Nuanced responses

**Best For**:
- Code refactoring
- Bug fixing
- Architecture decisions
- Complex scripting

**Default Tier**:
- Custom models without tier assignment default to Tier 0 (see [CUSTOM_MODELS.md](CUSTOM_MODELS.md))

### Tier 3: Expert Coding Models
**Size**: 13B+ parameters  
**RAM**: 16-24GB  
**Speed**: Slower (10-25 tokens/sec)  
**Use Cases**: Expert programming, complex systems

**Bundled Models**:
- `deepseek-coder` (33B) - Specialized coding model

**Characteristics**:
- Expert-level coding
- Deep understanding
- Multi-language mastery
- System architecture knowledge

**Best For**:
- Large codebases
- System design
- Performance optimization
- Security analysis

### Tier 4: Frontier Models
**Size**: 70B+ parameters  
**RAM**: 32GB+ (Q4), 48GB+ (Q5)  
**Speed**: Slow (5-15 tokens/sec)  
**Use Cases**: Cutting-edge reasoning, research tasks

**Bundled Models**:
- `llama3.1-70b` - Meta's flagship model

**Characteristics**:
- State-of-the-art reasoning
- Exceptional quality
- Comprehensive knowledge
- Resource intensive

**Best For**:
- Critical production code
- Research tasks
- Complex algorithms
- Educational content

## How Model Selection Works

### Selection Algorithm

```python
1. Check task complexity
   └─> Simple task? → Tier 0-1
   └─> Coding task? → Tier 1-2
   └─> Complex task? → Tier 2-3
   └─> Expert task? → Tier 3-4

2. Check enabled models in selected tier
   └─> Found? → Use it
   └─> Not found? → Try next tier up

3. Fallback to any available enabled model
```

### Task Classification

LuciferAI analyzes your input to determine complexity:

**Tier 0 Triggers**:
- File listing keywords: "ls", "show files", "list"
- Navigation: "cd", "go to directory"
- Simple queries: "what is", "where is"

**Tier 1 Triggers**:
- Script keywords: "write script", "create function"
- Basic coding: "python", "bash", "simple"
- Explanations: "explain", "how does"

**Tier 2 Triggers**:
- Code operations: "refactor", "optimize", "fix"
- Complex logic: "algorithm", "design pattern"
- Debugging: "error", "bug", "issue"

**Tier 3+ Triggers**:
- Advanced keywords: "architecture", "system", "performance"
- Complex code: "concurrent", "distributed", "scalable"
- Expert tasks: "security", "optimization", "analysis"

### Code Reference

Implementation in `core/enhanced_agent.py`:

```python
def _select_model_by_tier(self, user_query: str) -> Optional[str]:
    # Determine required tier from query complexity
    required_tier = self._determine_tier_from_query(user_query)
    
    # Find best available model in that tier
    for tier in range(required_tier, 5):
        model = self._find_enabled_model_in_tier(tier)
        if model:
            return model
    
    # Fallback to any enabled model
    return self._get_any_enabled_model()
```

## Adding Models to Tiers

### Method 1: Edit model_tiers.py (Recommended)

```bash
# Open tier configuration
nano core/model_tiers.py
```

```python
# core/model_tiers.py

# Tier 0: 1-3B params - Quick responses
TIER_0_MODELS = [
    'tinyllama',
    'phi-2',
    'your-small-model',  # Add your 1-3B model here
]

# Tier 1: 3-8B params - Balanced
TIER_1_MODELS = [
    'gemma2',
    'your-7b-model',  # Add your 7B model here
]

# Tier 2: 7-13B params - Advanced
TIER_2_MODELS = [
    'mistral',
    'your-13b-model',  # Add your 13B model here
]

# Tier 3: 13B+ params - Expert
TIER_3_MODELS = [
    'deepseek-coder',
    'your-expert-model',  # Add your 13B+ model here
]

# Tier 4: 70B+ params - Frontier
TIER_4_MODELS = [
    'llama3.1-70b',
    'your-70b-model',  # Add your 70B+ model here
]
```

### Method 2: Dynamic (No Code Changes)

Simply place your model in `models/custom_models/`:
- Automatically treated as Tier 2
- No restart needed
- Works immediately

### Choosing the Right Tier

Consider:

1. **Parameter Count**
   - 1-3B → Tier 0
   - 3-8B → Tier 1
   - 7-13B → Tier 2
   - 13-70B → Tier 3
   - 70B+ → Tier 4

2. **Model Purpose**
   - General chat → Tier 1-2
   - Coding specialist → Tier 2-3
   - Research model → Tier 3-4

3. **Your Hardware**
   - 8GB RAM → Max Tier 1
   - 16GB RAM → Max Tier 2
   - 32GB RAM → Max Tier 3
   - 64GB+ RAM → Tier 4 possible

## Platform-Specific Considerations

### Standard Desktop/Laptop

**macOS (Apple Silicon)**:
- Unified memory advantage
- Metal acceleration
- 8GB: Tier 0-1
- 16GB: Tier 0-2
- 32GB+: All tiers

**macOS (Intel)**:
- AVX2 acceleration
- 16GB: Tier 0-2
- 32GB+: Tier 0-3

**Linux (High-end)**:
- CUDA acceleration (if NVIDIA)
- Best performance for Tier 3-4
- Recommended for 70B+ models

**Windows**:
- AVX2 support
- Similar to Intel macOS
- WSL recommended for dev work

### Raspberry Pi

**Pi 5 (8GB)**:
- Tier 0: ✅ Excellent (phi-2, tinyllama)
- Tier 1: ⚠️ Slow but usable (Q3_K_M quant)
- Tier 2+: ❌ Not recommended

**Recommended Setup**:
```python
# core/model_tiers.py (Raspberry Pi config)
TIER_0_MODELS = ['tinyllama', 'phi-2']
TIER_1_MODELS = []  # Skip tier 1
TIER_2_MODELS = []  # Skip tier 2
```

**Optimization**:
- Use Q2_K or Q3_K_M quantizations only
- Enable swap (8GB+)
- Close unnecessary services
- Overclock if stable

**Best Models for Pi**:
- `tinyllama-q2_k` (700MB) - Ultra lightweight
- `phi-2-q3_k_m` (1.2GB) - Balanced
- Custom tiny models (<2B params)

### Arduino/Microcontrollers

**Direct LLM**: Not feasible (insufficient RAM/CPU)

**Alternative Architectures**:

1. **Edge Impulse + TinyML**
   - Use keyword spotting models
   - Simple command classification
   - <100KB models

2. **Remote Inference**
   - Arduino as client
   - LuciferAI on Pi/server
   - Serial/WiFi communication

3. **Pre-Trained Embeddings**
   - Store command embeddings
   - Cosine similarity matching
   - No inference needed

**Example Setup**:
```
Arduino → WiFi → Raspberry Pi (LuciferAI) → Execute commands
  ^                                               |
  └───────────── Response ─────────────────────────┘
```

### Custom OS / Embedded Systems

**Buildroot / Yocto**:
```bash
# Include llamafile dependencies
BR2_PACKAGE_PYTHON3=y
BR2_PACKAGE_PYTHON_NUMPY=y

# Optimize for space
USE_Q2K_ONLY=true
STRIP_BINARIES=true
```

**OpenWRT**:
- Very limited (64-512MB RAM)
- Tier 0 only (Q2_K quantization)
- Consider remote inference instead

**Android (Termux)**:
- Tier 0-1 depending on RAM
- Use llamafile Android build
- 8GB+ recommended

**iOS (iSH)**:
- Limited performance
- Tier 0 only
- Consider native llamafile app

### Server/Cloud Deployment

**Docker Container**:
```dockerfile
FROM python:3.11-slim

# Install LuciferAI
COPY . /app
WORKDIR /app

# Enable all tiers for cloud instance
ENV ENABLE_ALL_TIERS=true

# Start with tier 3 model
CMD ["python3", "lucifer.py", "--model", "deepseek-coder"]
```

**Kubernetes**:
- Resource limits per tier
- Auto-scaling based on demand
- Model caching for speed

## Performance Tuning

### Memory Optimization

**Tier 0-1 (8GB RAM)**:
```python
# Enable only lightweight models
llm enable phi-2
llm enable tinyllama
llm disable deepseek-coder
llm disable llama3.1-70b
```

**Tier 2-3 (16GB RAM)**:
```python
# Balance of power and speed
llm enable gemma2
llm enable mistral
llm enable deepseek-coder
llm disable llama3.1-70b  # Too heavy
```

**Tier 4 (32GB+ RAM)**:
```python
# Enable everything
llm enable phi-2
llm enable gemma2
llm enable mistral
llm enable deepseek-coder
llm enable llama3.1-70b
```

### Speed Optimization

For faster responses:

1. **Prefer Lower Tiers**
   ```python
   # Force tier 0-1 for most tasks
   # Edit enhanced_agent.py:
   required_tier = min(determined_tier, 1)
   ```

2. **Use More Aggressive Quantization**
   - Q4_K_M → Q3_K_M (30% faster)
   - Q5_K_M → Q4_K_M (40% faster)

3. **Reduce Context Window**
   ```python
   # In enhanced_agent.py
   MAX_CONTEXT_TOKENS = 1024  # Down from 2048
   ```

### Quality Optimization

For best results:

1. **Start at Higher Tier**
   ```python
   # Default to tier 2 unless simple task
   default_tier = 2
   ```

2. **Use Less Aggressive Quantization**
   - Q4_K_M → Q5_K_M
   - Q3_K_M → Q4_K_M

3. **Enable Larger Models**
   ```bash
   llm enable deepseek-coder
   llm enable llama3.1-70b
   ```

## Examples

### Example 1: Personal Laptop (16GB RAM)

**Goal**: Balance speed and quality

```python
# core/model_tiers.py
TIER_0_MODELS = ['phi-2', 'tinyllama']
TIER_1_MODELS = ['gemma2']
TIER_2_MODELS = ['mistral']
TIER_3_MODELS = []  # Skip for RAM
TIER_4_MODELS = []  # Skip for RAM
```

```bash
# Enable models
llm enable phi-2
llm enable gemma2
llm enable mistral
```

**Result**: Fast tier 0/1 for common tasks, quality tier 2 for coding.

### Example 2: Raspberry Pi 5 (8GB)

**Goal**: Maximum efficiency

```python
# core/model_tiers.py
TIER_0_MODELS = ['tinyllama-q2', 'phi-2-q3']
TIER_1_MODELS = []
TIER_2_MODELS = []
```

```bash
# Enable minimal models
llm enable tinyllama
llm disable gemma2
llm disable mistral
llm disable deepseek-coder
llm disable llama3.1-70b
```

**Result**: Usable LuciferAI on constrained hardware.

### Example 3: Workstation (64GB RAM)

**Goal**: Maximum quality

```python
# core/model_tiers.py
TIER_0_MODELS = ['phi-2']
TIER_1_MODELS = ['gemma2']
TIER_2_MODELS = ['mistral']
TIER_3_MODELS = ['deepseek-coder']
TIER_4_MODELS = ['llama3.1-70b']
```

```bash
# Enable all models
llm enable phi-2
llm enable gemma2
llm enable mistral
llm enable deepseek-coder
llm enable llama3.1-70b
```

**Result**: Optimal model selection for every task.

### Example 4: Custom Fine-Tuned Model

**Scenario**: You've created a custom 13B model specialized for Python

```python
# core/model_tiers.py
TIER_3_MODELS = [
    'deepseek-coder',
    'my-python-expert-13b',  # Your custom model
]
```

```bash
# Place and enable
cp my-python-expert-13b-q4.gguf models/custom_models/
llm enable my-python-expert-13b
```

**Result**: Your model is used for expert-level Python tasks.

### Example 5: Multi-Device Setup

**Desktop** (32GB RAM):
```python
# All tiers enabled
TIER_4_MODELS = ['llama3.1-70b']  # Heavy lifting here
```

**Laptop** (16GB RAM):
```python
# Tier 0-2 only
TIER_4_MODELS = []  # No 70B
```

**Pi** (8GB RAM):
```python
# Tier 0 only
TIER_1_MODELS = []
TIER_2_MODELS = []
```

## Best Practices

### Model Organization

```
High RAM (32GB+):
├── Tier 0: phi-2 (quick tasks)
├── Tier 1: gemma2 (general)
├── Tier 2: mistral (coding)
├── Tier 3: deepseek-coder (expert)
└── Tier 4: llama3.1-70b (critical)

Medium RAM (16GB):
├── Tier 0: phi-2, tinyllama
├── Tier 1: gemma2
└── Tier 2: mistral

Low RAM (8GB):
├── Tier 0: tinyllama (Q2_K)
└── Tier 1: phi-2 (Q3_K_M)
```

### Testing New Models

1. **Start untiered** (automatic Tier 2)
2. **Test on various tasks**
3. **Compare to existing tier models**
4. **Assign to appropriate tier**
5. **Document reasoning**

### Monitoring Performance

```bash
# Check which model was selected
tail -f ~/.luciferai/logs/session_*.json | grep model_selected

# Monitor RAM usage
htop

# Track response times
# (logged automatically in session JSON)
```

## See Also

- [CUSTOM_MODELS.md](CUSTOM_MODELS.md) - Adding custom models
- [MODEL_DEVELOPMENT.md](MODEL_DEVELOPMENT.md) - Creating models
- `core/model_tiers.py` - Tier definitions (code)
- `core/enhanced_agent.py` - Selection logic (code)
