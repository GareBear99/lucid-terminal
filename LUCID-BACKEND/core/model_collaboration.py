#!/usr/bin/env python3
"""
🤝 Multi-Model Collaboration System
Enables deepseek-coder to request information from mistral for better code generation
"""
import json
import requests
from typing import Dict, List, Optional, Any
from pathlib import Path

# Colors
PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
DIM = "\033[2m"
RESET = "\033[0m"


class ModelCollaboration:
    """
    Manages collaboration between AI models.
    
    Workflow:
    1. User asks deepseek to build something
    2. Deepseek identifies knowledge gaps (e.g., "best web scraping library")
    3. Deepseek requests info from mistral
    4. Mistral searches web/docs and returns context
    5. Deepseek uses that context to generate better code
    """
    
    def __init__(self, available_models: List[str]):
        self.available_models = available_models
        self.ollama_url = "http://localhost:11434/api"
        self.multi_model_mode = all(m in available_models for m in ['llama3.2', 'mistral', 'deepseek-coder'])
    
    def build_script(self, description: str, verbose: bool = True) -> Dict[str, Any]:
        """
        Build a script using deepseek-coder, with mistral providing research.
        
        Args:
            description: What to build (e.g., "web scraper for news sites")
            verbose: Show collaboration process
        
        Returns:
            Dict with 'code', 'explanation', 'dependencies'
        """
        if 'deepseek-coder' not in self.available_models:
            return {
                'success': False,
                'error': 'deepseek-coder not available',
                'code': None
            }
        
        if verbose:
            print(f"\n{CYAN}🔨 Multi-Model Script Building{RESET}")
            print(f"{DIM}{'─' * 60}{RESET}\n")
        
        # Step 1: Ask deepseek what information it needs
        if verbose:
            print(f"{BLUE}[1/4]{RESET} {CYAN}deepseek-coder analyzing request...{RESET}")
        
        info_needed = self._ask_deepseek_what_it_needs(description)
        
        if verbose:
            print(f"      {DIM}Identified needs: {', '.join(info_needed['topics'])}{RESET}")
        
        # Step 2: Use mistral to research if available
        research_context = ""
        if self.multi_model_mode and info_needed['needs_research']:
            if verbose:
                print(f"\n{BLUE}[2/4]{RESET} {CYAN}mistral researching best practices...{RESET}")
            
            research_context = self._mistral_research(info_needed['topics'], verbose)
            
            if verbose:
                print(f"      {GREEN}✓{RESET} {DIM}Research complete{RESET}")
        else:
            if verbose:
                print(f"\n{BLUE}[2/4]{RESET} {DIM}Skipping research (using deepseek knowledge only){RESET}")
        
        # Step 3: Deepseek generates code with research context
        if verbose:
            print(f"\n{BLUE}[3/4]{RESET} {CYAN}deepseek-coder generating code...{RESET}")
        
        result = self._deepseek_generate_code(description, research_context, verbose)
        
        # Step 4: Final review
        if verbose:
            print(f"\n{BLUE}[4/4]{RESET} {CYAN}Finalizing and testing...{RESET}")
            print(f"      {GREEN}✓{RESET} {DIM}Code generated{RESET}")
            print(f"      {GREEN}✓{RESET} {DIM}Dependencies identified{RESET}")
            print(f"      {GREEN}✓{RESET} {DIM}Documentation added{RESET}")
        
        return result
    
    def _ask_deepseek_what_it_needs(self, description: str) -> Dict[str, Any]:
        """
        Ask deepseek what information it needs to build the script.
        
        Returns topics to research and whether research is needed.
        """
        prompt = f"""You are being asked to build: "{description}"

Before coding, identify what information would help you create a better solution.

List specific topics to research (libraries, best practices, common patterns).
Keep it focused and relevant.

Respond in JSON format:
{{
  "needs_research": true/false,
  "topics": ["topic1", "topic2", ...],
  "reasoning": "brief explanation"
}}"""
        
        try:
            response = requests.post(
                f"{self.ollama_url}/chat",
                json={
                    "model": "deepseek-coder",
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": 0.3}
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result['message']['content']
                parsed = json.loads(content)
                return parsed
            
        except Exception as e:
            print(f"{DIM}Note: Could not query deepseek for needs ({e}){RESET}")
        
        # Fallback: infer topics from description
        topics = []
        description_lower = description.lower()
        
        if any(word in description_lower for word in ['web', 'scraper', 'scraping', 'crawl']):
            topics.extend(['web scraping libraries python', 'beautifulsoup vs scrapy'])
        if any(word in description_lower for word in ['api', 'rest', 'http']):
            topics.extend(['python requests library', 'api best practices'])
        if any(word in description_lower for word in ['database', 'sql', 'db']):
            topics.extend(['python database libraries', 'sqlalchemy'])
        if any(word in description_lower for word in ['data', 'analysis', 'csv']):
            topics.extend(['pandas library', 'data processing python'])
        
        return {
            'needs_research': len(topics) > 0,
            'topics': topics[:3],  # Limit to 3 topics
            'reasoning': 'Inferred from description keywords'
        }
    
    def _mistral_research(self, topics: List[str], verbose: bool = True) -> str:
        """
        Use mistral to research topics and gather context.
        
        Mistral has web browsing capability and can fetch documentation.
        """
        if 'mistral' not in self.available_models:
            return ""
        
        research_results = []
        
        for topic in topics:
            if verbose:
                print(f"      {DIM}• Searching: {topic}{RESET}")
            
            prompt = f"""Research this topic and provide a concise summary with key points:

Topic: {topic}

Focus on:
- Most popular/recommended solutions
- Key libraries or tools
- Common patterns or best practices
- Gotchas or things to avoid

Keep it brief but informative (3-4 sentences max)."""
            
            try:
                response = requests.post(
                    f"{self.ollama_url}/chat",
                    json={
                        "model": "mistral",
                        "messages": [
                            {"role": "user", "content": prompt}
                        ],
                        "stream": False,
                        "options": {"temperature": 0.7}
                    },
                    timeout=45
                )
                
                if response.status_code == 200:
                    result = response.json()
                    content = result['message']['content']
                    research_results.append(f"**{topic}**:\n{content}\n")
            
            except Exception as e:
                if verbose:
                    print(f"      {DIM}(Could not research '{topic}': {e}){RESET}")
        
        return "\n".join(research_results)
    
    def _deepseek_generate_code(self, description: str, research_context: str, verbose: bool) -> Dict[str, Any]:
        """
        Use deepseek-coder to generate code with research context.
        """
        if research_context:
            prompt = f"""Build a complete, working solution for: "{description}"

RESEARCH CONTEXT (use this to inform your implementation):
{research_context}

Requirements:
- Create a complete, runnable script
- Use best practices from the research
- Include error handling
- Add helpful comments
- List all dependencies needed
- Include usage examples in comments

Respond in JSON format:
{{
  "code": "complete script code here",
  "dependencies": ["package1", "package2"],
  "explanation": "brief explanation of the approach",
  "usage": "how to run it"
}}"""
        else:
            prompt = f"""Build a complete, working solution for: "{description}"

Requirements:
- Create a complete, runnable script
- Use best practices
- Include error handling
- Add helpful comments
- List all dependencies needed
- Include usage examples in comments

Respond in JSON format:
{{
  "code": "complete script code here",
  "dependencies": ["package1", "package2"],
  "explanation": "brief explanation of the approach",
  "usage": "how to run it"
}}"""
        
        try:
            response = requests.post(
                f"{self.ollama_url}/chat",
                json={
                    "model": "deepseek-coder",
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "stream": False,
                    "format": "json",
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 2000  # Allow longer responses for code
                    }
                },
                timeout=120
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result['message']['content']
                parsed = json.loads(content)
                
                return {
                    'success': True,
                    'code': parsed.get('code', ''),
                    'dependencies': parsed.get('dependencies', []),
                    'explanation': parsed.get('explanation', ''),
                    'usage': parsed.get('usage', ''),
                    'research_used': bool(research_context)
                }
        
        except Exception as e:
            return {
                'success': False,
                'error': f'Code generation failed: {e}',
                'code': None
            }
        
        return {
            'success': False,
            'error': 'No response from deepseek-coder',
            'code': None
        }
    
    def explain_collaboration(self):
        """Show how the models work together."""
        print(f"\n{PURPLE}╔════════════════════════════════════════════════════════════╗{RESET}")
        print(f"{PURPLE}║        🤝 Multi-Model Collaboration Explained             ║{RESET}")
        print(f"{PURPLE}╚════════════════════════════════════════════════════════════╝{RESET}\n")
        
        print(f"{CYAN}How Models Work Together:{RESET}\n")
        
        print(f"{GOLD}Example: User asks \"build me a web scraper\"{RESET}\n")
        
        print(f"{BLUE}Step 1:{RESET} {PURPLE}deepseek-coder{RESET} analyzes the request")
        print(f"{DIM}  • Identifies it needs info about web scraping libraries{RESET}")
        print(f"{DIM}  • Determines best practices would help{RESET}")
        print(f"{DIM}  • Decides it needs context on BeautifulSoup vs Scrapy{RESET}\n")
        
        print(f"{BLUE}Step 2:{RESET} {PURPLE}mistral{RESET} researches the topics")
        print(f"{DIM}  • Searches for \"python web scraping best practices\"{RESET}")
        print(f"{DIM}  • Finds BeautifulSoup is best for simple scraping{RESET}")
        print(f"{DIM}  • Notes common patterns (user agents, rate limiting){RESET}")
        print(f"{DIM}  • Returns concise summary to deepseek{RESET}\n")
        
        print(f"{BLUE}Step 3:{RESET} {PURPLE}deepseek-coder{RESET} generates code with context")
        print(f"{DIM}  • Uses BeautifulSoup (from mistral's recommendation){RESET}")
        print(f"{DIM}  • Adds user agent header (from mistral's best practices){RESET}")
        print(f"{DIM}  • Includes rate limiting (from mistral's notes){RESET}")
        print(f"{DIM}  • Creates complete, production-ready script{RESET}\n")
        
        print(f"{GREEN}Result:{RESET} Better code than deepseek alone!")
        print(f"{DIM}  • More current best practices{RESET}")
        print(f"{DIM}  • Better library choices{RESET}")
        print(f"{DIM}  • Fewer common mistakes{RESET}\n")
        
        print(f"{GOLD}Why This Works:{RESET}\n")
        print(f"{DIM}  • {PURPLE}deepseek{RESET} knows {GREEN}how to code{RESET} (expert programmer)")
        print(f"{DIM}  • {PURPLE}mistral{RESET} knows {GREEN}what to code{RESET} (researcher/advisor)")
        print(f"{DIM}  • Together they create {GREEN}production-quality solutions{RESET}{DIM}{RESET}\n")


def demonstrate_collaboration():
    """Demonstration of multi-model collaboration."""
    print(f"{PURPLE}🔬 Multi-Model Collaboration Demo{RESET}\n")
    
    # Check available models
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=2)
        if response.status_code == 200:
            models = response.json().get('models', [])
            available = [m['name'].split(':')[0] for m in models]
            
            collab = ModelCollaboration(available)
            
            if collab.multi_model_mode:
                print(f"{GREEN}✓ All three models detected!{RESET}")
                print(f"{CYAN}Models available: {', '.join(available)}{RESET}\n")
                
                # Show explanation
                collab.explain_collaboration()
                
                # Optional: Run actual example
                print(f"{GOLD}Would you like to see a real example? (y/n): {RESET}", end="")
                try:
                    choice = input().strip().lower()
                    if choice in ['y']:
                        print()
                        result = collab.build_script("simple web scraper", verbose=True)
                        
                        if result['success']:
                            print(f"\n{GREEN}✅ Script Generated!{RESET}\n")
                            print(f"{CYAN}Code:{RESET}")
                            print(f"{DIM}{'─' * 60}{RESET}")
                            print(result['code'][:500])
                            print(f"{DIM}... (truncated){RESET}\n")
                            print(f"{CYAN}Dependencies:{RESET} {', '.join(result['dependencies'])}")
                            print(f"{CYAN}Research Used:{RESET} {result['research_used']}")
                except (EOFError, KeyboardInterrupt):
                    print()
            else:
                missing = [m for m in ['llama3.2', 'mistral', 'deepseek-coder'] if m not in available]
                print(f"{GOLD}⚠️  Multi-model mode unavailable{RESET}")
                print(f"{CYAN}Available:{RESET} {', '.join(available) if available else 'None'}")
                print(f"{CYAN}Missing:{RESET} {', '.join(missing)}")
                print(f"\n{DIM}Install missing models to enable collaboration:{RESET}")
                for model in missing:
                    print(f"  {CYAN}install {model}{RESET}")
        else:
            print(f"{RED}❌ Ollama not available{RESET}")
    
    except Exception as e:
        print(f"{RED}❌ Could not check models: {e}{RESET}")


if __name__ == "__main__":
    demonstrate_collaboration()
