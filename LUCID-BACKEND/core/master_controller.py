#!/usr/bin/env python3
"""
🎯 LuciferAI Master Controller
Perfect command routing with multi-layer fallbacks and tier enforcement

Architecture:
- Layer 1: Direct Command Router (instant system commands)
- Layer 2: NLP Parser Router (natural language → commands)
- Layer 3: Tier-Based LLM Router (complexity → model selection)
- Layer 4: Fallback System (error recovery)
- Layer 5: Emergency Mode (minimal survival)

Every route validated. Every tier enforced. Zero ambiguity.
"""
import sys
import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from enum import Enum

# Add parent paths
sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))
sys.path.insert(0, str(Path(__file__).parent))

from command_keywords import (
    DIRECT_COMMANDS, ACTION_KEYWORDS, QUESTION_KEYWORDS,
    is_question, is_action_request, is_test_command,
    extract_politeness, normalize_text, get_autocorrection
)
from model_tiers import get_model_tier, get_tier_capabilities
from fallback_system import get_fallback_system
from lucifer_colors import c, Colors, Emojis


class RouteType(Enum):
    """Route classification types."""
    DIRECT_SYSTEM = "direct_system"           # help, exit, clear, memory
    DIRECT_FILE = "direct_file"               # create file, delete, move, copy
    DIRECT_LLM_MGMT = "direct_llm_mgmt"      # llm list, llm enable/disable
    DIRECT_INSTALL = "direct_install"         # install models
    DIRECT_GITHUB = "direct_github"           # github commands
    DIRECT_ENV = "direct_env"                 # environment commands
    SCRIPT_CREATION = "script_creation"       # multi-step script generation
    SCRIPT_FIX = "script_fix"                 # fix broken script
    QUESTION_SIMPLE = "question_simple"       # simple Q&A
    QUESTION_COMPLEX = "question_complex"     # complex Q&A needing research
    UNKNOWN = "unknown"                       # fallback needed


class TierCapability(Enum):
    """What each tier can and cannot do."""
    # Tier 0 capabilities
    BASIC_ROUTING = 0
    TEMPLATE_SEARCH = 0
    SIMPLE_RESPONSE = 0
    
    # Tier 1 capabilities
    BASIC_GENERATION = 1
    TEMPLATE_ADAPTATION = 1
    
    # Tier 2 capabilities
    CODE_GENERATION = 2
    MULTI_STEP_WORKFLOW = 2
    TEMPLATE_VALIDATION = 2
    AUTO_TESTING = 2
    
    # Tier 3 capabilities
    RESEARCH_PHASE = 3
    ADVANCED_ANALYSIS = 3
    OPTIMIZATION = 3
    
    # Tier 4 capabilities
    ENTERPRISE_GRADE = 4
    ARCHITECTURAL_DESIGN = 4
    SECURITY_ANALYSIS = 4


class MasterController:
    """
    Master orchestration system for perfect routing and fallbacks.
    
    Features:
    - 5-layer routing with validation
    - Tier-based capability enforcement
    - Multi-tier fallback system
    - Command validation and auto-correction
    - Emergency mode for catastrophic failures
    """
    
    def __init__(self, enhanced_agent):
        """Initialize master controller with reference to enhanced agent."""
        self.agent = enhanced_agent
        self.fallback_system = get_fallback_system()
        self.route_history = []  # Track routing decisions
        self.fallback_count = 0
        
        # Command validation cache
        self.validated_commands = {}
        
        print(c(f"{Emojis.HEARTBEAT} Master Controller initialized", "purple"))
    
    # ═══════════════════════════════════════════════════════════════════
    # LAYER 1: DIRECT COMMAND ROUTER
    # ═══════════════════════════════════════════════════════════════════
    
    def route_command(self, user_input: str) -> Tuple[RouteType, Dict[str, Any]]:
        """
        Main routing function. Determines command type and extracts metadata.
        
        Returns: (RouteType, metadata_dict)
        """
        if not user_input or not user_input.strip():
            return RouteType.UNKNOWN, {"error": "empty_input"}
        
        # Clean and normalize input
        cleaned_input = extract_politeness(user_input)
        normalized_input = normalize_text(cleaned_input)
        
        # Auto-correct typos
        corrected_input = get_autocorrection(normalized_input)
        if corrected_input != normalized_input:
            print(c(f"💡 Did you mean: {corrected_input}", "yellow"))
            normalized_input = corrected_input
        
        # Layer 1: Check direct system commands (fastest path)
        route_type = self._check_direct_commands(normalized_input)
        if route_type != RouteType.UNKNOWN:
            metadata = {
                "original": user_input,
                "normalized": normalized_input,
                "layer": 1,
                "handler": self._get_handler_for_route(route_type)
            }
            self._log_route(route_type, metadata)
            return route_type, metadata
        
        # Layer 2: Check NLP patterns
        route_type = self._check_nlp_patterns(normalized_input, user_input)
        if route_type != RouteType.UNKNOWN:
            metadata = {
                "original": user_input,
                "normalized": normalized_input,
                "layer": 2,
                "handler": self._get_handler_for_route(route_type)
            }
            self._log_route(route_type, metadata)
            return route_type, metadata
        
        # Layer 3: Check if question or complex request (including imperative-style)
        if is_question(user_input) or self._is_imperative_question(user_input):
            complexity = self._assess_question_complexity(user_input)
            route_type = RouteType.QUESTION_SIMPLE if complexity == "simple" else RouteType.QUESTION_COMPLEX
            metadata = {
                "original": user_input,
                "normalized": normalized_input,
                "layer": 3,
                "complexity": complexity,
                "handler": self._get_handler_for_route(route_type)
            }
            self._log_route(route_type, metadata)
            return route_type, metadata
        
        # Layer 4: Unknown - needs LLM interpretation or fallback
        metadata = {
            "original": user_input,
            "normalized": normalized_input,
            "layer": 4,
            "needs_fallback": True
        }
        self._log_route(RouteType.UNKNOWN, metadata)
        return RouteType.UNKNOWN, metadata
    
    def _check_direct_commands(self, normalized_input: str) -> RouteType:
        """Check if input matches any direct command patterns."""
        normalized_lower = normalized_input.lower().strip()
        
        # System commands
        for cmd in DIRECT_COMMANDS['system']:
            if normalized_lower.startswith(cmd):
                return RouteType.DIRECT_SYSTEM
        
        # File operations
        for cmd in DIRECT_COMMANDS['file_ops']:
            if normalized_lower.startswith(cmd):
                return RouteType.DIRECT_FILE
        
        # LLM management
        for cmd in DIRECT_COMMANDS['llm']:
            if normalized_lower.startswith(cmd):
                return RouteType.DIRECT_LLM_MGMT
        
        # Installation
        for cmd in DIRECT_COMMANDS['install']:
            if normalized_lower.startswith(cmd):
                return RouteType.DIRECT_INSTALL
        
        # GitHub
        for cmd in DIRECT_COMMANDS['github']:
            if normalized_lower.startswith(cmd):
                return RouteType.DIRECT_GITHUB
        
        # Environment
        for cmd in DIRECT_COMMANDS['environment']:
            if normalized_lower.startswith(cmd):
                return RouteType.DIRECT_ENV
        
        return RouteType.UNKNOWN
    
    def _check_nlp_patterns(self, normalized_input: str, original_input: str) -> RouteType:
        """Check for natural language patterns that indicate specific routes."""
        user_lower = original_input.lower()
        
        # Script creation pattern: "make/create/write [a] script/something that [ACTION]"
        has_creation = any(kw in user_lower for kw in ['write', 'create', 'make', 'build', 'generate'])
        has_target = any(kw in user_lower for kw in ['script', 'program', 'code', 'file', 'something', 'tool'])
        has_action_connector = bool(re.search(r'\b(that|which|to)\b', user_lower))
        
        # Comprehensive action verb list (FIXED - was only 23, now 80+)
        action_verbs = [
            # Communication
            'tell', 'tells', 'say', 'says', 'inform', 'notify', 'alert', 'report',
            # Information
            'give', 'gives', 'provide', 'provides', 'supply', 'present',
            # Query/Search
            'find', 'finds', 'search', 'searches', 'locate', 'locates', 'discover', 'detect', 'identify',
            # Monitoring
            'check', 'checks', 'monitor', 'monitors', 'track', 'tracks', 'watch', 'watches', 'observe',
            # Transformation
            'convert', 'converts', 'transform', 'transforms', 'change', 'changes', 'modify', 'modifies', 
            'parse', 'parses', 'process', 'processes',
            # Data Operations
            'read', 'reads', 'write', 'writes', 'save', 'saves', 'load', 'loads', 'store', 'stores', 
            'retrieve', 'retrieves',
            # Execution
            'open', 'opens', 'launch', 'launches', 'run', 'runs', 'execute', 'executes', 'start', 'starts',
            # Network
            'download', 'downloads', 'upload', 'uploads', 'send', 'sends', 'fetch', 'fetches', 
            'get', 'gets', 'post', 'posts', 'delete', 'deletes',
            # Display
            'print', 'prints', 'display', 'displays', 'show', 'shows', 'output', 'outputs', 
            'return', 'returns', 'render', 'renders',
            # Calculation
            'calculate', 'calculates', 'compute', 'computes', 'count', 'counts', 'sum', 'sums',
            # Manipulation
            'sort', 'sorts', 'filter', 'filters', 'merge', 'merges', 'split', 'splits',
            # Browser/Web
            'browser', 'browse', 'navigate', 'navigates',
            # System
            'list', 'lists', 'scan', 'scans', 'analyze', 'analyzes'
        ]
        
        has_action_verbs = any(verb in user_lower for verb in action_verbs)
        
        is_script_request = has_creation and has_target and ((has_action_connector and has_action_verbs) or has_action_verbs)
        
        if is_script_request:
            return RouteType.SCRIPT_CREATION
        
        # Script fix pattern: "fix [filename]"
        if user_lower.startswith('fix ') and not 'help' in user_lower:
            return RouteType.SCRIPT_FIX
        
        return RouteType.UNKNOWN
    
    def _is_imperative_question(self, text: str) -> bool:
        """Check if text is an imperative-style question (analyze, compare, explain, etc.)."""
        text_lower = text.lower().strip()
        
        imperative_starters = [
            'analyze', 'analyse', 'compare', 'explain', 'describe', 'discuss',
            'evaluate', 'assess', 'review', 'examine', 'investigate',
            'summarize', 'summarise', 'outline', 'detail', 'elaborate'
        ]
        
        return any(text_lower.startswith(verb) for verb in imperative_starters)
    
    def _assess_question_complexity(self, question: str) -> str:
        """Assess whether a question is simple or complex."""
        question_lower = question.lower()
        
        # Complex indicators (check these first as they're more specific)
        complex_indicators = [
            'architecture', 'design pattern', 'best practice', 'best practices', 'optimize',
            'performance', 'scalability', 'security', 'production',
            'enterprise', 'compare', 'analyze', 'analyse', 'deep dive',
            'explain in detail', 'comprehensive', 'advanced', 'difference between',
            'pros and cons', 'advantages', 'disadvantages', 'trade-off', 'tradeoff'
        ]
        
        if any(indicator in question_lower for indicator in complex_indicators):
            return "complex"
        
        # Simple indicators
        simple_indicators = [
            'what is', 'who is', 'where is', 'when', 'how do i',
            'define', 'meaning of'
        ]
        
        if any(indicator in question_lower for indicator in simple_indicators):
            return "simple"
        
        # Default to simple for ambiguous cases
        return "simple"
    
    def _get_handler_for_route(self, route_type: RouteType) -> str:
        """Get the handler function name for a route type."""
        handler_map = {
            RouteType.DIRECT_SYSTEM: "_handle_system_command",
            RouteType.DIRECT_FILE: "_handle_file_command",
            RouteType.DIRECT_LLM_MGMT: "_handle_llm_management",
            RouteType.DIRECT_INSTALL: "_handle_install",
            RouteType.DIRECT_GITHUB: "_handle_github",
            RouteType.DIRECT_ENV: "_handle_environment",
            RouteType.SCRIPT_CREATION: "_handle_multi_step_script_creation",
            RouteType.SCRIPT_FIX: "_auto_fix_script",
            RouteType.QUESTION_SIMPLE: "_handle_simple_question",
            RouteType.QUESTION_COMPLEX: "_handle_complex_question",
            RouteType.UNKNOWN: "_handle_unknown_with_fallback"
        }
        return handler_map.get(route_type, "_handle_unknown_with_fallback")
    
    def _log_route(self, route_type: RouteType, metadata: Dict[str, Any]):
        """Log routing decision for debugging and analytics."""
        self.route_history.append({
            "route": route_type.value,
            "layer": metadata.get("layer", 0),
            "normalized": metadata.get("normalized", ""),
            "handler": metadata.get("handler", "")
        })
        
        # Keep only last 100 routes
        if len(self.route_history) > 100:
            self.route_history = self.route_history[-100:]
    
    # ═══════════════════════════════════════════════════════════════════
    # LAYER 3: TIER-BASED MODEL SELECTION
    # ═══════════════════════════════════════════════════════════════════
    
    def select_model_for_task(self, route_type: RouteType, complexity: str = "simple") -> Tuple[Optional[str], int]:
        """
        Select the appropriate model based on route type and complexity.
        Enforces tier capabilities - lower tiers cannot perform higher tier tasks.
        
        Returns: (model_name, tier_level)
        """
        # Get available models
        available_models = self.agent.available_models if hasattr(self.agent, 'available_models') else []
        enabled_models = [m for m in available_models if self._is_model_enabled(m)]
        
        if not enabled_models:
            print(c(f"{Emojis.WARNING} No models enabled. Using TinyLlama fallback.", "yellow"))
            return "tinyllama", 0
        
        # Determine required tier based on route and complexity
        required_tier = self._get_required_tier(route_type, complexity)
        
        # Find best model that meets or exceeds required tier
        best_model = None
        best_tier = -1
        
        for model in enabled_models:
            model_tier = get_model_tier(model)
            
            # Model must meet minimum tier requirement
            if model_tier >= required_tier:
                # Prefer the lowest tier that meets requirements (efficiency)
                if best_model is None or model_tier < best_tier:
                    best_model = model
                    best_tier = model_tier
        
        if best_model is None:
            # No model meets requirements - use highest available and warn
            for model in enabled_models:
                model_tier = get_model_tier(model)
                if model_tier > best_tier:
                    best_model = model
                    best_tier = model_tier
            
            if best_model:
                required_name = get_tier_capabilities(required_tier)['name']
                actual_name = get_tier_capabilities(best_tier)['name']
                print(c(f"{Emojis.WARNING} Task requires {required_name} (Tier {required_tier}), ", "yellow") +
                      c(f"but only {actual_name} (Tier {best_tier}) available.", "yellow"))
                print(c(f"Consider installing higher tier models for better results.", "dim"))
        
        return best_model, best_tier
    
    def _get_required_tier(self, route_type: RouteType, complexity: str) -> int:
        """Determine minimum tier required for a route and complexity."""
        # Direct commands don't need LLMs (Tier 0)
        if route_type in [RouteType.DIRECT_SYSTEM, RouteType.DIRECT_FILE, 
                         RouteType.DIRECT_LLM_MGMT, RouteType.DIRECT_INSTALL,
                         RouteType.DIRECT_GITHUB, RouteType.DIRECT_ENV]:
            return 0
        
        # Script creation requires different tiers based on complexity
        if route_type == RouteType.SCRIPT_CREATION:
            if complexity == "simple":
                return 1  # Tier 1 can handle basic scripts
            elif complexity == "moderate":
                return 2  # Tier 2 for multi-step scripts
            else:
                return 3  # Tier 3 for complex scripts
        
        # Script fixing requires Tier 2+ (context understanding)
        if route_type == RouteType.SCRIPT_FIX:
            return 2
        
        # Questions
        if route_type == RouteType.QUESTION_SIMPLE:
            return 0  # Even Tier 0 can answer simple questions
        
        if route_type == RouteType.QUESTION_COMPLEX:
            return 2  # Complex questions need Tier 2+
        
        # Default to Tier 1
        return 1
    
    def _is_model_enabled(self, model_name: str) -> bool:
        """Check if a model is enabled."""
        if not hasattr(self.agent, 'llm_state'):
            return True  # Default to enabled if no state
        
        llm_state = self.agent.llm_state
        return llm_state.get(model_name, {}).get('enabled', True)
    
    def enforce_tier_capabilities(self, tier: int, requested_action: str) -> Tuple[bool, str]:
        """
        Enforce tier capability boundaries.
        
        Returns: (is_allowed, message)
        """
        tier_caps = get_tier_capabilities(tier)
        
        # Map actions to required tiers
        action_requirements = {
            "generate_new_code": 2,
            "multi_step_workflow": 2,
            "research_phase": 3,
            "optimization": 3,
            "security_analysis": 4,
            "architectural_design": 4
        }
        
        required_tier = action_requirements.get(requested_action, 0)
        
        if tier < required_tier:
            required_caps = get_tier_capabilities(required_tier)
            message = (f"Action '{requested_action}' requires {required_caps['name']} "
                      f"(Tier {required_tier}), but only {tier_caps['name']} "
                      f"(Tier {tier}) is available.")
            return False, message
        
        return True, f"Tier {tier} can perform '{requested_action}'"
    
    # ═══════════════════════════════════════════════════════════════════
    # LAYER 4: FALLBACK SYSTEM
    # ═══════════════════════════════════════════════════════════════════
    
    def execute_with_fallback(self, route_type: RouteType, metadata: Dict[str, Any]) -> str:
        """
        Execute command with multi-layer fallback system.
        
        Fallback layers:
        1. Primary handler
        2. Alternative handler (if available)
        3. Tier fallback (lower tier model)
        4. Template system (no LLM)
        5. Emergency CLI mode
        """
        try:
            # Layer 1: Try primary handler
            handler_name = metadata.get('handler')
            if handler_name and hasattr(self.agent, handler_name):
                handler = getattr(self.agent, handler_name)
                result = handler(metadata['original'])
                return result
            
            # Layer 2: Try alternative handler
            result = self._try_alternative_handler(route_type, metadata)
            if result:
                return result
            
            # Layer 3: Tier fallback - try lower tier model
            self.fallback_count += 1
            print(c(f"{Emojis.WARNING} Primary handler failed. Trying tier fallback...", "yellow"))
            result = self._tier_fallback(route_type, metadata)
            if result:
                return result
            
            # Layer 4: Template system fallback (no LLM)
            print(c(f"{Emojis.WARNING} Tier fallback failed. Using template system...", "yellow"))
            result = self._template_fallback(route_type, metadata)
            if result:
                return result
            
            # Layer 5: Emergency CLI mode
            if self.fallback_count >= 3:
                print(c(f"{Emojis.CROSS} Multiple failures detected. Entering emergency mode...", "red"))
                self.fallback_system.fallback_emergency_cli()
                return c(f"{Emojis.INFO} Emergency mode activated. Type 'help' for available commands.", "cyan")
            
            return c(f"{Emojis.CROSS} Unable to process command. Please try rephrasing.", "red")
            
        except Exception as e:
            print(c(f"{Emojis.CROSS} Error in execute_with_fallback: {e}", "red"))
            return self._emergency_fallback(str(e))
    
    def _try_alternative_handler(self, route_type: RouteType, metadata: Dict[str, Any]) -> Optional[str]:
        """Try alternative handling methods."""
        # For unknown routes, try NLP parser
        if route_type == RouteType.UNKNOWN:
            if hasattr(self.agent, 'nlp_parser'):
                try:
                    parsed = self.agent.nlp_parser.parse(metadata['original'])
                    if parsed and parsed.get('confidence', 0) > 0.5:
                        return self.agent._handle_parsed_command(parsed)
                except Exception:
                    pass
        
        return None
    
    def _tier_fallback(self, route_type: RouteType, metadata: Dict[str, Any]) -> Optional[str]:
        """Try using a lower tier model as fallback."""
        available_models = self.agent.available_models if hasattr(self.agent, 'available_models') else []
        
        # Try each tier from highest to lowest
        for tier in range(4, -1, -1):
            for model in available_models:
                if get_model_tier(model) == tier and self._is_model_enabled(model):
                    try:
                        print(c(f"Trying {model} (Tier {tier})...", "dim"))
                        # Attempt basic LLM query
                        if hasattr(self.agent, '_query_ollama'):
                            response = self.agent._query_ollama(
                                metadata['original'],
                                model_override=model
                            )
                            if response:
                                return response
                    except Exception:
                        continue
        
        return None
    
    def _template_fallback(self, route_type: RouteType, metadata: Dict[str, Any]) -> Optional[str]:
        """Use template system without LLM."""
        if route_type == RouteType.SCRIPT_CREATION:
            # Search templates
            if hasattr(self.agent, 'template_manager'):
                try:
                    templates = self.agent.template_manager.search_templates(metadata['original'])
                    if templates:
                        return c(f"{Emojis.INFO} Found {len(templates)} template(s) matching your request.", "green")
                except Exception:
                    pass
        
        return None
    
    def _emergency_fallback(self, error: str) -> str:
        """Emergency fallback for catastrophic failures."""
        self.fallback_system.fallback_emergency_cli()
        
        error_msg = [
            c(f"{Emojis.CROSS} Critical Error: {error}", "red"),
            "",
            c(f"Emergency CLI Mode Activated", "yellow"),
            c(f"Available commands:", "cyan"),
            c(f"  - help: Show available commands", "dim"),
            c(f"  - fix: Attempt system repair", "dim"),
            c(f"  - exit: Quit LuciferAI", "dim")
        ]
        
        return "\n".join(error_msg)
    
    # ═══════════════════════════════════════════════════════════════════
    # VALIDATION & DIAGNOSTICS
    # ═══════════════════════════════════════════════════════════════════
    
    def validate_all_routes(self) -> Dict[str, Any]:
        """
        Validate that all routes are working properly.
        Returns comprehensive validation report.
        """
        print(c(f"\n{Emojis.INFO} Validating all routes...\n", "cyan"))
        
        validation_report = {
            "timestamp": str(Path.home()),
            "routes_tested": 0,
            "routes_passed": 0,
            "routes_failed": 0,
            "details": []
        }
        
        # Test commands for each route type
        test_commands = {
            RouteType.DIRECT_SYSTEM: ["help", "memory", "clear"],
            RouteType.DIRECT_FILE: ["list", "read test.txt"],
            RouteType.DIRECT_LLM_MGMT: ["llm list", "llm list all"],
            RouteType.DIRECT_INSTALL: ["install core models"],
            RouteType.SCRIPT_CREATION: ["make me a script that prints hello"],
            RouteType.SCRIPT_FIX: ["fix broken.py"],
            RouteType.QUESTION_SIMPLE: ["what is python"],
            RouteType.QUESTION_COMPLEX: ["explain python architecture in detail"]
        }
        
        for route_type, commands in test_commands.items():
            for cmd in commands:
                validation_report["routes_tested"] += 1
                
                try:
                    detected_route, metadata = self.route_command(cmd)
                    
                    if detected_route == route_type:
                        validation_report["routes_passed"] += 1
                        status = c("✅ PASS", "green")
                    else:
                        validation_report["routes_failed"] += 1
                        status = c("❌ FAIL", "red")
                    
                    print(f"{status} {route_type.value:20s} <- '{cmd}'")
                    
                    validation_report["details"].append({
                        "command": cmd,
                        "expected": route_type.value,
                        "detected": detected_route.value,
                        "passed": detected_route == route_type
                    })
                    
                except Exception as e:
                    validation_report["routes_failed"] += 1
                    print(c(f"❌ ERROR {route_type.value:20s} <- '{cmd}': {e}", "red"))
                    
                    validation_report["details"].append({
                        "command": cmd,
                        "expected": route_type.value,
                        "error": str(e),
                        "passed": False
                    })
        
        # Print summary
        print(c(f"\n{'═' * 60}", "dim"))
        print(c(f"Validation Summary:", "cyan"))
        print(c(f"  Total: {validation_report['routes_tested']}", "white"))
        print(c(f"  Passed: {validation_report['routes_passed']}", "green"))
        print(c(f"  Failed: {validation_report['routes_failed']}", "red"))
        
        success_rate = (validation_report['routes_passed'] / validation_report['routes_tested']) * 100
        print(c(f"  Success Rate: {success_rate:.1f}%", "cyan"))
        print(c(f"{'═' * 60}\n", "dim"))
        
        return validation_report
    
    def get_route_statistics(self) -> Dict[str, Any]:
        """Get statistics about routing decisions."""
        if not self.route_history:
            return {"message": "No routing history yet"}
        
        stats = {
            "total_routes": len(self.route_history),
            "by_type": {},
            "by_layer": {},
            "fallback_count": self.fallback_count
        }
        
        for entry in self.route_history:
            route = entry["route"]
            layer = entry["layer"]
            
            stats["by_type"][route] = stats["by_type"].get(route, 0) + 1
            stats["by_layer"][f"layer_{layer}"] = stats["by_layer"].get(f"layer_{layer}", 0) + 1
        
        return stats
    
    def print_routing_diagnostics(self):
        """Print detailed routing diagnostics."""
        print(c(f"\n{'═' * 70}", "purple"))
        print(c(f"🎯 Master Controller Diagnostics", "purple"))
        print(c(f"{'═' * 70}\n", "purple"))
        
        stats = self.get_route_statistics()
        
        print(c(f"Total Commands Routed: {stats['total_routes']}", "cyan"))
        print(c(f"Fallback Activations: {self.fallback_count}", "yellow"))
        print()
        
        print(c(f"Routes by Type:", "cyan"))
        for route, count in sorted(stats['by_type'].items(), key=lambda x: x[1], reverse=True):
            print(c(f"  {route:25s}: {count:3d}", "white"))
        
        print()
        print(c(f"Routes by Layer:", "cyan"))
        for layer, count in sorted(stats['by_layer'].items()):
            print(c(f"  {layer:10s}: {count:3d}", "white"))
        
        print(c(f"\n{'═' * 70}\n", "purple"))


# ═══════════════════════════════════════════════════════════════════
# GLOBAL INSTANCE
# ═══════════════════════════════════════════════════════════════════

_master_controller = None


def get_master_controller(enhanced_agent) -> MasterController:
    """Get global master controller instance."""
    global _master_controller
    if _master_controller is None:
        _master_controller = MasterController(enhanced_agent)
    return _master_controller


if __name__ == "__main__":
    print(c("🎯 Master Controller Test Mode", "purple"))
    print(c("This module must be imported by EnhancedLuciferAgent", "yellow"))
