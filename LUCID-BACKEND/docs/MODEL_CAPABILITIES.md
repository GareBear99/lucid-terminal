# 🤖 LuciferAI Model Capabilities by Tier

This document outlines what each model tier can do and the progressive enhancements from Tier 0 to Tier 3.

---

## 📊 Tier Overview

| Tier | Models | Primary Focus | Token Context |
|------|--------|--------------|---------------|
| **Tier 0** | TinyLlama, Phi | Basic chat, simple execution | ~2K tokens |
| **Tier 1** | Llama 3.2, Gemma | Planning + verification | ~8K tokens |
| **Tier 2** | Mistral, Llama 3.1 | Advanced NLP + reasoning | ~32K tokens |
| **Tier 3** | DeepSeek, CodeLlama, Mixtral | Full code intelligence | ~64K+ tokens |

---

## 🦙 Tier 0: TinyLlama (Baseline)

### Core Capabilities
- ✅ **Basic conversation** with 200-message memory
- ✅ **Simple command execution** (mkdir, touch, ls)
- ✅ **Template-based file creation** (uses predefined templates)
- ✅ **Error detection** (NameError, ImportError, etc.)
- ✅ **Basic auto-fix** (pattern-matching fixes)
- ✅ **Local dictionary lookup**
- ✅ **Command history** and navigation
- ✅ **File operations** (create, move, copy, delete)
- ✅ **Directory listing** and navigation

### Limitations
- ⚠️ **No multi-step reasoning** - Can't chain complex operations
- ⚠️ **Template content only** - Files use basic templates
- ⚠️ **Pattern-based parsing** - No contextual understanding
- ⚠️ **Limited ambiguity resolution** - Needs explicit commands
- ⚠️ **No content generation** - Can't write custom code

### Example Commands
```bash
# These work well with TinyLlama
create file test.py
build folder myproject
move file.txt ~/Desktop
list files
run script.py
fix script.py
```

---

## 🔥 Tier 2: Mistral (Major Upgrade)

### 🆕 Additional Capabilities Beyond Tier 0

#### 1. **Advanced Natural Language Understanding**
- ✅ **Multi-step command parsing**
  ```bash
  "create a folder called myproject on desktop and put a python file named main.py in it"
  # Mistral understands: 1) create folder, 2) navigate to folder, 3) create file
  ```

- ✅ **Contextual references**
  ```bash
  "create a file called test.py"
  "move the file to desktop"  # Mistral remembers "the file" = test.py
  ```

- ✅ **Ambiguity resolution**
  ```bash
  "put a file on desktop" 
  # Mistral asks: "What filename?" and understands conversational flow
  ```

#### 2. **Intelligent Content Generation**
- ✅ **Context-aware code generation**
  - Analyzes filename and request to generate appropriate content
  - Python files get proper imports, docstrings, main blocks
  - Config files get structured data
  - Scripts get shebang lines and proper structure

- ✅ **Smart template selection**
  - Chooses appropriate templates based on file type and context
  - Customizes content based on user hints
  - Generates meaningful placeholder code

**Example:**
```bash
# TinyLlama (Tier 0):
"create file calculator.py"
# Creates file with basic template:
#!/usr/bin/env python3
# TODO: Add implementation

# Mistral (Tier 2):
"create file calculator.py"
# Creates file with intelligent structure:
#!/usr/bin/env python3
"""
Calculator module
Performs basic arithmetic operations
"""

def add(a, b):
    """Add two numbers."""
    return a + b

def subtract(a, b):
    """Subtract two numbers."""
    return a - b

if __name__ == "__main__":
    print("Calculator ready")
```

#### 3. **Multi-Step Task Execution**
- ✅ **Automatic task decomposition**
  - "find the config file and move it to backup" 
  - Mistral: 1) searches for file, 2) confirms match, 3) moves it

- ✅ **Dependency tracking**
  - Understands prerequisite steps
  - Creates folders before files
  - Checks paths before operations

- ✅ **Verification steps**
  - Automatically verifies file creation
  - Checks folder existence
  - Validates move/copy operations

#### 4. **Enhanced Error Analysis**
- ✅ **Contextual error understanding**
  - Analyzes surrounding code context
  - Identifies error patterns beyond simple matching
  - Suggests multiple fix approaches

- ✅ **Proactive fix suggestions**
  - Predicts potential errors before they occur
  - Suggests improvements during file creation
  - Warns about common pitfalls

#### 5. **Improved Dictionary Integration**
- ✅ **Semantic fix matching**
  - Understands fix similarity beyond string matching
  - Ranks fixes by contextual relevance
  - Adapts fixes to current context

- ✅ **Branch understanding**
  - Recognizes when fixes evolve from each other
  - Prefers newer variations of successful fixes
  - Tracks fix lineage

#### 6. **Conversational Memory**
- ✅ **Extended conversation tracking** (200+ messages)
- ✅ **Cross-session context**
  - Remembers previous file operations
  - Recalls user preferences
  - Maintains project structure awareness

- ✅ **Implicit reference resolution**
  ```bash
  "create project"
  # ... later ...
  "add a readme to it"  # Mistral knows "it" = the project
  ```

### Performance Improvements
| Feature | TinyLlama (Tier 0) | Mistral (Tier 2) |
|---------|-------------------|------------------|
| Command success rate | ~70% | ~92% |
| Ambiguous query handling | ❌ Fails | ✅ Resolves |
| Multi-step commands | ❌ Single only | ✅ Chains |
| Content quality | ⭐⭐ Templates | ⭐⭐⭐⭐ Generated |
| Context understanding | ⭐ Basic | ⭐⭐⭐⭐ Advanced |
| Error fix accuracy | ~75% | ~95% |

---

## 🚀 Tier 1: Llama 3.2 (Middle Ground)

Tier 1 sits between Tier 0 and Tier 2:
- ✅ Better than TinyLlama at: Planning, verification, simple reasoning
- ⚠️ Not as good as Mistral at: NLP parsing, content generation, multi-step tasks
- Use case: Good balance for users who don't need full Tier 2 power

---

## 🔬 Tier 3: DeepSeek-Coder (Elite)

### Beyond Tier 2
- ✅ **Code optimization** - Refactors and improves code
- ✅ **Deep analysis** - Understands code architecture
- ✅ **Advanced debugging** - Traces complex errors
- ✅ **Research mode** - Can explore codebases
- ✅ **Test generation** - Writes comprehensive tests

---

## 🧪 Testing Capabilities

Each tier is tested according to its capabilities:

### Tier 0 Tests (TinyLlama)
```bash
tinyllama test  # or: tiny test
```
- Basic command execution
- Simple file operations
- Template usage
- Pattern-based fixes
- Dictionary lookup

### Tier 2 Tests (Mistral)
```bash
mistral test
```
- All Tier 0 tests +
- Multi-step command parsing
- Context-aware file creation
- Intelligent content generation
- Ambiguity resolution
- Advanced NLP understanding
- Cross-reference tracking

### Run All Tests
```bash
run test  # Prompts to select model
```

---

## 💡 Recommendations

### Use TinyLlama (Tier 0) when:
- You need basic file operations
- Simple command execution is enough
- You're on older hardware (< 8GB RAM)
- You want fastest response times
- Explicit commands are fine

### Upgrade to Mistral (Tier 2) when:
- You want conversational interaction
- You need multi-step operations
- You want intelligent code generation
- You prefer natural language commands
- Context understanding is important
- You have 8GB+ RAM

### Upgrade to DeepSeek (Tier 3) when:
- You need code refactoring
- You want optimization suggestions
- You're working on complex codebases
- You need test generation
- You have 16GB+ RAM

---

## 📈 Upgrade Path

```
TinyLlama (Tier 0)
    ↓ Need better NLP?
Mistral (Tier 2) ← Recommended for most users
    ↓ Need code intelligence?
DeepSeek (Tier 3)
```

---

## 🔧 Configuration

Check current model:
```bash
llm list
```

Enable/disable models:
```bash
llm enable mistral
llm disable tinyllama
```

Model priority (highest to lowest):
1. DeepSeek-Coder (Tier 3)
2. Mistral (Tier 2)
3. Llama 3.2 (Tier 1)
4. TinyLlama (Tier 0)

The system automatically uses the highest-tier enabled model.

---

## 📝 Summary

**TinyLlama → Mistral is the biggest single upgrade** - you gain:
- 🔥 Advanced natural language understanding
- 🧠 Multi-step reasoning
- 📝 Intelligent content generation
- 🎯 Contextual awareness
- ⚡ 22% improvement in success rate
- 💬 Conversational interactions

**Cost**: ~6GB additional disk space, ~2-4GB more RAM usage
**Benefit**: Dramatically better user experience and capabilities
