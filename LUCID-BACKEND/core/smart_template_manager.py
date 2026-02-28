#!/usr/bin/env python3
"""
🌐 Smart Template Manager
WiFi-aware template selection that intelligently chooses the best template source:
- Offline: Uses local + consensus templates
- Online: Compares local/consensus with web search results
"""
import socket
import subprocess
from typing import Optional, Dict, List, Tuple, Any
from script_templates import ScriptTemplates
from template_consensus import TemplateConsensus


class SmartTemplateManager:
    """
    Intelligently selects templates based on WiFi connectivity and quality.
    
    Modes:
    - Offline: Local + consensus templates only
    - Online: Compare local/consensus with web search, use best
    """
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.script_templates = ScriptTemplates()
        self.template_consensus = TemplateConsensus(user_id)
        self.wifi_connected = self._check_wifi()
    
    def _check_wifi(self) -> bool:
        """Check if WiFi/internet is connected."""
        try:
            # Try to connect to Google DNS
            socket.create_connection(("8.8.8.8", 53), timeout=2)
            return True
        except (socket.timeout, socket.error):
            return False
    
    def find_best_template(self, query: str, language: Optional[str] = None) -> Tuple[str, Dict, str]:
        """
        Find the best template for a query.
        
        Returns:
            (template_id, template_data, source)
            source can be: 'builtin', 'consensus', 'online_enhanced'
        """
        # Always check built-in templates first
        builtin_match = self.script_templates.find_template(query)
        
        # Check consensus templates
        consensus_matches = self.template_consensus.search_templates(query, language)
        consensus_best = consensus_matches[0] if consensus_matches else None
        
        # If offline, return best available
        if not self.wifi_connected:
            return self._select_offline_best(builtin_match, consensus_best)
        
        # Online: compare with web-enhanced results
        return self._select_online_best(query, language, builtin_match, consensus_best)
    
    def _select_offline_best(self, builtin_match: Optional[Tuple], 
                            consensus_best: Optional[Dict]) -> Tuple[str, Dict, str]:
        """Select best template when offline."""
        # Prefer consensus (community-validated) over built-in
        if consensus_best and consensus_best.get('relevance_score', 0) >= 2:
            # High relevance consensus template
            return (
                consensus_best['hash'],
                consensus_best,
                'consensus'
            )
        
        # Fall back to built-in
        if builtin_match:
            template_id, template_data = builtin_match
            return (template_id, template_data, 'builtin')
        
        # Use lower-relevance consensus if no built-in
        if consensus_best:
            return (
                consensus_best['hash'],
                consensus_best,
                'consensus'
            )
        
        return (None, None, None)
    
    def _select_online_best(self, query: str, language: Optional[str],
                           builtin_match: Optional[Tuple],
                           consensus_best: Optional[Dict]) -> Tuple[str, Dict, str]:
        """
        Select best template when online by comparing with web results.
        Uses mistral to search and enhance templates.
        """
        # Get web-enhanced information (if mistral is available)
        web_info = self._get_web_enhanced_info(query, language)
        
        # Score each option
        scores = {}
        
        # Score built-in template
        if builtin_match:
            template_id, template_data = builtin_match
            scores['builtin'] = self._score_template(template_data, web_info)
        
        # Score consensus template
        if consensus_best:
            scores['consensus'] = self._score_template(consensus_best, web_info)
        
        # If web info significantly improves template, mark as enhanced
        if web_info and web_info.get('confidence', 0) > 0.7:
            scores['online_enhanced'] = web_info.get('confidence', 0) * 10
        
        # Select highest score
        if not scores:
            return (None, None, None)
        
        best_source = max(scores.items(), key=lambda x: x[1])[0]
        
        if best_source == 'builtin' and builtin_match:
            template_id, template_data = builtin_match
            # Enhance with web info if available
            if web_info:
                template_data = self._enhance_template(template_data, web_info)
            return (template_id, template_data, 'builtin')
        
        elif best_source == 'consensus' and consensus_best:
            # Enhance with web info if available
            if web_info:
                consensus_best = self._enhance_template(consensus_best, web_info)
            return (consensus_best['hash'], consensus_best, 'consensus')
        
        elif best_source == 'online_enhanced' and web_info:
            # Create new template from web info
            enhanced_template = self._create_from_web_info(query, language, web_info)
            return ('web_enhanced', enhanced_template, 'online_enhanced')
        
        # Fallback
        if builtin_match:
            template_id, template_data = builtin_match
            return (template_id, template_data, 'builtin')
        if consensus_best:
            return (consensus_best['hash'], consensus_best, 'consensus')
        
        return (None, None, None)
    
    def _get_web_enhanced_info(self, query: str, language: Optional[str]) -> Optional[Dict]:
        """
        Use mistral to search web and gather enhanced information.
        Only called when WiFi is connected.
        """
        try:
            # Check if mistral is available
            import requests
            response = requests.get("http://localhost:11434/api/tags", timeout=1)
            if response.status_code == 200:
                models = response.json().get('models', [])
                model_names = [m['name'].split(':')[0] for m in models]
                
                if 'mistral' not in model_names:
                    return None
                
                # Use mistral to search for best practices
                search_query = f"best practices and modern approach for: {query}"
                if language:
                    search_query += f" in {language}"
                
                # Simulate web search via mistral
                # In real implementation, mistral would use web search tool
                result = requests.post(
                    "http://localhost:11434/api/generate",
                    json={
                        "model": "mistral",
                        "prompt": f"Search the web for: {search_query}. Provide key insights and best practices.",
                        "stream": False
                    },
                    timeout=15
                )
                
                if result.status_code == 200:
                    web_result = result.json().get('response', '')
                    return {
                        'insights': web_result,
                        'confidence': 0.8,
                        'source': 'mistral_web_search'
                    }
        
        except Exception:
            pass
        
        return None
    
    def _score_template(self, template: Dict, web_info: Optional[Dict]) -> float:
        """Score a template based on relevance and quality."""
        score = 0.0
        
        # Base score from relevance
        score += template.get('relevance_score', 0) * 2
        
        # Rating bonus
        score += template.get('rating', 0) * 1.5
        
        # Download count bonus (popular templates)
        downloads = template.get('downloads', 0)
        if downloads > 10:
            score += 2
        elif downloads > 5:
            score += 1
        
        # Web info alignment bonus
        if web_info and web_info.get('insights'):
            insights = web_info['insights'].lower()
            template_keywords = [k.lower() for k in template.get('keywords', [])]
            
            # Check keyword alignment
            alignment = sum(1 for kw in template_keywords if kw in insights)
            score += alignment * 0.5
        
        return score
    
    def _enhance_template(self, template: Dict, web_info: Dict) -> Dict:
        """Enhance a template with web information."""
        enhanced = template.copy()
        
        # Add web insights as comments
        if 'template' in enhanced and web_info.get('insights'):
            insights = web_info['insights'][:200]  # Limit length
            enhanced['template'] = f"# Web insights: {insights}\n\n" + enhanced['template']
            enhanced['web_enhanced'] = True
        
        return enhanced
    
    def _create_from_web_info(self, query: str, language: Optional[str], 
                              web_info: Dict) -> Dict:
        """Create a new template from web information."""
        return {
            'name': f"Web-Enhanced: {query}",
            'language': language or 'Python',
            'template': f"# Template generated from web search\n# Query: {query}\n\n# TODO: Implement based on insights\npass",
            'description': web_info.get('insights', '')[:200],
            'keywords': query.lower().split(),
            'web_enhanced': True,
            'source': 'online'
        }
    
    def get_status_info(self) -> Dict:
        """Get current template manager status."""
        builtin_count = len(self.script_templates.templates)
        consensus_stats = self.template_consensus.get_stats()
        
        return {
            'wifi_connected': self.wifi_connected,
            'mode': 'Online (Web-Enhanced)' if self.wifi_connected else 'Offline (Local + Consensus)',
            'builtin_templates': builtin_count,
            'consensus_templates': consensus_stats['total_templates'],
            'queued_uploads': consensus_stats['queued_uploads']
        }


if __name__ == "__main__":
    # Test smart template manager
    manager = SmartTemplateManager("TEST-USER")
    
    status = manager.get_status_info()
    print(f"Status: {status}")
    
    # Test template search
    template_id, template_data, source = manager.find_best_template("flask api")
    print(f"\nBest template for 'flask api':")
    print(f"  ID: {template_id}")
    print(f"  Source: {source}")
    if template_data:
        print(f"  Name: {template_data.get('name', 'Unknown')}")
