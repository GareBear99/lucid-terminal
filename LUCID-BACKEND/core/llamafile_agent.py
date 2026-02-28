#!/usr/bin/env python3
"""
🦙 LuciferAI Llamafile Agent - TinyLlama Integration
Provides basic AI replies using llamafile with TinyLlama model
Includes 200-message conversation memory
"""
import subprocess
import json
from pathlib import Path
from typing import List, Dict, Optional
from collections import deque

# Import knowledge handlers
try:
    from core.zodiac_knowledge import handle_zodiac_query
    from core.simple_knowledge import handle_simple_query, handle_memory_query
except ImportError:
    def handle_zodiac_query(query: str) -> str:
        return ""
    def handle_simple_query(query: str) -> str:
        return ""
    def handle_memory_query(query: str, history: list) -> str:
        return ""


class LlamafileAgent:
    """
    Agent that uses llamafile with TinyLlama for basic AI responses.
    Maintains 200-message conversation history for context.
    """
    
    def __init__(self, model_path: Optional[str] = None, llamafile_path: Optional[str] = None, model_name: Optional[str] = None):
        """Initialize llamafile agent.
        
        Args:
            model_path: Explicit path to GGUF model file
            llamafile_path: Path to llamafile binary
            model_name: Model name (e.g., 'tinyllama', 'mistral', 'llama3.2')
                       If provided, auto-detects path from model_files_map
        """
        # Get project root - use internal .luciferai directory
        project_root = Path(__file__).parent.parent
        luciferai_dir = project_root / '.luciferai'
        
        # Default paths
        self.llamafile_path = llamafile_path or (luciferai_dir / 'bin' / 'llamafile')
        
        # Determine model path
        if model_name and not model_path:
            # Auto-detect from model name using model_files_map
            model_path = self._get_model_path_from_name(model_name)
        
        self.model_path = model_path or (luciferai_dir / 'models' / 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf')
        self.model_name = model_name or self._detect_model_name_from_path()
        
        # Check if llamafile and model exist
        self.available = self.llamafile_path.exists() and self.model_path.exists()
        
        # Conversation memory (200 messages max)
        self.conversation_history: deque = deque(maxlen=200)
        
        # System prompt - different for TinyLlama vs Mistral
        is_tiny = 'tinyllama' in str(self.model_path).lower()
        
        if is_tiny:
            # TinyLlama: Simple, concise system prompt
            self.system_prompt = (
                "You are LuciferAI, a helpful AI assistant. "
                "Answer questions clearly and concisely. "
                "Keep responses brief and friendly."
            )
        else:
            # Mistral: More capable, detailed
            self.system_prompt = (
                "You are LuciferAI, an advanced AI assistant. "
                "Provide clear, detailed, and accurate responses. "
                "Use your knowledge to help users effectively. "
                "If you don't know something, be honest about it."
            )
        
        # Detect model name from path for display
        model_name = "TinyLlama 1.1B (Tier 0)"
        if self.model_path and 'mistral' in str(self.model_path).lower():
            model_name = "Mistral 7B (Tier 2)"
        
        # Only print initialization in verbose mode (not during tests)
        import os
        verbose = os.getenv('LUCIFER_VERBOSE', '0') == '1'
        
        if self.available and verbose:
            print(f"✅ Llamafile agent initialized")
            print(f"   Model: {model_name}")
            print(f"   Memory: 200 messages")
        elif not self.available and verbose:
            print(f"⚠️  Llamafile or model not found")
            print(f"   Run: ./setup_bundled_models.sh")
    
    def _get_model_path_from_name(self, model_name: str) -> Optional[Path]:
        """Get model file path from model name using model_files_map.
        
        Args:
            model_name: Model name (e.g., 'tinyllama', 'mistral')
        
        Returns:
            Path to model file or None if not found
        """
        try:
            from core.model_files_map import get_model_file, get_canonical_name
            
            canonical_name = get_canonical_name(model_name)
            model_file = get_model_file(canonical_name)
            
            if model_file:
                project_root = Path(__file__).parent.parent
                models_dir = project_root / '.luciferai' / 'models'
                model_path = models_dir / model_file
                
                if model_path.exists():
                    return model_path
        except ImportError:
            pass
        
        return None
    
    def _detect_model_name_from_path(self) -> str:
        """Detect model name from file path.
        
        Returns:
            Model name (e.g., 'tinyllama', 'mistral')
        """
        if not self.model_path:
            return 'unknown'
        
        path_str = str(self.model_path).lower()
        
        # Check for known model patterns
        if 'tinyllama' in path_str:
            return 'tinyllama'
        elif 'mistral' in path_str and 'mixtral' not in path_str:
            return 'mistral'
        elif 'llama-3.2' in path_str or 'llama3.2' in path_str:
            return 'llama3.2'
        elif 'llama-2' in path_str or 'llama2' in path_str:
            return 'llama2'
        elif 'phi-3' in path_str or 'phi3' in path_str:
            return 'phi-3'
        elif 'phi-2' in path_str or 'phi2' in path_str:
            return 'phi-2'
        elif 'deepseek' in path_str:
            return 'deepseek-coder'
        elif 'gemma-2' in path_str or 'gemma2' in path_str:
            return 'gemma2'
        elif 'gemma' in path_str:
            return 'gemma'
        else:
            return 'unknown'
    
    def add_to_history(self, role: str, content: str):
        """Add a message to conversation history."""
        self.conversation_history.append({
            'role': role,
            'content': content
        })
    
    def get_context(self, max_messages: int = 10) -> str:
        """
        Get recent conversation context for the prompt.
        Returns last N message pairs formatted for context.
        """
        if not self.conversation_history:
            return ""
        
        # Get last N messages (limited for token efficiency)
        recent = list(self.conversation_history)[-max_messages:]
        
        context_lines = []
        for msg in recent:
            role_label = "User" if msg['role'] == 'user' else "Assistant"
            context_lines.append(f"{role_label}: {msg['content']}")
        
        return "\n".join(context_lines)
    
    def query(self, prompt: str, temperature: float = 0.3, max_tokens: int = 200) -> str:
        """
        Query TinyLlama via llamafile.
        
        Args:
            prompt: User's question/command
            temperature: Creativity level (0.0-1.0, lower = less hallucination)
            max_tokens: Maximum response length (200 = 20% faster than 256)
        
        Returns:
            Model's response or refusal if uncertain
        """
        if not self.available:
            model_name = "TinyLlama" if 'tinyllama' in str(self.model_path).lower() else "Mistral"
            return f"❌ {model_name} not available. Run: ./setup_bundled_models.sh"
        
        # Check if this is a zodiac query (keyword-based, no LLM needed)
        zodiac_response = handle_zodiac_query(prompt)
        if zodiac_response:
            print(f"✨ Zodiac knowledge match - instant response")
            self.add_to_history('user', prompt)
            self.add_to_history('assistant', zodiac_response)
            return zodiac_response
        
        # Check if this is a simple knowledge query
        simple_response = handle_simple_query(prompt)
        if simple_response:
            print(f"✨ Simple knowledge match - instant response")
            self.add_to_history('user', prompt)
            self.add_to_history('assistant', simple_response)
            return simple_response
        
        # Add user message to history
        self.add_to_history('user', prompt)
        
        # Check if this is a memory recall query
        memory_response = handle_memory_query(prompt, list(self.conversation_history))
        if memory_response:
            print(f"✨ Memory recall - instant response")
            self.add_to_history('assistant', memory_response)
            return memory_response
        
        # Build context-aware prompt
        context = self.get_context(max_messages=6)  # Last 6 messages for context
        
        if context:
            full_prompt = f"{self.system_prompt}\n\nPrevious conversation:\n{context}\n\nUser: {prompt}\nAssistant:"
        else:
            full_prompt = f"{self.system_prompt}\n\nUser: {prompt}\nAssistant:"
        
        # Determine timeout based on model
        is_mistral = 'mistral' in str(self.model_path).lower()
        timeout = 120 if is_mistral else 24  # TinyLlama: 24s (20% faster than 30s)
        model_name = 'Mistral' if is_mistral else 'TinyLlama'
        
        import sys
        print(f"🔄 Processing with {model_name}... (max {timeout}s)")
        print(f"📝 Request: {prompt[:100]}{'...' if len(prompt) > 100 else ''}")
        sys.stdout.flush()  # Force output immediately
        
        try:
            # Run llamafile with TinyLlama/Mistral
            # macOS requires sh wrapper for llamafile execution
            # Modest speed optimization:
            # - Reduced tokens (256 -> 200)
            # - Multi-threading for parallel processing
            # - Increased context size for conversation memory
            cmd = [
                'sh',
                str(self.llamafile_path),
                '-m', str(self.model_path),
                '-p', full_prompt,
                '-c', '1024',               # Context size (default 512 was too small)
                '--temp', str(temperature),
                '-n', str(max_tokens),
                '--threads', '4',           # Use 4 CPU threads
                '--top-p', '0.9',           # Nucleus sampling
                '--top-k', '40',            # Limit vocabulary
                '--repeat-penalty', '1.1',  # Avoid repetition
                '--silent-prompt',          # Don't echo prompt
                '--no-display-prompt'       # Clean output
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            if result.returncode == 0:
                response = result.stdout.strip()
                if response:
                    print(f"✅ Response received ({len(response)} chars) - Completed with {model_name}")
                else:
                    print(f"⚠️  Empty response from llamafile")
                    if result.stderr:
                        print(f"   stderr: {result.stderr[:300]}")
                sys.stdout.flush()
                
                # Clean up response (remove prompt echo if present)
                if "Assistant:" in response:
                    response = response.split("Assistant:")[-1].strip()
                
                # Validate response quality
                is_tiny = 'tinyllama' in str(self.model_path).lower()
                
                if not self._is_response_valid(response, prompt, is_tiny):
                    # Determine current model tier
                    if is_tiny:
                        # TinyLlama gave a hallucinated/invalid response
                        fallback_msg = self._get_upgrade_message()
                        self.add_to_history('assistant', fallback_msg)
                        return fallback_msg
                    else:
                        # Mistral should be able to handle most requests
                        fallback_msg = (
                            "I cannot fulfill this request with confidence. "
                            "Mistral (Tier 2) tried but couldn't provide a reliable answer."
                        )
                        self.add_to_history('assistant', fallback_msg)
                        return fallback_msg
                
                # Add assistant response to history
                self.add_to_history('assistant', response)
                
                return response
            else:
                # Non-zero return code - llamafile error
                error_msg = f"❌ Llamafile error (code {result.returncode})\n"
                if result.stderr:
                    # Show last 1000 chars of stderr to see actual error
                    error_msg += f"stderr: {result.stderr.strip()[-1000:]}\n"
                if result.stdout:
                    error_msg += f"stdout: {result.stdout.strip()[:500]}"
                print(error_msg)
                return error_msg
                
        except subprocess.TimeoutExpired:
            timeout_msg = f"⚠️  Request timed out after {timeout}s. {model_name} may need more time for complex queries."
            print(timeout_msg)
            return timeout_msg
        except KeyboardInterrupt:
            interrupt_msg = f"\n⚠️  Request cancelled by user (Ctrl+C)"
            print(interrupt_msg)
            # Don't add to history since request was cancelled
            return interrupt_msg
        except Exception as e:
            error_msg = f"❌ Error: {e}"
            print(error_msg)
            return error_msg
    
    def _get_upgrade_message(self) -> str:
        """Generate upgrade message based on installed models."""
        from pathlib import Path
        
        # Check for bundled llamafile models
        project_root = Path(__file__).parent.parent
        models_dir = project_root / '.luciferai' / 'models'
        
        mistral_installed = (models_dir / 'mistral-7b-instruct-v0.2.Q4_K_M.gguf').exists()
        
        # Check for Ollama models (if Ollama is available)
        ollama_models = []
        try:
            import subprocess
            result = subprocess.run(['ollama', 'list'], capture_output=True, text=True, timeout=2)
            if result.returncode == 0:
                for line in result.stdout.split('\n')[1:]:  # Skip header
                    if line.strip():
                        model_name = line.split()[0]
                        ollama_models.append(model_name)
        except:
            pass
        
        # Build upgrade message
        msg = "⚠️  TinyLlama (Tier 0) has very limited capabilities and cannot handle this request reliably.\n\n"
        
        if mistral_installed or ollama_models:
            msg += "Available models:\n"
            
            if mistral_installed:
                msg += "  • llm enable mistral  (Mistral 7B - Tier 2, bundled, ✅ installed)\n"
            
            for model in ollama_models:
                if 'llama' in model.lower():
                    msg += f"  • llm enable {model}  (✅ installed via Ollama)\n"
                elif 'mistral' in model.lower():
                    msg += f"  • llm enable {model}  (✅ installed via Ollama)\n"
                elif 'deepseek' in model.lower():
                    msg += f"  • llm enable {model}  (✅ installed via Ollama)\n"
            
            msg += "\n"
        
        msg += "Install more models:\n"
        
        if not any('llama3.2' in m or 'llama-3.2' in m for m in ollama_models):
            msg += "  • luci install llama3.2  (Tier 1, ❌ not installed)\n"
        
        if not mistral_installed and not any('mistral' in m.lower() for m in ollama_models):
            msg += "  • luci install mistral   (Tier 2 - recommended, ❌ not installed)\n"
        
        if not any('deepseek' in m.lower() for m in ollama_models):
            msg += "  • luci install deepseek  (Tier 3 - best, ❌ not installed)"
        
        return msg
    
    def clear_history(self):
        """Clear conversation history."""
        self.conversation_history.clear()
        print("🗑️  Conversation history cleared")
    
    def _is_response_valid(self, response: str, original_prompt: str, is_tiny: bool = False) -> bool:
        """
        Validate response quality to detect hallucinations.
        Returns False if response appears to be nonsense/hallucinated.
        
        Args:
            response: The model's response
            original_prompt: The user's original prompt
            is_tiny: Whether this is TinyLlama (stricter validation)
        """
        if not response or len(response.strip()) < 5:
            return False
            
        response_lower = response.lower()
        prompt_lower = original_prompt.lower()
        
        # Detect completely off-topic hallucinations
        off_topic_indicators = [
            # Talking about rides/transportation when not asked
            ('uber' in response_lower or 'lyft' in response_lower or 'taxi' in response_lower) and not any(word in prompt_lower for word in ['ride', 'uber', 'lyft', 'taxi', 'transport', 'car']),
            # Talking about pricing/rates when not asked
            ('pricing' in response_lower or 'rates' in response_lower) and not any(word in prompt_lower for word in ['price', 'cost', 'rate', 'how much']),
            # Continuing a conversation that never started
            ('thank you for' in response_lower or 'based on your' in response_lower) and len(self.conversation_history) < 3,
            # Responding as if user asked a question they didn't
            ("that's a good point" in response_lower or "based on your location" in response_lower) and not ('?' in original_prompt),
        ]
        
        if any(off_topic_indicators):
            return False
        
        # Red flags for hallucination
        hallucination_patterns = [
            # Empty or too short
            len(response.strip()) < 10,
            # Starts with "yes" or "no" but doesn't answer yes/no question
            (response_lower.startswith(("yes,", "no,")) and "?" in original_prompt and not any(q in prompt_lower for q in ["is", "are", "can", "do", "does", "will", "should"])),
            # Starts writing unrelated code without being asked
            ("what is" in prompt_lower and "```" in response and "def " in response_lower),
            # Answers a different question than asked
            ("python" not in prompt_lower and "```python" in response),
            # Provides conversational filler that wasn't requested
            ("here's" in response_lower and len(original_prompt) < 50 and "show" not in prompt_lower and "give" not in prompt_lower and "how" not in prompt_lower),
            # Response is way too long for a simple greeting (>200 chars)
            (len(original_prompt) < 20 and any(greeting in prompt_lower for greeting in ['hi', 'hello', 'hey']) and len(response) > 200),
            # Starts with affirmative but then goes off topic (very long)
            (response_lower.startswith(("yes", "sure", "of course")) and len(response) > 250 and len(original_prompt) < 50),
        ]
        
        return not any(hallucination_patterns)
    
    def get_memory_stats(self) -> Dict:
        """Get statistics about conversation memory."""
        return {
            'total_messages': len(self.conversation_history),
            'max_capacity': self.conversation_history.maxlen,
            'usage_percent': (len(self.conversation_history) / self.conversation_history.maxlen) * 100
        }
    
    def show_memory_stats(self):
        """Display memory statistics."""
        stats = self.get_memory_stats()
        print(f"\n📊 Conversation Memory:")
        print(f"   Messages: {stats['total_messages']}/{stats['max_capacity']}")
        print(f"   Usage: {stats['usage_percent']:.1f}%")
        print()
    
    def process_request(self, user_input: str) -> str:
        """
        Process user request - compatible with LuciferAI agent interface.
        This method makes LlamafileAgent work as a drop-in replacement.
        
        Args:
            user_input: User's command/question
        
        Returns:
            Response string
        """
        # Handle special commands
        user_input_lower = user_input.lower().strip()
        
        if user_input_lower == 'help':
            return self._get_help_text()
        elif user_input_lower in ['clear history', 'clear memory']:
            self.clear_history()
            return "🗑️  Conversation history cleared"
        elif user_input_lower in ['memory', 'stats']:
            stats = self.get_memory_stats()
            return (f"📊 Conversation Memory:\n"
                   f"   Messages: {stats['total_messages']}/{stats['max_capacity']}\n"
                   f"   Usage: {stats['usage_percent']:.1f}%")
        
        # Use TinyLlama for AI response
        return self.query(user_input)
    
    def _get_help_text(self) -> str:
        """Get help text for TinyLlama agent."""
        return (
            "🦙 LuciferAI - TinyLlama Mode (Tier 0)\n\n"
            "Commands:\n"
            "  help           - Show this help\n"
            "  memory         - Show conversation memory stats\n"
            "  clear history  - Clear conversation history\n"
            "  exit/quit      - Exit LuciferAI\n\n"
            "Features:\n"
            "  • Basic chat and Q&A\n"
            "  • 200-message conversation memory\n"
            "  • Tier 0 model (works on all systems)\n"
            "  • No internet required\n\n"
            "For advanced features, install Ollama:\n"
            "  luci install ollama\n"
            "  luci install llama3.2  (Tier 1)\n"
            "  luci install mistral   (Tier 2)\n"
        )


def test_llamafile_agent():
    """Test the llamafile agent."""
    print("\n🧪 Testing Llamafile Agent\n")
    
    agent = LlamafileAgent()
    
    if not agent.available:
        print("⚠️  Llamafile/TinyLlama not available")
        print("   Run: ./setup_bundled_models.sh")
        return
    
    # Test basic query
    print("📝 Testing basic query...")
    response = agent.query("What is Python?")
    print(f"Response: {response}\n")
    
    # Test with context
    print("📝 Testing conversation context...")
    agent.query("My name is Alice")
    response = agent.query("What's my name?")
    print(f"Response: {response}\n")
    
    # Show memory stats
    agent.show_memory_stats()


if __name__ == "__main__":
    test_llamafile_agent()
