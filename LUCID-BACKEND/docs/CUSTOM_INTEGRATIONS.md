# Custom AI Service Integrations

This guide covers integrating **external AI services** and **non-GGUF models** into LuciferAI. For local GGUF model files, see [CUSTOM_MODELS.md](CUSTOM_MODELS.md).

## Overview

LuciferAI supports multiple types of custom AI integrations:
- **Local Image Generation** (Flux, Stable Diffusion, InvokeAI, DiffusionBee)
- **Image Retrieval** (Google Images search with local caching)
- **External API Services** (GitHub Copilot, OpenAI, Anthropic, custom endpoints)
- **Custom Plugin Architecture** (add your own AI services)

---

## Image Generation System

### Built-in Image Generation

LuciferAI includes an **OS-aware image generation system** that automatically selects the best model for your hardware.

#### Supported Models

| Model | System Requirements | Quality | Speed |
|-------|-------------------|---------|-------|
| **Flux.1-schnell** | macOS Big Sur+ / Windows 10+ / Modern Linux | Excellent | Fast (4 steps) |
| **Stable Diffusion 1.5** | macOS Catalina / Windows 7+ / Any Linux | Good | Medium (20 steps) |
| **InvokeAI** | Cross-platform (CLI tool) | Excellent | Configurable |
| **DiffusionBee** | macOS only (GUI app) | Excellent | Fast |

#### Commands

```bash
# Generate an image from text
python3 lucifer.py -c "generate image a cyberpunk cityscape at sunset"

# Check generation status
python3 lucifer.py -c "image status"

# Interactive mode
python3 lucifer.py
> generate image a cute robot holding a flower
```

Generated images are saved to: `~/.luciferai/generated_images/`

---

### Recommended: Local Text-to-Image Generator

**For ChatGPT-quality image generation on your machine, we recommend [Fooocus](https://github.com/lllyasviel/Fooocus):**

#### Why Fooocus?
- ✅ **On-par with DALL-E 3 / Midjourney quality**
- ✅ **Minimal configuration** - works out of the box
- ✅ **Fast** - optimized for consumer GPUs (8GB VRAM+)
- ✅ **Cross-platform** - Windows, macOS (M1/M2), Linux
- ✅ **No API costs** - 100% local and free
- ✅ **Advanced features** - inpainting, outpainting, style transfer

#### Installation (macOS)

```bash
# Clone repository
git clone https://github.com/lllyasviel/Fooocus.git
cd Fooocus

# Install dependencies (requires Python 3.10+)
pip install -r requirements_versions.txt

# First run (downloads models ~4GB)
python launch.py

# Access at http://localhost:7865
```

#### Integration with LuciferAI

Once installed, Fooocus runs as a local web UI. To integrate:

1. **Manual Integration**: Run Fooocus separately, use its web UI
2. **Advanced Integration**: Create a plugin (see [Plugin Architecture](#plugin-architecture) below)

**Fooocus API Mode** (for programmatic access):
```bash
# Start Fooocus with API enabled
python launch.py --api
```

Then access via HTTP at `http://localhost:7865/api` (see [External API Services](#external-api-services))

---

## Image Retrieval System

LuciferAI can **search and download images from Google Images** for AI processing.

### Requirements
- **mistral** or **deepseek-coder** LLM installed (for vision analysis)

### Commands

```bash
# Search for images
python3 lucifer.py -c "image search cute cats"

# Download specific image by index
python3 lucifer.py -c "image download 2"

# View search results
python3 lucifer.py -c "image status"
```

### How It Works
1. Searches Google Images via scraping
2. Caches results locally in `~/.luciferai/images/image_cache.json`
3. Downloads images to `~/.luciferai/images/`
4. Returns file paths for AI vision models to process

---

## External API Services

### Overview

You can integrate external AI APIs like GitHub Copilot, OpenAI, Anthropic, or custom endpoints into LuciferAI's workflow.

### Supported Integration Methods

1. **Direct API Calls** - Use Python requests in custom handlers
2. **Plugin Architecture** - Create reusable plugins (recommended)
3. **Ollama Proxy** - Route external APIs through Ollama-compatible endpoints

---

### Method 1: Direct API Integration

**Example: GitHub Copilot Integration**

GitHub Copilot doesn't have a public API, but you can integrate it via:
- **Copilot CLI** (`github-copilot-cli` npm package)
- **VSCode Extension API** (if running in VSCode)
- **Copilot Agent API** (for GitHub App integrations)

Create a custom handler in `core/enhanced_agent.py`:

```python
# Add to enhanced_agent.py

def _handle_copilot_suggest(self, query: str) -> str:
    """Use GitHub Copilot for code suggestions"""
    try:
        import subprocess
        result = subprocess.run(
            ['github-copilot-cli', 'suggest', query],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            return f"GitHub Copilot Suggestion:\n{result.stdout}"
        else:
            return f"Copilot error: {result.stderr}"
    except Exception as e:
        return f"Failed to call Copilot: {e}"

# Register command in _handle_input()
if query.startswith("copilot "):
    prompt = query[8:]  # Remove "copilot " prefix
    return self._handle_copilot_suggest(prompt)
```

**Example: OpenAI API Integration**

```python
def _handle_openai_query(self, prompt: str, model: str = "gpt-4") -> str:
    """Query OpenAI API directly"""
    import os
    import requests
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return "Error: OPENAI_API_KEY environment variable not set"
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}]
            },
            timeout=60
        )
        
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
        else:
            return f"OpenAI API error: {response.status_code}"
    except Exception as e:
        return f"Failed to call OpenAI: {e}"
```

---

### Method 2: Plugin Architecture

**Recommended approach for reusable integrations.**

#### Plugin Structure

Create a new Python module in `luci/` directory:

```
luci/
├── image_generator.py  # Existing plugin
├── your_plugin.py      # Your custom plugin
```

#### Plugin Template

```python
"""
Your Custom AI Service Plugin
Integrates [service name] with LuciferAI
"""
import os
from typing import Optional, Tuple, Dict
from pathlib import Path

class YourServicePlugin:
    """Integration with [Service Name]"""
    
    def __init__(self):
        self.config_dir = Path.home() / ".luciferai"
        self.api_key = os.getenv("YOUR_SERVICE_API_KEY")
        self.is_available = self._check_availability()
    
    def _check_availability(self) -> bool:
        """Check if service is configured and accessible"""
        # Check API key, installed CLI tools, etc.
        return self.api_key is not None
    
    def execute(self, query: str) -> Tuple[bool, str]:
        """
        Execute query on service
        Returns: (success: bool, result: str)
        """
        if not self.is_available:
            return False, "Service not configured"
        
        try:
            # Your API call logic here
            result = self._call_service_api(query)
            return True, result
        except Exception as e:
            return False, str(e)
    
    def _call_service_api(self, query: str) -> str:
        """Make actual API call"""
        # Implementation here
        pass
```

#### Register Plugin

Add to `core/enhanced_agent.py`:

```python
# Import your plugin
from luci.your_plugin import YourServicePlugin

# In __init__()
self.your_service = YourServicePlugin()

# Add command handler in _handle_input()
if query.startswith("yourservice "):
    prompt = query[12:]  # Remove prefix
    success, result = self.your_service.execute(prompt)
    return result
```

---

### Method 3: Ollama Proxy Pattern

**Convert external APIs to Ollama-compatible endpoints.**

Some external services can be proxied through Ollama's interface:

```python
# Example: Proxy external API as Ollama model
import requests

def query_external_via_ollama(prompt: str, model: str = "custom-gpt"):
    """Query external service through Ollama proxy"""
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": model,
            "prompt": prompt,
            "stream": False
        }
    )
    return response.json()["response"]
```

Configure custom model routing in Ollama's `Modelfile`:

```dockerfile
FROM external-api-bridge
PARAMETER temperature 0.7
SYSTEM You are a helpful assistant powered by [external service].
```

---

## Security Best Practices

### API Key Management

**NEVER hardcode API keys.** Use environment variables:

```bash
# Add to ~/.bashrc or ~/.zshrc
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GITHUB_TOKEN="ghp_..."

# Or use .env file
echo "OPENAI_API_KEY=sk-..." >> ~/.luciferai/.env
```

Load in your plugin:

```python
import os
from dotenv import load_dotenv

load_dotenv(Path.home() / ".luciferai" / ".env")
api_key = os.getenv("OPENAI_API_KEY")
```

### Rate Limiting

Implement rate limiting for external APIs:

```python
import time
from collections import deque

class RateLimiter:
    def __init__(self, max_calls: int, time_window: int):
        self.max_calls = max_calls
        self.time_window = time_window
        self.calls = deque()
    
    def wait_if_needed(self):
        now = time.time()
        
        # Remove old calls outside window
        while self.calls and self.calls[0] < now - self.time_window:
            self.calls.popleft()
        
        # Wait if at limit
        if len(self.calls) >= self.max_calls:
            sleep_time = self.time_window - (now - self.calls[0])
            if sleep_time > 0:
                time.sleep(sleep_time)
        
        self.calls.append(now)

# Usage
limiter = RateLimiter(max_calls=10, time_window=60)  # 10 calls/min
limiter.wait_if_needed()
# Make API call
```

---

## Testing Custom Integrations

### Test Your Plugin

```python
# test_your_plugin.py
from luci.your_plugin import YourServicePlugin

def test_plugin():
    plugin = YourServicePlugin()
    
    # Test availability
    assert plugin.is_available, "Plugin not configured"
    
    # Test execution
    success, result = plugin.execute("test query")
    assert success, f"Plugin failed: {result}"
    
    print(f"✅ Plugin test passed: {result[:100]}")

if __name__ == "__main__":
    test_plugin()
```

### Integration Testing

```bash
# Test commands work end-to-end
python3 lucifer.py -c "yourservice test query"

# Test error handling
unset YOUR_SERVICE_API_KEY
python3 lucifer.py -c "yourservice should fail gracefully"
```

---

## Example: Complete Anthropic Claude Integration

```python
"""
luci/anthropic_plugin.py
Anthropic Claude integration for LuciferAI
"""
import os
import requests
from typing import Tuple
from pathlib import Path

class AnthropicPlugin:
    """Anthropic Claude API integration"""
    
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.api_url = "https://api.anthropic.com/v1/messages"
        self.model = "claude-3-5-sonnet-20241022"
        self.is_available = self.api_key is not None
    
    def query(self, prompt: str, max_tokens: int = 4096) -> Tuple[bool, str]:
        """Query Claude API"""
        if not self.is_available:
            return False, "ANTHROPIC_API_KEY not set"
        
        try:
            response = requests.post(
                self.api_url,
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": self.model,
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": prompt}]
                },
                timeout=120
            )
            
            if response.status_code == 200:
                result = response.json()["content"][0]["text"]
                return True, result
            else:
                return False, f"API error {response.status_code}: {response.text}"
        
        except Exception as e:
            return False, f"Request failed: {e}"
```

**Register in enhanced_agent.py:**

```python
from luci.anthropic_plugin import AnthropicPlugin

# In __init__()
self.anthropic = AnthropicPlugin()

# In _handle_input()
if query.startswith("claude "):
    prompt = query[7:]
    success, result = self.anthropic.query(prompt)
    if success:
        return f"🧠 Claude: {result}"
    else:
        return f"❌ {result}"
```

**Usage:**

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
python3 lucifer.py -c "claude explain quantum computing"
```

---

## Troubleshooting

### Image Generation Not Working

```bash
# Check installed models
python3 lucifer.py -c "image status"

# Install Flux (modern systems)
pip install torch torchvision diffusers transformers accelerate

# Install Stable Diffusion (legacy systems)
pip install diffusers transformers torch

# Test generation
python3 lucifer.py -c "generate image test"
```

### Image Retrieval Requires Advanced Model

```bash
# Install mistral for vision capabilities
python3 lucifer.py -c "install mistral"

# Then try image search
python3 lucifer.py -c "image search python logo"
```

### External API Returns 401/403

- Check API key is set: `echo $YOUR_API_KEY`
- Verify key has correct permissions
- Check rate limits haven't been exceeded

### Plugin Not Loading

- Ensure plugin file is in `luci/` directory
- Check import path in `enhanced_agent.py`
- Verify plugin class name matches import
- Look for Python syntax errors: `python3 -m py_compile luci/your_plugin.py`

---

## See Also

- [CUSTOM_MODELS.md](CUSTOM_MODELS.md) - Local GGUF model integration
- [MODEL_TIERS.md](MODEL_TIERS.md) - Model tier system and installation
- [TIER_SYSTEM.md](TIER_SYSTEM.md) - Technical tier system details
- [TRAIN_CUSTOM_LLM_FOR_LUCIFERAI.md](TRAIN_CUSTOM_LLM_FOR_LUCIFERAI.md) - Training custom models

---

## Contributing

To add your integration to LuciferAI's documentation:

1. Create plugin following [Plugin Architecture](#plugin-architecture)
2. Test thoroughly with example queries
3. Document API key requirements and installation steps
4. Submit pull request with plugin + docs

**Questions?** Use the help command: `python3 lucifer.py -c "help"`
