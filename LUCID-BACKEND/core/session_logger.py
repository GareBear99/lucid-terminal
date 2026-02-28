#!/usr/bin/env python3
"""
📝 Session Logger - Tracks all user sessions with timestamps
Maintains last 6 months of session logs in ~/.luciferai/logs/sessions/
"""
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict, Optional


class SessionLogger:
    """
    Logs all user sessions with timestamps.
    
    Features:
    - Creates timestamped session files (YYYYMMDD_HHMMSS.json)
    - Stores in ~/.luciferai/logs/sessions/
    - Auto-cleans sessions older than 6 months
    - Tracks conversation history, commands, and metadata
    """
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        
        # Session log directories
        luciferai_home = Path.home() / ".luciferai"
        self.logs_dir = luciferai_home / "logs"
        self.sessions_dir = self.logs_dir / "sessions"
        
        # Ensure directories exist
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        
        # Current session info
        self.session_start = datetime.now()
        self.session_id = self.session_start.strftime("%Y%m%d_%H%M%S")
        self.session_file = self.sessions_dir / f"session_{self.session_id}.json"
        
        # Session data
        self.session_data = {
            'session_id': self.session_id,
            'user_id': self.user_id,
            'started_at': self.session_start.isoformat(),
            'ended_at': None,
            'messages': [],
            'commands_executed': 0,
            'files_created': [],
            'files_modified': [],
            'errors': [],
            'events': []  # Execution flow events (model switches, bypasses, etc.)
        }
        
        # Clean old sessions (older than 6 months)
        self._cleanup_old_sessions()
        
        # Create initial session file
        self._save_session()
    
    def _cleanup_old_sessions(self):
        """Delete session logs older than 6 months."""
        cutoff_date = datetime.now() - timedelta(days=180)  # 6 months
        
        deleted_count = 0
        for session_file in self.sessions_dir.glob("session_*.json"):
            try:
                # Extract date from filename: session_YYYYMMDD_HHMMSS.json
                filename = session_file.stem  # Remove .json
                date_str = filename.split('_')[1]  # Get YYYYMMDD
                
                # Parse date
                session_date = datetime.strptime(date_str, "%Y%m%d")
                
                # Delete if older than 6 months
                if session_date < cutoff_date:
                    session_file.unlink()
                    deleted_count += 1
            except (ValueError, IndexError):
                # Skip malformed filenames
                continue
        
        if deleted_count > 0:
            from lucifer_colors import c
            print(c(f"🗑️  Cleaned up {deleted_count} session(s) older than 6 months", "dim"))
    
    def log_message(self, role: str, content: str, metadata: Optional[Dict] = None):
        """
        Log a message in the current session.
        
        Args:
            role: 'user' or 'assistant' or 'system'
            content: Message content
            metadata: Optional metadata (model used, execution time, etc.)
        """
        message_entry = {
            'timestamp': datetime.now().isoformat(),
            'role': role,
            'content': content
        }
        
        if metadata:
            message_entry['metadata'] = metadata
        
        self.session_data['messages'].append(message_entry)
        
        # Auto-save every 5 messages
        if len(self.session_data['messages']) % 5 == 0:
            self._save_session()
    
    def log_command(self, command: str, success: bool = True, error: Optional[str] = None):
        """
        Log a command execution.
        
        Args:
            command: Command that was executed
            success: Whether command succeeded
            error: Error message if failed
        """
        self.session_data['commands_executed'] += 1
        
        if not success and error:
            self.session_data['errors'].append({
                'timestamp': datetime.now().isoformat(),
                'command': command,
                'error': error
            })
        
        self._save_session()
    
    def log_file_created(self, filepath: str):
        """Log a file creation."""
        self.session_data['files_created'].append({
            'timestamp': datetime.now().isoformat(),
            'path': filepath
        })
        self._save_session()
    
    def log_file_modified(self, filepath: str):
        """Log a file modification."""
        self.session_data['files_modified'].append({
            'timestamp': datetime.now().isoformat(),
            'path': filepath
        })
        self._save_session()
    
    def log_event(self, event_type: str, description: str, metadata: Optional[Dict] = None):
        """
        Log an execution flow event.
        
        Args:
            event_type: Type of event (e.g., 'model_switch', 'bypass', 'template_used', 'error_fixed')
            description: Human-readable event description
            metadata: Optional event metadata
        """
        event_entry = {
            'timestamp': datetime.now().isoformat(),
            'type': event_type,
            'description': description
        }
        
        if metadata:
            event_entry['metadata'] = metadata
        
        self.session_data['events'].append(event_entry)
        
        # Auto-save every 10 events
        if len(self.session_data['events']) % 10 == 0:
            self._save_session()
    
    def log_execution_tracking(self, detailed_log: Dict):
        """
        Log detailed execution tracking from ExecutionTracker.
        
        Args:
            detailed_log: Complete execution tracking data including files, templates, fixes, models
        """
        tracking_entry = {
            'timestamp': datetime.now().isoformat(),
            'type': 'execution_tracking',
            'data': detailed_log
        }
        
        # Add to events for full audit trail
        self.session_data['events'].append(tracking_entry)
        
        # Also update file tracking if files were affected
        if detailed_log.get('files', {}).get('created'):
            for filepath in detailed_log['files']['created']:
                if not any(f['path'] == filepath for f in self.session_data['files_created']):
                    self.session_data['files_created'].append({
                        'timestamp': datetime.now().isoformat(),
                        'path': filepath
                    })
        
        if detailed_log.get('files', {}).get('modified'):
            for filepath in detailed_log['files']['modified']:
                if not any(f['path'] == filepath for f in self.session_data['files_modified']):
                    self.session_data['files_modified'].append({
                        'timestamp': datetime.now().isoformat(),
                        'path': filepath
                    })
        
        self._save_session()
    
    def end_session(self):
        """Mark session as ended and save final state."""
        self.session_data['ended_at'] = datetime.now().isoformat()
        
        # Calculate session duration
        if self.session_data['started_at']:
            start = datetime.fromisoformat(self.session_data['started_at'])
            end = datetime.now()
            duration_seconds = (end - start).total_seconds()
            self.session_data['duration_seconds'] = duration_seconds
        
        self._save_session()
    
    def _save_session(self):
        """Save current session data to file."""
        with open(self.session_file, 'w') as f:
            json.dump(self.session_data, f, indent=2)
    
    def get_session_info(self) -> Dict:
        """Get current session information."""
        return {
            'session_id': self.session_id,
            'started_at': self.session_start,
            'messages_count': len(self.session_data['messages']),
            'commands_count': self.session_data['commands_executed'],
            'files_created': len(self.session_data['files_created']),
            'files_modified': len(self.session_data['files_modified'])
        }
    
    @staticmethod
    def get_recent_sessions(limit: int = 10) -> List[Dict]:
        """
        Get most recent session summaries.
        
        Args:
            limit: Maximum number of sessions to return
        
        Returns:
            List of session summaries (most recent first)
        """
        sessions_dir = Path.home() / ".luciferai" / "logs" / "sessions"
        
        if not sessions_dir.exists():
            return []
        
        sessions = []
        session_files = sorted(sessions_dir.glob("session_*.json"), reverse=True)[:limit]
        
        for session_file in session_files:
            try:
                with open(session_file, 'r') as f:
                    session_data = json.load(f)
                    
                    # Create summary
                    summary = {
                        'session_id': session_data.get('session_id'),
                        'started_at': session_data.get('started_at'),
                        'ended_at': session_data.get('ended_at'),
                        'message_count': len(session_data.get('messages', [])),
                        'commands_count': session_data.get('commands_executed', 0),
                        'files_created': len(session_data.get('files_created', [])),
                        'files_modified': len(session_data.get('files_modified', [])),
                        'events_count': len(session_data.get('events', []))
                    }
                    
                    sessions.append(summary)
            except:
                continue
        
        return sessions
    
    @staticmethod
    def get_session_stats() -> Dict:
        """Get overall session statistics."""
        sessions_dir = Path.home() / ".luciferai" / "logs" / "sessions"
        
        if not sessions_dir.exists():
            return {
                'total_sessions': 0,
                'oldest_session': None,
                'newest_session': None
            }
        
        session_files = list(sessions_dir.glob("session_*.json"))
        
        if not session_files:
            return {
                'total_sessions': 0,
                'oldest_session': None,
                'newest_session': None
            }
        
        # Sort by filename (which contains timestamp)
        sorted_files = sorted(session_files)
        
        oldest = None
        newest = None
        
        try:
            # Parse oldest
            oldest_name = sorted_files[0].stem
            oldest_date = oldest_name.split('_')[1] + '_' + oldest_name.split('_')[2]
            oldest = datetime.strptime(oldest_date, "%Y%m%d_%H%M%S")
            
            # Parse newest
            newest_name = sorted_files[-1].stem
            newest_date = newest_name.split('_')[1] + '_' + newest_name.split('_')[2]
            newest = datetime.strptime(newest_date, "%Y%m%d_%H%M%S")
        except:
            pass
        
        return {
            'total_sessions': len(session_files),
            'oldest_session': oldest.isoformat() if oldest else None,
            'newest_session': newest.isoformat() if newest else None
        }
