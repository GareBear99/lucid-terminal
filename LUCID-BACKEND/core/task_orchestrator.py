"""
Task Orchestration System
Manages task decomposition, subtasks, and next steps for LLM collaboration
Similar to Warp AI's task planning approach
"""

from dataclasses import dataclass, field
from typing import List, Optional, Callable
from enum import Enum
import time
import json

class TaskStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    WAITING = "waiting"

class TaskPriority(Enum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4

@dataclass
class NextStep:
    """Represents a next step in task execution"""
    description: str
    assigned_to: Optional[str] = None  # 'mistral', 'deepseek', or None
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[str] = None
    
    def __str__(self):
        status_icon = {
            TaskStatus.PENDING: "○",
            TaskStatus.IN_PROGRESS: "◐",
            TaskStatus.COMPLETED: "●",
            TaskStatus.FAILED: "✗",
            TaskStatus.WAITING: "⏸"
        }
        return f"{status_icon[self.status]} {self.description}"

@dataclass
class SubTask:
    """Represents a subtask within a larger task"""
    title: str
    description: str
    assigned_to: Optional[str] = None
    next_steps: List[NextStep] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    priority: TaskPriority = TaskPriority.MEDIUM
    depends_on: List[str] = field(default_factory=list)  # IDs of other subtasks
    result: Optional[str] = None
    
    def __str__(self):
        status_icon = {
            TaskStatus.PENDING: "[ ]",
            TaskStatus.IN_PROGRESS: "[→]",
            TaskStatus.COMPLETED: "[✓]",
            TaskStatus.FAILED: "[✗]",
            TaskStatus.WAITING: "[⏸]"
        }
        return f"{status_icon[self.status]} {self.title}"

@dataclass
class Task:
    """Represents a core task with multiple subtasks"""
    title: str
    description: str
    subtasks: List[SubTask] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    priority: TaskPriority = TaskPriority.MEDIUM
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    result: Optional[str] = None
    
    def add_subtask(self, subtask: SubTask):
        """Add a subtask to this task"""
        self.subtasks.append(subtask)
    
    def get_pending_subtasks(self) -> List[SubTask]:
        """Get all pending subtasks that have no dependencies or whose dependencies are complete"""
        pending = []
        for subtask in self.subtasks:
            if subtask.status == TaskStatus.PENDING:
                # Check if dependencies are satisfied
                if not subtask.depends_on:
                    pending.append(subtask)
                else:
                    # Check if all dependencies are completed
                    deps_complete = all(
                        any(s.title == dep and s.status == TaskStatus.COMPLETED 
                            for s in self.subtasks)
                        for dep in subtask.depends_on
                    )
                    if deps_complete:
                        pending.append(subtask)
        return pending
    
    def is_complete(self) -> bool:
        """Check if all subtasks are complete"""
        return all(st.status == TaskStatus.COMPLETED for st in self.subtasks)
    
    def __str__(self):
        status_icon = {
            TaskStatus.PENDING: "⭘",
            TaskStatus.IN_PROGRESS: "⟳",
            TaskStatus.COMPLETED: "✓",
            TaskStatus.FAILED: "✗",
            TaskStatus.WAITING: "⏸"
        }
        return f"{status_icon[self.status]} {self.title}"


class TaskOrchestrator:
    """Orchestrates task execution across multiple LLMs"""
    
    def __init__(self):
        self.tasks: List[Task] = []
        self.current_task: Optional[Task] = None
    
    def create_task(self, title: str, description: str, priority: TaskPriority = TaskPriority.MEDIUM) -> Task:
        """Create a new task"""
        task = Task(title=title, description=description, priority=priority)
        self.tasks.append(task)
        return task
    
    def decompose_request(self, user_request: str, complexity: str = "basic") -> Task:
        """
        Decompose a user request into a task with subtasks and next steps
        complexity: 'basic' for mistral-style tasks, 'advanced' for deepseek-style tasks
        """
        # This will be overridden by specific parsers (mistral/deepseek)
        task = self.create_task(
            title="User Request",
            description=user_request
        )
        return task
    
    def assign_subtask(self, subtask: SubTask, llm: str):
        """Assign a subtask to a specific LLM"""
        subtask.assigned_to = llm
        subtask.status = TaskStatus.IN_PROGRESS
    
    def complete_subtask(self, subtask: SubTask, result: str):
        """Mark a subtask as completed with result"""
        subtask.status = TaskStatus.COMPLETED
        subtask.result = result
    
    def fail_subtask(self, subtask: SubTask, error: str):
        """Mark a subtask as failed with error"""
        subtask.status = TaskStatus.FAILED
        subtask.result = error
    
    def get_task_tree(self, task: Task) -> str:
        """Generate a visual tree representation of the task"""
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from lucifer_colors import Colors, Emojis
        
        lines = []
        lines.append(f"{Colors.CYAN}{Emojis.TARGET} {task.title}{Colors.RESET}")
        lines.append(f"  {Colors.DIM}{task.description}{Colors.RESET}")
        lines.append("")
        
        for i, subtask in enumerate(task.subtasks, 1):
            color = {
                TaskStatus.PENDING: Colors.DIM,
                TaskStatus.IN_PROGRESS: Colors.YELLOW,
                TaskStatus.COMPLETED: Colors.GREEN,
                TaskStatus.FAILED: Colors.RED,
                TaskStatus.WAITING: Colors.BLUE
            }.get(subtask.status, Colors.RESET)
            
            lines.append(f"{color}{i}. {subtask}{Colors.RESET}")
            
            if subtask.assigned_to:
                lines.append(f"   {Colors.DIM}→ Assigned to: {subtask.assigned_to}{Colors.RESET}")
            
            if subtask.next_steps:
                for step in subtask.next_steps:
                    step_color = {
                        TaskStatus.PENDING: Colors.DIM,
                        TaskStatus.IN_PROGRESS: Colors.YELLOW,
                        TaskStatus.COMPLETED: Colors.GREEN,
                        TaskStatus.FAILED: Colors.RED,
                        TaskStatus.WAITING: Colors.BLUE
                    }.get(step.status, Colors.RESET)
                    lines.append(f"   {step_color}  • {step}{Colors.RESET}")
            lines.append("")
        
        return "\n".join(lines)
    
    def execute_task_async(self, task: Task, executor: Callable):
        """
        Execute a task asynchronously using the provided executor function
        executor should handle calling the appropriate LLM and updating statuses
        """
        self.current_task = task
        task.status = TaskStatus.IN_PROGRESS
        
        # Get ready subtasks
        ready_subtasks = task.get_pending_subtasks()
        
        # Execute ready subtasks
        for subtask in ready_subtasks:
            executor(subtask)
    
    def save_task_state(self, filepath: str):
        """Save current task state to file"""
        state = {
            "tasks": [
                {
                    "title": t.title,
                    "description": t.description,
                    "status": t.status.value,
                    "subtasks": [
                        {
                            "title": st.title,
                            "description": st.description,
                            "status": st.status.value,
                            "assigned_to": st.assigned_to,
                            "result": st.result
                        }
                        for st in t.subtasks
                    ]
                }
                for t in self.tasks
            ]
        }
        
        with open(filepath, 'w') as f:
            json.dump(state, f, indent=2)
    
    def clear_completed(self):
        """Remove completed tasks from the list"""
        self.tasks = [t for t in self.tasks if not t.is_complete()]
