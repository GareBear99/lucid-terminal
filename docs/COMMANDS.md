# 📚 Lucid Terminal - Complete Command Reference

This document provides a comprehensive reference for all 45+ commands available in Lucid Terminal.

---

## ⚡ Direct Commands (7 commands)

### `/help`
**Description**: Display comprehensive help menu with all available commands  
**Usage**: `/help [category]`  
**Examples**:
```bash
> /help              # Show all commands
> /help fixnet       # Show FixNet commands only
```

### `/fix <file>`
**Description**: Auto-fix errors in code files with quality grading  
**Usage**: `/fix <file_path>`  
**Examples**:
```bash
> /fix script.py     # Fix Python script
> /fix app.ts        # Fix TypeScript file
```

### `/models`
**Description**: Display all installed AI models with tier information  
**Usage**: `/models`  
**Output**: Shows model name, tier, size, and status

### `/llm list`
**Description**: List available LLM models and their status  
**Usage**: `/llm list [tier]`  
**Examples**:
```bash
> /llm list          # Show all models
> /llm list tier3    # Show only Tier 3 models
```

### `/chat`
**Description**: Start interactive chat mode with current model  
**Usage**: `/chat`

### `/exec <cmd>`
**Description**: Execute shell command directly  
**Usage**: `/exec <shell_command>`  
**Examples**:
```bash
> /exec ls -la       # List files
> /exec npm test     # Run tests
```

### `/pwd`
**Description**: Print current working directory  
**Usage**: `/pwd`

---

## 🔧 FixNet Commands (3 commands)

### `/fixnet search`
**Description**: Search FixNet dictionary for relevant fixes  
**Usage**: `/fixnet search <error_message>`  
**Examples**:
```bash
> /fixnet search "ModuleNotFoundError"
> /fixnet search "TypeError: undefined"
```

### `/fixnet sync`
**Description**: Synchronize local FixNet with community fixes  
**Usage**: `/fixnet sync`  
**Output**: Shows sync status and downloaded fixes

### `/fixnet status`
**Description**: Display FixNet statistics and configuration  
**Usage**: `/fixnet status`  
**Output**: Total fixes, success rate, last sync time

---

## 🧠 Model Management (4 commands)

### `/model list`
**Description**: List all available models with detailed information  
**Usage**: `/model list`

### `/model switch`
**Description**: Switch active model to different tier  
**Usage**: `/model switch <model_name>`  
**Examples**:
```bash
> /model switch mistral-7b
> /model switch tinyllama
```

### `/model install`
**Description**: Install new AI model from Ollama library  
**Usage**: `/model install <model_name>`  
**Examples**:
```bash
> /model install mistral
> /model install llama3.1
```

### `/model info`
**Description**: Show detailed information about specific model  
**Usage**: `/model info <model_name>`

---

## ✨ AI Code Generation (2 commands)

### `/generate`
**Description**: Generate code from natural language description  
**Usage**: `/generate <description>`  
**Examples**:
```bash
> /generate make me a script that tells me my gps
> /generate create a weather app in Python
```

### `/build`
**Description**: Build complete project from requirements  
**Usage**: `/build <project_description>`

---

## ⚙️ Workflow & System (4 commands)

### `/workflow status`
**Description**: Show current workflow state and phase  
**Usage**: `/workflow status`

### `/validate`
**Description**: Validate generated scripts with execution tests  
**Usage**: `/validate <script_path>`

### `/history`
**Description**: Show command history with timestamps  
**Usage**: `/history [limit]`  
**Examples**:
```bash
> /history           # Show all history
> /history 10        # Show last 10 commands
```

### `/settings`
**Description**: Open settings panel  
**Usage**: `/settings`

---

## 🐙 GitHub Integration (5 commands)

### `/github status`
**Description**: Show current git repository status  
**Usage**: `/github status`

### `/github commit`
**Description**: Commit changes with AI-generated message  
**Usage**: `/github commit [message]`

### `/github push`
**Description**: Push commits to remote repository  
**Usage**: `/github push`

### `/github branch`
**Description**: List or switch git branches  
**Usage**: `/github branch [name]`

### `/github sync`
**Description**: Sync with remote repository  
**Usage**: `/github sync`

---

## 🌍 Environment Management (3 commands)

### `/env list`
**Description**: List all detected Python/Node environments  
**Usage**: `/env list`

### `/env activate`
**Description**: Activate specific environment  
**Usage**: `/env activate <env_name>`

### `/env create`
**Description**: Create new virtual environment  
**Usage**: `/env create <env_name>`

---

## 📦 Model Installation (6 commands)

### `/install core models`
**Description**: Install recommended core models (Mistral, Llama 3.2)  
**Usage**: `/install core models`

### `/install tier <n>`
**Description**: Install all models for specific tier  
**Usage**: `/install tier 2`  
**Examples**:
```bash
> /install tier 2    # Install Tier 2 models (Mistral 7B)
> /install tier 3    # Install Tier 3 models (DeepSeek 33B)
```

### `/install mistral`
**Description**: Install Mistral 7B model (Tier 2)  
**Usage**: `/install mistral`

### `/install llama3`
**Description**: Install Llama 3.1 model  
**Usage**: `/install llama3`

### `/install deepseek`
**Description**: Install DeepSeek Coder model (Tier 3)  
**Usage**: `/install deepseek`

### `/install qwen`
**Description**: Install Qwen 2.5 Coder model  
**Usage**: `/install qwen`

---

## 🛠️ Developer Tools (3 commands)

### `/debug`
**Description**: Enable debug mode with verbose logging  
**Usage**: `/debug [on|off]`

### `/logs`
**Description**: Display application logs  
**Usage**: `/logs [lines]`

### `/clear`
**Description**: Clear terminal screen  
**Usage**: `/clear`

---

## 🎯 Special Modes (2 commands)

### `/interactive`
**Description**: Enter interactive AI mode (continuous conversation)  
**Usage**: `/interactive`

### `/batch`
**Description**: Execute batch of commands from file  
**Usage**: `/batch <file_path>`

---

## 💬 Natural Language (2 commands)

### Question Mode
**Description**: Ask any question without command prefix  
**Usage**: Just type your question  
**Examples**:
```bash
> what is TypeScript
> how do I center a div
> explain async/await
```

### Script Generation
**Description**: Request script creation in natural language  
**Usage**: Describe what you want to build  
**Examples**:
```bash
> make me a script that tells me my gps
> create a program to find large files
> build a weather fetcher
```

---

## 📊 System Information (3 commands)

### `/system info`
**Description**: Display system information (CPU, RAM, disk)  
**Usage**: `/system info`

### `/storage`
**Description**: Show disk space used by models and caches  
**Usage**: `/storage`

### `/version`
**Description**: Display Lucid Terminal version  
**Usage**: `/version`

---

## 🎨 Output Formatting

Commands support various output formats:

- **Default**: Human-readable terminal output
- **JSON**: `--json` flag for programmatic access
- **Quiet**: `--quiet` flag for minimal output
- **Verbose**: `--verbose` flag for detailed logging

**Examples**:
```bash
> /llm list --json
> /fixnet status --verbose
> /model install mistral --quiet
```

---

## 🔗 Command Chaining

Chain multiple commands with `&&`:

```bash
> /fixnet sync && /fix script.py && /validate script.py
> /model switch mistral && /generate weather app
```

---

## 📝 Notes

- Commands with `/` prefix are direct commands
- Natural language input (no prefix) routes to AI
- Use `Tab` for command auto-completion
- Use `↑`/`↓` arrow keys for command history
- Type `/help <category>` for category-specific help

---

**For more information, visit**: https://github.com/GareBear99/lucid-terminal
