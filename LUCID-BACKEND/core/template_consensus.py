#!/usr/bin/env python3
"""
🎨 Template Consensus System
Manages collaborative template sharing similar to fix consensus.
Templates are uploaded to GitHub consensus repo under templates/ branch.
"""
import json
import hashlib
import time
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime


class TemplateConsensus:
    """
    Manages template sharing and consensus validation.
    Similar to fix consensus but for code templates.
    """
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.consensus_home = Path.home() / ".luciferai" / "consensus"
        self.templates_dir = self.consensus_home / "templates"
        self.local_templates_file = self.templates_dir / "local_templates.json"
        self.remote_templates_file = self.templates_dir / "remote_templates.json"
        self.upload_queue_file = self.templates_dir / "upload_queue.json"
        
        # Ensure directories exist
        self.templates_dir.mkdir(parents=True, exist_ok=True)
        
        # Load templates
        self.local_templates = self._load_local_templates()
        self.remote_templates = self._load_remote_templates()
        self.upload_queue = self._load_upload_queue()
    
    def _load_local_templates(self) -> Dict:
        """Load locally created/saved templates."""
        if self.local_templates_file.exists():
            try:
                with open(self.local_templates_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {}
    
    def _load_remote_templates(self) -> Dict:
        """Load templates from consensus."""
        if self.remote_templates_file.exists():
            try:
                with open(self.remote_templates_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {}
    
    def _load_upload_queue(self) -> List:
        """Load queued templates for upload."""
        if self.upload_queue_file.exists():
            try:
                with open(self.upload_queue_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        return []
    
    def _save_local_templates(self):
        """Save local templates to disk."""
        with open(self.local_templates_file, 'w') as f:
            json.dump(self.local_templates, f, indent=2)
    
    def _save_remote_templates(self):
        """Save remote templates to disk."""
        with open(self.remote_templates_file, 'w') as f:
            json.dump(self.remote_templates, f, indent=2)
    
    def _save_upload_queue(self):
        """Save upload queue to disk."""
        with open(self.upload_queue_file, 'w') as f:
            json.dump(self.upload_queue, f, indent=2)
    
    def _check_template_hash_conflicts(self, template_hash: str) -> bool:
        """
        Check if a template hash conflicts with existing templates in LOCAL and GLOBAL consensus.
        Cross-checks both local and remote templates.
        
        Args:
            template_hash: Hash to check
        
        Returns:
            True if conflict exists, False otherwise
        """
        # Check LOCAL consensus (excluding current template)
        local_count = sum(1 for h in self.local_templates.keys() if h == template_hash)
        if local_count > 1:
            return True
        
        # Check GLOBAL (remote) consensus
        if template_hash in self.remote_templates:
            return True
        
        return False
    
    def _regenerate_template_hash(self, name: str, template_code: str, salt: str = "") -> str:
        """
        Generate a new unique template hash.
        
        Args:
            name: Template name
            template_code: Template code
            salt: Optional salt for uniqueness
        
        Returns:
            16-character hex hash
        """
        combined = f"{name}:{template_code}:{salt}"
        return hashlib.sha256(combined.encode()).hexdigest()[:16]
    
    def cleanup_orphaned_templates(self):
        """
        Remove templates with no keywords/tags from local consensus.
        Also validates template hash IDs for conflicts (local + global).
        Shows detailed report of what was removed and fixed.
        """
        orphaned = []
        orphaned_details = []
        fixed_hashes = 0
        
        # First pass: Check for orphaned templates and hash conflicts
        templates_to_fix = []
        for template_hash, template in list(self.local_templates.items()):
            keywords = template.get('keywords', [])
            
            # Check 1: Orphaned (no keywords)
            if not keywords or len(keywords) == 0:
                orphaned.append(template_hash)
                orphaned_details.append({
                    'name': template.get('name', 'Unknown'),
                    'hash': template_hash,
                    'created': template.get('created', 'Unknown'),
                    'reason': 'No keywords/tags - unsearchable'
                })
                del self.local_templates[template_hash]
                continue
            
            # Check 2: Hash conflict (exists in local multiple times OR in global)
            if self._check_template_hash_conflicts(template_hash):
                templates_to_fix.append((template_hash, template))
        
        # Second pass: Fix hash conflicts
        for old_hash, template in templates_to_fix:
            # Generate new unique hash
            import time
            new_hash = self._regenerate_template_hash(
                template.get('name', ''),
                template.get('template', ''),
                salt=str(time.time())
            )
            
            # Ensure new hash is truly unique
            while self._check_template_hash_conflicts(new_hash):
                new_hash = self._regenerate_template_hash(
                    template.get('name', ''),
                    template.get('template', ''),
                    salt=str(time.time()) + str(fixed_hashes)
                )
            
            # Update template with new hash
            template['hash'] = new_hash
            del self.local_templates[old_hash]
            self.local_templates[new_hash] = template
            fixed_hashes += 1
        
        if orphaned or fixed_hashes > 0:
            self._save_local_templates()
            
            # Print detailed cleanup report
            print(f"\033[33m🧹 Template Consensus Cleanup Report:\033[0m")
            if orphaned:
                print(f"\033[33m   Found {len(orphaned)} orphaned template(s)\033[0m")
            if fixed_hashes > 0:
                print(f"\033[36m   Fixed {fixed_hashes} hash ID(s) (local+global conflicts)\033[0m")
            print()
            
            # Show orphaned templates
            if orphaned_details:
                for i, detail in enumerate(orphaned_details, 1):
                    print(f"\033[31m   ❌ Template {i}/{len(orphaned)}:\033[0m")
                    print(f"\033[90m      Name: {detail['name']}\033[0m")
                    print(f"\033[90m      Hash: {detail['hash'][:12]}...\033[0m")
                    print(f"\033[90m      Created: {detail['created'][:10] if len(detail['created']) > 10 else detail['created']}\033[0m")
                    print(f"\033[31m      Reason: {detail['reason']}\033[0m")
                    print()
            
            # Summary
            if orphaned:
                print(f"\033[32m   ✅ Removed {len(orphaned)} unsearchable template(s)\033[0m")
            if fixed_hashes > 0:
                print(f"\033[32m   ✅ Regenerated {fixed_hashes} hash ID(s)\033[0m")
            print()
        
        return orphaned
    
    def find_similar_template(self, name: str, template_code: str) -> Optional[str]:
        """
        Find existing template with similar name or code.
        Returns template hash if found.
        """
        # Check by name similarity
        name_normalized = name.lower().replace('_', ' ').replace('-', ' ')
        
        for template_hash, template in self.local_templates.items():
            existing_name = template['name'].lower().replace('_', ' ').replace('-', ' ')
            
            # Check if names are very similar (80% match)
            if name_normalized in existing_name or existing_name in name_normalized:
                return template_hash
            
            # Check if code is identical (exact match)
            if template['template'].strip() == template_code.strip():
                return template_hash
        
        return None
    
    def merge_keywords(self, template_hash: str, new_keywords: List[str]) -> bool:
        """
        Merge new keywords into existing template.
        Deduplicates and updates the template.
        """
        if template_hash not in self.local_templates:
            return False
        
        template = self.local_templates[template_hash]
        existing_keywords = set(template.get('keywords', []))
        new_keywords_set = set(new_keywords)
        
        # Merge keywords
        merged = existing_keywords | new_keywords_set
        
        # Update template
        template['keywords'] = list(merged)
        template['updated'] = datetime.now().isoformat()
        template['version'] = template.get('version', 1) + 1
        
        self._save_local_templates()
        return True
    
    def add_template(self, name: str, language: str, keywords: List[str], 
                    template_code: str, description: str = "") -> str:
        """
        Add a new template to local collection with smart management:
        - Cleanup orphaned templates (no keywords)
        - Check for duplicates and merge keywords
        - Only save if has valid keywords
        
        Returns:
            Template hash (ID)
        """
        # STEP 1: Cleanup orphaned templates before adding new one
        self.cleanup_orphaned_templates()
        
        # STEP 2: Validate keywords - don't save templates with no keywords
        if not keywords or len(keywords) == 0:
            raise ValueError("Cannot save template without keywords. Template would be unsearchable.")
        
        # STEP 3: Check if similar template already exists
        existing_hash = self.find_similar_template(name, template_code)
        
        if existing_hash:
            # Template already exists - merge keywords instead of duplicating
            self.merge_keywords(existing_hash, keywords)
            return existing_hash
        
        # STEP 4: Create new template
        # Generate unique hash for template
        template_hash = hashlib.sha256(
            f"{name}:{language}:{template_code}".encode()
        ).hexdigest()[:16]
        
        # Check if founder and add label
        from core.founder_config import is_founder, get_author_label
        from core.time_validator import get_consensus_timestamp
        
        # Get validated timestamp (only if online)
        ts_info = get_consensus_timestamp()
        
        template_data = {
            'hash': template_hash,
            'name': name,
            'language': language,
            'keywords': keywords,
            'template': template_code,
            'description': description,
            'author': self.user_id,
            'author_label': get_author_label(self.user_id),  # Add founder label if applicable
            'version': 1,
            'downloads': 0,
            'rating': 0.0,
            'votes': 0
        }
        
        # Only add timestamp if validated (online and accurate)
        if ts_info['validated']:
            template_data['created'] = ts_info['timestamp']
            template_data['timezone'] = ts_info['timezone']
            template_data['utc_offset'] = ts_info['utc_offset']
        
        # Save to local
        self.local_templates[template_hash] = template_data
        self._save_local_templates()
        
        # Queue for upload
        if template_hash not in [t['hash'] for t in self.upload_queue]:
            self.upload_queue.append({
                'hash': template_hash,
                'queued_at': datetime.now().isoformat()
            })
            self._save_upload_queue()
        
        return template_hash
    
    def search_templates(self, query: str, language: Optional[str] = None) -> List[Dict]:
        """
        Search for templates in local and remote collections.
        
        Args:
            query: Search keywords
            language: Optional language filter
        
        Returns:
            List of matching templates sorted by relevance
        """
        query_lower = query.lower()
        matches = []
        
        # Combine local and remote
        all_templates = {**self.remote_templates, **self.local_templates}
        
        for template_hash, template in all_templates.items():
            # Filter by language if specified
            if language and template['language'].lower() != language.lower():
                continue
            
            score = 0
            
            # Check name match
            if query_lower in template['name'].lower():
                score += 3
            
            # Check keyword matches
            for keyword in template.get('keywords', []):
                if keyword.lower() in query_lower:
                    score += 2
            
            # Check language match
            if template['language'].lower() in query_lower:
                score += 1
            
            # Check description match
            if query_lower in template.get('description', '').lower():
                score += 1
            
            if score > 0:
                matches.append({
                    **template,
                    'relevance_score': score,
                    'source': 'local' if template_hash in self.local_templates else 'remote'
                })
        
        # Sort by relevance score (highest first) then by rating
        matches.sort(key=lambda x: (x['relevance_score'], x.get('rating', 0)), reverse=True)
        
        return matches
    
    def get_template(self, template_hash: str) -> Optional[Dict]:
        """Get a specific template by hash."""
        # Check local first
        if template_hash in self.local_templates:
            return self.local_templates[template_hash]
        
        # Check remote
        if template_hash in self.remote_templates:
            # Increment download count
            self.remote_templates[template_hash]['downloads'] += 1
            self._save_remote_templates()
            return self.remote_templates[template_hash]
        
        return None
    
    def rate_template(self, template_hash: str, rating: float):
        """
        Rate a template (0.0 to 5.0).
        Updates the rolling average.
        """
        template = self.get_template(template_hash)
        if not template:
            return False
        
        # Update rating (rolling average)
        old_rating = template.get('rating', 0.0)
        old_votes = template.get('votes', 0)
        
        new_votes = old_votes + 1
        new_rating = ((old_rating * old_votes) + rating) / new_votes
        
        # Update in appropriate collection
        if template_hash in self.local_templates:
            self.local_templates[template_hash]['rating'] = new_rating
            self.local_templates[template_hash]['votes'] = new_votes
            self._save_local_templates()
        elif template_hash in self.remote_templates:
            self.remote_templates[template_hash]['rating'] = new_rating
            self.remote_templates[template_hash]['votes'] = new_votes
            self._save_remote_templates()
        
        return True
    
    def sync_with_remote(self) -> Dict[str, int]:
        """
        Sync templates with GitHub consensus repo.
        Downloads new templates and uploads queued ones.
        
        Returns:
            Stats dict with download/upload counts
        """
        stats = {
            'downloaded': 0,
            'uploaded': 0,
            'errors': 0
        }
        
        try:
            # Import GitHub uploader
            from github_uploader import GitHubUploader
            
            uploader = GitHubUploader(self.user_id)
            
            # Download remote templates
            remote_templates = uploader.fetch_templates()
            
            if remote_templates:
                for template_hash, template_data in remote_templates.items():
                    if template_hash not in self.remote_templates:
                        self.remote_templates[template_hash] = template_data
                        stats['downloaded'] += 1
                
                self._save_remote_templates()
            
            # Upload queued templates
            if self.upload_queue:
                for queued in self.upload_queue[:]:  # Copy list to avoid modification during iteration
                    template_hash = queued['hash']
                    
                    if template_hash in self.local_templates:
                        template_data = self.local_templates[template_hash]
                        
                        # Upload to GitHub
                        success = uploader.upload_template(template_data)
                        
                        if success:
                            self.upload_queue.remove(queued)
                            stats['uploaded'] += 1
                        else:
                            stats['errors'] += 1
                
                self._save_upload_queue()
        
        except Exception as e:
            stats['errors'] += 1
            print(f"Template sync error: {e}")
        
        return stats
    
    def get_stats(self) -> Dict:
        """Get template statistics."""
        return {
            'local_templates': len(self.local_templates),
            'remote_templates': len(self.remote_templates),
            'queued_uploads': len(self.upload_queue),
            'total_templates': len(self.local_templates) + len(self.remote_templates),
            'top_rated': sorted(
                [t for t in {**self.local_templates, **self.remote_templates}.values()],
                key=lambda x: x.get('rating', 0),
                reverse=True
            )[:5]
        }
    
    def list_templates_by_language(self) -> Dict[str, int]:
        """Get count of templates grouped by language."""
        languages = {}
        
        all_templates = {**self.local_templates, **self.remote_templates}
        
        for template in all_templates.values():
            lang = template.get('language', 'Unknown')
            languages[lang] = languages.get(lang, 0) + 1
        
        return dict(sorted(languages.items(), key=lambda x: x[1], reverse=True))
    
    def discover_new_template(self, template_code: str, language: str) -> Optional[str]:
        """
        Auto-discover and save a new template when user creates code.
        Analyzes code patterns to extract keywords and generate template.
        
        Returns:
            Template hash if saved, None otherwise
        """
        # Extract potential keywords from code
        keywords = self._extract_keywords(template_code, language)
        
        # Generate a name from keywords
        name = self._generate_template_name(keywords, language)
        
        # Add template
        return self.add_template(
            name=name,
            language=language,
            keywords=keywords,
            template_code=template_code,
            description=f"Auto-discovered {language} template"
        )
    
    def _extract_keywords(self, code: str, language: str) -> List[str]:
        """Extract keywords from code for template matching."""
        keywords = []
        
        # Common patterns
        patterns = {
            'Python': ['flask', 'django', 'fastapi', 'requests', 'beautifulsoup', 
                      'pandas', 'numpy', 'argparse', 'click', 'asyncio'],
            'JavaScript': ['express', 'react', 'vue', 'angular', 'node', 'fetch', 'axios'],
            'Bash': ['backup', 'monitor', 'deploy', 'install', 'cron'],
            'Go': ['http', 'gin', 'gorilla', 'grpc'],
        }
        
        code_lower = code.lower()
        
        for keyword in patterns.get(language, []):
            if keyword in code_lower:
                keywords.append(keyword)
        
        # Add general keywords based on code structure
        if 'def ' in code or 'function ' in code or 'func ' in code:
            keywords.append('function')
        if 'class ' in code:
            keywords.append('class')
        if 'import ' in code or 'require(' in code:
            keywords.append('module')
        if '@app.route' in code or 'app.get' in code:
            keywords.append('api')
        if 'scrape' in code_lower or 'beautifulsoup' in code_lower:
            keywords.append('scraper')
        
        return list(set(keywords))[:10]  # Limit to 10 keywords
    
    def _generate_template_name(self, keywords: List[str], language: str) -> str:
        """Generate a template name from keywords and language."""
        if not keywords:
            return f"{language} Template"
        
        # Use top 2-3 keywords
        key_parts = keywords[:3]
        return f"{language} {' '.join(key_parts).title()}"


if __name__ == "__main__":
    # Test template consensus
    consensus = TemplateConsensus("TEST-USER-ID")
    
    # Add a test template
    template_hash = consensus.add_template(
        name="Test Flask API",
        language="Python",
        keywords=["flask", "api", "rest"],
        template_code="from flask import Flask\napp = Flask(__name__)",
        description="Simple Flask API template"
    )
    
    print(f"Added template: {template_hash}")
    
    # Search
    results = consensus.search_templates("flask api")
    print(f"\nSearch results: {len(results)}")
    
    # Stats
    stats = consensus.get_stats()
    print(f"\nStats: {stats}")
