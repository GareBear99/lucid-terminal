# LLM Routing Flow & Step System

This document explains how LuciferAI routes requests through the LLM and displays visible progress steps.

## Overview

Every user input follows a decision tree that determines:
1. Whether to use LLM at all (local commands bypass it)
2. Which tier model to use (smart bypass system)
3. How to display progress (step system)
4. Whether to integrate with FixNet

## Complete Routing Diagram

```
User Input
    │
    ├─► LOCAL COMMANDS (instant, no LLM)
    │   ├── help, badges, soul, mainmenu
    │   ├── fixnet sync/stats
    │   ├── llm list/enable/disable
    │   ├── session list/info/stats
    │   ├── environments, daemon/watcher
    │   ├── github status/link
    │   ├── models info, program summary
    │   ├── run <script>, fix <script>
    │   └── exit, quit, clear, cls
    │
    └─► LLM PROCESSING REQUIRED
        │
        ├─► QUESTIONS (what/how/why/explain?)
        │   └── _handle_general_llm_query()
        │
        ├─► SIMPLE TASKS (create file/folder)
        │   └── _handle_single_task_with_llm()
        │
        ├─► SCRIPT CREATION (write a script that...)
        │   └── _handle_multi_step_script_creation()
        │
        └─► FIX SCRIPT (error detected)
            └── _auto_fix_script()
```

---

## Route Details

### 1. Questions (Q&A Route)

**Trigger**: Input contains question keywords (what, how, why, explain, etc.)

**Handler**: `_handle_general_llm_query()`

**Flow**:
```
1. Detect question intent
2. Select best available model (tiered bypass)
3. Stream response token-by-token
4. Show token statistics
```

**Visual Output**:
```
💡 Bypassed: tinyllama (Tier 0), phi-2 (Tier 0)
🧠 Using mistral (Tier 2, next available)
✓ Model loaded (3.2s)

[Response streams here character by character...]

[Input: 45 tokens, Output: 128 tokens, Total: 173 tokens]
```

---

### 2. Simple Tasks (File/Folder Creation)

**Trigger**: Simple creation keywords without complex logic

**Handler**: `_handle_single_task_with_llm()`

**Flow**:
```
Step 1/2: Creating file/folder
Step 2/2: Verifying existence
```

**Visual Output**:
```
📝 Step 1/2: Creating hello.py...
✅ Step 1/2 Complete

📝 Step 2/2: Verifying file exists
✅ Step 2/2 Complete

✅ Task completed successfully!
```

---

### 3. Script Creation (Complex Route)

**Trigger**: "write a script", "create a program", "build a tool", etc.

**Handler**: `_handle_multi_step_script_creation()`

**Flow**:
```
1. Parse task requirements
2. LLM plans the steps
3. Execute each step with progress
4. Validate the output
5. Upload to FixNet if novel
```

**Visual Output**:
```
💡 Bypassed: tinyllama (Tier 0), phi-2 (Tier 0)
🧠 Using mistral (Tier 2, next available)

🤔 mistral (Tier 2) thinking:
[LLM streams its reasoning and plan...]

📝 Step 1/5: Parsing task requirements
✅ Step 1/5 Complete

📝 Step 2/5: Creating file structure
✅ Step 2/5 Complete

📝 Step 3/5: Generating code
[Code streams here...]
✅ Step 3/5 Complete

📝 Step 4/5: Validating syntax
✅ Step 4/5 Complete

📝 Step 5/5: Uploading to FixNet
✅ Uploaded as novel solution (similarity: 0.23)

[Input: 89 tokens, Output: 456 tokens, Total: 545 tokens]
```

---

### 4. Fix Script (Error Recovery Route)

**Trigger**: Script execution fails OR user runs `fix <script>`

**Handler**: `_auto_fix_script()`

**Flow**:
```
Step 1/5: Search FixNet for similar fixes
Step 2/5: Apply known fix (if found)
Step 3/5: Generate new fix (if needed)
Step 4/5: Apply and test fix
Step 5/5: Upload to FixNet (if novel)
```

**Visual Output**:
```
🔧 Auto-fix triggered for: broken_script.py

📝 Step 1/5: Searching for similar fixes...
   Found 3 similar fixes in FixNet

📝 Step 2/5: Applying known fix (score: 0.92)
   Fix: "ImportError: No module named requests"
✅ Step 2/5 Complete

📝 Step 3/5: Skipped (existing fix worked)

📝 Step 4/5: Testing fixed script...
✅ Step 4/5 Complete - Script runs successfully

📝 Step 5/5: Uploading fix context to FixNet
   ⏭️ Skipped - Fix already exists (similarity: 0.92)

✅ Script fixed and verified!
```

---

## Tiered Model Bypass System

LuciferAI uses a smart bypass system that skips lower-tier models when higher-quality responses are needed.

### Tier Hierarchy

| Tier | Models | Use Case |
|------|--------|----------|
| 0 | tinyllama, phi-2 | Simple completions |
| 1 | llama2, gemma | Basic tasks |
| 2 | mistral, codellama | Code generation |
| 3 | mixtral, deepseek | Complex reasoning |
| 4 | llama3, claude | Advanced tasks |

### Bypass Logic

```python
# Pseudocode
for tier in [4, 3, 2, 1, 0]:
    models = get_models_at_tier(tier)
    for model in models:
        if model.is_available():
            return model
        else:
            print(f"💡 Bypassed: {model.name} (Tier {tier})")
```

### Visual Feedback

When models are bypassed:
```
💡 Bypassed: tinyllama (Tier 0), phi-2 (Tier 0), llama2 (Tier 1)
🧠 Using mistral (Tier 2, next available)
```

---

## Token Streaming

All LLM routes use streaming for visible progress:

### Loading Phase
```
⏳ Loading model... (0s)
⏳ Loading model... (1s)
⏳ Loading model... (2s)
✓ Model loaded (3.2s)
```

### Generation Phase
```
[Response streams character by character...]
```

### Stall Detection
If generation stalls for >10 seconds:
```
[waiting 12s]
```

### Completion Stats
```
[Input: 45 tokens, Output: 128 tokens, Total: 173 tokens]
```

---

## FixNet Integration Points

FixNet is called at these points in the flow:

| Route | When FixNet is Called |
|-------|----------------------|
| Script Creation | After successful generation (upload if novel) |
| Fix Script | Step 1 (search) + Step 5 (upload if novel) |
| Manual Fix | After user confirms fix works |

### Smart Upload Filter

Before uploading, LuciferAI checks:
1. **Similarity Score**: Rejects if >0.85 similar to existing fix
2. **Quality Check**: Rejects if solution is incomplete
3. **Duplicate Hash**: Rejects exact duplicates
4. **Branch Detection**: Links related fixes

---

## Code References

| Function | File | Line |
|----------|------|------|
| `_route_request()` | `core/enhanced_agent.py` | ~200 |
| `_handle_general_llm_query()` | `core/enhanced_agent.py` | ~400 |
| `_handle_single_task_with_llm()` | `core/enhanced_agent.py` | ~500 |
| `_handle_multi_step_script_creation()` | `core/enhanced_agent.py` | ~600 |
| `_auto_fix_script()` | `core/enhanced_agent.py` | ~800 |
| `print_step()` | `core/lucifer_colors.py` | ~764 |
| `stream_response()` | `core/llm_backend.py` | ~434 |

---

## Summary

1. **Local commands** → Instant, no LLM
2. **Questions** → Tiered bypass → Best model → Stream response
3. **Simple tasks** → 2-step workflow (create + verify)
4. **Script creation** → LLM plans → Multi-step execution → FixNet upload
5. **Fix script** → Search FixNet → Apply/Generate fix → Upload if novel

Every route shows:
- Which models were bypassed
- Which model was selected
- Step progress (📝 Step X/Y)
- Token streaming with load indicator
- Final token statistics
