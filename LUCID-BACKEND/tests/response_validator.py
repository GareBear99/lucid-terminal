#!/usr/bin/env python3
"""
Response Validation System
Validates model responses against expected criteria
"""
import re
from typing import Dict, List, Tuple

class ResponseValidator:
    """Validates model responses based on test type and expected output."""
    
    @staticmethod
    def validate_response(command: str, description: str, response: str, model_tier: int) -> Tuple[str, str, Dict]:
        """
        Validate a response against expected criteria.
        
        Args:
            command: The input command
            description: Test description
            response: Model's response
            model_tier: Tier of the model (0-3)
            
        Returns:
            Tuple of (result, status, details)
        """
        response_lower = response.lower().strip()
        details = {
            'has_content': bool(response.strip()),
            'length': len(response),
            'keywords_found': [],
            'issues': []
        }
        
        # Empty response check
        if not response.strip():
            return "❌ FAILED", "No response generated", details
        
        # Check for actual errors (not just mentioning the word)
        error_indicators = [
            'error:', 'exception:', 'traceback'
        ]
        if any(err in response_lower for err in error_indicators):
            details['issues'].append('Contains error message')
            # But don't auto-fail - model might be explaining an error
        
        # Determine test category
        if 'Query:' in description:
            return ResponseValidator._validate_query(command, response, response_lower, model_tier, details)
        elif 'Memory:' in description:
            return ResponseValidator._validate_memory(command, response, response_lower, details)
        elif 'Multi-step' in description:
            return ResponseValidator._validate_multistep(command, response, response_lower, model_tier, details)
        elif 'Limitation:' in description:
            return ResponseValidator._validate_limitation(response, response_lower, model_tier, details)
        elif 'Horoscope:' in description or 'Zodiac:' in description:
            return ResponseValidator._validate_horoscope(command, response, response_lower, details)
        elif 'File:' in description:
            return ResponseValidator._validate_file_operation(command, response, response_lower, details)
        elif 'Daemon:' in description or 'Fix:' in description:
            return ResponseValidator._validate_daemon_fix(command, response, response_lower, details)
        elif 'Model:' in description:
            return ResponseValidator._validate_model_management(command, response, response_lower, details)
        elif 'Edge:' in description:
            return ResponseValidator._validate_edge_case(command, response, response_lower, details)
        else:
            return ResponseValidator._validate_general(command, response, response_lower, details)
    
    @staticmethod
    def _validate_query(command: str, response: str, response_lower: str, model_tier: int, details: Dict) -> Tuple[str, str, Dict]:
        """Validate information query responses."""
        command_lower = command.lower()
        
        # Extract what was asked about
        query_keywords = {
            'ls': ['list', 'files', 'directory', 'contents', 'command'],
            'python': ['programming', 'language', 'interpreted', 'code'],
            'git': ['version control', 'repository', 'commits', 'vcs'],
            'algorithm': ['step', 'procedure', 'solve', 'problem', 'process'],
            'grep': ['search', 'pattern', 'text', 'find', 'match'],
            'docker': ['container', 'platform', 'application', 'deploy'],
            'npm': ['package', 'node', 'javascript', 'manager'],
            'recursion': ['function', 'itself', 'call', 'repeat'],
            'serendipity': ['fortunate', 'discovery', 'accident', 'chance'],
            'hello': ['hi', 'greeting', 'hello', 'hey', 'how'],
            'cd': ['change', 'directory', 'navigate', 'folder'],
            'mkdir': ['make', 'create', 'directory', 'folder'],
            'chmod': ['permission', 'change', 'mode', 'access', 'file'],
            'sudo': ['superuser', 'admin', 'root', 'privilege', 'permission'],
            'cat': ['concatenate', 'display', 'file', 'contents', 'output'],
            'kubernetes': ['container', 'orchestration', 'cluster', 'deploy'],
            'json': ['format', 'data', 'javascript', 'object', 'notation'],
            'rust': ['programming', 'language', 'systems', 'memory', 'safe'],
            'javascript': ['programming', 'language', 'web', 'browser'],
            'boolean': ['true', 'false', 'data type', 'logic'],
        }
        
        # Find which topic was asked about
        matched_topic = None
        for topic, keywords in query_keywords.items():
            if topic in command_lower:
                matched_topic = topic
                expected_keywords = keywords
                break
        
        if matched_topic:
            # Check if response contains relevant keywords
            found_keywords = [kw for kw in expected_keywords if kw in response_lower]
            details['keywords_found'] = found_keywords
            
            # More lenient: 1+ keyword is success if response is substantial
            if len(found_keywords) >= 1 and len(response) > 15:
                details['keyword_match_rate'] = f"{len(found_keywords)}/{len(expected_keywords)}"
                return "✅ SUCCESS", f"Relevant answer with {len(found_keywords)} key terms", details
            elif len(response) > 30:  # Long response without exact keywords might still be good
                # Check if topic is mentioned in any form
                if matched_topic in response_lower or any(kw[:4] in response_lower for kw in expected_keywords):
                    return "✅ SUCCESS", "Relevant substantive response", details
                else:
                    details['issues'].append('Missing topic relevance')
                    return "⚠️  WEAK", "Response may not address topic", details
            else:
                details['issues'].append('No clear topic relevance')
                return "❌ FAILED", f"Response doesn't address '{matched_topic}'", details
        
        # Generic query validation - substantial response passes
        if len(response) > 15:
            return "✅ SUCCESS", "Got substantive response", details
        else:
            details['issues'].append('Response too short')
            return "⚠️  WEAK", "Response too brief", details
    
    @staticmethod
    def _validate_memory(command: str, response: str, response_lower: str, details: Dict) -> Tuple[str, str, Dict]:
        """Validate memory-related operations."""
        command_lower = command.lower()
        
        # Setting memory
        if any(pattern in command_lower for pattern in ['my name is', 'i like', 'i work', 'i have', 'i prefer', 'my birthday']):
            # Should acknowledge storing the information - be lenient
            acknowledge_terms = ['noted', 'remember', 'stored', 'got it', 'understood', 'recorded', 'saved', 'ok', 'thanks', 'great']
            found = [term for term in acknowledge_terms if term in response_lower]
            details['keywords_found'] = found
            
            # Any response > 5 chars is acceptable as acknowledgment
            if found or len(response) > 5:
                return "✅ SUCCESS", "Acknowledged information", details
            else:
                details['issues'].append('No acknowledgment')
                return "❌ FAILED", "No response", details
        
        # Recalling memory
        elif any(pattern in command_lower for pattern in ["what's my", 'what is my', 'tell me about', 'what do you know']):
            # Should contain factual recall or admission of no memory
            if 'alice' in response_lower or 'python' in response_lower or 'developer' in response_lower or 'cat' in response_lower or 'dog' in response_lower:
                details['keywords_found'].append('recalled_fact')
                return "✅ SUCCESS", "Successfully recalled information", details
            elif any(phrase in response_lower for phrase in ["don't know", "no information", "haven't told", "not sure"]):
                return "✅ SUCCESS", "Correctly indicated no stored memory", details
            else:
                details['issues'].append('Unclear memory recall')
                return "⚠️  WEAK", "Response ambiguous", details
        
        # General memory command
        elif command_lower in ['memory', 'show memory', 'history']:
            if 'message' in response_lower or 'conversation' in response_lower or 'history' in response_lower:
                return "✅ SUCCESS", "Showed memory stats", details
            else:
                return "⚠️  WEAK", "Unclear memory response", details
        
        return "✅ SUCCESS", "Memory operation completed", details
    
    @staticmethod
    def _validate_multistep(command: str, response: str, response_lower: str, model_tier: int, details: Dict) -> Tuple[str, str, Dict]:
        """Validate multi-step task responses and verify actual execution."""
        from pathlib import Path
        import os
        
        command_lower = command.lower()
        
        # Check for actual file/folder creation if that was the task
        actual_execution = False
        execution_verified = False
        
        # Check if task involves creating files/folders
        if 'create' in command_lower or 'make' in command_lower or 'mkdir' in command_lower:
            # Extract what should be created
            if 'testfolder' in command_lower:
                check_path = Path('testfolder')
                if check_path.exists():
                    execution_verified = True
                    details['verified_action'] = 'testfolder exists'
                    actual_execution = True
                else:
                    details['issues'] = details.get('issues', []) + ['testfolder not created']
            
            if 'hello.py' in command_lower or 'readme' in command_lower or '.py' in command_lower:
                # Check for Python file creation
                test_files = list(Path('.').glob('**/hello.py')) + list(Path('.').glob('**/readme*'))
                if test_files:
                    execution_verified = True
                    details['verified_action'] = f'File created: {test_files[0].name}'
                    actual_execution = True
                else:
                    details['issues'] = details.get('issues', []) + ['Expected file not found']
        
        # Check if task involves listing files
        if 'list' in command_lower and 'python' in command_lower:
            # Should show actual .py files in response
            if '.py' in response_lower:
                execution_verified = True
                details['verified_action'] = 'Listed Python files'
                actual_execution = True
            else:
                details['issues'] = details.get('issues', []) + ['No Python files listed']
        
        # Multi-step tasks should show evidence of multiple operations
        step_indicators = [
            'created', 'made', 'built',
            'listed', 'found', 'searched',
            'wrote', 'written', 'generated',
            'analyzed', 'compared', 'checked'
        ]
        
        found_steps = [ind for ind in step_indicators if ind in response_lower]
        details['keywords_found'] = found_steps
        details['steps_detected'] = len(found_steps)
        
        # For Tier 0 models, complex multi-step tasks should suggest upgrade
        if model_tier == 0 and 'Advanced' in command:
            if any(phrase in response_lower for phrase in ['upgrade', 'install', 'mistral', 'tier']):
                return "✅ SUCCESS", "Correctly suggested upgrade (Tier 0)", details
            else:
                details['issues'].append('Should suggest upgrade for complex task')
                return "⚠️  WARNING", "Tier 0 should prompt upgrade", details
        
        # Verify actual task execution
        if actual_execution:
            if execution_verified:
                return "✅ SUCCESS", f"Task executed and verified: {details.get('verified_action', 'completed')}", details
            else:
                details['issues'].append('Task mentioned but not executed')
                return "❌ FAILED", "Task not actually executed", details
        
        # For non-execution tasks, check response indicators
        if len(found_steps) >= 2:
            return "✅ SUCCESS", f"Completed multi-step task ({len(found_steps)} steps)", details
        elif len(found_steps) == 1:
            return "⚠️  WEAK", "Only partial completion", details
        elif any(word in response_lower for word in ['error', 'failed', 'cannot', 'unable']):
            details['issues'].append('Task failed')
            return "❌ FAILED", "Task execution failed", details
        else:
            return "⚠️  WEAK", "Unclear task completion", details
    
    @staticmethod
    def _validate_limitation(response: str, response_lower: str, model_tier: int, details: Dict) -> Tuple[str, str, Dict]:
        """Validate limitation test responses."""
        upgrade_indicators = [
            'install', 'upgrade', 'mistral', 'llama3.2', 'tier',
            'more capable', 'advanced model', 'better model'
        ]
        
        found_indicators = [ind for ind in upgrade_indicators if ind in response_lower]
        details['keywords_found'] = found_indicators
        
        # Tier 0 should suggest upgrade
        if model_tier == 0:
            if found_indicators:
                return "✅ SUCCESS", f"Correctly suggested upgrade (found: {', '.join(found_indicators[:2])})", details
            elif len(response) < 50:
                details['issues'].append('Response too brief for complex question')
                return "⚠️  WARNING", "Should suggest upgrade but gave brief response", details
            else:
                details['issues'].append('No upgrade suggestion for Tier 0')
                return "❌ FAILED", "Tier 0 should suggest upgrade", details
        
        # Higher tiers should attempt the task
        else:
            if found_indicators:
                details['issues'].append('Higher tier should not need upgrade')
                return "❌ FAILED", f"Tier {model_tier} should handle this task", details
            elif len(response) > 100:
                return "✅ SUCCESS", f"Tier {model_tier} provided detailed response", details
            else:
                return "⚠️  WEAK", "Response lacks depth", details
    
    @staticmethod
    def _validate_horoscope(command: str, response: str, response_lower: str, details: Dict) -> Tuple[str, str, Dict]:
        """Validate horoscope/zodiac responses."""
        zodiac_signs = [
            'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
            'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
        ]
        
        elements = ['fire', 'earth', 'air', 'water']
        
        # Check if response mentions zodiac-related terms
        mentioned_signs = [sign for sign in zodiac_signs if sign in response_lower]
        mentioned_elements = [elem for elem in elements if elem in response_lower]
        
        details['keywords_found'] = mentioned_signs + mentioned_elements
        
        if mentioned_signs or mentioned_elements:
            return "✅ SUCCESS", f"Zodiac information provided ({len(mentioned_signs)} signs)", details
        elif 'august' in command.lower() and 'august' in response_lower:
            return "✅ SUCCESS", "Relevant date information", details
        elif len(response) > 30:
            return "⚠️  WEAK", "Response lacks zodiac specifics", details
        else:
            details['issues'].append('No zodiac information found')
            return "❌ FAILED", "Missing zodiac content", details
    
    @staticmethod
    def _validate_edge_case(command: str, response: str, response_lower: str, details: Dict) -> Tuple[str, str, Dict]:
        """Validate edge case handling."""
        command_lower = command.lower().strip()
        
        # Empty command
        if not command_lower:
            if any(phrase in response_lower for phrase in ['empty', 'no command', 'please', 'try again']):
                return "✅ SUCCESS", "Handled empty input gracefully", details
            elif len(response) < 10:
                return "⚠️  WEAK", "Minimal response to empty input", details
            else:
                return "⚠️  WEAK", "Unclear handling of empty input", details
        
        # Gibberish
        elif command_lower == 'asdfghjkl':
            if any(phrase in response_lower for phrase in ['understand', "don't know", 'unclear', 'help', 'try again']):
                return "✅ SUCCESS", "Handled gibberish gracefully", details
            else:
                return "⚠️  WEAK", "Should indicate confusion", details
        
        # Philosophical/creative
        elif 'meaning of life' in command_lower or 'joke' in command_lower:
            if len(response) > 20:
                return "✅ SUCCESS", "Provided creative response", details
            else:
                return "⚠️  WEAK", "Response too brief", details
        
        # Unreasonable request
        elif '500 line' in command_lower or 'quantum physics' in command_lower:
            # Should either attempt or explain limitation
            if len(response) > 50:
                return "✅ SUCCESS", "Addressed complex request", details
            else:
                return "⚠️  WEAK", "Insufficient response to complex request", details
        
        return "✅ SUCCESS", "Edge case handled", details
    
    @staticmethod
    def _validate_file_operation(command: str, response: str, response_lower: str, details: Dict) -> Tuple[str, str, Dict]:
        """Validate file operation commands."""
        # Any response showing action taken or file output is success
        if len(response) > 10:
            details['keywords_found'] = ['executed']
            return "✅ SUCCESS", "File operation executed", details
        else:
            return "❌ FAILED", "No output from file operation", details
    
    @staticmethod
    def _validate_daemon_fix(command: str, response: str, response_lower: str, details: Dict) -> Tuple[str, str, Dict]:
        """Validate daemon/watcher and fix consensus commands."""
        # Check for daemon/fix related output
        indicators = ['running', 'watching', 'fixed', 'consensus', 'found', 'daemon', 'error', 'script']
        found = [ind for ind in indicators if ind in response_lower]
        details['keywords_found'] = found
        
        if found or len(response) > 15:
            return "✅ SUCCESS", "Daemon/Fix command executed", details
        else:
            return "❌ FAILED", "No daemon/fix output", details
    
    @staticmethod
    def _validate_model_management(command: str, response: str, response_lower: str, details: Dict) -> Tuple[str, str, Dict]:
        """Validate model management commands."""
        # Check for model-related output
        indicators = ['model', 'llm', 'tinyllama', 'mistral', 'llama', 'enabled', 'disabled', 'tier']
        found = [ind for ind in indicators if ind in response_lower]
        details['keywords_found'] = found
        
        if found or len(response) > 15:
            return "✅ SUCCESS", "Model management executed", details
        else:
            return "❌ FAILED", "No model info", details
    
    @staticmethod
    def _validate_general(command: str, response: str, response_lower: str, details: Dict) -> Tuple[str, str, Dict]:
        """Validate general commands."""
        # Help/info commands
        if any(cmd in command.lower() for cmd in ['help', 'info', 'status']):
            if len(response) > 50:
                return "✅ SUCCESS", "Provided help information", details
            else:
                return "⚠️  WEAK", "Help response too brief", details
        
        # Clear/history commands
        elif any(cmd in command.lower() for cmd in ['clear', 'history']):
            if any(word in response_lower for word in ['clear', 'history', 'deleted', 'removed']):
                return "✅ SUCCESS", "Acknowledged command", details
            else:
                return "⚠️  WEAK", "Unclear acknowledgment", details
        
        # Generic success if has content
        if len(response) > 10:
            return "✅ SUCCESS", "Generated response", details
        else:
            return "⚠️  WEAK", "Response very brief", details
    
    @staticmethod
    def get_score(result: str) -> int:
        """Convert result to numeric score."""
        scores = {
            "✅ SUCCESS": 100,
            "⚠️  WEAK": 50,
            "⚠️  WARNING": 40,
            "❌ FAILED": 0,
            "❓ UNKNOWN": 25,
            "⏱️  TIMEOUT": 0,
        }
        return scores.get(result, 0)
