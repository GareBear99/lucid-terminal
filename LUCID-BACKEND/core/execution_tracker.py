"""
Execution Tracker - Track all changes and resources used during request execution
Similar to Warp AI's file tracking, but also tracks templates, fixes, and consensus data
"""

from typing import List, Dict, Optional
from pathlib import Path


class ExecutionTracker:
    """Track execution statistics for a single request."""
    
    def __init__(self):
        # File tracking
        self.files_affected: List[Dict[str, str]] = []  # {path, action, size}
        self.files_created: List[str] = []
        self.files_modified: List[str] = []
        self.files_deleted: List[str] = []  # Permanently deleted
        self.files_moved: List[Dict[str, str]] = []  # {from, to}
        self.files_overwritten: List[str] = []
        
        # Directory tracking
        self.directories_created: List[str] = []
        self.directories_modified: List[str] = []
        self.directories_deleted: List[str] = []
        self.directories_moved: List[Dict[str, str]] = []  # {from, to}
        self.directories_overwritten: List[str] = []
        
        # Resource tracking
        self.templates_used: List[Dict[str, any]] = []  # {name, relevance, source, consensus_stats}
        self.fixes_used: List[Dict[str, any]] = []   # {name, success_rate, consensus_stats}
        
        # Model tracking
        self.models_used: List[Dict[str, str]] = []  # {model, tier, purpose}
        
        # Consensus tracking
        self.consensus_uploads: List[Dict[str, str]] = []  # {type, name, action}
        self.consensus_tag_updates: List[Dict[str, str]] = []  # {name, old_tags, new_tags}
        
        # Timing
        import time
        self.start_time = time.time()
        self.end_time = None
        
    def track_file_created(self, file_path: str, size_bytes: int = 0):
        """Track a newly created file."""
        from datetime import datetime
        self.files_created.append(file_path)
        self.files_affected.append({
            'timestamp': datetime.now().isoformat(),
            'path': file_path,
            'action': 'created',
            'size': size_bytes
        })
    
    def track_file_modified(self, file_path: str, size_bytes: int = 0):
        """Track a modified file."""
        from datetime import datetime
        self.files_modified.append(file_path)
        self.files_affected.append({
            'timestamp': datetime.now().isoformat(),
            'path': file_path,
            'action': 'modified',
            'size': size_bytes
        })
    
    def track_file_deleted(self, file_path: str):
        """Track a permanently deleted file."""
        from datetime import datetime
        self.files_deleted.append(file_path)
        self.files_affected.append({
            'timestamp': datetime.now().isoformat(),
            'path': file_path,
            'action': 'deleted',
            'size': 0
        })
    
    def track_file_moved(self, from_path: str, to_path: str):
        """Track a moved file."""
        from datetime import datetime
        self.files_moved.append({
            'timestamp': datetime.now().isoformat(),
            'from': from_path,
            'to': to_path
        })
        self.files_affected.append({
            'timestamp': datetime.now().isoformat(),
            'path': from_path,
            'action': 'moved',
            'size': 0,
            'destination': to_path
        })
    
    def track_directory_created(self, dir_path: str):
        """Track a created directory."""
        from datetime import datetime
        self.directories_created.append({
            'timestamp': datetime.now().isoformat(),
            'path': dir_path
        })
    
    def track_directory_deleted(self, dir_path: str):
        """Track a deleted directory."""
        from datetime import datetime
        self.directories_deleted.append({
            'timestamp': datetime.now().isoformat(),
            'path': dir_path
        })
    
    def track_directory_moved(self, from_path: str, to_path: str):
        """Track a moved directory."""
        from datetime import datetime
        self.directories_moved.append({
            'timestamp': datetime.now().isoformat(),
            'from': from_path,
            'to': to_path
        })
    
    def track_directory_modified(self, dir_path: str):
        """Track a modified directory (permissions, attributes, etc.)."""
        from datetime import datetime
        self.directories_modified.append({
            'timestamp': datetime.now().isoformat(),
            'path': dir_path
        })
    
    def track_directory_overwritten(self, dir_path: str):
        """Track an overwritten directory (deleted and recreated)."""
        from datetime import datetime
        self.directories_overwritten.append({
            'timestamp': datetime.now().isoformat(),
            'path': dir_path
        })
    
    def track_file_overwritten(self, file_path: str, size_bytes: int = 0):
        """Track an overwritten file."""
        from datetime import datetime
        self.files_overwritten.append(file_path)
        self.files_affected.append({
            'timestamp': datetime.now().isoformat(),
            'path': file_path,
            'action': 'overwritten',
            'size': size_bytes
        })
    
    def track_template_used(self, name: str, relevance: int, source: str, 
                           consensus_stats: Optional[Dict] = None):
        """Track a template being used."""
        from datetime import datetime
        self.templates_used.append({
            'timestamp': datetime.now().isoformat(),
            'name': name,
            'relevance': relevance,
            'source': source,
            'consensus_stats': consensus_stats or {}
        })
    
    def track_fix_used(self, name: str, success_rate: float, 
                         consensus_stats: Optional[Dict] = None):
        """Track a fix being used."""
        from datetime import datetime
        self.fixes_used.append({
            'timestamp': datetime.now().isoformat(),
            'name': name,
            'success_rate': success_rate,
            'consensus_stats': consensus_stats or {}
        })
    
    def track_model_used(self, model: str, tier: int, purpose: str, tokens: int = 0, output: str = None):
        """Track a model being used.
        
        Args:
            model: Model name
            tier: Model tier (0-4)
            purpose: What the model was used for
            tokens: Number of tokens generated (approximate)
            output: The actual generated text/code
        """
        from datetime import datetime
        self.models_used.append({
            'timestamp': datetime.now().isoformat(),
            'model': model,
            'tier': tier,
            'purpose': purpose,
            'tokens': tokens,
            'output': output
        })
    
    def track_consensus_upload(self, item_type: str, name: str, action: str = 'uploaded'):
        """Track an upload to consensus (template or fix)."""
        from datetime import datetime
        self.consensus_uploads.append({
            'timestamp': datetime.now().isoformat(),
            'type': item_type,  # 'template' or 'fix'
            'name': name,
            'action': action  # 'uploaded', 'updated', 'merged'
        })
    
    def track_consensus_tag_update(self, name: str, old_tags: List[str], new_tags: List[str]):
        """Track tag updates in consensus."""
        from datetime import datetime
        self.consensus_tag_updates.append({
            'timestamp': datetime.now().isoformat(),
            'name': name,
            'old_tags': old_tags,
            'new_tags': new_tags,
            'added_tags': list(set(new_tags) - set(old_tags)),
            'removed_tags': list(set(old_tags) - set(new_tags))
        })
    
    def stop_timer(self):
        """Stop the execution timer."""
        import time
        self.end_time = time.time()
    
    def get_elapsed_time(self) -> float:
        """Get elapsed time in seconds."""
        import time
        end = self.end_time if self.end_time else time.time()
        return end - self.start_time
    
    def get_stats_summary(self) -> Dict[str, int]:
        """Get summary counts for display."""
        return {
            'files_affected': len(self.files_affected),
            'files_created': len(self.files_created),
            'files_modified': len(self.files_modified),
            'files_deleted': len(self.files_deleted),
            'files_moved': len(self.files_moved),
            'files_overwritten': len(self.files_overwritten),
            'templates_used': len(self.templates_used),
            'fixes_used': len(self.fixes_used),
            'models_used': len(self.models_used),
            'directories_created': len(self.directories_created),
            'directories_modified': len(self.directories_modified),
            'directories_deleted': len(self.directories_deleted),
            'directories_moved': len(self.directories_moved),
            'directories_overwritten': len(self.directories_overwritten),
            'consensus_uploads': len(self.consensus_uploads),
            'consensus_tag_updates': len(self.consensus_tag_updates),
            'elapsed_time': self.get_elapsed_time()
        }
    
    def get_detailed_log(self) -> Dict:
        """Get detailed information for session logging."""
        # Create detailed token breakdown by model and purpose
        token_breakdown = {}
        total_tokens = 0
        
        for model_info in self.models_used:
            model_name = model_info['model']
            purpose = model_info['purpose']
            tokens = model_info.get('tokens', 0)
            total_tokens += tokens
            
            if model_name not in token_breakdown:
                token_breakdown[model_name] = {
                    'tier': model_info['tier'],
                    'total_tokens': 0,
                    'breakdown': {}
                }
            
            token_breakdown[model_name]['total_tokens'] += tokens
            
            if purpose not in token_breakdown[model_name]['breakdown']:
                token_breakdown[model_name]['breakdown'][purpose] = 0
            token_breakdown[model_name]['breakdown'][purpose] += tokens
        
        return {
            'files': {
                'affected': self.files_affected,
                'created': self.files_created,
                'modified': self.files_modified,
                'deleted': self.files_deleted,
                'moved': self.files_moved,
                'overwritten': self.files_overwritten
            },
            'directories': {
                'created': self.directories_created,
                'modified': self.directories_modified,
                'deleted': self.directories_deleted,
                'moved': self.directories_moved,
                'overwritten': self.directories_overwritten
            },
            'resources': {
                'templates': self.templates_used,
                'fixes': self.fixes_used
            },
            'consensus': {
                'uploads': self.consensus_uploads,
                'tag_updates': self.consensus_tag_updates
            },
            'models': self.models_used,
            'tokens': {
                'total': total_tokens,
                'by_model': token_breakdown
            },
            'timing': {
                'start_time': self.start_time,
                'end_time': self.end_time,
                'elapsed_seconds': self.get_elapsed_time()
            },
            'summary': self.get_stats_summary()
        }
    
    def format_stats_display(self) -> str:
        """Format stats for display before execution summary."""
        from lucifer_colors import c
        
        stats = self.get_stats_summary()
        
        lines = []
        lines.append(c("📊 Execution Statistics:", "cyan"))
        lines.append(c("─" * 60, "dim"))
        
        # Files section - always show for troubleshooting
        lines.append(c(f"📁 Files affected: {stats['files_affected']}", "white"))
        
        # Created
        if stats['files_created'] > 0:
            lines.append(c(f"   • Created: {stats['files_created']}", "green"))
            for filepath in self.files_created[:3]:
                from pathlib import Path
                lines.append(c(f"     - {Path(filepath).name}", "dim"))
            if len(self.files_created) > 3:
                lines.append(c(f"     ... and {len(self.files_created) - 3} more", "dim"))
        else:
            lines.append(c(f"   • Created: 0", "dim"))
        
        # Modified
        if stats['files_modified'] > 0:
            lines.append(c(f"   • Modified: {stats['files_modified']}", "yellow"))
            for filepath in self.files_modified[:3]:
                from pathlib import Path
                lines.append(c(f"     - {Path(filepath).name}", "dim"))
            if len(self.files_modified) > 3:
                lines.append(c(f"     ... and {len(self.files_modified) - 3} more", "dim"))
        else:
            lines.append(c(f"   • Modified: 0", "dim"))
        
        # Overwritten
        if stats['files_overwritten'] > 0:
            lines.append(c(f"   • Overwritten: {stats['files_overwritten']}", "yellow"))
            for filepath in self.files_overwritten[:3]:
                from pathlib import Path
                lines.append(c(f"     - {Path(filepath).name}", "dim"))
            if len(self.files_overwritten) > 3:
                lines.append(c(f"     ... and {len(self.files_overwritten) - 3} more", "dim"))
        else:
            lines.append(c(f"   • Overwritten: 0", "dim"))
        
        # Deleted
        if stats['files_deleted'] > 0:
            lines.append(c(f"   • Deleted: {stats['files_deleted']}", "red"))
            for filepath in self.files_deleted[:3]:
                from pathlib import Path
                lines.append(c(f"     - {Path(filepath).name}", "dim"))
            if len(self.files_deleted) > 3:
                lines.append(c(f"     ... and {len(self.files_deleted) - 3} more", "dim"))
        else:
            lines.append(c(f"   • Deleted: 0", "dim"))
        
        # Moved
        if stats['files_moved'] > 0:
            lines.append(c(f"   • Moved: {stats['files_moved']}", "cyan"))
            for move in self.files_moved[:3]:
                from pathlib import Path
                lines.append(c(f"     - {Path(move['from']).name} → {Path(move['to']).name}", "dim"))
            if len(self.files_moved) > 3:
                lines.append(c(f"     ... and {len(self.files_moved) - 3} more", "dim"))
        else:
            lines.append(c(f"   • Moved: 0", "dim"))
        
        # Directories section - always show for troubleshooting
        dirs_affected = stats['directories_created'] + stats['directories_deleted'] + stats['directories_moved']
        lines.append(c(f"📂 Directories affected: {dirs_affected}", "white"))
        
        # Created directories
        if stats['directories_created'] > 0:
            lines.append(c(f"   • Created: {stats['directories_created']}", "green"))
            for dir_info in self.directories_created[:3]:
                dir_path = dir_info['path']
                lines.append(c(f"     - {dir_path}", "dim"))
            if len(self.directories_created) > 3:
                lines.append(c(f"     ... and {len(self.directories_created) - 3} more", "dim"))
        else:
            lines.append(c(f"   • Created: 0", "dim"))
        
        # Deleted directories
        if stats['directories_deleted'] > 0:
            lines.append(c(f"   • Deleted: {stats['directories_deleted']}", "red"))
            for dir_info in self.directories_deleted[:3]:
                dir_path = dir_info['path']
                lines.append(c(f"     - {dir_path}", "dim"))
            if len(self.directories_deleted) > 3:
                lines.append(c(f"     ... and {len(self.directories_deleted) - 3} more", "dim"))
        else:
            lines.append(c(f"   • Deleted: 0", "dim"))
        
        # Moved directories
        if stats['directories_moved'] > 0:
            lines.append(c(f"   • Moved: {stats['directories_moved']}", "cyan"))
            for move in self.directories_moved[:3]:
                lines.append(c(f"     - {move['from']} → {move['to']}", "dim"))
            if len(self.directories_moved) > 3:
                lines.append(c(f"     ... and {len(self.directories_moved) - 3} more", "dim"))
        else:
            lines.append(c(f"   • Moved: 0", "dim"))
        
        # Templates section - always show for troubleshooting
        lines.append(c(f"📋 Templates used: {stats['templates_used']}", "white"))
        if stats['templates_used'] > 0:
            for template in self.templates_used:
                lines.append(c(f"   • {template['name']} (relevance: {template['relevance']}/10)", "dim"))
        
        # Fixes section - always show for troubleshooting
        lines.append(c(f"🔧 Fixes used: {stats['fixes_used']}", "white"))
        if stats['fixes_used'] > 0:
            for fix in self.fixes_used:
                lines.append(c(f"   • {fix['name']} (success: {fix['success_rate']:.1f}%)", "dim"))
        
        # Models section - always show for troubleshooting
        lines.append(c(f"🧠 Models used: {stats['models_used']}", "white"))
        if stats['models_used'] > 0:
            # Aggregate tokens by model (combine all purposes)
            model_aggregates = {}  # {model_name: {tier, tokens, purposes[]}}
            for model_info in self.models_used:
                model_name = model_info['model']
                if model_name not in model_aggregates:
                    model_aggregates[model_name] = {
                        'tier': model_info['tier'],
                        'tokens': 0,
                        'purposes': []
                    }
                model_aggregates[model_name]['tokens'] += model_info.get('tokens', 0)
                if model_info['purpose'] not in model_aggregates[model_name]['purposes']:
                    model_aggregates[model_name]['purposes'].append(model_info['purpose'])
            
            # Display each model with total tokens and purposes
            for model_name, data in model_aggregates.items():
                purposes_str = ", ".join(data['purposes'])
                if data['tokens'] > 0:
                    lines.append(c(f"   • {model_name} (Tier {data['tier']}) - {purposes_str} [{data['tokens']} tokens]", "dim"))
                else:
                    lines.append(c(f"   • {model_name} (Tier {data['tier']}) - {purposes_str}", "dim"))
        
        # Consensus uploads section - always show for troubleshooting
        lines.append(c(f"📤 Consensus uploads: {stats['consensus_uploads']}", "white"))
        if stats['consensus_uploads'] > 0:
            for upload in self.consensus_uploads:
                lines.append(c(f"   • {upload['type']}: {upload['name']} ({upload['action']})", "dim"))
        
        # Tag updates section - always show for troubleshooting
        lines.append(c(f"🏷️  Tag updates: {stats['consensus_tag_updates']}", "white"))
        if stats['consensus_tag_updates'] > 0:
            for update in self.consensus_tag_updates:
                if update['added_tags']:
                    lines.append(c(f"   • {update['name']}: +{', '.join(update['added_tags'])}", "green"))
                if update['removed_tags']:
                    lines.append(c(f"   • {update['name']}: -{', '.join(update['removed_tags'])}", "red"))
        
        # Timing
        elapsed = stats['elapsed_time']
        if elapsed < 60:
            time_str = f"{elapsed:.2f}s"
        else:
            minutes = int(elapsed // 60)
            seconds = elapsed % 60
            time_str = f"{minutes}m {seconds:.2f}s"
        lines.append(c(f"⏱️  Execution time: {time_str}", "white"))
        
        lines.append(c("─" * 60, "dim"))
        
        return "\n".join(lines)
    
    def reset(self):
        """Reset all tracking data for a new request."""
        self.files_affected.clear()
        self.files_created.clear()
        self.files_modified.clear()
        self.files_deleted.clear()
        self.files_moved.clear()
        self.files_overwritten.clear()
        self.directories_created.clear()
        self.directories_deleted.clear()
        self.directories_moved.clear()
        self.templates_used.clear()
        self.fixes_used.clear()
        self.models_used.clear()
        self.consensus_uploads.clear()
        self.consensus_tag_updates.clear()
        
        # Reset timing
        import time
        self.start_time = time.time()
        self.end_time = None
