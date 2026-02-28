"""
Advanced Memory System for LuciferAI
- Session logs with configurable depth per model
- Permanent storage for user preferences (name, settings)
- Session archiving with keyword detection
- Context injection for LLM queries
"""

import json
import os
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
from collections import deque

class MemorySystem:
    """
    Multi-tiered memory system with model-specific configurations.
    
    Memory Tiers:
    1. Session Memory - Current conversation (model-dependent depth)
    2. Permanent Memory - User preferences, names, important facts
    3. Archive Memory - Previous sessions stored for reference
    """
    
    def __init__(self, user_id: str, model: str = "llama3.2"):
        self.user_id = user_id
        self.model = model
        
        # Memory directories
        self.memory_home = Path.home() / ".luciferai" / "memory"
        self.sessions_dir = self.memory_home / "sessions"
        self.archives_dir = self.memory_home / "archives"
        self.permanent_file = self.memory_home / "permanent.json"
        
        # Ensure directories exist
        self.memory_home.mkdir(parents=True, exist_ok=True)
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self.archives_dir.mkdir(parents=True, exist_ok=True)
        
        # Model-specific memory configurations
        self.memory_configs = {
            'llama3.2': {
                'session_depth': 1200,  # 1 session, 1200 entries
                'max_sessions': 1,
                'description': 'Basic command parsing memory'
            },
            'mistral-7b': {
                'session_depth': 2400,  # 2 sessions worth, 2400 entries
                'max_sessions': 2,
                'description': 'Template and web search context'
            },
            'deepseek-coder': {
                'session_depth': 12000,  # 3 sessions, 12000 entries
                'max_sessions': 3,
                'description': 'Advanced code generation with deep context'
            }
        }
        
        # Get config for current model
        self.config = self.memory_configs.get(model, self.memory_configs['llama3.2'])
        
        # Current session memory (deque for efficient rotation)
        self.session_memory = deque(maxlen=self.config['session_depth'])
        
        # Load permanent memory
        self.permanent_memory = self._load_permanent_memory()
        
        # Current session ID
        self.current_session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Load last session if exists
        self._load_last_session()
    
    def _load_permanent_memory(self) -> Dict:
        """Load permanent memory (name, preferences, etc.)"""
        if self.permanent_file.exists():
            try:
                with open(self.permanent_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        
        return {
            'user_name': None,
            'preferences': {},
            'important_facts': [],
            'created_at': datetime.now().isoformat()
        }
    
    def _save_permanent_memory(self):
        """Save permanent memory to disk"""
        with open(self.permanent_file, 'w') as f:
            json.dump(self.permanent_memory, f, indent=2)
    
    def _load_last_session(self):
        """Load the most recent session"""
        session_files = sorted(self.sessions_dir.glob("session_*.json"), reverse=True)
        
        if session_files:
            try:
                with open(session_files[0], 'r') as f:
                    session_data = json.load(f)
                    # Load entries into memory
                    for entry in session_data.get('entries', [])[-self.config['session_depth']:]:
                        self.session_memory.append(entry)
                    
                    # Use the same session ID
                    self.current_session_id = session_data.get('session_id', self.current_session_id)
            except:
                pass
    
    def add_entry(self, role: str, content: str, metadata: Optional[Dict] = None):
        """
        Add an entry to session memory
        
        Args:
            role: 'user' or 'assistant' or 'system'
            content: The message content
            metadata: Optional metadata (tool calls, errors, etc.)
        """
        entry = {
            'role': role,
            'content': content,
            'timestamp': datetime.now().isoformat(),
            'metadata': metadata or {}
        }
        
        self.session_memory.append(entry)
        
        # Auto-save every 10 entries
        if len(self.session_memory) % 10 == 0:
            self.save_session()
    
    def get_context(self, max_entries: Optional[int] = None) -> List[Dict]:
        """
        Get conversation context for LLM
        
        Args:
            max_entries: Limit number of entries (useful for token limits)
        
        Returns:
            List of conversation entries
        """
        if max_entries:
            return list(self.session_memory)[-max_entries:]
        return list(self.session_memory)
    
    def get_context_string(self, max_entries: Optional[int] = None) -> str:
        """Get formatted context as a string for injection"""
        context = self.get_context(max_entries)
        
        lines = []
        for entry in context:
            role = entry['role'].upper()
            content = entry['content']
            lines.append(f"[{role}]: {content}")
        
        return "\n".join(lines)
    
    def save_session(self):
        """Save current session to disk"""
        session_file = self.sessions_dir / f"session_{self.current_session_id}.json"
        
        session_data = {
            'session_id': self.current_session_id,
            'model': self.model,
            'created_at': self.current_session_id,
            'updated_at': datetime.now().isoformat(),
            'entry_count': len(self.session_memory),
            'entries': list(self.session_memory)
        }
        
        with open(session_file, 'w') as f:
            json.dump(session_data, f, indent=2)
    
    def archive_session(self, archive_name: Optional[str] = None):
        """
        Archive current session and start fresh
        
        Args:
            archive_name: Optional custom name for the archive
        """
        # Save current session first
        self.save_session()
        
        # Create archive name
        if not archive_name:
            archive_name = f"archive_{self.current_session_id}"
        
        # Move session to archives
        session_file = self.sessions_dir / f"session_{self.current_session_id}.json"
        archive_file = self.archives_dir / f"{archive_name}.json"
        
        if session_file.exists():
            # Load, add archive metadata, save to archives
            with open(session_file, 'r') as f:
                session_data = json.load(f)
            
            session_data['archived_at'] = datetime.now().isoformat()
            session_data['archive_name'] = archive_name
            session_data['entry_count'] = len(self.session_memory)
            
            with open(archive_file, 'w') as f:
                json.dump(session_data, f, indent=2)
            
            # Remove from sessions
            session_file.unlink()
        
        # Clear current session and start new
        self.session_memory.clear()
        self.current_session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        return archive_name
    
    def load_archive(self, archive_name: str) -> Optional[Dict]:
        """Load a specific archive by name"""
        archive_file = self.archives_dir / f"{archive_name}.json"
        
        if archive_file.exists():
            try:
                with open(archive_file, 'r') as f:
                    return json.load(f)
            except:
                pass
        
        return None
    
    def list_archives(self) -> List[Dict]:
        """List all archived sessions"""
        archives = []
        
        for archive_file in sorted(self.archives_dir.glob("*.json"), reverse=True):
            try:
                with open(archive_file, 'r') as f:
                    data = json.load(f)
                    archives.append({
                        'name': archive_file.stem,
                        'archived_at': data.get('archived_at'),
                        'entry_count': data.get('entry_count', 0),
                        'model': data.get('model')
                    })
            except:
                continue
        
        return archives
    
    def set_user_name(self, name: str):
        """Permanently remember user's name"""
        self.permanent_memory['user_name'] = name
        self._save_permanent_memory()
    
    def get_user_name(self) -> Optional[str]:
        """Get user's name if stored"""
        return self.permanent_memory.get('user_name')
    
    def set_preference(self, key: str, value: any):
        """Store a permanent preference"""
        self.permanent_memory['preferences'][key] = value
        self._save_permanent_memory()
    
    def get_preference(self, key: str) -> Optional[any]:
        """Get a stored preference"""
        return self.permanent_memory['preferences'].get(key)
    
    def add_important_fact(self, fact: str):
        """Add a fact to permanent memory"""
        self.permanent_memory['important_facts'].append({
            'fact': fact,
            'added_at': datetime.now().isoformat()
        })
        self._save_permanent_memory()
    
    def search_memory(self, query: str, include_archives: bool = False) -> List[Dict]:
        """
        Search through memory for relevant entries
        
        Args:
            query: Search query
            include_archives: Whether to search archived sessions too
        
        Returns:
            List of matching entries
        """
        query_lower = query.lower()
        matches = []
        
        # Search current session
        for entry in self.session_memory:
            if query_lower in entry['content'].lower():
                matches.append({
                    'entry': entry,
                    'source': 'current_session'
                })
        
        # Search archives if requested
        if include_archives:
            for archive in self.list_archives():
                archive_data = self.load_archive(archive['name'])
                if archive_data:
                    for entry in archive_data.get('entries', []):
                        if query_lower in entry['content'].lower():
                            matches.append({
                                'entry': entry,
                                'source': f"archive:{archive['name']}"
                            })
        
        return matches
    
    def detect_archive_keywords(self, user_input: str) -> bool:
        """Detect if user wants to archive session"""
        archive_keywords = [
            'archive this',
            'archive session',
            'new session',
            'start over',
            'start fresh',
            'clear memory',
            'reset conversation'
        ]
        
        user_lower = user_input.lower()
        return any(keyword in user_lower for keyword in archive_keywords)
    
    def get_memory_stats(self) -> Dict:
        """Get statistics about memory usage"""
        return {
            'model': self.model,
            'session_depth': self.config['session_depth'],
            'current_entries': len(self.session_memory),
            'memory_usage_percent': (len(self.session_memory) / self.config['session_depth']) * 100,
            'max_sessions': self.config['max_sessions'],
            'user_name': self.get_user_name(),
            'archives_count': len(self.list_archives()),
            'permanent_facts': len(self.permanent_memory.get('important_facts', []))
        }
    
    def inject_context_for_model(self, user_query: str, max_context_entries: int = 10) -> str:
        """
        Create context-aware prompt for LLM
        Includes user name, recent conversation, and relevant memory
        
        Args:
            user_query: The current user query
            max_context_entries: How many recent entries to include
        
        Returns:
            Enhanced prompt with context
        """
        context_parts = []
        
        # Add user name if known
        user_name = self.get_user_name()
        if user_name:
            context_parts.append(f"User's name: {user_name}")
        
        # Add important facts
        facts = self.permanent_memory.get('important_facts', [])
        if facts:
            recent_facts = facts[-3:]  # Last 3 facts
            context_parts.append("Important context:")
            for fact_obj in recent_facts:
                context_parts.append(f"  - {fact_obj['fact']}")
        
        # Add recent conversation
        recent_context = self.get_context(max_context_entries)
        if recent_context:
            context_parts.append("\nRecent conversation:")
            for entry in recent_context[-5:]:  # Last 5 exchanges
                role = entry['role']
                content = entry['content'][:100]  # Truncate long messages
                context_parts.append(f"  [{role}]: {content}")
        
        # Combine context with current query
        if context_parts:
            full_prompt = "\n".join(context_parts) + f"\n\nCurrent query: {user_query}"
            return full_prompt
        
        return user_query


# Helper function to detect "remember" or "my name is" patterns
def extract_name_from_input(user_input: str) -> Optional[str]:
    """Extract name if user is introducing themselves"""
    import re
    
    patterns = [
        r"my name is (\w+)",
        r"i'm (\w+)",
        r"i am (\w+)",
        r"call me (\w+)",
        r"remember me as (\w+)"
    ]
    
    user_lower = user_input.lower()
    
    for pattern in patterns:
        match = re.search(pattern, user_lower)
        if match:
            return match.group(1).capitalize()
    
    return None


# Test memory system
if __name__ == "__main__":
    # Test basic functionality
    memory = MemorySystem("TEST-USER", model="deepseek-coder")
    
    # Add some entries
    memory.add_entry("user", "Hello, can you help me with Python?")
    memory.add_entry("assistant", "Of course! I can help you with Python. What do you need?")
    memory.add_entry("user", "My name is John")
    
    # Extract and save name
    name = extract_name_from_input("My name is John")
    if name:
        memory.set_user_name(name)
    
    # Get context
    print("Current context:")
    print(memory.get_context_string())
    
    print("\nMemory stats:")
    print(json.dumps(memory.get_memory_stats(), indent=2))
    
    # Test archiving
    print("\nArchiving session...")
    archive_name = memory.archive_session("test_archive")
    print(f"Archived as: {archive_name}")
    
    print("\nArchives:")
    for archive in memory.list_archives():
        print(f"  - {archive['name']}: {archive['entry_count']} entries")
