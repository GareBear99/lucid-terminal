#!/usr/bin/env python3
"""
🧠 LuciferMemory — Enhanced Per-User Memory System
Hierarchical memory with context, sessions, and intelligent retrieval
"""
import os
import json
import hashlib
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from collections import defaultdict

# Paths
LUCIFER_HOME = Path.home() / ".luciferai"
MEMORY_DIR = LUCIFER_HOME / "memory"
MEMORY_DIR.mkdir(parents=True, exist_ok=True)

# Colors
PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
DIM = "\033[2m"
RESET = "\033[0m"


class LuciferMemory:
    """
    Enhanced memory system with:
    - Per-user storage isolation
    - Session-based organization
    - Context tracking (projects, files, errors)
    - Intelligent search and retrieval
    - Memory compression for old data
    """
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.user_dir = MEMORY_DIR / user_id
        self.user_dir.mkdir(exist_ok=True)
        
        # Memory files
        self.active_memory_file = self.user_dir / "active_memory.json"
        self.archive_file = self.user_dir / "archive.json"
        self.sessions_file = self.user_dir / "sessions.json"
        self.context_index = self.user_dir / "context_index.json"
        
        # Load memory
        self.active_memory = self._load_json(self.active_memory_file, [])
        self.sessions = self._load_json(self.sessions_file, {})
        self.context = self._load_json(self.context_index, {
            "projects": {},
            "files": {},
            "errors": {},
            "fixes": {}
        })
        
        # Current session
        self.current_session_id = self._create_session()
    
    # ─────────────────────────────── FILE I/O ─────────────────────────────── #
    def _load_json(self, path: Path, default: Any) -> Any:
        """Load JSON with fallback."""
        if not path.exists():
            self._save_json(path, default)
            return default
        
        try:
            with open(path) as f:
                return json.load(f)
        except json.JSONDecodeError:
            return default
    
    def _save_json(self, path: Path, data: Any):
        """Save JSON safely."""
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
    
    # ─────────────────────────────── SESSIONS ─────────────────────────────── #
    def _create_session(self) -> str:
        """Create new session or continue today's session."""
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Check for existing session today
        for session_id, session in self.sessions.items():
            if session['date'] == today and session['active']:
                return session_id
        
        # Create new session
        session_id = hashlib.sha256(f"{self.user_id}-{datetime.now().isoformat()}".encode()).hexdigest()[:12]
        
        self.sessions[session_id] = {
            "date": today,
            "start_time": datetime.now().isoformat(),
            "active": True,
            "events_count": 0,
            "projects": set(),
            "error_types": defaultdict(int)
        }
        
        self._save_json(self.sessions_file, self.sessions)
        return session_id
    
    def end_session(self):
        """Mark current session as inactive."""
        if self.current_session_id in self.sessions:
            self.sessions[self.current_session_id]['active'] = False
            self.sessions[self.current_session_id]['end_time'] = datetime.now().isoformat()
            self._save_json(self.sessions_file, self.sessions)
    
    # ─────────────────────────────── MEMORY LOGGING ─────────────────────────────── #
    def log_event(self,
                  event_type: str,
                  target: str,
                  message: str,
                  context: Optional[Dict] = None):
        """
        Log an event with full context.
        
        Args:
            event_type: Type of event (run_success, run_fail, fix_applied, etc.)
            target: File/script/project target
            message: Event description
            context: Additional context (error_type, line_number, fix_hash, etc.)
        """
        # Create memory entry
        entry = {
            "id": hashlib.sha256(f"{datetime.now().isoformat()}-{target}".encode()).hexdigest()[:8],
            "timestamp": datetime.now().isoformat(),
            "session_id": self.current_session_id,
            "event_type": event_type,
            "target": target,
            "message": message,
            "context": context or {}
        }
        
        # Add to active memory
        self.active_memory.append(entry)
        self._save_json(self.active_memory_file, self.active_memory)
        
        # Update session stats
        if self.current_session_id in self.sessions:
            self.sessions[self.current_session_id]['events_count'] += 1
            
            # Track project
            if 'project' in (context or {}):
                if isinstance(self.sessions[self.current_session_id]['projects'], set):
                    self.sessions[self.current_session_id]['projects'] = list(self.sessions[self.current_session_id]['projects'])
                if context['project'] not in self.sessions[self.current_session_id]['projects']:
                    self.sessions[self.current_session_id]['projects'].append(context['project'])
            
            # Track error types
            if 'error_type' in (context or {}):
                error_type = context['error_type']
                if isinstance(self.sessions[self.current_session_id]['error_types'], defaultdict):
                    self.sessions[self.current_session_id]['error_types'] = dict(self.sessions[self.current_session_id]['error_types'])
                self.sessions[self.current_session_id]['error_types'][error_type] = \
                    self.sessions[self.current_session_id]['error_types'].get(error_type, 0) + 1
            
            self._save_json(self.sessions_file, self.sessions)
        
        # Update context index
        self._update_context_index(entry)
        
        # Archive old memories if needed
        if len(self.active_memory) > 1000:
            self._archive_old_memories()
    
    def _update_context_index(self, entry: Dict):
        """Update context index for fast lookups."""
        # Index by project
        if 'project' in entry.get('context', {}):
            project = entry['context']['project']
            if project not in self.context['projects']:
                self.context['projects'][project] = []
            self.context['projects'][project].append(entry['id'])
        
        # Index by file
        target = entry['target']
        if target not in self.context['files']:
            self.context['files'][target] = {
                "first_seen": entry['timestamp'],
                "events": [],
                "error_count": 0,
                "success_count": 0
            }
        
        self.context['files'][target]['events'].append(entry['id'])
        
        if 'fail' in entry['event_type'] or 'error' in entry['event_type']:
            self.context['files'][target]['error_count'] += 1
        elif 'success' in entry['event_type']:
            self.context['files'][target]['success_count'] += 1
        
        # Index by error type
        if 'error_type' in entry.get('context', {}):
            error_type = entry['context']['error_type']
            if error_type not in self.context['errors']:
                self.context['errors'][error_type] = []
            self.context['errors'][error_type].append(entry['id'])
        
        # Index by fix
        if 'fix_hash' in entry.get('context', {}):
            fix_hash = entry['context']['fix_hash']
            if fix_hash not in self.context['fixes']:
                self.context['fixes'][fix_hash] = []
            self.context['fixes'][fix_hash].append(entry['id'])
        
        self._save_json(self.context_index, self.context)
    
    # ─────────────────────────────── RETRIEVAL ─────────────────────────────── #
    def get_recent_events(self, limit: int = 20, event_type: Optional[str] = None) -> List[Dict]:
        """Get recent events, optionally filtered by type."""
        events = self.active_memory[-limit:]
        
        if event_type:
            events = [e for e in events if e['event_type'] == event_type]
        
        return events
    
    def get_events_for_file(self, target: str) -> List[Dict]:
        """Get all events for a specific file."""
        if target not in self.context['files']:
            return []
        
        event_ids = self.context['files'][target]['events']
        return [e for e in self.active_memory if e['id'] in event_ids]
    
    def get_events_for_project(self, project: str) -> List[Dict]:
        """Get all events for a specific project."""
        if project not in self.context['projects']:
            return []
        
        event_ids = self.context['projects'][project]
        return [e for e in self.active_memory if e['id'] in event_ids]
    
    def get_similar_errors(self, error_message: str, limit: int = 5) -> List[Dict]:
        """Find similar errors in memory."""
        # Normalize error for matching
        error_normalized = error_message.lower()[:50]
        
        matches = []
        for event in self.active_memory:
            if 'fail' in event['event_type'] or 'error' in event['event_type']:
                if error_normalized in event['message'].lower():
                    matches.append(event)
        
        return matches[-limit:]
    
    def search(self, query: str, limit: int = 10) -> List[Dict]:
        """Full-text search across all memory."""
        query_lower = query.lower()
        matches = []
        
        for event in self.active_memory:
            # Search in message
            if query_lower in event['message'].lower():
                matches.append(event)
            # Search in target
            elif query_lower in event['target'].lower():
                matches.append(event)
            # Search in context
            elif query_lower in str(event.get('context', {})).lower():
                matches.append(event)
        
        return matches[-limit:]
    
    # ─────────────────────────────── STATISTICS ─────────────────────────────── #
    def get_statistics(self) -> Dict[str, Any]:
        """Get memory statistics."""
        total_events = len(self.active_memory)
        
        # Event type breakdown
        event_types = defaultdict(int)
        for event in self.active_memory:
            event_types[event['event_type']] += 1
        
        # File statistics
        most_problematic = sorted(
            [(f, data['error_count']) for f, data in self.context['files'].items()],
            key=lambda x: x[1],
            reverse=True
        )[:5]
        
        # Session statistics
        active_sessions = sum(1 for s in self.sessions.values() if s.get('active', False))
        
        return {
            "total_events": total_events,
            "total_sessions": len(self.sessions),
            "active_sessions": active_sessions,
            "event_types": dict(event_types),
            "most_problematic_files": most_problematic,
            "projects_tracked": len(self.context['projects']),
            "unique_errors": len(self.context['errors'])
        }
    
    def print_statistics(self):
        """Display memory statistics."""
        stats = self.get_statistics()
        
        print(f"\n{PURPLE}{'='*60}{RESET}")
        print(f"{PURPLE}🧠 Memory Statistics - User: {self.user_id[:8]}...{RESET}")
        print(f"{PURPLE}{'='*60}{RESET}\n")
        
        print(f"{GOLD}Total Events:{RESET} {stats['total_events']}")
        print(f"{GOLD}Sessions:{RESET} {stats['total_sessions']} (Active: {stats['active_sessions']})")
        print(f"{GOLD}Projects Tracked:{RESET} {stats['projects_tracked']}")
        print(f"{GOLD}Unique Error Types:{RESET} {stats['unique_errors']}")
        
        if stats['event_types']:
            print(f"\n{BLUE}Event Types:{RESET}")
            for event_type, count in sorted(stats['event_types'].items(), key=lambda x: x[1], reverse=True)[:5]:
                print(f"  • {event_type}: {count}")
        
        if stats['most_problematic_files']:
            print(f"\n{RED}Most Problematic Files:{RESET}")
            for filename, error_count in stats['most_problematic_files']:
                print(f"  • {filename}: {error_count} errors")
        
        print(f"\n{PURPLE}{'='*60}{RESET}\n")
    
    def display_recent(self, limit: int = 20):
        """Display recent memory entries."""
        print(f"\n{PURPLE}🧠 Recent Memory - Session: {self.current_session_id[:8]}{RESET}")
        print(f"{PURPLE}{'─'*60}{RESET}\n")
        
        recent = self.get_recent_events(limit)
        
        if not recent:
            print(f"{GOLD}No events in memory yet{RESET}")
            return
        
        for event in recent:
            # Color based on event type
            if 'success' in event['event_type']:
                color = GREEN
            elif 'fail' in event['event_type'] or 'error' in event['event_type']:
                color = RED
            elif 'fix' in event['event_type']:
                color = GOLD
            else:
                color = BLUE
            
            timestamp = datetime.fromisoformat(event['timestamp']).strftime("%H:%M:%S")
            print(f"{DIM}[{timestamp}]{RESET} {color}{event['event_type']}{RESET} → {event['target']}")
            print(f"   {event['message'][:100]}{'...' if len(event['message']) > 100 else ''}")
            
            if event.get('context'):
                context_str = ", ".join(f"{k}={v}" for k, v in list(event['context'].items())[:3])
                print(f"   {DIM}{context_str}{RESET}")
            print()
    
    # ─────────────────────────────── ARCHIVING ─────────────────────────────── #
    def _archive_old_memories(self):
        """Move old memories to archive."""
        cutoff_date = datetime.now() - timedelta(days=30)
        
        # Load archive
        archive = self._load_json(self.archive_file, [])
        
        # Split active memory
        to_archive = []
        keep_active = []
        
        for event in self.active_memory:
            event_date = datetime.fromisoformat(event['timestamp'])
            if event_date < cutoff_date:
                to_archive.append(event)
            else:
                keep_active.append(event)
        
        # Update files
        if to_archive:
            archive.extend(to_archive)
            self._save_json(self.archive_file, archive)
            
            self.active_memory = keep_active
            self._save_json(self.active_memory_file, self.active_memory)
            
            print(f"{BLUE}📦 Archived {len(to_archive)} old memories{RESET}")


# Test
if __name__ == "__main__":
    import uuid
    
    # Generate test user ID
    device_id = str(uuid.UUID(int=uuid.getnode()))
    username = os.getenv("USER", "unknown")
    user_id = hashlib.sha256(f"{device_id}-{username}".encode()).hexdigest()[:16].upper()
    
    print(f"{PURPLE}🧪 Testing Enhanced Memory System{RESET}\n")
    
    memory = LuciferMemory(user_id)
    
    # Test logging
    memory.log_event("run_success", "test.py", "Script executed successfully", {
        "project": "TestProject",
        "duration": 1.5
    })
    
    memory.log_event("run_fail", "broken.py", "NameError: name 'x' is not defined", {
        "project": "TestProject",
        "error_type": "NameError",
        "line": 42
    })
    
    memory.log_event("fix_applied", "broken.py", "Added: import x", {
        "fix_hash": "abc123",
        "error_type": "NameError"
    })
    
    # Display
    memory.display_recent()
    memory.print_statistics()
