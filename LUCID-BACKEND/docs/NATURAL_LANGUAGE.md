# 🧠 Natural Language Processing in LuciferAI

## Overview

LuciferAI now supports natural language commands powered by Ollama, allowing you to interact with the system using conversational language instead of formal commands.

## Architecture

### Hybrid Intelligence System

LuciferAI uses a **three-layer approach** for command understanding:

1. **Local Learning (Ollama)** - Offline AI processes commands locally
2. **Global Consensus** - Community fixes synced from FixNet  
3. **Keyword Logic** - Rule-based fallback when Ollama unavailable

### Models

- **llama3.2** (2GB) - Perfect for command parsing, fix application, and watcher operations
- **mistral** (7GB) - Advanced model for full script generation and complex tasks

## Examples with Breakdown

### Example 1: Watch Command

**Input:**
```
"watch my desktop fan terminal file"
```

**Response:**
```
🤔 Let me confirm what you want...

I understood: You want to watch this file:
  → ~/Desktop/lucifer_fan_terminal_adaptive_daemon_v1_1.py
     (Matched: fan, terminal, file)

Which mode do you want?
  [1] Autofix Mode - Automatically apply fixes when errors detected
  [2] Watch Mode - Monitor and suggest fixes (you choose)
```

**How Ollama Understood:**
- `watch` → Intent: Monitor/daemon mode
- `desktop` → Location hint: ~/Desktop/
- `fan terminal file` → File name keywords
- Fuzzy matched against filesystem
- Found 1 match with 90% confidence
- Asks: Autofix or Watch mode?

---

### Example 2: Natural Fix Command

**Input:**
```
"can you fix the errors in my test script"
```

**Response:**
```
🤔 Let me confirm...

I found multiple matches. Which one did you mean?

  [1] ~/Desktop/test.py (Matched: test, script)
  [2] ~/Projects/test_suite.py (Matched: test, script)
  [0] None of these / Cancel
```

**How Ollama Understood:**
- `can you` → Polite request pattern
- `fix` → Intent: Auto-fix errors
- `errors` → Context: Error detection needed
- `test script` → File hints
- Searches filesystem for *.py files
- Ranks by keyword match score
- Presents top matches for confirmation

---

### Example 3: Complex Monitoring

**Input:**
```
"could you monitor the lucifer daemon"
```

**Response:**
```
Is this correct?
  → ~/Projects/LuciferAI_Local/core/lucifer_watcher.py
     (Matched: lucifer, daemon)

yes/no:
```

**How Ollama Understood:**
- `could you` → Polite request
- `monitor` → Intent: Watch/observe
- `lucifer daemon` → Specific file hints
- High confidence match (85%)
- Asks for mode confirmation

---

## Keyword Detection Reference

### Intent Keywords

| Keyword | Intent |
|---------|--------|
| `watch`, `monitor`, `observe` | Daemon watcher |
| `fix`, `repair`, `autofix` | Auto-fix mode |
| `run`, `execute`, `start` | Execute script |
| `can you`, `could you`, `please` | Natural requests |

### File Hint Keywords

**Location:**
- `desktop`, `documents`, `projects`

**Type:**
- `file`, `script`, `daemon`, `terminal`

**Program:**
- `lucifer`, `fan`, `test`, `watcher`

## Processing Flow

1. **Extract** keywords from input
2. **Determine** intent (watch/fix/run)
3. **Search** filesystem with hints
4. **Score** matches by relevance
5. **Confirm** with user before executing

## Installation

### Install Ollama (One-time)

1. Visit: https://ollama.ai
2. Download and install Ollama for macOS
3. Pull a model:
   ```bash
   ollama pull llama3.2    # Basic AI (2GB)
   ollama pull mistral     # Advanced (7GB)
   ```
4. Restart LuciferAI

### Start Ollama

```bash
ollama serve
```

The Ollama server will run in the background and LuciferAI will automatically detect it.

## Comparison: Formal vs Natural

| Formal Command | Natural Language |
|----------------|------------------|
| `daemon add ~/Desktop/script.py` | `"watch my desktop script file"` |
| `run test.py` | `"can you execute the test file"` |
| `fix errors.py` | `"please fix the errors in my script"` |
| `daemon start autofix` | `"monitor with automatic fixes"` |

## Benefits

✅ **Natural conversation** - Talk to LuciferAI like a person  
✅ **Fuzzy matching** - Don't need exact file paths  
✅ **"Did you mean"** - Smart suggestions when ambiguous  
✅ **100% offline** - No cloud APIs, all processing local  
✅ **Fallback** - Works without Ollama using keywords  
✅ **Interactive** - Confirms before executing  

## When Ollama is Not Available

If Ollama isn't installed, LuciferAI will:
1. Detect multi-word natural language input
2. Show an installation prompt explaining benefits
3. Offer to open the installation page
4. Suggest keyword-based alternatives

You can always use formal commands without Ollama.

## Testing

Run the info screen to see interactive examples:

```bash
python3 lucifer.py -c info
```

Or try it in interactive mode:

```bash
python3 lucifer.py
> watch my desktop file
```

## Technical Details

- **Parser:** `core/nlp_parser.py`
- **Integration:** `core/enhanced_agent.py` (lines 282-323)
- **Ollama Prompt:** JSON-structured intent extraction
- **Confidence Threshold:** 50% minimum for suggestions
- **File Search:** Fuzzy string matching with SequenceMatcher
- **Max Candidates:** Top 5 matches presented

---

**Note:** Natural language processing is an enhancement, not a replacement. Formal commands remain fully supported and often faster for experienced users.
