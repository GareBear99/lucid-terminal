#!/usr/bin/env python3
"""
🧠 Unified LLM Backend - Native llamafile execution with GGUF models
Provides a single interface for all LLM operations via native llamafile subprocess calls
"""
import os
import json
from typing import Dict, Any, List, Optional, Callable
from pathlib import Path

# Colors
PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
RESET = "\033[0m"

LUCIFER_HOME = Path.home() / ".luciferai"
# Models are in project root /models, not in .luciferai
PROJECT_ROOT = Path(__file__).parent.parent
MODELS_DIR = PROJECT_ROOT / "models"


class LLMBackend:
    """
    Unified interface for LLM operations.
    
    Automatically detects and uses:
    1. Ollama (preferred if available)
    2. llama-cpp-python (fallback for older systems)
    
    All LLM functions work identically regardless of backend.
    """
    
    def __init__(self, model: str = "llama3.2", verbose: bool = False):
        self.model = model
        self.verbose = verbose
        self.backend_type = None
        self.backend = None
        
        # Tier-based timeouts (in seconds)
        self.tier_timeouts = {
            'tinyllama': 20,         # Tier 0: Fast responses
            'llama3.2': 30,          # Tier 1: Moderate
            'mistral': 45,           # Tier 2: More complex
            'deepseek-coder': 60,    # Tier 3: Most capable, may need more time
            'llama3.1-70b': 120,     # Tier 4: Ultra models need more time
            'mixtral-8x22b': 120,    # Tier 4: Ultra models
            'qwen-72b': 120          # Tier 4: Ultra models
        }
        
        # Conversation memory - maintains up to 200 messages (100 exchanges)
        self.conversation_history: List[Dict[str, str]] = []
        self.max_history = 200  # 200 messages total (request + response pairs)
        
        # Detect and initialize backend
        self._detect_backend()
    
    def _detect_backend(self):
        """Detect which LLM backend is available."""
        # Force Native llamafile (subprocess - local only, no server)
        # We explicitly skip Ollama as per user request
        
        if self._check_native_llamafile():
            self.backend_type = "native-llamafile"
            self.backend = NativeLlamafileBackend(self.model, self.verbose)
            if self.verbose:
                print(f"{GREEN}✅ Using native llamafile backend{RESET}")
            return
            
        # If native check failed, maybe try to set it up or warn
        # For now, we fall back to None
        
        self.backend_type = None
        self.backend = None
        if self.verbose:
            print(f"{GOLD}⚠️  No native llamafile found. Please ensure 'bin/llamafile' exists.{RESET}")

    def _check_ollama(self) -> bool:
        """Check if Ollama is available and running."""
        # Disabled
        return False
    
    def _check_native_llamafile(self) -> bool:
        """Check if native llamafile binary exists."""
        llamafile_path = LUCIFER_HOME / 'bin' / 'llamafile'
        return llamafile_path.exists()
    
    def is_available(self) -> bool:
        """Check if any LLM backend is available."""
        return self.backend is not None
    
    def get_backend_type(self) -> Optional[str]:
        """Get the active backend type."""
        return self.backend_type
    
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """
        Send chat messages to LLM and get response.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            **kwargs: Additional options (temperature, max_tokens, etc.)
        
        Returns:
            String response from LLM
        """
        if not self.backend:
            raise RuntimeError("No LLM backend available")
        
        # Don't override timeout - let backend use smart inactivity-based timeouts
        # Tier-based timeouts were causing premature termination during model loading
        # The backend will use: 
        # - 45s inactivity timeout (no tokens generated)
        # - 10min absolute maximum (streaming) or 5min (non-streaming)
        pass
        
        # Get response from backend
        response = self.backend.chat(messages, **kwargs)
        
        # Handle return_stats parameter
        return_stats = kwargs.get('return_stats', False)
        if return_stats and isinstance(response, tuple):
            # Backend returned (text, stats) tuple
            response_text = response[0]
            response_stats = response[1]
        else:
            # Backend returned just text
            response_text = response if not isinstance(response, tuple) else response[0]
            response_stats = None
        
        # Update conversation history (only if messages represent a single exchange)
        # Add the last user message and the assistant response
        if messages and not kwargs.get('skip_history', False):
            # Find the last user message
            for msg in reversed(messages):
                if msg['role'] == 'user':
                    self.conversation_history.append(msg)
                    break
            
            # Add assistant response
            self.conversation_history.append({
                'role': 'assistant',
                'content': response_text
            })
            
            # Trim history to max_history (keep most recent messages)
            if len(self.conversation_history) > self.max_history:
                # Keep system messages and trim from the middle
                system_msgs = [m for m in self.conversation_history if m['role'] == 'system']
                other_msgs = [m for m in self.conversation_history if m['role'] != 'system']
                
                # Keep most recent messages
                trimmed_msgs = other_msgs[-(self.max_history - len(system_msgs)):]
                self.conversation_history = system_msgs + trimmed_msgs
        
        # Return tuple if stats requested, otherwise just text
        if return_stats and response_stats is not None:
            return (response_text, response_stats)
        return response_text
    
    def generate(self, prompt: str, **kwargs):
        """
        Generate completion for a prompt.
        
        Args:
            prompt: Text prompt
            **kwargs: Additional options (temperature, max_tokens, etc.)
        
        Returns:
            String completion from LLM
        """
        if not self.backend:
            raise RuntimeError("No LLM backend available")
        
        # Don't override timeout - let backend use smart inactivity-based timeouts
        # (Same reasoning as in chat() method above)
        return self.backend.generate(prompt, **kwargs)
    
    def list_models(self) -> List[str]:
        """List available models."""
        if not self.backend:
            return []
        
        return self.backend.list_models()
    
    def set_model(self, model: str):
        """Change the active model."""
        self.model = model
        if self.backend:
            self.backend.set_model(model)
    
    def get_conversation_history(self) -> List[Dict[str, str]]:
        """Get the current conversation history."""
        return self.conversation_history.copy()
    
    def clear_conversation_history(self):
        """Clear the conversation history (e.g., when starting a new chat)."""
        self.conversation_history = []
    
    def add_system_message(self, content: str):
        """Add a system message to conversation history."""
        self.conversation_history.append({
            'role': 'system',
            'content': content
        })
    
    def get_conversation_length(self) -> int:
        """Get the number of messages in conversation history."""
        return len(self.conversation_history)


class OpenAIBackend:
    """Backend implementation for OpenAI-compatible APIs (llamafile)."""
    
    def __init__(self, model: str, verbose: bool = False):
        self.model = model
        self.verbose = verbose
        self.base_url = "http://localhost:11434/v1"
        # Get actual model ID from API
        self._actual_model_id = self._get_actual_model_id()
    
    def _get_actual_model_id(self) -> str:
        """Get the actual model ID from the API."""
        import requests
        try:
            response = requests.get("http://localhost:11434/v1/models", timeout=2)
            if response.status_code == 200:
                models = response.json().get('data', [])
                if models:
                    return models[0]['id']  # Use first available model
        except:
            pass
        # Fallback to original model name
        return self.model
    
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Send chat request to OpenAI-compatible API."""
        import requests
        
        # Extract options
        temperature = kwargs.get('temperature', 0.7)
        max_tokens = kwargs.get('max_tokens', 2048)
        repeat_penalty = kwargs.get('repeat_penalty', 1.15)  # Prevent repetition
        top_p = kwargs.get('top_p', 0.9)
        
        payload = {
            "model": self._actual_model_id,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "frequency_penalty": repeat_penalty - 1.0,  # OpenAI API uses frequency_penalty
            "top_p": top_p
        }
        
        response = requests.post(
            f"{self.base_url}/chat/completions",
            json=payload,
            timeout=kwargs.get('timeout', 120)
        )
        
        if response.status_code == 200:
            result = response.json()
            return result['choices'][0]['message']['content']
        else:
            raise RuntimeError(f"OpenAI API error: {response.status_code} - {response.text}")
    
    def generate(self, prompt: str, **kwargs) -> str:
        """Generate completion using OpenAI-compatible API (via chat endpoint)."""
        # Convert prompt to chat format since llamafile supports chat better
        messages = [{"role": "user", "content": prompt}]
        return self.chat(messages, **kwargs)
    
    def list_models(self) -> List[str]:
        """List available models from OpenAI-compatible API."""
        import requests
        
        try:
            response = requests.get(f"{self.base_url.replace('/v1', '')}/v1/models", timeout=5)
            if response.status_code == 200:
                models = response.json().get('data', [])
                return [m['id'] for m in models]
        except:
            pass
        
        return []
    
    def set_model(self, model: str):
        """Change the active model."""
        self.model = model


class OllamaBackend:
    """Backend implementation for Ollama."""
    
    def __init__(self, model: str, verbose: bool = False):
        self.model = model
        self.verbose = verbose
        self.base_url = "http://localhost:11434"
    
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Send chat request to Ollama."""
        import requests
        
        # Extract options
        temperature = kwargs.get('temperature', 0.7)
        max_tokens = kwargs.get('max_tokens', 2048)
        stream = kwargs.get('stream', False)
        format_json = kwargs.get('format', None)
        
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
        }
        
        if format_json == "json":
            payload["format"] = "json"
        
        response = requests.post(
            f"{self.base_url}/api/chat",
            json=payload,
            timeout=kwargs.get('timeout', 120)
        )
        
        if response.status_code == 200:
            result = response.json()
            return result['message']['content']
        else:
            raise RuntimeError(f"Ollama API error: {response.status_code}")
    
    def generate(self, prompt: str, **kwargs) -> str:
        """Generate completion using Ollama."""
        import requests
        
        temperature = kwargs.get('temperature', 0.7)
        max_tokens = kwargs.get('max_tokens', 2048)
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            }
        }
        
        response = requests.post(
            f"{self.base_url}/api/generate",
            json=payload,
            timeout=kwargs.get('timeout', 120)
        )
        
        if response.status_code == 200:
            result = response.json()
            return result['response']
        else:
            raise RuntimeError(f"Ollama API error: {response.status_code}")
    
    def list_models(self) -> List[str]:
        """List available Ollama models."""
        import requests
        
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if response.status_code == 200:
                models = response.json().get('models', [])
                return [m['name'] for m in models]
        except:
            pass
        
        return []
    
    def set_model(self, model: str):
        """Change the active model."""
        self.model = model


class NativeLlamafileBackend:
    """Backend implementation for native llamafile (subprocess calls)."""
    
    def __init__(self, model: str, verbose: bool = False):
        self.model = model
        self.verbose = verbose
        self.llamafile_path = LUCIFER_HOME / 'bin' / 'llamafile'
        self.model_path = self._get_model_path()
    
    def _get_model_path(self) -> Path:
        """Get the model file path based on model name."""
        from core.model_files_map import get_model_file, get_canonical_name
        
        try:
            canonical_name = get_canonical_name(self.model)
            model_file = get_model_file(canonical_name)
            
            if model_file:
                model_path = MODELS_DIR / model_file
                if model_path.exists():
                    return model_path
        except:
            pass
        
        # Fallback: try to find any matching model
        possible_paths = list(MODELS_DIR.glob(f"*{self.model}*.gguf"))
        if possible_paths:
            return possible_paths[0]
        
        # Final fallback to tinyllama
        return MODELS_DIR / 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'
    
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Send chat request using native llamafile."""
        # Convert messages to prompt
        prompt = self._messages_to_prompt(messages)
        return self.generate(prompt, **kwargs)
    
    def generate(self, prompt: str, **kwargs) -> str:
        """Generate completion using native llamafile."""
        import subprocess
        import sys
        import os
        
        temperature = kwargs.get('temperature', 0.7)
        max_tokens = kwargs.get('max_tokens', 300)
        stream = kwargs.get('stream', False)
        
        # Build llamafile command
        # On macOS, llamafile APE format needs to be run through sh
        import platform
        if platform.system() == 'Darwin':  # macOS
            cmd = [
                'sh', str(self.llamafile_path),
                '-m', str(self.model_path),
                '-p', prompt,
                '-n', str(max_tokens),
                '--temp', str(temperature),
                '-ngl', '0',  # CPU only for compatibility
                '--silent-prompt'  # Don't echo the prompt
            ]
        else:
            cmd = [
                str(self.llamafile_path),
                '-m', str(self.model_path),
                '-p', prompt,
                '-n', str(max_tokens),
                '--temp', str(temperature),
                '-ngl', '0',  # CPU only for compatibility
                '--silent-prompt'  # Don't echo the prompt
            ]
        
        try:
            if stream:
                # Streaming mode: print tokens as they're generated
                import threading
                import queue
                import time
                
                output_queue = queue.Queue()
                full_output = []
                
                def read_output(pipe, q):
                    """Read output character by character and queue it."""
                    try:
                        while True:
                            char = pipe.read(1)
                            if not char:
                                break
                            q.put(char)
                            full_output.append(char)
                    except:
                        pass
                    finally:
                        q.put(None)  # Signal completion
                
                # Start subprocess
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=0  # Unbuffered
                )
                
                # Start output reader thread
                reader_thread = threading.Thread(target=read_output, args=(process.stdout, output_queue), daemon=True)
                reader_thread.start()
                
                # Print output as it arrives with activity-based timeout
                start_time = time.time()
                last_activity = time.time()  # Track last token received
                timeout = kwargs.get('timeout', 600)  # Total timeout (10 min absolute max)
                inactivity_timeout = kwargs.get('inactivity_timeout', 45)  # Timeout if no tokens for 45s (model loading)
                stream_callback = kwargs.get('stream_callback', None)  # Optional callback for live updates
                show_progress = kwargs.get('show_progress', True)  # Show token counter
                
                # Token counting for visual feedback
                char_count = 0
                token_estimate = 0
                last_progress_update = time.time()
                model_loading = True  # Flag for loading phase
                
                while True:
                    try:
                        char = output_queue.get(timeout=1)
                        if char is None:  # Completion signal
                            break
                        
                        # First token received - model is loaded
                        if model_loading:
                            model_loading = False
                            load_time = time.time() - start_time
                            if show_progress:
                                sys.stdout.write(f"\r{GREEN}✓ Model loaded ({load_time:.1f}s){RESET}\n")
                                sys.stdout.flush()
                        
                        char_count += 1
                        token_estimate = char_count // 4  # ~4 chars per token
                        
                        if stream_callback:
                            full_output.append(char)
                            current_text = ''.join(full_output)
                            if char_count % 5 == 0:
                                stream_callback(current_text, char_count)
                        else:
                            # Default: write directly to stdout with token counter
                            sys.stdout.write(char)
                            sys.stdout.flush()
                        
                        last_activity = time.time()  # Update activity timestamp
                        
                        # Show token counter every 20 chars (~5 tokens)
                        if show_progress and char_count % 20 == 0:
                            elapsed = time.time() - start_time
                            # Don't overwrite output - show inline progress occasionally
                            pass  # Token count shown at end
                            
                    except queue.Empty:
                        current_time = time.time()
                        time_since_activity = current_time - last_activity
                        elapsed_total = current_time - start_time
                        
                        # Show waiting indicator during model loading
                        if model_loading and show_progress:
                            dots = int(elapsed_total) % 4
                            wait_msg = f"\r{GOLD}⏳ Loading model{'.' * dots}{' ' * (3-dots)} ({elapsed_total:.0f}s){RESET}"
                            sys.stdout.write(wait_msg)
                            sys.stdout.flush()
                        elif show_progress and time_since_activity > 3:
                            # Show stall warning if no tokens for 3+ seconds
                            sys.stdout.write(f" {GOLD}[waiting {time_since_activity:.0f}s]{RESET}")
                            sys.stdout.flush()
                        
                        # Check for inactivity (no tokens generated after model loaded)
                        if not model_loading and time_since_activity > inactivity_timeout:
                            process.kill()
                            raise RuntimeError(f"\n{RED}❌ Generation stalled - no tokens for {time_since_activity:.0f}s{RESET}")
                        
                        # Extended timeout during model loading (90s), shorter after (45s)
                        loading_timeout = 90 if model_loading else inactivity_timeout
                        if time_since_activity > loading_timeout:
                            process.kill()
                            phase = "loading" if model_loading else "generating"
                            raise RuntimeError(f"\n{RED}❌ Timeout during {phase} - no activity for {time_since_activity:.0f}s{RESET}")
                        
                        # Check total timeout (absolute maximum)
                        if elapsed_total > timeout:
                            process.kill()
                            raise RuntimeError(f"\n{RED}❌ Total timeout ({timeout}s) exceeded{RESET}")
                        continue
                
                # Wait for process to complete and capture stderr for token stats
                process.wait(timeout=5)
                stderr_output = process.stderr.read() if process.stderr else ""
                
                if process.returncode != 0:
                    raise RuntimeError(f"Llamafile error: {stderr_output}")
                
                output_text = ''.join(full_output).strip()
                
                # Parse token counts from stderr
                token_stats = self._parse_token_stats(stderr_output)
                
                # Return tuple if caller wants stats, otherwise just text for backwards compatibility
                if kwargs.get('return_stats', False):
                    return (output_text, token_stats)
                return output_text
            else:
                # Non-streaming mode: wait for full output
                # Use much longer timeout since we can't detect inactivity in non-streaming
                # On Catalina, model loading can take 30-60s before any output
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=kwargs.get('timeout', 300)  # 5 min for non-streaming (includes model load time)
                )
                
                if result.returncode == 0:
                    output_text = result.stdout.strip()
                    
                    # Parse token counts from stderr
                    token_stats = self._parse_token_stats(result.stderr)
                    
                    # Return tuple if caller wants stats, otherwise just text
                    if kwargs.get('return_stats', False):
                        return (output_text, token_stats)
                    return output_text
                else:
                    raise RuntimeError(f"Llamafile error: {result.stderr}")
        
        except subprocess.TimeoutExpired:
            raise RuntimeError("Llamafile request timed out")
        except Exception as e:
            raise RuntimeError(f"Llamafile error: {e}")
    
    def _parse_token_stats(self, stderr: str) -> Dict[str, int]:
        """Parse token statistics from llamafile stderr output.
        
        Llamafile outputs timing info like:
        llama_print_timings: prompt eval time = ... ms / 2 tokens
        llama_print_timings: eval time = ... ms / 4 runs
        """
        import re
        
        stats = {
            'prompt_tokens': 0,
            'generated_tokens': 0,
            'total_tokens': 0
        }
        
        try:
            # Look for prompt eval line - format: "prompt eval time = ... ms / N tokens"
            prompt_match = re.search(r'prompt eval time\s*=\s*[\d.]+\s*ms\s*/\s*(\d+)\s+tokens', stderr)
            if prompt_match:
                stats['prompt_tokens'] = int(prompt_match.group(1))
            
            # Look for generation eval line - format: "eval time = ... ms / N runs"
            # Note: llamafile uses "runs" not "tokens" for generated output
            gen_match = re.search(r'eval time\s*=\s*[\d.]+\s*ms\s*/\s*(\d+)\s+runs', stderr)
            if gen_match:
                stats['generated_tokens'] = int(gen_match.group(1))
            
            stats['total_tokens'] = stats['prompt_tokens'] + stats['generated_tokens']
        except Exception:
            # If parsing fails, return zeros
            pass
        
        return stats
    
    def _messages_to_prompt(self, messages: List[Dict[str, str]]) -> str:
        """Convert chat messages to prompt format."""
        prompt_parts = []
        
        for msg in messages:
            role = msg['role']
            content = msg['content']
            
            if role == 'system':
                prompt_parts.append(f"System: {content}")
            elif role == 'user':
                prompt_parts.append(f"User: {content}")
            elif role == 'assistant':
                prompt_parts.append(f"Assistant: {content}")
        
        prompt_parts.append("Assistant:")
        return "\n".join(prompt_parts)
    
    def list_models(self) -> List[str]:
        """List available GGUF models."""
        if not MODELS_DIR.exists():
            return []
        
        gguf_files = list(MODELS_DIR.glob("*.gguf"))
        return [f.stem for f in gguf_files]
    
    def set_model(self, model: str):
        """Change the active model."""
        self.model = model
        self.model_path = self._get_model_path()


# Convenience function
def get_llm_backend(model: str = "llama3.2", verbose: bool = False) -> LLMBackend:
    """
    Get a unified LLM backend.
    
    Automatically detects and uses Ollama or llama-cpp-python.
    """
    return LLMBackend(model, verbose)


# Test
if __name__ == "__main__":
    print(f"{PURPLE}🧠 Testing Unified LLM Backend{RESET}\n")
    
    # Create backend
    backend = get_llm_backend(verbose=True)
    
    if backend.is_available():
        print(f"\n{GREEN}Backend type: {backend.get_backend_type()}{RESET}\n")
        
        # Test generate
        print(f"{BLUE}Testing generate...{RESET}")
        response = backend.generate("Say 'Hello from LLM backend!'", max_tokens=50)
        print(f"{CYAN}Response: {response}{RESET}\n")
        
        # Test chat
        print(f"{BLUE}Testing chat...{RESET}")
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is 2+2?"}
        ]
        response = backend.chat(messages, max_tokens=50)
        print(f"{CYAN}Response: {response}{RESET}\n")
        
        # List models
        print(f"{BLUE}Available models:{RESET}")
        models = backend.list_models()
        for model in models:
            print(f"  • {model}")
    else:
        print(f"{RED}❌ No LLM backend available{RESET}")
        print(f"{CYAN}Install Ollama or llama-cpp-python{RESET}")
